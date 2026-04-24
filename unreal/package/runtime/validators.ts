import type { JsonObject } from "./types"

export function ensureJsonObject(input: unknown, label = "params"): JsonObject {
  if (input === undefined || input === null) {
    return {}
  }

  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${label} must be a JSON object`)
  }

  return input as JsonObject
}
