import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
const DEFAULT_TENANT_ID = process.env.PAGECRAN_TEAMS_TENANT_ID || "common"
const DEFAULT_SCOPES = (
  process.env.PAGECRAN_TEAMS_SCOPES ||
  "offline_access openid profile User.Read Chat.Read Chat.ReadWrite Team.ReadBasic.All Channel.ReadBasic.All ChannelMessage.Read.All ChannelMessage.Send"
)
  .split(/[\s,]+/)
  .map((item) => item.trim())
  .filter(Boolean)
  .join(" ")
const AUTH_FILE_PATH =
  process.env.PAGECRAN_TEAMS_AUTH_FILE ||
  join(homedir(), ".config", "opencode", "pagecran_teams_auth.json")
const PENDING_AUTH_FILE_PATH =
  process.env.PAGECRAN_TEAMS_PENDING_AUTH_FILE ||
  join(homedir(), ".config", "opencode", "pagecran_teams_auth_pending.json")
const AUTH_REFRESH_SKEW_MS = 60 * 1000

function ensureParentDirectory(filePath) {
  mkdirSync(dirname(filePath), { recursive: true })
}

function parseJson(text) {
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function readJsonFile(filePath) {
  if (!existsSync(filePath)) {
    return null
  }

  return JSON.parse(readFileSync(filePath, "utf8"))
}

function writeJsonFile(filePath, value) {
  ensureParentDirectory(filePath)
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8")
}

function removeFileIfExists(filePath) {
  if (existsSync(filePath)) {
    rmSync(filePath, { force: true })
  }
}

function getClientId() {
  const value = process.env.PAGECRAN_TEAMS_CLIENT_ID
  if (!value) {
    throw new Error("Set PAGECRAN_TEAMS_CLIENT_ID before using the Teams CLI.")
  }

  return value
}

function buildOAuthUrl(tenantId, leaf) {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/${leaf}`
}

async function postForm(url, formFields, allowError = false) {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(formFields)) {
    if (value !== undefined && value !== null) {
      body.set(key, String(value))
    }
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  })

  const text = await response.text()
  const payload = parseJson(text)
  if (!response.ok && !allowError) {
    const message = payload?.error_description || payload?.error || text
    throw new Error(`OAuth request failed (${response.status}): ${message}`)
  }

  return payload || {}
}

function buildStoredAuth(tokenPayload, tenantId, clientId, scope, previousAuth = null) {
  const expiresIn = Number(tokenPayload.expires_in || 3600)
  return {
    tenantId,
    clientId,
    scope,
    tokenType: tokenPayload.token_type || "Bearer",
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token || previousAuth?.refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    createdAt: Date.now()
  }
}

function loadAuth() {
  return readJsonFile(AUTH_FILE_PATH)
}

function saveAuth(auth) {
  writeJsonFile(AUTH_FILE_PATH, auth)
}

function loadPendingAuth() {
  return readJsonFile(PENDING_AUTH_FILE_PATH)
}

function savePendingAuth(pending) {
  writeJsonFile(PENDING_AUTH_FILE_PATH, pending)
}

function clearPendingAuth() {
  removeFileIfExists(PENDING_AUTH_FILE_PATH)
}

function clearAuth() {
  removeFileIfExists(AUTH_FILE_PATH)
}

async function authStart() {
  const clientId = getClientId()
  const payload = await postForm(buildOAuthUrl(DEFAULT_TENANT_ID, "devicecode"), {
    client_id: clientId,
    scope: DEFAULT_SCOPES
  })

  const pending = {
    tenantId: DEFAULT_TENANT_ID,
    clientId,
    scope: DEFAULT_SCOPES,
    deviceCode: payload.device_code,
    userCode: payload.user_code,
    verificationUri: payload.verification_uri,
    verificationUriComplete: payload.verification_uri_complete,
    intervalSeconds: Number(payload.interval || 5),
    expiresAt: Date.now() + Number(payload.expires_in || 900) * 1000
  }
  savePendingAuth(pending)
  console.log(JSON.stringify(pending, null, 2))
}

async function authPoll() {
  const pending = loadPendingAuth()
  if (!pending?.deviceCode) {
    throw new Error("No pending device login. Run auth-start first.")
  }

  while (Date.now() < pending.expiresAt) {
    const payload = await postForm(
      buildOAuthUrl(pending.tenantId, "token"),
      {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: pending.clientId,
        device_code: pending.deviceCode
      },
      true
    )

    if (payload.access_token) {
      const auth = buildStoredAuth(payload, pending.tenantId, pending.clientId, pending.scope)
      saveAuth(auth)
      clearPendingAuth()
      console.log(JSON.stringify({ authenticated: true, authFile: AUTH_FILE_PATH }, null, 2))
      return
    }

    if (payload.error === "authorization_pending") {
      await new Promise((resolve) => setTimeout(resolve, pending.intervalSeconds * 1000))
      continue
    }

    throw new Error(payload?.error_description || payload?.error || "Unknown device login error")
  }

  console.log(JSON.stringify({ authenticated: false, pending: true }, null, 2))
}

async function refreshStoredAuth(auth) {
  if (!auth?.refreshToken) {
    throw new Error("Stored Teams authentication is expired and has no refresh token. Run auth-start then auth-poll again.")
  }

  const payload = await postForm(
    buildOAuthUrl(auth.tenantId || DEFAULT_TENANT_ID, "token"),
    {
      grant_type: "refresh_token",
      client_id: auth.clientId || getClientId(),
      refresh_token: auth.refreshToken,
      scope: auth.scope || DEFAULT_SCOPES
    },
    true
  )

  if (!payload.access_token) {
    clearAuth()
    const message = payload?.error_description || payload?.error || "Unknown refresh failure"
    throw new Error(`Stored Teams authentication could not be refreshed: ${message}`)
  }

  const refreshed = buildStoredAuth(
    payload,
    auth.tenantId || DEFAULT_TENANT_ID,
    auth.clientId || getClientId(),
    auth.scope || DEFAULT_SCOPES,
    auth
  )
  saveAuth(refreshed)
  return refreshed
}

async function getValidAuth(forceRefresh = false) {
  const auth = loadAuth()
  if (!auth?.accessToken) {
    throw new Error("No Teams auth found. Run auth-start then auth-poll first.")
  }

  if (!forceRefresh && Number(auth.expiresAt || 0) - Date.now() > AUTH_REFRESH_SKEW_MS) {
    return auth
  }

  return refreshStoredAuth(auth)
}

async function requestGraph(method, path, bodyText) {
  let auth = await getValidAuth()
  const url = path.startsWith("https://") ? path : `${GRAPH_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`
  const parsedBody = bodyText ? JSON.parse(bodyText) : undefined

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const headers = {
      Authorization: `${auth.tokenType || "Bearer"} ${auth.accessToken}`
    }
    let body
    if (parsedBody !== undefined) {
      headers["Content-Type"] = "application/json"
      body = JSON.stringify(parsedBody)
    }

    const response = await fetch(url, {
      method,
      headers,
      body
    })
    const text = await response.text()
    const payload = parseJson(text)

    if (response.status === 401 && attempt === 0) {
      auth = await refreshStoredAuth(auth)
      continue
    }

    console.log(JSON.stringify({ status: response.status, ok: response.ok, result: payload }, null, 2))
    return
  }
}

const [command, ...rest] = process.argv.slice(2)

try {
  switch (command) {
    case "status":
      console.log(JSON.stringify({ auth: loadAuth(), pending: loadPendingAuth() }, null, 2))
      break
    case "auth-start":
      await authStart()
      break
    case "auth-poll":
      await authPoll()
      break
    case "logout":
      clearAuth()
      clearPendingAuth()
      console.log(JSON.stringify({ authenticated: false }, null, 2))
      break
    case "request": {
      const method = (rest[0] || "GET").toUpperCase()
      const path = rest[1]
      const bodyText = rest[2]
      if (!path) {
        throw new Error("Usage: request <METHOD> <PATH> [BODY_JSON]")
      }
      await requestGraph(method, path, bodyText)
      break
    }
    default:
      console.log(
        [
          "Usage:",
          "  pagecran_teams_cli.mjs status",
          "  pagecran_teams_cli.mjs auth-start",
          "  pagecran_teams_cli.mjs auth-poll",
          "  pagecran_teams_cli.mjs logout",
          "  pagecran_teams_cli.mjs request GET /me"
        ].join("\n")
      )
      process.exitCode = 1
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
