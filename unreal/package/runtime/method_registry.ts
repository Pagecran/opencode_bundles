import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { loadMethodRegistry } from "../_runtime/method_registry"
import type { MethodManifest } from "../_runtime/types"

const runtimeDir = dirname(fileURLToPath(import.meta.url))
const registry = loadMethodRegistry(join(runtimeDir, "..", "methods"))

export function getUnrealMethodDefinition(method: string): MethodManifest | null {
  return registry.get(method)
}

export function listUnrealMethodDefinitions(): MethodManifest[] {
  return registry.list()
}

export function getUnrealMethodRegistry() {
  return registry
}
