// Public entrypoint of @pagecran/bundle-runtime.
// Re-exports the stable surface used by Pagecran OpenCode bundles.

export type {
  JsonObject,
  MethodArgManifest,
  MethodArgType,
  MethodExecution,
  MethodKind,
  MethodManifest,
  MethodRequires,
  MethodRisk,
  MethodVerify,
  RawBridgeRequest,
  DispatchOptions
} from "./types"

export { ensureJsonObject, isRecord } from "./validators"
export { toJson, errorToMessage } from "./output"
export { validateAndNormalizeArgs } from "./manifest_args"

export { loadMethodRegistry } from "./method_registry"
export type { MethodRegistry } from "./method_registry"

export { createHostDispatcher } from "./host_dispatcher"
export type { BridgeProfile, HostDispatcher } from "./host_dispatcher"

export { buildToolArgs, buildPluginTools } from "./plugin_tools"
export type { ToolExecutor } from "./plugin_tools"

export { runCoherenceCheck, printCoherenceReport } from "./coherence_check"
export type { CoherenceCheckOptions, CoherenceReport } from "./coherence_check"
