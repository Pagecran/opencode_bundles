import { validateAndNormalizeArgs } from "../_runtime/manifest_args"
import { ensureJsonObject } from "../_runtime/validators"
import type { DispatchOptions, MethodManifest } from "../_runtime/types"

import {
  getBlendfileSummaryDatablocks,
  getBlendfileSummaryLinkedLibraries,
  getBlendfileSummaryMissingFiles,
  getBlendfileSummaryPathInfo
} from "./audit"
import {
  getBlenderApiDocs,
  searchBlenderApiDocs,
  searchBlenderManual
} from "./docs"

type Handler = (params: Record<string, unknown>, timeoutMs?: number) => unknown | Promise<unknown>

const handlers = new Map<string, Handler>([
  ["docs.search_api", searchBlenderApiDocs],
  ["docs.search_manual", searchBlenderManual],
  ["docs.get_api", getBlenderApiDocs],
  ["audit.path_info", getBlendfileSummaryPathInfo],
  ["audit.datablocks", getBlendfileSummaryDatablocks],
  ["audit.missing_files", getBlendfileSummaryMissingFiles],
  ["audit.linked_libraries", getBlendfileSummaryLinkedLibraries]
])

function normalizeHandlerName(definition: MethodManifest) {
  const handler = definition.execution.handler
  if (typeof handler !== "string" || !handler.trim()) {
    throw new Error(`Method ${definition.name}: ${definition.execution.strategy} requires execution.handler`)
  }
  return handler.trim()
}

export function isLocalBlenderMethod(definition: MethodManifest) {
  return definition.execution.strategy === "local_handler" || definition.execution.strategy === "host_cli"
}

export async function dispatchLocalBlenderMethod(
  definition: MethodManifest,
  options: DispatchOptions
) {
  const handlerName = normalizeHandlerName(definition)
  const handler = handlers.get(handlerName)
  if (!handler) {
    throw new Error(`Method ${definition.name}: unknown local handler '${handlerName}'`)
  }

  const rawParams = ensureJsonObject(options.params)
  const params = definition.args ? validateAndNormalizeArgs(definition, rawParams) : rawParams
  return handler(params, options.timeoutMs)
}

export function listLocalBlenderHandlers() {
  return Array.from(handlers.keys()).sort((a, b) => a.localeCompare(b))
}
