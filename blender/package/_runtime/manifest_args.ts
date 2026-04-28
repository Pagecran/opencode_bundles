import type { MethodArgManifest, MethodManifest } from "./types"
import { isRecord } from "./validators"

type JsonRecord = Record<string, unknown>

function readEnumValues(argManifest: MethodArgManifest) {
  return Array.isArray(argManifest.enum) ? argManifest.enum : []
}

function isMissingValue(value: unknown) {
  return value === undefined || value === null
}

function formatValueType(value: unknown) {
  if (Array.isArray(value)) return "array"
  if (value === null) return "null"
  return typeof value
}

function validateEnum(value: unknown, argManifest: MethodArgManifest, argPath: string) {
  const enumValues = readEnumValues(argManifest)
  if (enumValues.length === 0) return

  if (!enumValues.includes(String(value))) {
    throw new Error(`Invalid value for ${argPath}. Expected one of: ${enumValues.join(", ")}.`)
  }
}

function cloneDefaultValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloneDefaultValue(item))
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneDefaultValue(item)])
    )
  }
  return value
}

function validateAndNormalizeValue(
  value: unknown,
  argManifest: MethodArgManifest,
  argPath: string
): unknown {
  switch (argManifest.type) {
    case "string": {
      if (typeof value !== "string") {
        throw new Error(`Invalid value for ${argPath}. Expected string, received ${formatValueType(value)}.`)
      }
      validateEnum(value, argManifest, argPath)
      return value
    }
    case "integer": {
      if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new Error(`Invalid value for ${argPath}. Expected integer, received ${formatValueType(value)}.`)
      }
      return value
    }
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Invalid value for ${argPath}. Expected number, received ${formatValueType(value)}.`)
      }
      return value
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        throw new Error(`Invalid value for ${argPath}. Expected boolean, received ${formatValueType(value)}.`)
      }
      return value
    }
    case "object": {
      if (!isRecord(value)) {
        throw new Error(`Invalid value for ${argPath}. Expected object, received ${formatValueType(value)}.`)
      }
      return value
    }
    case "array": {
      if (!Array.isArray(value)) {
        throw new Error(`Invalid value for ${argPath}. Expected array, received ${formatValueType(value)}.`)
      }
      if (!argManifest.items) return value
      return value.map((item, index) =>
        validateAndNormalizeValue(item, argManifest.items as MethodArgManifest, `${argPath}[${index}]`)
      )
    }
    case "any": {
      if (readEnumValues(argManifest).length > 0) {
        validateEnum(value, argManifest, argPath)
      }
      return value
    }
    default:
      throw new Error(`Unsupported manifest arg type for ${argPath}: ${argManifest.type}`)
  }
}

export function validateAndNormalizeArgs(manifest: MethodManifest, rawArgs: JsonRecord = {}) {
  const args = manifest.args || {}
  const normalizedArgs: JsonRecord = {}
  const knownArgNames = new Set(Object.keys(args))

  for (const key of Object.keys(rawArgs)) {
    if (!knownArgNames.has(key)) {
      throw new Error(`Unexpected argument for ${manifest.name}: ${key}`)
    }
  }

  for (const [argName, argManifest] of Object.entries(args)) {
    const rawValue = rawArgs[argName]

    if (isMissingValue(rawValue)) {
      if (argManifest.default !== undefined) {
        normalizedArgs[argName] = cloneDefaultValue(argManifest.default)
        continue
      }
      if (argManifest.required) {
        throw new Error(`Missing required argument for ${manifest.name}: ${argName}`)
      }
      continue
    }

    normalizedArgs[argName] = validateAndNormalizeValue(rawValue, argManifest, argName)
  }

  return normalizedArgs
}
