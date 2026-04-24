import { unrealMethodDefinitions } from "../methods/registry"

const methodMap = new Map(unrealMethodDefinitions.map((definition) => [definition.name, definition]))

export function getUnrealMethodDefinition(method: string) {
  return methodMap.get(method)
}

export function listUnrealMethodDefinitions() {
  return unrealMethodDefinitions
}
