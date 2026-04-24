export type JsonObject = Record<string, unknown>

export type UnrealMethodRisk = "read" | "write" | "destructive"

export type UnrealMethodKind = "host-backed" | "hostless"

export type UnrealMethodExecution =
  | {
      strategy: "bridge_method"
      method: string
    }
  | {
      strategy: "host_script"
      script: string
      function?: string
    }

export type UnrealMethodRequirement = {
  bridgeMethods?: string[]
}

export type UnrealMethodDefinition = {
  name: string
  domain: string
  description: string
  kind: UnrealMethodKind
  risk: UnrealMethodRisk
  execution: UnrealMethodExecution
  requires?: UnrealMethodRequirement
}

export type UnrealRawRequest = (options: {
  method: string
  params?: JsonObject
  timeoutMs?: number
  host?: string
  port?: number
}) => Promise<unknown>

export type UnrealDispatchOptions = {
  method: string
  params?: JsonObject
  timeoutMs?: number
  host?: string
  port?: number
  requestRaw: UnrealRawRequest
}
