import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import type { JsonObject } from "../_runtime/types"

type DocScope = "api" | "manual"

type SearchResult = {
  path: string
  line: number
  snippet: string
}

const RUNTIME_DIR = dirname(fileURLToPath(import.meta.url))
const DOCS_ROOT = resolve(RUNTIME_DIR, "..", "data", "blender_docs")
const DEFAULT_MAX_RESULTS = 20
const DEFAULT_CONTEXT_LINES = 1
const DEFAULT_MAX_CHARS = 32 * 1024

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? Math.trunc(value) : Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function requiredString(params: JsonObject, key: string) {
  const value = params[key]
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Parameter '${key}' is required`)
  }
  return value.trim()
}

function scopeRoot(scope: DocScope) {
  return join(DOCS_ROOT, scope)
}

function toPosixPath(path: string) {
  return path.split(sep).join("/")
}

function listRstFiles(root: string): string[] {
  const result: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = join(root, entry.name)
    if (entry.isDirectory()) {
      result.push(...listRstFiles(fullPath))
      continue
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".rst")) {
      result.push(fullPath)
    }
  }
  return result
}

function ensureInside(root: string, candidate: string) {
  const resolvedRoot = resolve(root)
  const resolvedCandidate = resolve(candidate)
  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(resolvedRoot + sep)) {
    throw new Error("Resolved documentation path escapes the docs root")
  }
  return resolvedCandidate
}

function resolveApiDoc(identifier: string) {
  const root = scopeRoot("api")
  const normalized = identifier.replace(/\\/g, "/").replace(/\.rst$/i, "")
  const candidates = [
    join(root, `${normalized}.rst`),
    join(root, `${normalized.replace(/\//g, ".")}.rst`)
  ]

  for (const candidate of candidates) {
    const resolved = ensureInside(root, candidate)
    try {
      if (statSync(resolved).isFile()) return resolved
    } catch {
      // Try the next candidate.
    }
  }

  const lowerIdentifier = normalized.toLowerCase()
  const matches = listRstFiles(root).filter((filePath) => {
    const stem = toPosixPath(relative(root, filePath)).replace(/\.rst$/i, "").toLowerCase()
    return stem === lowerIdentifier || stem.endsWith(`/${lowerIdentifier}`) || stem.endsWith(`.${lowerIdentifier}`)
  })

  if (matches.length === 1) return matches[0]
  if (matches.length > 1) {
    return matches.sort((a, b) => a.length - b.length || a.localeCompare(b))[0]
  }

  throw new Error(`No Blender API docs found for '${identifier}'`)
}

function searchDocs(scope: DocScope, params: JsonObject) {
  const query = requiredString(params, "query")
  const queryLower = query.toLowerCase()
  const maxResults = clampInteger(params.max_results, DEFAULT_MAX_RESULTS, 1, 100)
  const contextLines = clampInteger(params.context_lines, DEFAULT_CONTEXT_LINES, 0, 8)
  const root = scopeRoot(scope)
  const results: SearchResult[] = []

  for (const filePath of listRstFiles(root)) {
    const content = readFileSync(filePath, "utf8")
    const lines = content.split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].toLowerCase().includes(queryLower)) continue

      const start = Math.max(0, index - contextLines)
      const end = Math.min(lines.length, index + contextLines + 1)
      results.push({
        path: toPosixPath(relative(DOCS_ROOT, filePath)),
        line: index + 1,
        snippet: lines.slice(start, end).join("\n").trim()
      })
      if (results.length >= maxResults) {
        return { scope, query, count: results.length, results }
      }
    }
  }

  return { scope, query, count: results.length, results }
}

export function searchBlenderApiDocs(params: JsonObject) {
  return searchDocs("api", params)
}

export function searchBlenderManual(params: JsonObject) {
  return searchDocs("manual", params)
}

export function getBlenderApiDocs(params: JsonObject) {
  const identifier = requiredString(params, "identifier")
  const maxChars = clampInteger(params.max_chars, DEFAULT_MAX_CHARS, 1024, 256 * 1024)
  const filePath = resolveApiDoc(identifier)
  const content = readFileSync(filePath, "utf8")
  const truncated = content.length > maxChars
  const text = truncated ? content.slice(0, maxChars) : content

  return {
    identifier,
    path: toPosixPath(relative(DOCS_ROOT, filePath)),
    truncated,
    size_chars: content.length,
    content: text
  }
}
