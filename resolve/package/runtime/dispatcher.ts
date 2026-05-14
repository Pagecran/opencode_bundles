import { validateAndNormalizeArgs } from "../_runtime/manifest_args"

import { getResolveHostStatus, runResolveHostAction } from "./host"
import { getMethodManifest, listMethodManifests } from "./method_registry"

type HandlerArgs = Record<string, unknown>
type MethodHandler = (args: HandlerArgs) => Promise<unknown> | unknown

const METHOD_HANDLERS: Record<string, MethodHandler> = {
  resolve_host_status(args) {
    return getResolveHostStatus(args)
  },
  resolve_ping(args) {
    return runResolveHostAction("ping", args)
  },
  resolve_get_current_page(args) {
    return runResolveHostAction("get_current_page", args)
  },
  resolve_list_projects(args) {
    return runResolveHostAction("list_projects", args)
  },
  resolve_get_project_info(args) {
    return runResolveHostAction("get_project_info", args)
  },
  resolve_list_timelines(args) {
    return runResolveHostAction("list_timelines", args)
  },
  resolve_get_fusion_comp(args) {
    return runResolveHostAction("get_current_comp", args)
  },
  resolve_list_fusion_tools(args) {
    return runResolveHostAction("list_fusion_tools", args)
  },
  resolve_probe_fusion_tool(args) {
    return runResolveHostAction("probe_fusion_tool", args)
  },
  resolve_add_fusion_tool(args) {
    return runResolveHostAction("add_fusion_tool", args)
  },
  resolve_set_fusion_inputs(args) {
    return runResolveHostAction("set_fusion_inputs", args)
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
    throw new Error(`Unknown Resolve method: ${name}`)
  }

  const handler = METHOD_HANDLERS[name]
  if (!handler) {
    throw new Error(`Resolve method is declared but not handled: ${name}`)
  }

  const normalized = validateAndNormalizeArgs(manifest, args)
  return handler(normalized)
}
