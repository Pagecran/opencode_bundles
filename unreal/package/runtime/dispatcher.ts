import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { createHostDispatcher, type BridgeProfile } from "../_runtime/host_dispatcher"
import type { DispatchOptions } from "../_runtime/types"

import { getUnrealMethodRegistry } from "./method_registry"

const RESULT_MARKER = "__OPENCODE_UNREAL_RESULT__"
const RUNTIME_DIR = dirname(fileURLToPath(import.meta.url))
const SCRIPTS_DIR = resolve(RUNTIME_DIR, "..", "scripts")

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

const unrealProfile: BridgeProfile = {
  bundleName: "unreal",
  scriptsDir: SCRIPTS_DIR,
  resultMarker: RESULT_MARKER,
  executePrimitive: "execute_python",
  extractStdout(response: unknown) {
    return extractPythonOutputs(response).join("\n")
  },
  detectHardFailure(response: unknown) {
    if (
      typeof response === "object" &&
      response !== null &&
      "ok" in response &&
      (response as { ok?: unknown }).ok === false
    ) {
      const pythonResponse = response as { command_result?: unknown }
      return typeof pythonResponse.command_result === "string"
        ? pythonResponse.command_result
        : "Python execution failed"
    }

    return null
  },
  buildHostFunctionCode() {
    return null
  }
}

const dispatch = createHostDispatcher(getUnrealMethodRegistry(), unrealProfile)

export async function dispatchUnrealMethod(options: DispatchOptions) {
  return dispatch(options)
}
