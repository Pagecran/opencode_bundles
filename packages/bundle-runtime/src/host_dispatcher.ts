import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import type {
  DispatchOptions,
  JsonObject,
  MethodExecution,
  MethodManifest,
  MethodRequires
} from "./types"
import type { MethodRegistry } from "./method_registry"
import { ensureJsonObject } from "./validators"

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------
//
// A bridge profile captures the small set of differences between host-backed
// bundles (Blender uses execute_code + plain stdout, Unreal uses execute_python
// with command_result/log_output, etc.).
//
// Adding a new host-backed bundle = declaring one BridgeProfile.

export type BridgeProfile = {
  bundleName: string
  // Path to <package>/scripts/ on disk (resolved by the consumer).
  scriptsDir: string
  // Marker emitted by the host script around the JSON result.
  resultMarker: string
  // Bridge primitive used to ship Python code for host_script / host_function.
  executePrimitive: string
  // Convert the raw bridge response into a single string we can scan for the marker.
  extractStdout: (response: unknown) => string
  // Optional: throw if the bridge already signaled a hard failure.
  detectHardFailure?: (response: unknown) => string | null
  // Optional: bundle-specific host_function support (Blender). Receive
  // (params, execution) and return Python source. Return null to signal
  // "this strategy is not supported by this bundle".
  buildHostFunctionCode?: (params: JsonObject, execution: MethodExecution) => string | null
}

// ---------------------------------------------------------------------------
// Python code generation (shared)
// ---------------------------------------------------------------------------

function pyStr(value: string) {
  return JSON.stringify(value)
}

function buildHostScriptCode(
  params: JsonObject,
  execution: MethodExecution,
  profile: BridgeProfile
): string {
  if (typeof execution.script !== "string") {
    throw new Error(`Method execution.strategy=host_script requires execution.script`)
  }

  const argsJson = JSON.stringify(params)
  const entrypoint = (execution.function as string | undefined) || "main"
  const scriptSource = readFileSync(resolve(profile.scriptsDir, execution.script), "utf8")
  const scriptsPath = pyStr(profile.scriptsDir)

  return [
    "import json",
    "import sys",
    `if ${scriptsPath} not in sys.path: sys.path.insert(0, ${scriptsPath})`,
    `__op_args = json.loads(${pyStr(argsJson)})`,
    scriptSource,
    `__op_result = ${entrypoint}(__op_args)`,
    `print(${pyStr(profile.resultMarker)} + json.dumps(__op_result, default=str))`
  ].join("\n")
}

function defaultBuildHostFunctionCode(
  params: JsonObject,
  execution: MethodExecution,
  profile: BridgeProfile
): string {
  if (
    typeof execution.package !== "string" ||
    typeof execution.module !== "string" ||
    typeof execution.function !== "string"
  ) {
    throw new Error(`Method execution.strategy=host_function requires package/module/function`)
  }

  const argsJson = JSON.stringify(params)
  const scriptsPath = pyStr(profile.scriptsDir)
  const moduleName = `${execution.package}.${execution.module}`

  return [
    "import importlib",
    "import json",
    "import sys",
    `if ${scriptsPath} not in sys.path: sys.path.insert(0, ${scriptsPath})`,
    `__op_module = importlib.import_module(${pyStr(moduleName)})`,
    `__op_function = getattr(__op_module, ${pyStr(execution.function)})`,
    `__op_args = json.loads(${pyStr(argsJson)})`,
    "__op_result = __op_function(**__op_args)",
    `print(${pyStr(profile.resultMarker)} + json.dumps(__op_result, default=str))`
  ].join("\n")
}

// ---------------------------------------------------------------------------
// Result parsing (shared)
// ---------------------------------------------------------------------------

function parseExecuteResult(method: string, response: unknown, profile: BridgeProfile) {
  const failure = profile.detectHardFailure?.(response)
  if (failure) {
    throw new Error(failure)
  }

  const stdout = profile.extractStdout(response)
  const markerIndex = stdout.lastIndexOf(profile.resultMarker)

  if (markerIndex === -1) {
    throw new Error(
      `${profile.bundleName} bundle method '${method}' did not emit a structured result marker`
    )
  }

  const rawJson = stdout.slice(markerIndex + profile.resultMarker.length).trim()
  if (!rawJson) {
    throw new Error(
      `${profile.bundleName} bundle method '${method}' emitted an empty structured result`
    )
  }

  try {
    return JSON.parse(rawJson)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `${profile.bundleName} bundle method '${method}' returned invalid JSON: ${message}`
    )
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

async function executeDefinition(
  definition: MethodManifest,
  options: DispatchOptions,
  profile: BridgeProfile
) {
  const params = ensureJsonObject(options.params)
  const execution = definition.execution

  if (execution.strategy === "bridge_method") {
    if (typeof execution.method !== "string") {
      throw new Error(`Method ${definition.name}: bridge_method requires execution.method`)
    }
    return options.requestRaw({
      method: execution.method,
      params,
      timeoutMs: options.timeoutMs,
      host: options.host,
      port: options.port
    })
  }

  let code: string
  if (execution.strategy === "host_script") {
    code = buildHostScriptCode(params, execution, profile)
  } else if (execution.strategy === "host_function") {
    const builder = profile.buildHostFunctionCode
      ? profile.buildHostFunctionCode
      : (p: JsonObject, e: MethodExecution) => defaultBuildHostFunctionCode(p, e, profile)
    const generated = builder(params, execution)
    if (generated === null) {
      throw new Error(
        `Method ${definition.name}: execution.strategy=host_function not supported by ${profile.bundleName}`
      )
    }
    code = generated
  } else {
    throw new Error(
      `Method ${definition.name}: unsupported execution.strategy '${execution.strategy}' for host-backed bundle`
    )
  }

  const response = await options.requestRaw({
    method: profile.executePrimitive,
    params: { code },
    timeoutMs: options.timeoutMs,
    host: options.host,
    port: options.port
  })

  return parseExecuteResult(definition.name, response, profile)
}

async function buildCapabilities(
  options: DispatchOptions,
  registry: MethodRegistry,
  profile: BridgeProfile
) {
  const methods = registry.list().map((definition) => ({
    name: definition.name,
    domain: definition.domain,
    description: definition.description,
    kind: definition.kind,
    risk: definition.risk,
    execution: definition.execution.strategy,
    requires: (definition.requires ?? {}) as MethodRequires
  }))

  try {
    const bridge = await options.requestRaw({
      method: "get_capabilities",
      params: {},
      timeoutMs: options.timeoutMs,
      host: options.host,
      port: options.port
    })

    return {
      bundle_name: profile.bundleName,
      commands: methods.map((method) => method.name),
      count: methods.length,
      methods,
      bridge
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      bundle_name: profile.bundleName,
      commands: methods.map((method) => method.name),
      count: methods.length,
      methods,
      bridge_error: message
    }
  }
}

export type HostDispatcher = (options: DispatchOptions) => Promise<unknown>

export function createHostDispatcher(
  registry: MethodRegistry,
  profile: BridgeProfile
): HostDispatcher {
  const passthroughMethods = new Set(["ping", profile.executePrimitive])

  return async function dispatch(options: DispatchOptions) {
    const method = options.method

    if (method === "get_capabilities") {
      return buildCapabilities(options, registry, profile)
    }

    if (method === "list_commands") {
      const commands = registry.list().map((definition) => definition.name)
      return { commands, count: commands.length }
    }

    if (passthroughMethods.has(method)) {
      return options.requestRaw({
        method,
        params: ensureJsonObject(options.params),
        timeoutMs: options.timeoutMs,
        host: options.host,
        port: options.port
      })
    }

    const definition = registry.get(method)
    if (!definition) {
      throw new Error(`Unknown ${profile.bundleName} bundle method '${method}'`)
    }

    return executeDefinition(definition, options, profile)
  }
}
