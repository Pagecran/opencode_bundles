import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { createHostDispatcher, type BridgeProfile } from "../_runtime/host_dispatcher"
import type { DispatchOptions } from "../_runtime/types"

import { dispatchLocalBlenderMethod, isLocalBlenderMethod } from "./local_handlers"
import { getBlenderMethodRegistry } from "./method_registry"

const RESULT_MARKER = "__OPENCODE_BLENDER_RESULT__"
const RUNTIME_DIR = dirname(fileURLToPath(import.meta.url))
const SCRIPTS_DIR = resolve(RUNTIME_DIR, "..", "scripts")

const blenderProfile: BridgeProfile = {
  bundleName: "blender",
  scriptsDir: SCRIPTS_DIR,
  resultMarker: RESULT_MARKER,
  executePrimitive: "execute_code",
  extractStdout(response: unknown) {
    const stdout =
      typeof response === "object" &&
      response !== null &&
      "result" in response &&
      typeof (response as { result?: unknown }).result === "string"
        ? (response as { result: string }).result
        : null

    if (!stdout) {
      throw new Error("Blender bridge returned no stdout")
    }

    return stdout
  }
}

const dispatch = createHostDispatcher(getBlenderMethodRegistry(), blenderProfile)

export async function dispatchBlenderMethod(options: DispatchOptions) {
  if (options.method !== "get_capabilities" && options.method !== "list_commands") {
    const definition = getBlenderMethodRegistry().get(options.method)
    if (definition && isLocalBlenderMethod(definition)) {
      return dispatchLocalBlenderMethod(definition, options)
    }
  }

  return dispatch(options)
}
