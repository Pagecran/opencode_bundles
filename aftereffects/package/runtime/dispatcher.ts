import { validateAndNormalizeArgs } from "../_runtime/manifest_args"

import { cleanupOldBridgeFiles, getBridgeStatus, sendBridgeCommand } from "./bridge"
import { getMethodManifest, listMethodManifests } from "./method_registry"

type HandlerArgs = Record<string, unknown>
type MethodHandler = (args: HandlerArgs) => Promise<unknown> | unknown

const METHOD_HANDLERS: Record<string, MethodHandler> = {
  ae_bridge_status() {
    return getBridgeStatus()
  },
  ae_cleanup_bridge_files(args) {
    return cleanupOldBridgeFiles(typeof args.max_age_ms === "number" ? args.max_age_ms : undefined)
  },
  ae_ping(args) {
    return sendBridgeCommand("ping", {}, { timeout_ms: args.timeout_ms })
  },
  ae_get_project_info(args) {
    return sendBridgeCommand("get_project_info", {}, { timeout_ms: args.timeout_ms })
  },
  ae_list_compositions(args) {
    return sendBridgeCommand("list_compositions", {}, { timeout_ms: args.timeout_ms })
  },
  ae_create_composition(args) {
    return sendBridgeCommand("create_composition", args, { timeout_ms: args.timeout_ms })
  },
  ae_add_text_layer(args) {
    return sendBridgeCommand("add_text_layer", args, { timeout_ms: args.timeout_ms })
  },
  ae_set_layer_properties(args) {
    return sendBridgeCommand("set_layer_properties", args, { timeout_ms: args.timeout_ms })
  },
  ae_execute_script(args) {
    return sendBridgeCommand("execute_script", args, { timeout_ms: args.timeout_ms })
  }
}

export function listPublicMethods() {
  return listMethodManifests()
}

export function listHandledMethodNames() {
  return Object.keys(METHOD_HANDLERS).sort()
}

export async function dispatchDeclaredMethod(name: string, args: HandlerArgs = {}) {
  const manifest = getMethodManifest(name)
  if (!manifest) {
    throw new Error(`Unknown After Effects method: ${name}`)
  }

  const handler = METHOD_HANDLERS[name]
  if (!handler) {
    throw new Error(`After Effects method is declared but not handled: ${name}`)
  }

  const normalized = validateAndNormalizeArgs(manifest, args)
  return handler(normalized)
}
