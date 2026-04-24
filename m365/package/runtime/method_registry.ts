import { readdirSync, readFileSync } from "node:fs"
import { dirname, extname, join } from "node:path"
import { fileURLToPath } from "node:url"

export type MethodArgType = "string" | "integer" | "number" | "boolean" | "object" | "array" | "any"

export type MethodArgManifest = {
  type: MethodArgType,
  required?: boolean,
  description?: string,
  default?: unknown,
  enum?: string[],
  items?: MethodArgManifest
}

export type MethodManifest = {
  name: string,
  domain: string,
  description: string,
  kind: "host-backed" | "hostless" | string,
  args: Record<string, MethodArgManifest>,
  returns: Record<string, unknown>,
  requires?: {
    auth?: boolean,
    scopes?: string[],
    env?: string[],
    [key: string]: unknown
  },
  execution: {
    strategy: string,
    tool?: string,
    [key: string]: unknown
  },
  verify: Record<string, unknown>,
  risk: string
}

let methodRegistryCache: Map<string, MethodManifest> | null = null

function getMethodsRoot() {
  const runtimeDir = dirname(fileURLToPath(import.meta.url))
  return join(runtimeDir, "..", "methods")
}

function listMethodFiles(rootPath: string): string[] {
  const entries = readdirSync(rootPath, { withFileTypes: true })
  const result: string[] = []

  for (const entry of entries) {
    const fullPath = join(rootPath, entry.name)
    if (entry.isDirectory()) {
      result.push(...listMethodFiles(fullPath))
      continue
    }

    if (entry.isFile() && extname(entry.name).toLowerCase() === ".json") {
      result.push(fullPath)
    }
  }

  return result
}

export function loadMethodRegistry() {
  if (methodRegistryCache) {
    return methodRegistryCache
  }

  const methodsRoot = getMethodsRoot()
  const manifests = listMethodFiles(methodsRoot)
    .map((filePath) => JSON.parse(readFileSync(filePath, "utf8")) as MethodManifest)
    .sort((a, b) => a.name.localeCompare(b.name))

  methodRegistryCache = new Map(manifests.map((manifest) => [manifest.name, manifest]))
  return methodRegistryCache
}

export function listMethodManifests() {
  return Array.from(loadMethodRegistry().values())
}

export function getMethodManifest(name: string) {
  return loadMethodRegistry().get(name) || null
}
