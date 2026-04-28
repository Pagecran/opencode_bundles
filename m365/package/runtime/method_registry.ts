import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { loadMethodRegistry } from "../_runtime/method_registry"
import type { MethodManifest } from "../_runtime/types"

// Re-export the manifest types so the rest of the bundle keeps a stable import path.
export type {
  MethodArgManifest,
  MethodArgType,
  MethodManifest
} from "../_runtime/types"

function getMethodsRoot() {
  const runtimeDir = dirname(fileURLToPath(import.meta.url))
  return join(runtimeDir, "..", "methods")
}

let cached: ReturnType<typeof loadMethodRegistry> | null = null

function getRegistry() {
  if (!cached) {
    cached = loadMethodRegistry(getMethodsRoot())
  }
  return cached
}

export function listMethodManifests(): MethodManifest[] {
  return getRegistry().list()
}

export function getMethodManifest(name: string): MethodManifest | null {
  return getRegistry().get(name)
}
