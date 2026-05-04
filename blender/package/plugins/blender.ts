import crypto from "node:crypto"
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs"
import net from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { tool, type Plugin } from "@opencode-ai/plugin"

import { dispatchBlenderMethod } from "../runtime/dispatcher"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JsonObject = Record<string, any>

type PendingRequest = {
  resolve: (value: any) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
  method: string
}

type BlenderEventMessage = {
  type: "event"
  name: string
  data?: any
  ts?: number
}

type BlenderIncoming = BlenderEventMessage | JsonObject

type SessionState = {
  connection: BlenderConnection
  eventBuffer: BlenderEventMessage[]
  host: string
  port: number
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEBUG =
  process.env.OPENCODE_BLENDER_DEBUG === "1" || process.env.PAGECRAN_BRIDGE_DEBUG === "1"

const DEFAULT_HOST =
  process.env.OPENCODE_BLENDER_HOST ||
  process.env.PAGECRAN_BRIDGE_HOST ||
  process.env.PAGECRAN_BLENDER_HOST ||
  process.env.BLENDER_HOST ||
  "127.0.0.1"

const DEFAULT_PORT = Number(
  process.env.OPENCODE_BLENDER_PORT ||
    process.env.PAGECRAN_BRIDGE_PORT ||
    process.env.PAGECRAN_BLENDER_PORT ||
    process.env.BLENDER_PORT ||
    9876
)

const DEFAULT_TIMEOUT_MS = Number(
  process.env.OPENCODE_BLENDER_TIMEOUT_MS ||
    process.env.PAGECRAN_BRIDGE_TIMEOUT_MS ||
    process.env.PAGECRAN_BLENDER_TIMEOUT_MS ||
    30000
)

const MAX_EVENT_BUFFER = Number(process.env.OPENCODE_BLENDER_EVENT_BUFFER || 100)

const LOG_DIR = join(tmpdir(), "pagecran-bridge")
const LOG_FILE = join(LOG_DIR, "requests.jsonl")

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

const sessions = new Map<string, SessionState>()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function debug(...args: any[]) {
  if (DEBUG) console.error("[blender-plugin]", ...args)
}

function normalizeSessionId(input: any): string {
  return input?.sessionID || input?.sessionId || input?.session_id || "global"
}

function resolveHost(host?: string) {
  return host || DEFAULT_HOST
}

function resolvePort(port?: number) {
  return typeof port === "number" ? port : DEFAULT_PORT
}

function makeSessionKey(sessionID: string, host: string, port: number) {
  return `${sessionID}@${host}:${port}`
}

function compactObject(input: JsonObject) {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined))
}

// ---------------------------------------------------------------------------
// Request logging (JSONL)
// ---------------------------------------------------------------------------

function logRequest(entry: {
  method: string
  params_keys: string[]
  success: boolean
  duration_ms: number
  error?: string
}) {
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    appendFileSync(LOG_FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n", "utf8")
  } catch {
    // logging is best-effort, never block the tool
  }
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function formatToolOutput(result: any, method: string, sessionID: string) {
  // Screenshots come back as base64 — save to temp file so the agent can reference the path.
  if (
    result &&
    typeof result === "object" &&
    typeof result.image_base64 === "string" &&
    typeof result.format === "string"
  ) {
    const imageBuffer = Buffer.from(result.image_base64, "base64")
    const outputDir = join(LOG_DIR, sessionID)
    mkdirSync(outputDir, { recursive: true })
    const filePath = join(outputDir, `${method}-${Date.now()}.${result.format}`)
    writeFileSync(filePath, imageBuffer)
    const { image_base64: _, ...rest } = result
    return JSON.stringify({ ...rest, image_path: filePath, image_bytes: imageBuffer.length }, null, 2)
  }

  return typeof result === "string" ? result : JSON.stringify(result, null, 2)
}

// ---------------------------------------------------------------------------
// Wire protocol — coerce both legacy and v2 message shapes
// ---------------------------------------------------------------------------

function coerceIncomingMessage(message: BlenderIncoming) {
  if ((message as BlenderEventMessage).type === "event") {
    return { kind: "event" as const, event: message as BlenderEventMessage }
  }

  if ((message as JsonObject).type === "result") {
    const m = message as JsonObject
    return {
      kind: "result" as const,
      id: String(m.id || ""),
      result: m.result,
      error: typeof m.error === "string" ? m.error : undefined
    }
  }

  if (typeof (message as JsonObject).status === "string") {
    const m = message as JsonObject
    return {
      kind: "result" as const,
      id: String(m.id || ""),
      result: m.result,
      error:
        m.status === "error" ? String(m.message || m.error_code || "Unknown Blender error") : undefined
    }
  }

  return { kind: "unknown" as const }
}

// ---------------------------------------------------------------------------
// BlenderConnection — persistent TCP socket with keep-alive & auto-reconnect
// ---------------------------------------------------------------------------

class BlenderConnection {
  private socket: net.Socket | null = null
  private connected = false
  private connecting: Promise<void> | null = null
  private readBuffer = ""
  private pending = new Map<string, PendingRequest>()
  private reconnectTimer: NodeJS.Timeout | null = null
  private manualClose = false

  constructor(
    private host: string,
    private port: number,
    private onEvent?: (event: BlenderEventMessage) => void
  ) {}

  isAlive() {
    return Boolean(this.socket && !this.socket.destroyed && this.connected)
  }

  async connect(): Promise<void> {
    if (this.isAlive()) return
    if (this.connecting) return this.connecting

    this.manualClose = false
    this.connecting = new Promise<void>((resolve, reject) => {
      const socket = new net.Socket()
      socket.setKeepAlive(true, 10000)
      socket.setNoDelay(true)

      const cleanup = () => {
        socket.removeListener("connect", onConnect)
        socket.removeListener("error", onError)
      }

      const onConnect = () => {
        cleanup()
        this.socket = socket
        this.connected = true
        this.connecting = null
        debug("connected", `${this.host}:${this.port}`)
        resolve()
      }

      const onError = (error: Error) => {
        cleanup()
        this.connected = false
        this.connecting = null
        debug("connect error", error.message)
        reject(error)
      }

      socket.on("data", (chunk) => this.handleData(chunk))
      socket.on("error", (error) => this.handleSocketError(error))
      socket.on("close", () => this.handleClose())
      socket.on("end", () => debug("socket end"))

      socket.once("connect", onConnect)
      socket.once("error", onError)
      socket.connect(this.port, this.host)
    })

    return this.connecting
  }

  private handleData(chunk: Buffer) {
    this.readBuffer += chunk.toString("utf8")

    while (true) {
      const nlIdx = this.readBuffer.indexOf("\n")
      let raw: string | null = null

      if (nlIdx !== -1) {
        raw = this.readBuffer.slice(0, nlIdx).trim()
        this.readBuffer = this.readBuffer.slice(nlIdx + 1)
      } else {
        const trimmed = this.readBuffer.trim()
        if (!trimmed) break
        try {
          JSON.parse(trimmed)
          raw = trimmed
          this.readBuffer = ""
        } catch {
          break
        }
      }

      if (!raw) continue

      let incoming: BlenderIncoming
      try {
        incoming = JSON.parse(raw)
      } catch {
        debug("invalid json from blender", raw)
        continue
      }

      const msg = coerceIncomingMessage(incoming)

      if (msg.kind === "event") {
        this.onEvent?.({ ...msg.event, ts: msg.event.ts || Date.now() })
        continue
      }

      if (msg.kind !== "result" || !msg.id) {
        debug("orphan or unknown message", incoming)
        continue
      }

      const pending = this.pending.get(msg.id)
      if (!pending) {
        debug("orphan response", msg.id)
        continue
      }

      clearTimeout(pending.timeout)
      this.pending.delete(msg.id)
      msg.error ? pending.reject(new Error(msg.error)) : pending.resolve(msg.result)
    }
  }

  private handleSocketError(error: Error) {
    debug("socket error", error.message)
    this.connected = false
  }

  private handleClose() {
    debug("socket close")
    this.connected = false
    this.socket = null

    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout)
      pending.reject(new Error(`Blender connection closed during ${pending.method}`))
      this.pending.delete(id)
    }

    if (!this.manualClose) this.scheduleReconnect()
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      try {
        debug("reconnect attempt")
        await this.connect()
      } catch (err: any) {
        debug("reconnect failed", err?.message || String(err))
      }
    }, 1000)
  }

  async request(method: string, params: JsonObject = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    await this.connect()
    if (!this.socket || !this.connected) throw new Error("Blender connection unavailable")

    const id = crypto.randomUUID()
    const payload = JSON.stringify({ type: "request", id, method, params }) + "\n"

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Blender timeout on '${method}' after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pending.set(id, { resolve, reject, timeout, method })
      this.socket!.write(payload, "utf8", (error) => {
        if (!error) return
        clearTimeout(timeout)
        this.pending.delete(id)
        reject(error)
      })
    })
  }

  async close() {
    this.manualClose = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout)
      pending.reject(new Error("Blender connection closed manually"))
      this.pending.delete(id)
    }
    if (this.socket && !this.socket.destroyed) {
      this.socket.end()
      this.socket.destroy()
    }
    this.socket = null
    this.connected = false
    this.connecting = null
  }
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

function getOrCreateSession(sessionID: string, host = DEFAULT_HOST, port = DEFAULT_PORT): SessionState {
  const key = makeSessionKey(sessionID, host, port)
  const existing = sessions.get(key)
  if (existing) return existing

  const eventBuffer: BlenderEventMessage[] = []
  const connection = new BlenderConnection(host, port, (event) => {
    eventBuffer.push(event)
    if (eventBuffer.length > MAX_EVENT_BUFFER) {
      eventBuffer.splice(0, eventBuffer.length - MAX_EVENT_BUFFER)
    }
  })

  const session: SessionState = { connection, eventBuffer, host, port }
  sessions.set(key, session)
  return session
}

async function destroySession(sessionID: string, host = DEFAULT_HOST, port = DEFAULT_PORT) {
  const key = makeSessionKey(sessionID, host, port)
  const state = sessions.get(key)
  if (!state) return false
  await state.connection.close()
  sessions.delete(key)
  return true
}

// ---------------------------------------------------------------------------
// Core request helper — used by the single blender_request tool
// ---------------------------------------------------------------------------

async function requestBlenderRaw(options: {
  context: any
  method: string
  params?: JsonObject
  timeoutMs?: number
  host?: string
  port?: number
}) {
  const sessionID = normalizeSessionId(options.context)
  const host = resolveHost(options.host)
  const port = resolvePort(options.port)
  const state = getOrCreateSession(sessionID, host, port)

  options.context.metadata({
    title: `Blender: ${options.method}`,
    metadata: { method: options.method, host, port, sessionID }
  })

  const t0 = Date.now()
  try {
    const result = await state.connection.request(
      options.method,
      compactObject(options.params || {}),
      options.timeoutMs
    )
    logRequest({
      method: options.method,
      params_keys: Object.keys(options.params || {}),
      success: true,
      duration_ms: Date.now() - t0
    })
    return result
  } catch (err: any) {
    logRequest({
      method: options.method,
      params_keys: Object.keys(options.params || {}),
      success: false,
      duration_ms: Date.now() - t0,
      error: err?.message || String(err)
    })
    throw err
  }
}

// ---------------------------------------------------------------------------
// Plugin — 6 tools instead of 60+
//
// All domain-specific Blender methods are called through the generic
// `blender_request` tool. The bundle runtime now owns the method registry
// and dispatches each method to a bridge primitive or host-side function.
// ---------------------------------------------------------------------------

const jsonRecordSchema = tool.schema.record(tool.schema.string(), tool.schema.any())
const stringArraySchema = tool.schema.array(tool.schema.string())

export const BlenderPlugin: Plugin = async () => {
  return {
    tool: {
      blender_connect: tool({
        description:
          "Establish or reuse the persistent Blender socket connection for the current session.",
        args: {
          host: tool.schema.string().optional(),
          port: tool.schema.number().int().optional()
        },
        async execute(args, context) {
          const sessionID = normalizeSessionId(context)
          const host = resolveHost(args.host)
          const port = resolvePort(args.port)
          const state = getOrCreateSession(sessionID, host, port)
          await state.connection.connect()
          return JSON.stringify(
            { ok: true, sessionID, host, port, connected: state.connection.isAlive() },
            null,
            2
          )
        }
      }),

      blender_disconnect: tool({
        description:
          "Close and forget the persistent Blender socket connection for the current session.",
        args: {
          host: tool.schema.string().optional(),
          port: tool.schema.number().int().optional()
        },
        async execute(args, context) {
          const sessionID = normalizeSessionId(context)
          const host = resolveHost(args.host)
          const port = resolvePort(args.port)
          const destroyed = await destroySession(sessionID, host, port)
          return JSON.stringify(
            { ok: true, sessionID, host, port, disconnected: destroyed },
            null,
            2
          )
        }
      }),

      blender_request: tool({
        description:
          "Send a command to the Blender bundle runtime. " +
          "Bundle-defined methods are dispatched through the OpenCode Blender Bridge. " +
          "If no skill is loaded, call with method 'get_capabilities' to discover available methods. " +
          "Screenshots and images are automatically saved to temp files.",
        args: {
          method: tool.schema.string(),
          params: jsonRecordSchema.optional(),
          timeout_ms: tool.schema.number().int().positive().optional(),
          host: tool.schema.string().optional(),
          port: tool.schema.number().int().optional()
        },
        async execute(args, context) {
          const sessionID = normalizeSessionId(context)
          const result = await dispatchBlenderMethod({
            method: args.method,
            params: (args.params || {}) as JsonObject,
            timeoutMs: args.timeout_ms,
            host: args.host,
            port: args.port,
            requestRaw: ({ method, params, timeoutMs, host, port }) =>
              requestBlenderRaw({
                context,
                method,
                params,
                timeoutMs,
                host,
                port
              })
          })
          return formatToolOutput(result, args.method, sessionID)
        }
      }),

      blender_events_get: tool({
        description:
          "Read buffered Blender events for the current session. " +
          "Returns an empty list until the addon starts emitting events.",
        args: {
          clear: tool.schema.boolean().optional(),
          event_names: stringArraySchema.optional(),
          host: tool.schema.string().optional(),
          port: tool.schema.number().int().optional()
        },
        async execute(args, context) {
          const sessionID = normalizeSessionId(context)
          const state = getOrCreateSession(
            sessionID,
            resolveHost(args.host),
            resolvePort(args.port)
          )
          const names = args.event_names ? new Set(args.event_names) : null
          const events = names
            ? state.eventBuffer.filter((e) => names.has(e.name))
            : [...state.eventBuffer]

          if (args.clear) {
            if (names) {
              const rest = state.eventBuffer.filter((e) => !names.has(e.name))
              state.eventBuffer.length = 0
              state.eventBuffer.push(...rest)
            } else {
              state.eventBuffer.length = 0
            }
          }

          return JSON.stringify({ events, count: events.length }, null, 2)
        }
      }),

      blender_events_wait: tool({
        description:
          "Wait for one or more Blender push events on the current persistent session. " +
          "Useful after actions that update the scene asynchronously.",
        args: {
          timeout_ms: tool.schema.number().int().positive().optional(),
          poll_interval_ms: tool.schema.number().int().positive().optional(),
          clear: tool.schema.boolean().optional(),
          event_names: stringArraySchema.optional(),
          host: tool.schema.string().optional(),
          port: tool.schema.number().int().optional()
        },
        async execute(args, context) {
          const sessionID = normalizeSessionId(context)
          const state = getOrCreateSession(
            sessionID,
            resolveHost(args.host),
            resolvePort(args.port)
          )
          await state.connection.connect()

          const timeout = args.timeout_ms || 1500
          const poll = args.poll_interval_ms || 100
          const names = args.event_names ? new Set(args.event_names) : null
          const t0 = Date.now()

          while (Date.now() - t0 < timeout) {
            const events = names
              ? state.eventBuffer.filter((e) => names.has(e.name))
              : [...state.eventBuffer]

            if (events.length > 0) {
              if (args.clear) {
                if (names) {
                  const rest = state.eventBuffer.filter((e) => !names.has(e.name))
                  state.eventBuffer.length = 0
                  state.eventBuffer.push(...rest)
                } else {
                  state.eventBuffer.length = 0
                }
              }
              return JSON.stringify(
                { events, count: events.length, waited_ms: Date.now() - t0, timed_out: false },
                null,
                2
              )
            }

            await new Promise((r) => setTimeout(r, poll))
          }

          return JSON.stringify(
            { events: [], count: 0, waited_ms: Date.now() - t0, timed_out: true },
            null,
            2
          )
        }
      }),

      pagecran_ping: tool({
        description:
          "Ping Blender over the persistent socket connection and report the active endpoint.",
        args: {
          host: tool.schema.string().optional(),
          port: tool.schema.number().int().optional(),
          timeout_seconds: tool.schema.number().positive().optional()
        },
        async execute(args, context) {
          const sessionID = normalizeSessionId(context)
          const host = resolveHost(args.host)
          const port = resolvePort(args.port)
          const result = await requestBlenderRaw({
            context,
            method: "ping",
            params: {},
            timeoutMs:
              typeof args.timeout_seconds === "number" ? args.timeout_seconds * 1000 : undefined,
            host,
            port
          })
          return JSON.stringify({ ok: true, sessionID, host, port, result }, null, 2)
        }
      })
    }
  }
}

export default BlenderPlugin
