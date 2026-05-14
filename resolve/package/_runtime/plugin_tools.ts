import { tool } from "@opencode-ai/plugin"

import type { MethodArgManifest, MethodManifest } from "./types"

type ToolSchemaType = any

function buildBaseSchema(argManifest: MethodArgManifest): ToolSchemaType {
  switch (argManifest.type) {
    case "string":
      return tool.schema.string()
    case "integer":
      return tool.schema.number().int()
    case "number":
      return tool.schema.number()
    case "boolean":
      return tool.schema.boolean()
    case "object":
      return tool.schema.record(tool.schema.string(), tool.schema.any())
    case "array":
      return tool.schema.array(
        argManifest.items ? buildBaseSchema(argManifest.items) : tool.schema.any()
      )
    case "any":
      return tool.schema.any()
    default:
      throw new Error(`Unsupported manifest arg type: ${argManifest.type}`)
  }
}

function buildArgSchema(argManifest: MethodArgManifest) {
  const schema = buildBaseSchema(argManifest)
  return argManifest.required ? schema : schema.optional()
}

export function buildToolArgs(args: Record<string, MethodArgManifest> | undefined) {
  const toolArgs: Record<string, ToolSchemaType> = {}
  if (!args) return toolArgs

  for (const [name, manifest] of Object.entries(args)) {
    toolArgs[name] = buildArgSchema(manifest)
  }
  return toolArgs
}

export type ToolExecutor = (args: Record<string, unknown>) => Promise<string>

// Build the { tool: {...} } object expected by an OpenCode plugin
// from a list of public method manifests + a single executor function.
// The executor is responsible for serialization (return a string).
export function buildPluginTools(
  manifests: MethodManifest[],
  execute: (manifest: MethodManifest, args: Record<string, unknown>) => Promise<string>
) {
  const tools: Record<string, ReturnType<typeof tool>> = {}

  for (const manifest of manifests) {
    tools[manifest.name] = tool({
      description: manifest.description,
      args: buildToolArgs(manifest.args),
      async execute(args) {
        return execute(manifest, args as Record<string, unknown>)
      }
    })
  }

  return tools
}
