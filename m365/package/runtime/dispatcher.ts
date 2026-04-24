import { getAuthStatus } from "./auth"
import { resolveCapabilities } from "./capability_resolver"
import {
  listWorkbookWorksheets,
  readWorkbookRange,
  writeWorkbookRange
} from "./excel"
import { executeGraphRequest, pingGraph } from "./graph"
import {
  createShareLink,
  getDriveItem,
  listDocumentLibraries,
  listDriveItems,
  listFileVersions,
  listSites,
  resolveSiteReference
} from "./m365"
import { getMethodManifest, listMethodManifests, type MethodManifest } from "./method_registry"
import {
  createChat,
  listChannels,
  listChatMessages,
  listChats,
  listTeams,
  readChannelMessages,
  sendChannelMessage,
  sendChatMessage
} from "./teams"

import {
  clearAuth,
  clearPendingAuth,
  getClientId,
  getScopeString,
  getTenantId,
  loadPendingAuth,
  pollForDeviceToken,
  startDeviceCode
} from "./auth"
import { validateAndNormalizeArgs } from "./manifest_args"

type HandlerArgs = Record<string, unknown>
type MethodHandler = (args: HandlerArgs) => Promise<unknown>

const REQUIRED_SCOPE_EQUIVALENTS: Record<string, string[]> = {
  "user.read": ["User.Read"],
  "sites.read.all": ["Sites.Read.All", "Sites.ReadWrite.All"],
  "sites.readwrite.all": ["Sites.ReadWrite.All"],
  "files.read.all": ["Files.Read.All", "Files.ReadWrite.All"],
  "files.read": ["Files.Read", "Files.ReadWrite"],
  "files.readwrite.all": ["Files.ReadWrite.All"],
  "files.readwrite": ["Files.ReadWrite"],
  "chat.read": ["Chat.Read", "Chat.ReadWrite"],
  "chat.readwrite": ["Chat.ReadWrite"],
  "channelmessage.send": ["ChannelMessage.Send"],
  "channelmessage.read.all": ["ChannelMessage.Read.All"]
}

const METHOD_HANDLERS: Record<string, MethodHandler> = {
  async m365_auth_status() {
    return {
      ...getAuthStatus(),
      capabilities: resolveCapabilities()
    }
  },
  async m365_auth_device_start(args) {
    const clientId = getClientId(readOptionalString(args.client_id))
    const tenantId = getTenantId(readOptionalString(args.tenant_id))
    const scope = getScopeString(readStringArray(args.scopes))
    const pending = await startDeviceCode({ clientId, tenantId, scope })

    return {
      ok: true,
      authenticated: false,
      client_id: clientId,
      tenant_id: tenantId,
      scope,
      device_code: pending.deviceCode,
      user_code: pending.userCode,
      verification_uri: pending.verificationUri,
      verification_uri_complete: pending.verificationUriComplete,
      expires_at: pending.expiresAt,
      interval_seconds: pending.intervalSeconds,
      message:
        pending.message ||
        "Open the Microsoft verification URL, enter the user code, then call m365_auth_device_poll."
    }
  },
  async m365_auth_device_poll(args) {
    const pending = loadPendingAuth()
    const clientId = getClientId(readOptionalString(args.client_id) || pending?.clientId)
    const tenantId = getTenantId(readOptionalString(args.tenant_id) || pending?.tenantId)
    const explicitScopes = readStringArray(args.scopes)
    const scope = getScopeString(explicitScopes || (pending?.scope ? pending.scope.split(" ") : undefined))
    const deviceCode = readOptionalString(args.device_code) || pending?.deviceCode

    if (!deviceCode) {
      throw new Error("No device code is available. Start with m365_auth_device_start first.")
    }

    return pollForDeviceToken({
      clientId,
      tenantId,
      scope,
      deviceCode,
      intervalSeconds: readPositiveInt(args.interval_seconds) || pending?.intervalSeconds || 5,
      timeoutSeconds: readPositiveInt(args.timeout_seconds) || 60
    })
  },
  async m365_auth_logout() {
    clearAuth()
    clearPendingAuth()
    return {
      ok: true,
      authenticated: false
    }
  },
  async m365_graph_request(args) {
    return executeGraphRequest(args as Parameters<typeof executeGraphRequest>[0])
  },
  async m365_ping(args) {
    return pingGraph(Boolean(args.force_refresh))
  },
  async m365_list_sites(args) {
    return listSites(args as Parameters<typeof listSites>[0])
  },
  async m365_get_site(args) {
    return resolveSiteReference(args as Parameters<typeof resolveSiteReference>[0])
  },
  async m365_list_document_libraries(args) {
    return listDocumentLibraries(args as Parameters<typeof listDocumentLibraries>[0])
  },
  async m365_list_drive_items(args) {
    return listDriveItems(args as Parameters<typeof listDriveItems>[0])
  },
  async m365_get_drive_item(args) {
    return getDriveItem(args as Parameters<typeof getDriveItem>[0])
  },
  async m365_list_file_versions(args) {
    return listFileVersions(args as Parameters<typeof listFileVersions>[0])
  },
  async m365_create_share_link(args) {
    return createShareLink(args as Parameters<typeof createShareLink>[0])
  },
  async m365_excel_list_worksheets(args) {
    return listWorkbookWorksheets(args as Parameters<typeof listWorkbookWorksheets>[0])
  },
  async m365_excel_read_range(args) {
    return readWorkbookRange(args as Parameters<typeof readWorkbookRange>[0])
  },
  async m365_excel_write_range(args) {
    return writeWorkbookRange(args as Parameters<typeof writeWorkbookRange>[0])
  },
  async m365_teams_list_chats(args) {
    return listChats(args as Parameters<typeof listChats>[0])
  },
  async m365_teams_read_chat_messages(args) {
    return listChatMessages(args)
  },
  async m365_teams_send_chat_message(args) {
    return sendChatMessage(args)
  },
  async m365_teams_create_chat(args) {
    return createChat(args)
  },
  async m365_teams_list_teams(args) {
    return listTeams(args as Parameters<typeof listTeams>[0])
  },
  async m365_teams_list_channels(args) {
    return listChannels(args as Parameters<typeof listChannels>[0])
  },
  async m365_teams_read_channel_messages(args) {
    return readChannelMessages(args)
  },
  async m365_teams_send_channel_message(args) {
    return sendChannelMessage(args)
  }
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined
  }

  const strings = value
    .map((item) => (typeof item === "string" && item.trim() ? item : null))
    .filter((item): item is string => Boolean(item))

  return strings.length > 0 ? strings : undefined
}

function readPositiveInt(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined
  }

  return Math.floor(parsed)
}

function isHumanReadableScopeNote(value: string) {
  return /^depends on /i.test(value)
}

function splitScopeAlternatives(value: string) {
  return value
    .split(/\s+or\s+/i)
    .map((item) => item.trim())
    .filter(Boolean)
}

function getSatisfyingScopes(requiredScope: string) {
  const normalized = requiredScope.toLowerCase()
  return REQUIRED_SCOPE_EQUIVALENTS[normalized] || [requiredScope]
}

function checkDeclaredScopes(manifest: MethodManifest) {
  const declaredScopes = manifest.requires?.scopes || []
  if (declaredScopes.length === 0) {
    return
  }

  const authStatus = getAuthStatus()
  const availableScopes = new Set(authStatus.scope_list.map((scope) => scope.toLowerCase()))

  for (const scopeEntry of declaredScopes) {
    if (isHumanReadableScopeNote(scopeEntry)) {
      continue
    }

    const alternatives = splitScopeAlternatives(scopeEntry)
    const isSatisfied = alternatives.some((candidate) =>
      getSatisfyingScopes(candidate).some((acceptableScope) =>
        availableScopes.has(acceptableScope.toLowerCase())
      )
    )

    if (!isSatisfied) {
      throw new Error(
        `Missing required Microsoft Graph scope for ${manifest.name}: ${scopeEntry}. Re-authenticate with PAGECRAN_M365_SCOPES including the needed permission.`
      )
    }
  }
}

function verifyMethodRequirements(manifest: MethodManifest) {
  if (!manifest.requires) {
    return
  }

  if (manifest.requires.auth) {
    const capabilities = resolveCapabilities()
    if (!capabilities.authenticated) {
      throw new Error(`Microsoft 365 authentication is required for ${manifest.name}. Start with m365_auth_device_start.`)
    }
  }

  checkDeclaredScopes(manifest)
}

export function listPublicMethods() {
  return listMethodManifests().filter((manifest) => manifest.execution.tool === manifest.name)
}

export function listHandledMethodNames() {
  return Object.keys(METHOD_HANDLERS).sort((a, b) => a.localeCompare(b))
}

export async function dispatchDeclaredMethod(name: string, args: HandlerArgs = {}) {
  const manifest = getMethodManifest(name)
  if (!manifest) {
    throw new Error(`Unknown method manifest: ${name}`)
  }

  verifyMethodRequirements(manifest)

  const normalizedArgs = validateAndNormalizeArgs(manifest, args)

  const handler = METHOD_HANDLERS[name]
  if (!handler) {
    throw new Error(`No runtime handler is registered for method ${manifest.name}.`)
  }

  return handler(normalizedArgs)
}
