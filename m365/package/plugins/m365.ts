import { tool } from "@opencode-ai/plugin"

import { dispatchDeclaredMethod, listPublicMethods } from "../runtime/dispatcher"
import { type MethodArgManifest } from "../runtime/method_registry"
import { toJson } from "../runtime/output"

type ToolSchemaType = any

function buildBaseSchema(argManifest: MethodArgManifest) {
  let schema: ToolSchemaType

  switch (argManifest.type) {
    case "string":
      schema = tool.schema.string()
      break
    case "integer":
      schema = tool.schema.number().int()
      break
    case "number":
      schema = tool.schema.number()
      break
    case "boolean":
      schema = tool.schema.boolean()
      break
    case "object":
      schema = tool.schema.record(tool.schema.string(), tool.schema.any())
      break
    case "array":
      schema = tool.schema.array(
        argManifest.items ? buildBaseSchema(argManifest.items) : tool.schema.any()
      )
      break
    case "any":
      schema = tool.schema.any()
      break
    default:
      throw new Error(`Unsupported manifest arg type: ${argManifest.type}`)
  }

  return schema
}

function buildArgSchema(argManifest: MethodArgManifest) {
  const schema = buildBaseSchema(argManifest)

  return argManifest.required ? schema : schema.optional()
}

function buildToolArgs(args: Record<string, MethodArgManifest>) {
  const toolArgs: Record<string, ToolSchemaType> = {}

  for (const [name, manifest] of Object.entries(args)) {
    toolArgs[name] = buildArgSchema(manifest)
  }

  return toolArgs
}

export const M365Plugin = async () => {
  const tools: Record<string, ReturnType<typeof tool>> = {}

  for (const manifest of listPublicMethods()) {
    tools[manifest.name] = tool({
      description: manifest.description,
      args: buildToolArgs(manifest.args),
      async execute(args) {
        const result = await dispatchDeclaredMethod(manifest.name, args)
        return toJson(result)
      }
    })
  }

  return {
    tool: tools
  }
}

export default {
  id: "m365",
  server: M365Plugin
}
