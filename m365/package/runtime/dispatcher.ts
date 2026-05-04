import { getAuthStatus } from "./auth"
import { resolveCapabilities } from "./capability_resolver"
import {
  listWorkbookWorksheets,
  readWorkbookRange,
  writeWorkbookRange
} from "./excel"
import { executeGraphRequest, pingGraph } from "./graph"
import {
  createDriveFolder,
  createShareLink,
  deleteDriveItem,
  downloadDriveItem,
  getDriveItem,
  listDocumentLibraries,
  listDriveItems,
  listFileVersions,
  listSites,
  resolveSiteReference,
  searchDriveItems,
  updateDriveItem,
  uploadSmallDriveItem
} from "./m365"
import { getMethodManifest, listMethodManifests } from "./method_registry"
import type { MethodManifest } from "../_runtime/types"
import { validateAndNormalizeArgs } from "../_runtime/manifest_args"
import { batchDriveItems, notify, searchWorkspace } from "./openwork"
import {
  getMailboxSettings,
  searchMailMessages,
  sendMailMessage,
  setAutomaticReplies
} from "./outlook"
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
  DEFAULT_APP_NAME,
  ensureDeviceCodeBootstrap,
  getClientId,
  getScopeList,
  getScopeString,
  getTenantId,
  getValidAuth,
  loadPendingAuth,
  pollForDeviceToken
} from "./auth"

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
  "channelmessage.read.all": ["ChannelMessage.Read.All"],
  "mail.read": ["Mail.Read", "Mail.ReadWrite"],
  "mail.send": ["Mail.Send"],
  "mailboxsettings.read": ["MailboxSettings.Read", "MailboxSettings.ReadWrite"],
  "mailboxsettings.readwrite": ["MailboxSettings.ReadWrite"]
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
    const scopeList = getScopeList(getScopeString(readStringArray(args.scopes)))

    try {
      const auth = await getValidAuth()
      const currentScopes = getScopeList(auth.scope)
      if (auth.clientId === clientId && auth.tenantId === tenantId) {
        const missingScopes = getMissingDeclaredScopes(
          {
            name: "m365_auth_device_start",
            domain: "auth",
            description: "",
            kind: "hostless",
            risk: "read",
            execution: { strategy: "direct_api", tool: "m365_auth_device_start" },
            requires: {
              auth: false,
              scopes: scopeList
            }
          },
          currentScopes
        )

        if (missingScopes.length === 0) {
          return {
            ok: true,
            authenticated: true,
            already_authenticated: true,
            app_name: DEFAULT_APP_NAME,
            client_id: auth.clientId,
            tenant_id: auth.tenantId,
            scope: auth.scope,
            scope_list: currentScopes,
            auth_file: getAuthStatus().auth_file,
            expires_at: auth.expiresAt
          }
        }
      }
    } catch {
      // No valid stored auth yet: continue with device-code bootstrap below.
    }

    const bootstrap = await ensureDeviceCodeBootstrap({ clientId, tenantId, scopes: scopeList })
    const pending = bootstrap.pending

    return {
      ok: true,
      authenticated: false,
      auto_started: bootstrap.autoStarted,
      app_name: DEFAULT_APP_NAME,
      client_id: clientId,
      tenant_id: tenantId,
      scope: pending.scope,
      scope_list: bootstrap.scopeList,
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
    if (!pending) {
      try {
        const auth = await getValidAuth()
        return {
          authenticated: true,
          pending: false,
          app_name: DEFAULT_APP_NAME,
          tokenFile: getAuthStatus().auth_file,
          expiresAt: auth.expiresAt,
          scope: auth.scope,
          scopeList: getScopeList(auth.scope),
          tenantId: auth.tenantId,
          clientId: auth.clientId,
          hasRefreshToken: Boolean(auth.refreshToken)
        }
      } catch {
        // Fall through to the usual missing-device-code error below.
      }
    }

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
  async m365_search_drive_items(args) {
    return searchDriveItems(args as Parameters<typeof searchDriveItems>[0])
  },
  async m365_create_drive_folder(args) {
    return createDriveFolder(args as Parameters<typeof createDriveFolder>[0])
  },
  async m365_download_drive_item(args) {
    return downloadDriveItem(args as Parameters<typeof downloadDriveItem>[0])
  },
  async m365_upload_small_drive_item(args) {
    return uploadSmallDriveItem(args as Parameters<typeof uploadSmallDriveItem>[0])
  },
  async m365_update_drive_item(args) {
    return updateDriveItem(args as Parameters<typeof updateDriveItem>[0])
  },
  async m365_delete_drive_item(args) {
    return deleteDriveItem(args as Parameters<typeof deleteDriveItem>[0])
  },
  async m365_search_workspace(args) {
    return searchWorkspace(args as Parameters<typeof searchWorkspace>[0])
  },
  async m365_batch_drive_items(args) {
    return batchDriveItems(args as Parameters<typeof batchDriveItems>[0])
  },
  async m365_notify(args) {
    return notify(args as Parameters<typeof notify>[0])
  },
  async m365_mail_search_messages(args) {
    return searchMailMessages(args as Parameters<typeof searchMailMessages>[0])
  },
  async m365_mail_send_message(args) {
    return sendMailMessage(args as Parameters<typeof sendMailMessage>[0])
  },
  async m365_mail_get_mailbox_settings(args) {
    return getMailboxSettings(args as Parameters<typeof getMailboxSettings>[0])
  },
  async m365_mail_set_automatic_replies(args) {
    return setAutomaticReplies(args as Parameters<typeof setAutomaticReplies>[0])
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

function getMissingDeclaredScopes(manifest: MethodManifest, availableScopes: string[]) {
  const declaredScopes = manifest.requires?.scopes || []
  const availableScopeSet = new Set(availableScopes.map((scope) => scope.toLowerCase()))
  const missingScopes: string[] = []

  for (const scopeEntry of declaredScopes) {
    if (isHumanReadableScopeNote(scopeEntry)) {
      continue
    }

    const alternatives = splitScopeAlternatives(scopeEntry)
    const isSatisfied = alternatives.some((candidate) =>
      getSatisfyingScopes(candidate).some((acceptableScope) =>
        availableScopeSet.has(acceptableScope.toLowerCase())
      )
    )

    if (!isSatisfied) {
      missingScopes.push(scopeEntry)
    }
  }

  return missingScopes
}

function collectBootstrapScopes(manifest: MethodManifest) {
  const bootstrapScopes = getScopeList(getScopeString())

  for (const scopeEntry of manifest.requires?.scopes || []) {
    if (isHumanReadableScopeNote(scopeEntry)) {
      continue
    }

    for (const alternative of splitScopeAlternatives(scopeEntry)) {
      bootstrapScopes.push(...getSatisfyingScopes(alternative))
    }
  }

  return getScopeList(bootstrapScopes.join(" "))
}

function buildAuthBootstrapError(
  manifest: MethodManifest,
  autoStarted: boolean,
  pending: NonNullable<ReturnType<typeof loadPendingAuth>>,
  missingScopes: string[] = []
) {
  const intro = autoStarted
    ? `Microsoft 365 device-code login was started automatically for ${DEFAULT_APP_NAME} before running ${manifest.name}.`
    : `Microsoft 365 device-code login is already pending for ${DEFAULT_APP_NAME} before running ${manifest.name}.`
  const scopeNote =
    missingScopes.length > 0
      ? ` Missing required scopes: ${missingScopes.join(", ")}.`
      : ""
  const verificationUrl = pending.verificationUriComplete || pending.verificationUri

  return [
    intro + scopeNote,
    `Open ${verificationUrl} and enter code ${pending.userCode}.`,
    "Then retry the command or call m365_auth_device_poll."
  ].join(" ")
}

async function verifyMethodRequirements(manifest: MethodManifest) {
  if (!manifest.requires?.auth) {
    return
  }

  let auth
  try {
    auth = await getValidAuth()
  } catch {
    const bootstrap = await ensureDeviceCodeBootstrap({ scopes: collectBootstrapScopes(manifest) })
    throw new Error(buildAuthBootstrapError(manifest, bootstrap.autoStarted, bootstrap.pending))
  }

  const missingScopes = getMissingDeclaredScopes(manifest, getScopeList(auth.scope))
  if (missingScopes.length > 0) {
    const bootstrap = await ensureDeviceCodeBootstrap({
      clientId: auth.clientId,
      tenantId: auth.tenantId,
      scopes: [...getScopeList(auth.scope), ...collectBootstrapScopes(manifest)]
    })
    throw new Error(buildAuthBootstrapError(manifest, bootstrap.autoStarted, bootstrap.pending, missingScopes))
  }
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

  await verifyMethodRequirements(manifest)

  const normalizedArgs = validateAndNormalizeArgs(manifest, args)

  const handler = METHOD_HANDLERS[name]
  if (!handler) {
    throw new Error(`No runtime handler is registered for method ${manifest.name}.`)
  }

  return handler(normalizedArgs)
}
