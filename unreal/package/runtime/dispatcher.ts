import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { getUnrealMethodDefinition, listUnrealMethodDefinitions } from "./method_registry"
import { ensureJsonObject } from "./validators"
import type { JsonObject, UnrealDispatchOptions, UnrealMethodExecution } from "./types"

const RESULT_MARKER = "__OPENCODE_UNREAL_RESULT__"
const RUNTIME_DIR = dirname(fileURLToPath(import.meta.url))
const SCRIPTS_DIR = resolve(RUNTIME_DIR, "..", "scripts")

function toPythonStringLiteral(value: string) {
  return JSON.stringify(value)
}

function readBundleScript(script: string) {
  return readFileSync(resolve(SCRIPTS_DIR, script), "utf8")
}

function buildHostScriptCode(
  params: JsonObject,
  execution: Extract<UnrealMethodExecution, { strategy: "host_script" }>
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

function extractPythonOutputs(response: unknown) {
  if (typeof response !== "object" || response === null) {
    return [] as string[]
  }

  const outputs: string[] = []
  const result = response as {
    command_result?: unknown
    log_output?: Array<{ output?: unknown }>
  }

  if (typeof result.command_result === "string" && result.command_result.length > 0) {
    outputs.push(result.command_result)
  }

  if (Array.isArray(result.log_output)) {
    for (const entry of result.log_output) {
      if (entry && typeof entry.output === "string") {
        outputs.push(entry.output)
      }
    }
  }

  return outputs
}

function parseExecutePythonResult(method: string, response: unknown) {
  const outputs = extractPythonOutputs(response)
  const combinedOutput = outputs.join("\n")
  const markerIndex = combinedOutput.lastIndexOf(RESULT_MARKER)

  if (markerIndex === -1) {
    throw new Error(`Unreal bundle method '${method}' did not emit a structured result marker`)
  }

  const rawJson = combinedOutput.slice(markerIndex + RESULT_MARKER.length).trim()
  if (!rawJson) {
    throw new Error(`Unreal bundle method '${method}' emitted an empty structured result`)
  }

  try {
    return JSON.parse(rawJson)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Unreal bundle method '${method}' returned invalid JSON: ${message}`)
  }
}

async function executeDefinition(options: UnrealDispatchOptions) {
  const definition = getUnrealMethodDefinition(options.method)
  if (!definition) {
    throw new Error(`Unknown Unreal bundle method '${options.method}'`)
  }

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

  const code = buildHostScriptCode(params, execution)
  const response = await options.requestRaw({
    method: "execute_python",
    params: { code },
    timeoutMs: options.timeoutMs,
    host: options.host,
    port: options.port
  })

  if (
    typeof response === "object" &&
    response !== null &&
    "ok" in response &&
    (response as { ok?: unknown }).ok === false
  ) {
    const pythonResponse = response as { command_result?: unknown }
    const commandResult =
      typeof pythonResponse.command_result === "string"
        ? pythonResponse.command_result
        : "Python execution failed"
    throw new Error(commandResult)
  }

  return parseExecutePythonResult(definition.name, response)
}

async function buildCapabilities(options: UnrealDispatchOptions) {
  const methods = listUnrealMethodDefinitions().map((definition) => ({
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
      bundle_name: "unreal",
      commands: methods.map((method) => method.name),
      count: methods.length,
      methods,
      bridge
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      bundle_name: "unreal",
      commands: methods.map((method) => method.name),
      count: methods.length,
      methods,
      bridge_error: message
    }
  }
}

export async function dispatchUnrealMethod(options: UnrealDispatchOptions) {
  const method = options.method

  if (method === "get_capabilities") {
    return buildCapabilities(options)
  }

  if (method === "list_commands") {
    const commands = listUnrealMethodDefinitions().map((definition) => definition.name)
    return { commands, count: commands.length }
  }

  if (method === "ping" || method === "execute_python") {
    return options.requestRaw({
      method,
      params: ensureJsonObject(options.params),
      timeoutMs: options.timeoutMs,
      host: options.host,
      port: options.port
    })
  }

  return executeDefinition(options)
}
