import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { getBlenderMethodDefinition, listBlenderMethodDefinitions } from "./method_registry"
import { ensureJsonObject } from "./validators"
import type {
  BlenderDispatchOptions,
  BlenderMethodDefinition,
  BlenderMethodExecution,
  JsonObject
} from "./types"

const RESULT_MARKER = "__OPENCODE_BLENDER_RESULT__"
const RUNTIME_DIR = dirname(fileURLToPath(import.meta.url))
const SCRIPTS_DIR = resolve(RUNTIME_DIR, "..", "scripts")

function toPythonStringLiteral(value: string) {
  return JSON.stringify(value)
}

function buildHostFunctionCode(
  definition: BlenderMethodDefinition,
  params: JsonObject,
  execution: Extract<BlenderMethodExecution, { strategy: "host_function" }>
) {
  const argsJson = JSON.stringify(params)
  const scriptsPath = toPythonStringLiteral(SCRIPTS_DIR)

  return [
    "import importlib",
    "import json",
    "import sys",
    `if ${scriptsPath} not in sys.path: sys.path.insert(0, ${scriptsPath})`,
    `__op_module = importlib.import_module(${toPythonStringLiteral(`${execution.package}.${execution.module}`)})`,
    `__op_function = getattr(__op_module, ${toPythonStringLiteral(execution.function)})`,
    `__op_args = json.loads(${toPythonStringLiteral(argsJson)})`,
    "__op_result = __op_function(**__op_args)",
    `print(${toPythonStringLiteral(RESULT_MARKER)} + json.dumps(__op_result, default=str))`
  ].join("\n")
}

function readBundleScript(script: string) {
  return readFileSync(resolve(SCRIPTS_DIR, script), "utf8")
}

function buildHostScriptCode(
  definition: BlenderMethodDefinition,
  params: JsonObject,
  execution: Extract<BlenderMethodExecution, { strategy: "host_script" }>
) {
  const argsJson = JSON.stringify(params)
  const entrypoint = execution.function || "main"
  const scriptSource = readBundleScript(execution.script)
  const scriptsPath = toPythonStringLiteral(SCRIPTS_DIR)

  return [
    "import json",
    "import sys",
    `if ${scriptsPath} not in sys.path: sys.path.insert(0, ${scriptsPath})`,
    `__op_args = json.loads(${toPythonStringLiteral(argsJson)})`,
    scriptSource,
    `__op_result = ${entrypoint}(__op_args)`,
    `print(${toPythonStringLiteral(RESULT_MARKER)} + json.dumps(__op_result, default=str))`
  ].join("\n")
}

function parseExecuteCodeResult(method: string, response: unknown) {
  const stdout =
    typeof response === "object" &&
    response !== null &&
    "result" in response &&
    typeof (response as { result?: unknown }).result === "string"
      ? (response as { result: string }).result
      : null

  if (!stdout) {
    throw new Error(`Blender bridge returned no stdout for '${method}'`)
  }

  const markerIndex = stdout.lastIndexOf(RESULT_MARKER)
  if (markerIndex === -1) {
    throw new Error(`Blender bundle method '${method}' did not emit a structured result marker`)
  }

  const rawJson = stdout.slice(markerIndex + RESULT_MARKER.length).trim()
  if (!rawJson) {
    throw new Error(`Blender bundle method '${method}' emitted an empty structured result`)
  }

  try {
    return JSON.parse(rawJson)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Blender bundle method '${method}' returned invalid JSON: ${message}`)
  }
}

async function executeDefinition(definition: BlenderMethodDefinition, options: BlenderDispatchOptions) {
  const params = ensureJsonObject(options.params)
  const execution = definition.execution

  if (execution.strategy === "bridge_method") {
    return options.requestRaw({
      method: execution.method,
      params,
      timeoutMs: options.timeoutMs,
      host: options.host,
      port: options.port
    })
  }

  const code =
    execution.strategy === "host_script"
      ? buildHostScriptCode(definition, params, execution)
      : buildHostFunctionCode(definition, params, execution)
  const response = await options.requestRaw({
    method: "execute_code",
    params: { code },
    timeoutMs: options.timeoutMs,
    host: options.host,
    port: options.port
  })
  return parseExecuteCodeResult(definition.name, response)
}

async function buildCapabilities(options: BlenderDispatchOptions) {
  const methods = listBlenderMethodDefinitions().map((definition) => ({
    name: definition.name,
    domain: definition.domain,
    description: definition.description,
    kind: definition.kind,
    risk: definition.risk,
    execution: definition.execution.strategy,
    requires: definition.requires || {}
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
      bundle_name: "blender",
      commands: methods.map((method) => method.name),
      count: methods.length,
      methods,
      bridge
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      bundle_name: "blender",
      commands: methods.map((method) => method.name),
      count: methods.length,
      methods,
      bridge_error: message
    }
  }
}

export async function dispatchBlenderMethod(options: BlenderDispatchOptions) {
  const method = options.method

  if (method === "get_capabilities") {
    return buildCapabilities(options)
  }

  if (method === "list_commands") {
    const commands = listBlenderMethodDefinitions().map((definition) => definition.name)
    return { commands, count: commands.length }
  }

  if (method === "ping" || method === "execute_code") {
    return options.requestRaw({
      method,
      params: ensureJsonObject(options.params),
      timeoutMs: options.timeoutMs,
      host: options.host,
      port: options.port
    })
  }

  const definition = getBlenderMethodDefinition(method)
  if (!definition) {
    throw new Error(`Unknown Blender bundle method '${method}'`)
  }

  return executeDefinition(definition, options)
}
