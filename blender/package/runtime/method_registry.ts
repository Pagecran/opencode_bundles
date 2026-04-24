import { blenderMethodDefinitions } from "../methods/registry"
import type { BlenderMethodDefinition } from "./types"

const methodMap = new Map<string, BlenderMethodDefinition>(
  blenderMethodDefinitions.map((definition) => [definition.name, definition])
)

export function getBlenderMethodDefinition(method: string) {
  return methodMap.get(method)
}

export function listBlenderMethodDefinitions() {
  return blenderMethodDefinitions
}
