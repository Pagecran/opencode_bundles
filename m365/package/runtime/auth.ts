import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

import { uniqueNonEmpty } from "./validators"

export const DEFAULT_APP_NAME = "TeamsPascale"
export const DEFAULT_CLIENT_ID = "674f3d17-5a27-417b-bcff-bfea2e61447b"
export const DEFAULT_TENANT_ID = "2fa485e4-1eee-4081-8445-98037b332c71"
const DEFAULT_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "User.Read",
  "Files.ReadWrite.All",
  "Sites.ReadWrite.All",
  "Chat.Read",
  "Chat.ReadWrite",
  "Team.ReadBasic.All",
  "Channel.ReadBasic.All",
  "ChannelMessage.Read.All",
  "ChannelMessage.Send",
  "Mail.Read",
  "Mail.Send",
  "MailboxSettings.ReadWrite"
]
const AUTH_REFRESH_SKEW_MS = 120000

export type JsonRecord = Record<string, unknown>

export type StoredAuth = {
  tenantId: string,
  clientId: string,
  scope: string,
  tokenType: string,
  accessToken: string,
  refreshToken: string | null,
  expiresAt: number,
  createdAt: number
}

export type PendingAuth = {
  tenantId: string,
  clientId: string,
  scope: string,
  deviceCode: string,
  userCode: string,
  verificationUri: string,
  verificationUriComplete: string | null,
  intervalSeconds: number,
  expiresAt: number,
  message: string | null
}

export type DeviceCodeBootstrap = {
  autoStarted: boolean,
  pending: PendingAuth,
  scopeList: string[]
}

type DeviceStartParams = {
  clientId: string,
  tenantId: string,
  scope: string
}

type DevicePollParams = {
  clientId: string,
  tenantId: string,
  scope: string,
  deviceCode: string,
  intervalSeconds: number,
  timeoutSeconds: number
}

function getFirstEnvValue(names: string[]) {
  for (const name of names) {
    const value = process.env[name]
    if (value) {
      return value
    }
  }

  return undefined
}

export const AUTH_FILE_PATH =
  getFirstEnvValue(["PAGECRAN_M365_AUTH_FILE", "PAGECRAN_TEAMS_AUTH_FILE"]) ||
  join(homedir(), ".config", "opencode", "pagecran_m365_auth.json")

export const PENDING_AUTH_FILE_PATH =
  getFirstEnvValue(["PAGECRAN_M365_PENDING_AUTH_FILE", "PAGECRAN_TEAMS_PENDING_AUTH_FILE"]) ||
  join(homedir(), ".config", "opencode", "pagecran_m365_auth_pending.json")

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function ensureParentDirectory(filePath: string) {
  mkdirSync(dirname(filePath), { recursive: true })
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readString(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function readNumber(value: unknown, fallback?: number) {
  const parsed = typeof value === "number" ? value : Number(value)
  if (Number.isFinite(parsed)) {
    return parsed
  }

  if (fallback !== undefined) {
    return fallback
  }

  return null
}

export function parseJson(text: string) {
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function readJsonFile<T>(filePath: string) {
  if (!existsSync(filePath)) {
    return null
  }

  return JSON.parse(readFileSync(filePath, "utf8")) as T
}

function writeJsonFile(filePath: string, value: unknown) {
  ensureParentDirectory(filePath)
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8")
}

function removeFileIfExists(filePath: string) {
  if (existsSync(filePath)) {
    rmSync(filePath, { force: true })
  }
}

export function getClientId(explicitValue?: string) {
  return (
    explicitValue ||
    getFirstEnvValue(["PAGECRAN_M365_CLIENT_ID", "PAGECRAN_TEAMS_CLIENT_ID"]) ||
    DEFAULT_CLIENT_ID
  )
}

export function getTenantId(explicitValue?: string) {
  return (
    explicitValue ||
    getFirstEnvValue(["PAGECRAN_M365_TENANT_ID", "PAGECRAN_TEAMS_TENANT_ID"]) ||
    DEFAULT_TENANT_ID
  )
}

export function getScopeString(explicitScopes?: string[]) {
  if (Array.isArray(explicitScopes) && explicitScopes.length > 0) {
    return uniqueNonEmpty(explicitScopes).join(" ")
  }

  const envValue = getFirstEnvValue(["PAGECRAN_M365_SCOPES", "PAGECRAN_TEAMS_SCOPES"])
  if (envValue) {
    return envValue
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .join(" ")
  }

  return DEFAULT_SCOPES.join(" ")
}

export function getScopeList(scopeString?: string | null) {
  return uniqueNonEmpty(String(scopeString || "").split(/[\s,]+/))
}

export function buildScopeString(scopes: string[]) {
  return uniqueNonEmpty(scopes).join(" ")
}

export function mergeScopes(...scopeLists: Array<string[] | null | undefined>) {
  const merged: string[] = []
  for (const scopeList of scopeLists) {
    if (Array.isArray(scopeList)) {
      merged.push(...scopeList)
    }
  }

  return uniqueNonEmpty(merged)
}

export function hasAllScopes(availableScopes: string[], requiredScopes: string[]) {
  const available = new Set(availableScopes.map((scope) => scope.toLowerCase()))
  return requiredScopes.every((scope) => available.has(scope.toLowerCase()))
}

function buildOAuthUrl(tenantId: string, leaf: string) {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/${leaf}`
}

function extractOAuthMessage(payload: unknown, fallback: string) {
  if (!isRecord(payload)) {
    return fallback
  }

  return (
    readString(payload.error_description) ||
    readString(payload.error) ||
    fallback
  )
}

async function postForm(
  url: string,
  formFields: Record<string, unknown>,
  allowError = false
) {
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
    throw new Error(
      `Microsoft OAuth request failed (${response.status}): ${extractOAuthMessage(payload, text)}`
    )
  }

  return payload
}

function buildStoredAuth(
  tokenPayload: unknown,
  tenantId: string,
  clientId: string,
  scope: string,
  previousAuth: StoredAuth | null = null
) {
  if (!isRecord(tokenPayload)) {
    throw new Error("Microsoft OAuth response did not return a valid token payload.")
  }

  const accessToken = readString(tokenPayload.access_token)
  if (!accessToken) {
    throw new Error("Microsoft OAuth response did not include an access token.")
  }

  const expiresIn = readNumber(tokenPayload.expires_in, 3600) || 3600
  return {
    tenantId,
    clientId,
    scope,
    tokenType: readString(tokenPayload.token_type) || "Bearer",
    accessToken,
    refreshToken: readString(tokenPayload.refresh_token) || previousAuth?.refreshToken || null,
    expiresAt: Date.now() + expiresIn * 1000,
    createdAt: Date.now()
  } satisfies StoredAuth
}

export function loadAuth() {
  return readJsonFile<StoredAuth>(AUTH_FILE_PATH)
}

function saveAuth(auth: StoredAuth) {
  writeJsonFile(AUTH_FILE_PATH, auth)
}

export function clearAuth() {
  removeFileIfExists(AUTH_FILE_PATH)
}

export function loadPendingAuth() {
  return readJsonFile<PendingAuth>(PENDING_AUTH_FILE_PATH)
}

function savePendingAuth(pendingAuth: PendingAuth) {
  writeJsonFile(PENDING_AUTH_FILE_PATH, pendingAuth)
}

export function clearPendingAuth() {
  removeFileIfExists(PENDING_AUTH_FILE_PATH)
}

export async function startDeviceCode({ clientId, tenantId, scope }: DeviceStartParams) {
  const payload = await postForm(buildOAuthUrl(tenantId, "devicecode"), {
    client_id: clientId,
    scope
  })

  if (!isRecord(payload)) {
    throw new Error("Microsoft OAuth device-code response was not a valid object.")
  }

  const deviceCode = readString(payload.device_code)
  const userCode = readString(payload.user_code)
  const verificationUri = readString(payload.verification_uri)

  if (!deviceCode || !userCode || !verificationUri) {
    throw new Error("Microsoft OAuth device-code response was missing required fields.")
  }

  const pending = {
    tenantId,
    clientId,
    scope,
    deviceCode,
    userCode,
    verificationUri,
    verificationUriComplete: readString(payload.verification_uri_complete),
    intervalSeconds: readNumber(payload.interval, 5) || 5,
    expiresAt: Date.now() + (readNumber(payload.expires_in, 900) || 900) * 1000,
    message: readString(payload.message)
  } satisfies PendingAuth

  savePendingAuth(pending)
  return pending
}

export async function ensureDeviceCodeBootstrap(options?: {
  clientId?: string,
  tenantId?: string,
  scopes?: string[]
}) {
  const clientId = getClientId(options?.clientId)
  const tenantId = getTenantId(options?.tenantId)
  const scopeList = mergeScopes(getScopeList(getScopeString()), options?.scopes)
  const scope = buildScopeString(scopeList)
  const pending = loadPendingAuth()

  if (
    pending &&
    pending.expiresAt > Date.now() &&
    pending.clientId === clientId &&
    pending.tenantId === tenantId &&
    hasAllScopes(getScopeList(pending.scope), scopeList)
  ) {
    return {
      autoStarted: false,
      pending,
      scopeList
    } satisfies DeviceCodeBootstrap
  }

  return {
    autoStarted: true,
    pending: await startDeviceCode({ clientId, tenantId, scope }),
    scopeList
  } satisfies DeviceCodeBootstrap
}

export async function pollForDeviceToken({
  clientId,
  tenantId,
  scope,
  deviceCode,
  intervalSeconds,
  timeoutSeconds
}: DevicePollParams) {
  const deadline = Date.now() + timeoutSeconds * 1000
  let pollSeconds = Math.max(2, intervalSeconds || 5)

  while (Date.now() < deadline) {
    const payload = await postForm(
      buildOAuthUrl(tenantId, "token"),
      {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: clientId,
        device_code: deviceCode
      },
      true
    )

    if (isRecord(payload) && readString(payload.access_token)) {
      const auth = buildStoredAuth(payload, tenantId, clientId, scope)
      saveAuth(auth)
      clearPendingAuth()
      return {
        authenticated: true,
        pending: false,
        tokenFile: AUTH_FILE_PATH,
        expiresAt: auth.expiresAt,
        scope: auth.scope,
        scopeList: getScopeList(auth.scope),
        tenantId: auth.tenantId,
        clientId: auth.clientId,
        hasRefreshToken: Boolean(auth.refreshToken)
      }
    }

    const errorCode = isRecord(payload) ? readString(payload.error) : null
    if (errorCode === "authorization_pending") {
      await sleep(pollSeconds * 1000)
      continue
    }

    if (errorCode === "slow_down") {
      pollSeconds += 5
      await sleep(pollSeconds * 1000)
      continue
    }

    if (errorCode === "authorization_declined") {
      clearPendingAuth()
      throw new Error("Microsoft authorization was declined by the user.")
    }

    if (errorCode === "expired_token") {
      clearPendingAuth()
      throw new Error("The device login code expired. Start a new Microsoft 365 login flow.")
    }

    throw new Error(`Microsoft OAuth polling failed: ${extractOAuthMessage(payload, "Unknown OAuth polling error")}`)
  }

  return {
    authenticated: false,
    pending: true,
    message: "Authorization is still pending. Complete the Microsoft login and poll again.",
    tokenFile: AUTH_FILE_PATH
  }
}

export async function refreshStoredAuth(auth: StoredAuth) {
  if (!auth.refreshToken) {
    throw new Error(
      "Stored Microsoft 365 authentication is expired and has no refresh token. Log in again."
    )
  }

  const payload = await postForm(
    buildOAuthUrl(auth.tenantId, "token"),
    {
      grant_type: "refresh_token",
      client_id: auth.clientId,
      refresh_token: auth.refreshToken,
      scope: auth.scope
    },
    true
  )

  if (!isRecord(payload) || !readString(payload.access_token)) {
    clearAuth()
    throw new Error(
      `Stored Microsoft 365 authentication could not be refreshed: ${extractOAuthMessage(payload, "Unknown refresh failure")}`
    )
  }

  const refreshed = buildStoredAuth(payload, auth.tenantId, auth.clientId, auth.scope, auth)
  saveAuth(refreshed)
  return refreshed
}

export async function getValidAuth(forceRefresh = false) {
  const auth = loadAuth()
  if (!auth?.accessToken) {
    throw new Error("Microsoft 365 is not authenticated. Start with m365_auth_device_start.")
  }

  if (!forceRefresh && auth.expiresAt - Date.now() > AUTH_REFRESH_SKEW_MS) {
    return auth
  }

  return refreshStoredAuth(auth)
}

export function getAuthStatus() {
  const auth = loadAuth()
  const pending = loadPendingAuth()

  return {
    app_name: DEFAULT_APP_NAME,
    authenticated: Boolean(auth?.accessToken),
    auth_file: AUTH_FILE_PATH,
    pending_auth_file: PENDING_AUTH_FILE_PATH,
    default_client_id: getClientId(),
    default_tenant_id: getTenantId(),
    default_scope: getScopeString(),
    tenant_id: auth?.tenantId || null,
    client_id: auth?.clientId || null,
    scope: auth?.scope || null,
    scope_list: getScopeList(auth?.scope),
    expires_at: auth?.expiresAt || null,
    expires_in_ms: auth?.expiresAt ? auth.expiresAt - Date.now() : null,
    has_refresh_token: Boolean(auth?.refreshToken),
    pending_auth: Boolean(pending),
    pending_client_id: pending?.clientId || null,
    pending_tenant_id: pending?.tenantId || null,
    pending_scope: pending?.scope || null,
    pending_user_code: pending?.userCode || null,
    pending_verification_uri: pending?.verificationUri || null,
    pending_verification_uri_complete: pending?.verificationUriComplete || null,
    pending_expires_at: pending?.expiresAt || null,
    default_scope_list: DEFAULT_SCOPES
  }
}
