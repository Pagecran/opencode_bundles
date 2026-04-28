// Shared runtime types for Pagecran OpenCode bundles.
// Single source of truth for manifest schema across blender, unreal, m365.

export type JsonObject = Record<string, unknown>

export type MethodArgType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "any"

export type MethodArgManifest = {
  type: MethodArgType
  required?: boolean
  description?: string
  default?: unknown
  enum?: string[]
  items?: MethodArgManifest
}

export type MethodRisk = "read" | "write" | "destructive"

export type MethodKind = "host-backed" | "hostless" | string

// Execution strategies. Bundles add their own variants via the `strategy` discriminator.
//
// host-backed bundles (blender, unreal):
//   - bridge_method  : forwarded as-is to the host bridge
//   - host_script    : inlined .py file from <package>/scripts/
//   - host_function  : import a python module from <package>/scripts/<package>/ (blender only)
//
// hostless bundles (m365):
//   - direct_api     : handled by an in-process TS handler keyed by manifest.name
//   - compose        : in-process composition over other tools
export type MethodExecution = {
  strategy: string
  // Common: bundle-side tool name actually exposed to OpenCode.
  // Defaults to manifest.name when missing. Public methods MUST set tool === name.
  tool?: string
  // bridge_method
  method?: string
  // host_script
  script?: string
  function?: string
  // host_function
  package?: string
  module?: string
  // free-form extension
  [key: string]: unknown
}

export type MethodRequires = {
  // host-backed: bridge primitives the method depends on
  bridgeMethods?: string[]
  // hostless: graph/auth requirements
  auth?: boolean
  scopes?: string[]
  env?: string[]
  [key: string]: unknown
}

export type MethodVerify = {
  strategy?: string
  method?: string
  [key: string]: unknown
}

export type MethodManifest = {
  name: string
  domain: string
  description: string
  kind: MethodKind
  args?: Record<string, MethodArgManifest>
  returns?: Record<string, unknown>
  requires?: MethodRequires
  execution: MethodExecution
  verify?: MethodVerify
  risk: MethodRisk
}

// Transport contract for host-backed bundles.
export type RawBridgeRequest = (options: {
  method: string
  params?: JsonObject
  timeoutMs?: number
  host?: string
  port?: number
}) => Promise<unknown>

export type DispatchOptions = {
  method: string
  params?: JsonObject
  timeoutMs?: number
  host?: string
  port?: number
  requestRaw: RawBridgeRequest
}
