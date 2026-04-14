import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { tool } from "@opencode-ai/plugin"

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
const DEFAULT_TENANT_ID = "common"
const DEFAULT_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "User.Read",
  "Chat.Read",
  "Chat.ReadWrite",
  "Team.ReadBasic.All",
  "Channel.ReadBasic.All",
  "ChannelMessage.Read.All",
  "ChannelMessage.Send"
]
const AUTH_REFRESH_SKEW_MS = 120000
const DEFAULT_CHAT_LIST_LIMIT = 20
const DEFAULT_TEAM_LIST_LIMIT = 50
const DEFAULT_MESSAGE_LIMIT = 20
const DEFAULT_RESOLUTION_LIMIT = 50
const MAX_LIST_LIMIT = 100
const AUTH_FILE_PATH =
  process.env.PAGECRAN_TEAMS_AUTH_FILE ||
  join(homedir(), ".config", "opencode", "pagecran_teams_auth.json")
const PENDING_AUTH_FILE_PATH =
  process.env.PAGECRAN_TEAMS_PENDING_AUTH_FILE ||
  join(homedir(), ".config", "opencode", "pagecran_teams_auth_pending.json")

const stringArraySchema = tool.schema.array(tool.schema.string())
const jsonRecordSchema = tool.schema.record(tool.schema.string(), tool.schema.any())

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function ensureParentDirectory(filePath: string) {
  mkdirSync(dirname(filePath), { recursive: true })
}

function parseJson(text: string) {
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function readJsonFile(filePath: string) {
  if (!existsSync(filePath)) {
    return null
  }

  return JSON.parse(readFileSync(filePath, "utf8"))
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

function getClientId(explicitValue?: string) {
  const value = explicitValue || process.env.PAGECRAN_TEAMS_CLIENT_ID
  if (!value) {
    throw new Error(
      "Missing Microsoft client id. Set PAGECRAN_TEAMS_CLIENT_ID or pass client_id explicitly."
    )
  }

  return value
}

function getTenantId(explicitValue?: string) {
  return explicitValue || process.env.PAGECRAN_TEAMS_TENANT_ID || DEFAULT_TENANT_ID
}

function getScopeString(explicitScopes?: string[]) {
  if (Array.isArray(explicitScopes) && explicitScopes.length > 0) {
    return explicitScopes.join(" ")
  }

  const envValue = process.env.PAGECRAN_TEAMS_SCOPES
  if (envValue) {
    return envValue
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .join(" ")
  }

  return DEFAULT_SCOPES.join(" ")
}

function clampPositiveInt(value: unknown, fallback: number, max = MAX_LIST_LIMIT) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.min(Math.floor(parsed), max)
}

function buildOAuthUrl(tenantId: string, leaf: string) {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/${leaf}`
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
    const message = payload?.error_description || payload?.error?.message || payload?.error || text
    throw new Error(`Microsoft OAuth request failed (${response.status}): ${message}`)
  }

  return payload || {}
}

function buildStoredAuth(
  tokenPayload: any,
  tenantId: string,
  clientId: string,
  scope: string,
  previousAuth: any = null
) {
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

function saveAuth(auth: unknown) {
  writeJsonFile(AUTH_FILE_PATH, auth)
}

function clearAuth() {
  removeFileIfExists(AUTH_FILE_PATH)
}

function loadPendingAuth() {
  return readJsonFile(PENDING_AUTH_FILE_PATH)
}

function savePendingAuth(pendingAuth: unknown) {
  writeJsonFile(PENDING_AUTH_FILE_PATH, pendingAuth)
}

function clearPendingAuth() {
  removeFileIfExists(PENDING_AUTH_FILE_PATH)
}

async function startDeviceCode({ clientId, tenantId, scope }: any) {
  const payload = await postForm(buildOAuthUrl(tenantId, "devicecode"), {
    client_id: clientId,
    scope
  })

  const pending = {
    tenantId,
    clientId,
    scope,
    deviceCode: payload.device_code,
    userCode: payload.user_code,
    verificationUri: payload.verification_uri,
    verificationUriComplete: payload.verification_uri_complete,
    intervalSeconds: Number(payload.interval || 5),
    expiresAt: Date.now() + Number(payload.expires_in || 900) * 1000,
    message: payload.message || null
  }

  savePendingAuth(pending)
  return pending
}

async function pollForDeviceToken({
  clientId,
  tenantId,
  scope,
  deviceCode,
  intervalSeconds,
  timeoutSeconds
}: any) {
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

    if (payload.access_token) {
      const auth = buildStoredAuth(payload, tenantId, clientId, scope)
      saveAuth(auth)
      clearPendingAuth()
      return {
        authenticated: true,
        pending: false,
        tokenFile: AUTH_FILE_PATH,
        expiresAt: auth.expiresAt,
        scope: auth.scope,
        tenantId: auth.tenantId,
        clientId: auth.clientId,
        hasRefreshToken: Boolean(auth.refreshToken)
      }
    }

    if (payload.error === "authorization_pending") {
      await sleep(pollSeconds * 1000)
      continue
    }

    if (payload.error === "slow_down") {
      pollSeconds += 5
      await sleep(pollSeconds * 1000)
      continue
    }

    if (payload.error === "authorization_declined") {
      clearPendingAuth()
      throw new Error("Microsoft authorization was declined by the user.")
    }

    if (payload.error === "expired_token") {
      clearPendingAuth()
      throw new Error("The device login code expired. Start a new Teams login flow.")
    }

    const message = payload?.error_description || payload?.error || "Unknown OAuth polling error"
    throw new Error(`Microsoft OAuth polling failed: ${message}`)
  }

  return {
    authenticated: false,
    pending: true,
    message: "Authorization is still pending. Complete the Microsoft login and poll again.",
    tokenFile: AUTH_FILE_PATH
  }
}

async function refreshStoredAuth(auth: any) {
  if (!auth?.refreshToken) {
    throw new Error("Stored Teams authentication is expired and has no refresh token. Log in again.")
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

  if (!payload.access_token) {
    clearAuth()
    const message = payload?.error_description || payload?.error || "Unknown refresh failure"
    throw new Error(`Stored Teams authentication could not be refreshed: ${message}`)
  }

  const refreshed = buildStoredAuth(payload, auth.tenantId, auth.clientId, auth.scope, auth)
  saveAuth(refreshed)
  return refreshed
}

async function getValidAuth(forceRefresh = false) {
  const auth = loadAuth()
  if (!auth) {
    throw new Error("Teams is not authenticated. Start with teams_auth_device_start.")
  }

  if (!forceRefresh && auth.expiresAt - Date.now() > AUTH_REFRESH_SKEW_MS) {
    return auth
  }

  return refreshStoredAuth(auth)
}

function buildGraphUrl(path: string, query?: Record<string, unknown>) {
  const baseUrl = path.startsWith("https://")
    ? path
    : `${GRAPH_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`
  const url = new URL(baseUrl)

  if (query && typeof query === "object") {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) {
        continue
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, String(item))
        }
      } else {
        url.searchParams.set(key, String(value))
      }
    }
  }

  return url.toString()
}

async function executeGraphRequest(args: any) {
  let auth = await getValidAuth(Boolean(args.force_refresh))
  const method = (args.method || (args.body ? "POST" : "GET")).toUpperCase()

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const headers: Record<string, string> = {
      Authorization: `${auth.tokenType} ${auth.accessToken}`
    }
    let body

    if (args.body !== undefined) {
      headers["Content-Type"] = "application/json"
      body = JSON.stringify(args.body)
    }

    const response = await fetch(buildGraphUrl(args.path, args.query), {
      method,
      headers,
      body
    })

    const text = await response.text()
    const payload = parseJson(text)
    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        method,
        path: args.path,
        result: payload
      }
    }

    if (response.status === 401 && attempt === 0) {
      auth = await getValidAuth(true)
      continue
    }

    const message = payload?.error?.message || payload?.error_description || payload?.error || text
    throw new Error(`Microsoft Graph request failed (${response.status}): ${message}`)
  }

  throw new Error("Microsoft Graph request failed after token refresh.")
}

async function graphResult(args: any) {
  const response = await executeGraphRequest(args)
  return response.result
}

function encodePathSegment(value: string) {
  return encodeURIComponent(String(value))
}

function normalizeMatchText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function uniqueNonEmpty(values: Array<unknown>) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const text = String(value || "").trim()
    if (!text) {
      continue
    }

    const key = text.toLowerCase()
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(text)
  }

  return result
}

function scoreSingleValue(value: unknown, query: string) {
  const normalizedValue = normalizeMatchText(value)
  const normalizedQuery = normalizeMatchText(query)
  if (!normalizedValue || !normalizedQuery) {
    return 0
  }

  if (normalizedValue === normalizedQuery) {
    return 1000
  }

  if (normalizedValue.startsWith(normalizedQuery)) {
    return 750
  }

  if (normalizedValue.includes(normalizedQuery)) {
    return 500
  }

  const queryTokens = normalizedQuery.split(" ").filter(Boolean)
  if (queryTokens.length > 1 && queryTokens.every((token) => normalizedValue.includes(token))) {
    return 300
  }

  return 0
}

function scoreBestValue(values: Array<unknown>, query?: string) {
  if (!query) {
    return 0
  }

  let best = 0
  for (const value of values) {
    best = Math.max(best, scoreSingleValue(value, query))
  }

  return best
}

function filterAndSortMatches<T>(
  items: T[],
  query: string | undefined,
  valuesForItem: (item: T) => Array<unknown>
) {
  if (!query) {
    return items
  }

  return items
    .map((item) => ({ item, score: scoreBestValue(valuesForItem(item), query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item)
}

function chooseSingleMatch<T>(
  items: T[],
  scoreForItem: (item: T) => number,
  labelForItem: (item: T) => string,
  kind: string
) {
  const scored = items
    .map((item) => ({ item, score: scoreForItem(item) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || labelForItem(a.item).localeCompare(labelForItem(b.item)))

  if (scored.length === 0) {
    return null
  }

  if (scored.length > 1 && scored[0].score === scored[1].score) {
    const preview = scored
      .slice(0, 5)
      .map((entry) => labelForItem(entry.item))
      .join(", ")
    throw new Error(`Ambiguous ${kind}. Matching candidates: ${preview}`)
  }

  return scored[0].item
}

function decodeBasicHtmlEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
}

function htmlToText(html: string) {
  if (!html) {
    return ""
  }

  return decodeBasicHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<li>/gi, "- ")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function bodyToReadableText(body: any) {
  const content = body?.content || ""
  if (!content) {
    return ""
  }

  return body?.contentType === "html" ? htmlToText(content) : String(content)
}

function buildMessageBody(content: string, contentType?: string) {
  const normalizedType = String(contentType || "text").toLowerCase() === "html" ? "html" : "text"
  return {
    body: {
      contentType: normalizedType,
      content
    }
  }
}

function summarizeIdentity(identity: any) {
  if (!identity) {
    return null
  }

  if (identity.user) {
    return {
      type: "user",
      id: identity.user.id || null,
      displayName: identity.user.displayName || null,
      userPrincipalName: null,
      userIdentityType: identity.user.userIdentityType || null
    }
  }

  if (identity.application) {
    return {
      type: "application",
      id: identity.application.id || null,
      displayName: identity.application.displayName || null
    }
  }

  return {
    type: "unknown",
    raw: identity
  }
}

function summarizeMessage(message: any) {
  return {
    id: message?.id || null,
    replyToId: message?.replyToId || null,
    messageType: message?.messageType || null,
    createdDateTime: message?.createdDateTime || null,
    lastModifiedDateTime: message?.lastModifiedDateTime || null,
    deletedDateTime: message?.deletedDateTime || null,
    subject: message?.subject || null,
    importance: message?.importance || null,
    from: summarizeIdentity(message?.from),
    contentType: message?.body?.contentType || null,
    content: bodyToReadableText(message?.body),
    rawContent: message?.body?.content || null
  }
}

async function getCurrentUser(forceRefresh = false) {
  const result = await graphResult({
    path: "/me",
    method: "GET",
    query: {
      "$select": "id,displayName,userPrincipalName,mail"
    },
    force_refresh: forceRefresh
  })

  return {
    id: result?.id || null,
    displayName: result?.displayName || null,
    userPrincipalName: result?.userPrincipalName || null,
    mail: result?.mail || null
  }
}

function summarizeChatMember(member: any) {
  return {
    id: member?.id || member?.userId || null,
    userId: member?.userId || member?.user?.id || null,
    displayName: member?.displayName || member?.user?.displayName || null,
    email: member?.email || member?.user?.userPrincipalName || null,
    roles: Array.isArray(member?.roles) ? member.roles : []
  }
}

function buildChatLabel(chat: any, members: any[], me: any) {
  if (chat?.topic) {
    return chat.topic
  }

  const labels = members
    .filter((member) => member.displayName || member.email)
    .filter((member) => member.userId !== me?.id)
    .map((member) => member.displayName || member.email)

  if (labels.length > 0) {
    return labels.slice(0, 3).join(", ") + (labels.length > 3 ? ` +${labels.length - 3}` : "")
  }

  return chat?.id || "Unnamed chat"
}

async function listChatMembers(chatId: string, forceRefresh = false) {
  const result = await graphResult({
    path: `/chats/${encodePathSegment(chatId)}/members`,
    method: "GET",
    query: {
      "$top": 50
    },
    force_refresh: forceRefresh
  })

  return Array.isArray(result?.value) ? result.value : []
}

async function getChatSummaryFromRaw(chat: any, me: any, forceRefresh = false) {
  const members = (await listChatMembers(chat.id, forceRefresh)).map(summarizeChatMember)
  const memberLabels = uniqueNonEmpty(
    members.flatMap((member: any) => [member.displayName, member.email])
  )

  return {
    id: chat?.id || null,
    label: buildChatLabel(chat, members, me),
    chatType: chat?.chatType || null,
    topic: chat?.topic || null,
    webUrl: chat?.webUrl || null,
    createdDateTime: chat?.createdDateTime || null,
    lastUpdatedDateTime: chat?.lastUpdatedDateTime || null,
    preview: bodyToReadableText(chat?.lastMessagePreview?.body),
    members,
    memberLabels
  }
}

async function getChatSummaryById(chatId: string, forceRefresh = false) {
  const me = await getCurrentUser(forceRefresh)
  const chat = await graphResult({
    path: `/chats/${encodePathSegment(chatId)}`,
    method: "GET",
    force_refresh: forceRefresh
  })

  return getChatSummaryFromRaw(chat, me, forceRefresh)
}

async function listChatSummaries(limit: number, forceRefresh = false) {
  const me = await getCurrentUser(forceRefresh)
  const result = await graphResult({
    path: "/me/chats",
    method: "GET",
    query: {
      "$top": clampPositiveInt(limit, DEFAULT_CHAT_LIST_LIMIT),
      "$orderby": "lastUpdatedDateTime desc"
    },
    force_refresh: forceRefresh
  })

  const chats = Array.isArray(result?.value) ? result.value : []
  return Promise.all(chats.map((chat: any) => getChatSummaryFromRaw(chat, me, forceRefresh)))
}

async function resolveChatReference(args: any) {
  if (args.chat_id) {
    return getChatSummaryById(args.chat_id, Boolean(args.force_refresh))
  }

  if (!args.chat_name && !args.participant_name) {
    throw new Error(
      "Provide chat_id, chat_name or participant_name. Use teams_list_chats to discover available chats."
    )
  }

  const chats = await listChatSummaries(
    clampPositiveInt(args.search_limit, DEFAULT_RESOLUTION_LIMIT),
    Boolean(args.force_refresh)
  )
  const match = chooseSingleMatch(
    chats,
    (chat) =>
      scoreBestValue([chat.label, chat.topic], args.chat_name) +
      scoreBestValue(chat.memberLabels, args.participant_name),
    (chat) => `${chat.label} [${chat.id}]`,
    "chat"
  )

  if (!match) {
    throw new Error("No matching chat was found. Use teams_list_chats to inspect available chats.")
  }

  return match
}

function getRequestedParticipantUsernames(args: any) {
  return uniqueNonEmpty([
    args.participant_username,
    ...(Array.isArray(args.participant_usernames) ? args.participant_usernames : [])
  ])
}

function buildUserBindUrl(userReference: string) {
  return `${GRAPH_BASE_URL}/users/${encodePathSegment(userReference)}`
}

function buildChatMemberBinding(userReference: string) {
  return {
    "@odata.type": "#microsoft.graph.aadUserConversationMember",
    roles: ["owner"],
    "user@odata.bind": buildUserBindUrl(userReference)
  }
}

async function createChatFromParticipants(args: any) {
  const forceRefresh = Boolean(args.force_refresh)
  const me = await getCurrentUser(forceRefresh)
  const requestedParticipants = getRequestedParticipantUsernames(args)

  if (requestedParticipants.length === 0) {
    throw new Error(
      "Provide participant_username or participant_usernames to create a new Teams chat."
    )
  }

  const selfReferences = new Set(
    uniqueNonEmpty([me.id, me.userPrincipalName, me.mail]).map((value: string) => normalizeMatchText(value))
  )
  const participants = requestedParticipants.filter(
    (value: string) => !selfReferences.has(normalizeMatchText(value))
  )

  if (!me.id) {
    throw new Error("Could not determine the authenticated user id for Teams chat creation.")
  }

  if (participants.length === 0) {
    throw new Error(
      "Provide at least one other participant username (UPN) or user id to create a chat."
    )
  }

  if (participants.length === 1 && args.chat_topic) {
    throw new Error("chat_topic is only supported when creating a group chat with multiple participants.")
  }

  const createdChat = await graphResult({
    path: "/chats",
    method: "POST",
    body: {
      chatType: participants.length === 1 ? "oneOnOne" : "group",
      ...(participants.length > 1 && args.chat_topic ? { topic: args.chat_topic } : {}),
      members: [buildChatMemberBinding(me.id), ...participants.map((value: string) => buildChatMemberBinding(value))]
    },
    force_refresh: forceRefresh
  })

  return {
    chat: await getChatSummaryById(createdChat.id, forceRefresh),
    requestedParticipants: participants
  }
}

async function resolveChatForSending(args: any) {
  const requestedParticipants = getRequestedParticipantUsernames(args)
  const hasExistingChatReference = Boolean(args.chat_id || args.chat_name || args.participant_name)

  if (hasExistingChatReference && requestedParticipants.length > 0) {
    throw new Error(
      "Use either chat_id/chat_name/participant_name for an existing chat, or participant_username/participant_usernames to create or reuse a chat by account."
    )
  }

  if (hasExistingChatReference) {
    return resolveChatReference(args)
  }

  if (requestedParticipants.length > 0) {
    return (await createChatFromParticipants(args)).chat
  }

  throw new Error(
    "Provide chat_id, chat_name, participant_name, participant_username or participant_usernames."
  )
}

function summarizeTeam(team: any) {
  return {
    id: team?.id || null,
    displayName: team?.displayName || null,
    description: team?.description || null,
    webUrl: team?.webUrl || null
  }
}

async function listTeams(forceRefresh = false): Promise<any[]> {
  const result = await graphResult({
    path: "/me/joinedTeams",
    method: "GET",
    force_refresh: forceRefresh
  })

  return (Array.isArray(result?.value) ? result.value : []).map(summarizeTeam)
}

async function resolveTeamReference(args: any) {
  const teams = await listTeams(Boolean(args.force_refresh))

  if (args.team_id) {
    const exact = teams.find((team: any) => team.id === args.team_id)
    if (exact) {
      return exact
    }

    throw new Error(`Unknown team_id: ${args.team_id}`)
  }

  if (!args.team_name) {
    throw new Error("Provide team_id or team_name. Use teams_list_teams to inspect available teams.")
  }

  const match = chooseSingleMatch(
    teams,
    (team: any) => scoreBestValue([team.displayName, team.description], args.team_name),
    (team: any) => `${team.displayName} [${team.id}]`,
    "team"
  )

  if (!match) {
    throw new Error("No matching team was found. Use teams_list_teams to inspect available teams.")
  }

  return match
}

function summarizeChannel(team: any, channel: any) {
  return {
    id: channel?.id || null,
    displayName: channel?.displayName || null,
    description: channel?.description || null,
    membershipType: channel?.membershipType || null,
    webUrl: channel?.webUrl || null,
    email: channel?.email || null,
    teamId: team?.id || null,
    teamName: team?.displayName || null
  }
}

async function listChannelsForTeam(team: any, forceRefresh = false): Promise<any[]> {
  const result = await graphResult({
    path: `/teams/${encodePathSegment(team.id)}/channels`,
    method: "GET",
    force_refresh: forceRefresh
  })

  return (Array.isArray(result?.value) ? result.value : []).map((channel: any) => summarizeChannel(team, channel))
}

async function listChannelsAcrossTeams(forceRefresh = false): Promise<any[]> {
  const teams = await listTeams(forceRefresh)
  const channelGroups = await Promise.all(
    teams.map((team: any) => listChannelsForTeam(team, forceRefresh))
  )
  return channelGroups.flat()
}

async function resolveChannelReference(args: any) {
  const forceRefresh = Boolean(args.force_refresh)
  let channels: any[] = []

  if (args.team_id || args.team_name) {
    const team = await resolveTeamReference(args)
    channels = await listChannelsForTeam(team, forceRefresh)
  } else {
    channels = await listChannelsAcrossTeams(forceRefresh)
  }

  if (args.channel_id) {
    const exact = channels.find((channel) => channel.id === args.channel_id)
    if (exact) {
      return exact
    }

    throw new Error(`Unknown channel_id: ${args.channel_id}`)
  }

  if (!args.channel_name) {
    throw new Error(
      "Provide channel_id or channel_name. Use teams_list_channels to inspect available channels."
    )
  }

  const match = chooseSingleMatch(
    channels,
    (channel) =>
      scoreBestValue([channel.displayName, channel.description], args.channel_name) +
      scoreBestValue([channel.teamName], args.team_name),
    (channel) => `${channel.teamName} / ${channel.displayName} [${channel.id}]`,
    "channel"
  )

  if (!match) {
    throw new Error(
      "No matching channel was found. Use teams_list_channels to inspect available channels."
    )
  }

  return match
}

async function listChatMessages(args: any) {
  const chat = await resolveChatReference(args)
  const result = await graphResult({
    path: `/chats/${encodePathSegment(chat.id)}/messages`,
    method: "GET",
    query: {
      "$top": clampPositiveInt(args.limit, DEFAULT_MESSAGE_LIMIT)
    },
    force_refresh: Boolean(args.force_refresh)
  })

  const messages = (Array.isArray(result?.value) ? result.value : []).map(summarizeMessage)
  return {
    chat,
    count: messages.length,
    messages
  }
}

async function sendChatMessage(args: any) {
  const chat = await resolveChatForSending(args)
  const result = await graphResult({
    path: `/chats/${encodePathSegment(chat.id)}/messages`,
    method: "POST",
    body: buildMessageBody(args.message, args.content_type),
    force_refresh: Boolean(args.force_refresh)
  })

  return {
    ok: true,
    chat,
    message: summarizeMessage(result)
  }
}

async function createChat(args: any) {
  const result = await createChatFromParticipants(args)
  return {
    ok: true,
    chat: result.chat,
    requestedParticipants: result.requestedParticipants
  }
}

async function listChannels(args: any) {
  const forceRefresh = Boolean(args.force_refresh)
  const channels: any[] = args.team_id || args.team_name
    ? await listChannelsForTeam(await resolveTeamReference(args), forceRefresh)
    : await listChannelsAcrossTeams(forceRefresh)

  const filtered = filterAndSortMatches(channels, args.query, (channel: any) => [
    channel.displayName,
    channel.description,
    channel.teamName
  ])

  return {
    count: filtered.length,
    channels: filtered
  }
}

async function readChannelMessages(args: any) {
  const channel = await resolveChannelReference(args)
  const result = await graphResult({
    path: `/teams/${encodePathSegment(channel.teamId)}/channels/${encodePathSegment(channel.id)}/messages`,
    method: "GET",
    query: {
      "$top": clampPositiveInt(args.limit, DEFAULT_MESSAGE_LIMIT)
    },
    force_refresh: Boolean(args.force_refresh)
  })

  const messages = (Array.isArray(result?.value) ? result.value : []).map(summarizeMessage)
  return {
    channel,
    count: messages.length,
    messages
  }
}

async function sendChannelMessage(args: any) {
  const channel = await resolveChannelReference(args)
  const result = await graphResult({
    path: `/teams/${encodePathSegment(channel.teamId)}/channels/${encodePathSegment(channel.id)}/messages`,
    method: "POST",
    body: buildMessageBody(args.message, args.content_type),
    force_refresh: Boolean(args.force_refresh)
  })

  return {
    ok: true,
    channel,
    message: summarizeMessage(result)
  }
}

export const TeamsPlugin = async () => {
  return {
    tool: {
      teams_auth_status: tool({
        description: "Show the local Teams authentication state for the current user.",
        args: {},
        async execute() {
          const auth = loadAuth()
          const pending = loadPendingAuth()
          return JSON.stringify(
            {
              authenticated: Boolean(auth),
              auth_file: AUTH_FILE_PATH,
              pending_auth_file: PENDING_AUTH_FILE_PATH,
              tenant_id: auth?.tenantId || null,
              client_id: auth?.clientId || null,
              scope: auth?.scope || null,
              expires_at: auth?.expiresAt || null,
              expires_in_ms: auth ? auth.expiresAt - Date.now() : null,
              has_refresh_token: Boolean(auth?.refreshToken),
              pending_auth: Boolean(pending),
              pending_user_code: pending?.userCode || null,
              pending_expires_at: pending?.expiresAt || null
            },
            null,
            2
          )
        }
      }),

      teams_auth_device_start: tool({
        description:
          "Start Microsoft device-code authentication for Teams/Graph and store a pending login locally.",
        args: {
          client_id: tool.schema.string().optional(),
          tenant_id: tool.schema.string().optional(),
          scopes: stringArraySchema.optional()
        },
        async execute(args) {
          const clientId = getClientId(args.client_id)
          const tenantId = getTenantId(args.tenant_id)
          const scope = getScopeString(args.scopes)
          const pending = await startDeviceCode({ clientId, tenantId, scope })

          return JSON.stringify(
            {
              ok: true,
              authenticated: false,
              client_id: clientId,
              tenant_id: tenantId,
              scope,
              device_code: pending.deviceCode,
              user_code: pending.userCode,
              verification_uri: pending.verificationUri,
              verification_uri_complete: pending.verificationUriComplete || null,
              expires_at: pending.expiresAt,
              interval_seconds: pending.intervalSeconds,
              message:
                pending.message ||
                "Open the Microsoft verification URL, enter the user code, then call teams_auth_device_poll."
            },
            null,
            2
          )
        }
      }),

      teams_auth_device_poll: tool({
        description:
          "Poll the pending Microsoft device-code login until access is granted or the timeout elapses.",
        args: {
          device_code: tool.schema.string().optional(),
          client_id: tool.schema.string().optional(),
          tenant_id: tool.schema.string().optional(),
          scopes: stringArraySchema.optional(),
          interval_seconds: tool.schema.number().int().positive().optional(),
          timeout_seconds: tool.schema.number().int().positive().optional()
        },
        async execute(args) {
          const pending = loadPendingAuth()
          const clientId = getClientId(args.client_id || pending?.clientId)
          const tenantId = getTenantId(args.tenant_id || pending?.tenantId)
          const scope = getScopeString(
            args.scopes || (pending?.scope ? pending.scope.split(" ") : undefined)
          )
          const deviceCode = args.device_code || pending?.deviceCode

          if (!deviceCode) {
            throw new Error("No device code is available. Start with teams_auth_device_start first.")
          }

          const result = await pollForDeviceToken({
            clientId,
            tenantId,
            scope,
            deviceCode,
            intervalSeconds: args.interval_seconds || pending?.intervalSeconds || 5,
            timeoutSeconds: args.timeout_seconds || 60
          })

          return JSON.stringify(result, null, 2)
        }
      }),

      teams_auth_logout: tool({
        description: "Clear the stored Teams authentication and any pending device login.",
        args: {},
        async execute() {
          clearAuth()
          clearPendingAuth()
          return JSON.stringify(
            {
              ok: true,
              authenticated: false,
              auth_file: AUTH_FILE_PATH,
              pending_auth_file: PENDING_AUTH_FILE_PATH
            },
            null,
            2
          )
        }
      }),

      teams_graph_request: tool({
        description:
          "Send a direct Microsoft Graph request for Teams-related workflows. Use the loaded Teams skill for path and payload examples.",
        args: {
          path: tool.schema.string(),
          method: tool.schema.string().optional(),
          query: jsonRecordSchema.optional(),
          body: jsonRecordSchema.optional(),
          force_refresh: tool.schema.boolean().optional()
        },
        async execute(args) {
          const result = await executeGraphRequest(args)
          return JSON.stringify(result, null, 2)
        }
      }),

      teams_ping: tool({
        description: "Validate Microsoft Graph connectivity by reading the authenticated user profile.",
        args: {
          force_refresh: tool.schema.boolean().optional()
        },
        async execute(args) {
          const result = await executeGraphRequest({
            path: "/me",
            method: "GET",
            query: {
              "$select": "id,displayName,userPrincipalName,mail"
            },
            force_refresh: args.force_refresh
          })
          return JSON.stringify(result, null, 2)
        }
      }),

      teams_list_chats: tool({
        description:
          "List recent chats with human-friendly labels, participants and message previews.",
        args: {
          limit: tool.schema.number().int().positive().optional(),
          query: tool.schema.string().optional(),
          force_refresh: tool.schema.boolean().optional()
        },
        async execute(args) {
          const chats = await listChatSummaries(
            clampPositiveInt(args.limit, DEFAULT_CHAT_LIST_LIMIT),
            Boolean(args.force_refresh)
          )
          const filtered = filterAndSortMatches(chats, args.query, (chat) => [
            chat.label,
            chat.topic,
            ...chat.memberLabels
          ])

          return JSON.stringify({ count: filtered.length, chats: filtered }, null, 2)
        }
      }),

      teams_read_chat_messages: tool({
        description:
          "Read messages from a chat using chat_id, chat_name or participant_name for a more comfortable lookup.",
        args: {
          chat_id: tool.schema.string().optional(),
          chat_name: tool.schema.string().optional(),
          participant_name: tool.schema.string().optional(),
          limit: tool.schema.number().int().positive().optional(),
          force_refresh: tool.schema.boolean().optional()
        },
        async execute(args) {
          const result = await listChatMessages(args)
          return JSON.stringify(result, null, 2)
        }
      }),

      teams_send_chat_message: tool({
        description:
          "Send a chat message using an existing chat reference, or create/reuse a chat from participant usernames when needed.",
        args: {
          chat_id: tool.schema.string().optional(),
          chat_name: tool.schema.string().optional(),
          participant_name: tool.schema.string().optional(),
          participant_username: tool.schema.string().optional(),
          participant_usernames: stringArraySchema.optional(),
          chat_topic: tool.schema.string().optional(),
          message: tool.schema.string(),
          content_type: tool.schema.string().optional(),
          force_refresh: tool.schema.boolean().optional()
        },
        async execute(args) {
          const result = await sendChatMessage(args)
          return JSON.stringify(result, null, 2)
        }
      }),

      teams_create_chat: tool({
        description:
          "Create or reuse a one-on-one or group chat from participant usernames (UPNs) or user ids.",
        args: {
          participant_username: tool.schema.string().optional(),
          participant_usernames: stringArraySchema.optional(),
          chat_topic: tool.schema.string().optional(),
          force_refresh: tool.schema.boolean().optional()
        },
        async execute(args) {
          const result = await createChat(args)
          return JSON.stringify(result, null, 2)
        }
      }),

      teams_list_teams: tool({
        description: "List joined Teams workspaces with optional fuzzy filtering by name.",
        args: {
          query: tool.schema.string().optional(),
          force_refresh: tool.schema.boolean().optional()
        },
        async execute(args) {
          const teams = await listTeams(Boolean(args.force_refresh))
          const filtered = filterAndSortMatches(teams, args.query, (team: any) => [
            team.displayName,
            team.description
          ])
          return JSON.stringify({ count: filtered.length, teams: filtered }, null, 2)
        }
      }),

      teams_list_channels: tool({
        description:
          "List channels for a team, or search channels across all joined teams when no team is specified.",
        args: {
          team_id: tool.schema.string().optional(),
          team_name: tool.schema.string().optional(),
          query: tool.schema.string().optional(),
          force_refresh: tool.schema.boolean().optional()
        },
        async execute(args) {
          const result = await listChannels(args)
          return JSON.stringify(result, null, 2)
        }
      }),

      teams_read_channel_messages: tool({
        description:
          "Read channel messages using team/channel names when possible, not only raw ids.",
        args: {
          team_id: tool.schema.string().optional(),
          team_name: tool.schema.string().optional(),
          channel_id: tool.schema.string().optional(),
          channel_name: tool.schema.string().optional(),
          limit: tool.schema.number().int().positive().optional(),
          force_refresh: tool.schema.boolean().optional()
        },
        async execute(args) {
          const result = await readChannelMessages(args)
          return JSON.stringify(result, null, 2)
        }
      }),

      teams_send_channel_message: tool({
        description:
          "Send a Teams channel message using team/channel names instead of forcing raw Graph ids.",
        args: {
          team_id: tool.schema.string().optional(),
          team_name: tool.schema.string().optional(),
          channel_id: tool.schema.string().optional(),
          channel_name: tool.schema.string().optional(),
          message: tool.schema.string(),
          content_type: tool.schema.string().optional(),
          force_refresh: tool.schema.boolean().optional()
        },
        async execute(args) {
          const result = await sendChannelMessage(args)
          return JSON.stringify(result, null, 2)
        }
      })
    }
  }
}

export default {
  id: "teams",
  server: TeamsPlugin
}
