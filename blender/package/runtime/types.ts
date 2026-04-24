export type JsonObject = Record<string, unknown>

export type BlenderMethodRisk = "read" | "write" | "destructive"

export type BlenderMethodKind = "host-backed" | "hostless"

export type BlenderMethodExecution =
  | {
      strategy: "bridge_method"
      method: string
    }
  | {
      strategy: "host_script"
      script: string
      function?: string
    }
  | {
      strategy: "host_function"
      package: string
      module: string
      function: string
    }

export type BlenderMethodRequirement = {
  bridgeMethods?: string[]
}

export type BlenderMethodDefinition = {
  name: string
  domain: string
  description: string
  kind: BlenderMethodKind
  risk: BlenderMethodRisk
  execution: BlenderMethodExecution
  requires?: BlenderMethodRequirement
}

export type BlenderRawRequest = (options: {
  method: string
  params?: JsonObject
  timeoutMs?: number
  host?: string
  port?: number
}) => Promise<unknown>

export type BlenderDispatchOptions = {
  method: string
  params?: JsonObject
  timeoutMs?: number
  host?: string
  port?: number
  requestRaw: BlenderRawRequest
}
