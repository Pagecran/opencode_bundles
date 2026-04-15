import crypto from "node:crypto"
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs"
import net from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { tool, type Plugin } from "@opencode-ai/plugin"

type JsonObject = Record<string, any>

type PendingRequest = {
  resolve: (value: any) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
  method: string
}

type UnrealEventMessage = {
  type: "event"
  name: string
  data?: any
  ts?: number
}

type UnrealIncoming = UnrealEventMessage | JsonObject

type SessionState = {
  connection: UnrealConnection
  eventBuffer: UnrealEventMessage[]
  host: string
  port: number
}

const DEBUG =
  process.env.OPENCODE_UNREAL_DEBUG === "1" ||
  process.env.PAGECRAN_UNREAL_DEBUG === "1" ||
  process.env.PAGECRAN_UNREAL_BRIDGE_DEBUG === "1"

const DEFAULT_HOST =
  process.env.OPENCODE_UNREAL_HOST ||
  process.env.PAGECRAN_UNREAL_HOST ||
  process.env.PAGECRAN_UNREAL_BRIDGE_HOST ||
  "127.0.0.1"

const DEFAULT_PORT = Number(
  process.env.OPENCODE_UNREAL_PORT ||
    process.env.PAGECRAN_UNREAL_PORT ||
    process.env.PAGECRAN_UNREAL_BRIDGE_PORT ||
    9877
)

const DEFAULT_TIMEOUT_MS = Number(
  process.env.OPENCODE_UNREAL_TIMEOUT_MS ||
    process.env.PAGECRAN_UNREAL_TIMEOUT_MS ||
    process.env.PAGECRAN_UNREAL_BRIDGE_TIMEOUT_MS ||
    30000
)

const MAX_EVENT_BUFFER = Number(
  process.env.OPENCODE_UNREAL_EVENT_BUFFER ||
    process.env.PAGECRAN_UNREAL_BRIDGE_EVENT_BUFFER ||
    100
)

const LOG_DIR = join(tmpdir(), "pagecran-unreal-bridge")
const LOG_FILE = join(LOG_DIR, "requests.jsonl")

const sessions = new Map<string, SessionState>()

function debug(...args: any[]) {
  if (DEBUG) console.error("[unreal-plugin]", ...args)
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
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}

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

function formatToolOutput(result: any, method: string, sessionID: string) {
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

function coerceIncomingMessage(message: UnrealIncoming) {
  if ((message as UnrealEventMessage).type === "event") {
    return { kind: "event" as const, event: message as UnrealEventMessage }
  }

  if ((message as JsonObject).type === "result") {
    const input = message as JsonObject
    return {
      kind: "result" as const,
      id: String(input.id || ""),
      result: input.result,
      error: typeof input.error === "string" ? input.error : undefined
    }
  }

  if (typeof (message as JsonObject).status === "string") {
    const input = message as JsonObject
    return {
      kind: "result" as const,
      id: String(input.id || ""),
      result: input.result,
      error:
        input.status === "error"
          ? String(input.message || input.error_code || "Unknown Unreal error")
          : undefined
    }
  }

  return { kind: "unknown" as const }
}

class UnrealConnection {
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
    private onEvent?: (event: UnrealEventMessage) => void
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
      const newlineIndex = this.readBuffer.indexOf("\n")
      let raw: string | null = null

      if (newlineIndex !== -1) {
        raw = this.readBuffer.slice(0, newlineIndex).trim()
        this.readBuffer = this.readBuffer.slice(newlineIndex + 1)
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

      let incoming: UnrealIncoming
      try {
        incoming = JSON.parse(raw)
      } catch {
        debug("invalid json from unreal", raw)
        continue
      }

      const message = coerceIncomingMessage(incoming)

      if (message.kind === "event") {
        this.onEvent?.({ ...message.event, ts: message.event.ts || Date.now() })
        continue
      }

      if (message.kind !== "result" || !message.id) {
        debug("orphan or unknown message", incoming)
        continue
      }

      const pending = this.pending.get(message.id)
      if (!pending) {
        debug("orphan response", message.id)
        continue
      }

      clearTimeout(pending.timeout)
      this.pending.delete(message.id)
      message.error ? pending.reject(new Error(message.error)) : pending.resolve(message.result)
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
      pending.reject(new Error(`Unreal connection closed during ${pending.method}`))
      this.pending.delete(id)
    }

    if (!this.manualClose) {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      try {
        debug("reconnect attempt")
        await this.connect()
      } catch (error: any) {
        debug("reconnect failed", error?.message || String(error))
      }
    }, 1000)
  }

  async request(method: string, params: JsonObject = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    await this.connect()
    if (!this.socket || !this.connected) {
      throw new Error("Unreal connection unavailable")
    }

    const id = crypto.randomUUID()
    const payload = JSON.stringify({ type: "request", id, method, params }) + "\n"

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Unreal timeout on '${method}' after ${timeoutMs}ms`))
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
      pending.reject(new Error("Unreal connection closed manually"))
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

function getOrCreateSession(sessionID: string, host = DEFAULT_HOST, port = DEFAULT_PORT): SessionState {
  const key = makeSessionKey(sessionID, host, port)
  const existing = sessions.get(key)
  if (existing) return existing

  const eventBuffer: UnrealEventMessage[] = []
  const connection = new UnrealConnection(host, port, (event) => {
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

async function requestUnreal(options: {
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
    title: `Unreal: ${options.method}`,
    metadata: { method: options.method, host, port, sessionID }
  })

  const startedAt = Date.now()
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
      duration_ms: Date.now() - startedAt
    })
    return result
  } catch (error: any) {
    logRequest({
      method: options.method,
      params_keys: Object.keys(options.params || {}),
      success: false,
      duration_ms: Date.now() - startedAt,
      error: error?.message || String(error)
    })
    throw error
  }
}

const jsonRecordSchema = tool.schema.record(tool.schema.string(), tool.schema.any())
const stringArraySchema = tool.schema.array(tool.schema.string())

export const UnrealPlugin: Plugin = async () => {
  return {
    tool: {
      unreal_connect: tool({
        description:
          "Establish or reuse the persistent Unreal socket connection for the current session.",
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

      unreal_disconnect: tool({
        description:
          "Close and forget the persistent Unreal socket connection for the current session.",
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

      unreal_request: tool({
        description:
          "Send a command to the Unreal bridge. The loaded skill provides the method catalog. If no skill is loaded, call with method 'get_capabilities' to discover available methods.",
        args: {
          method: tool.schema.string(),
          params: jsonRecordSchema.optional(),
          timeout_ms: tool.schema.number().int().positive().optional(),
          host: tool.schema.string().optional(),
          port: tool.schema.number().int().optional()
        },
        async execute(args, context) {
          const sessionID = normalizeSessionId(context)
          const result = await requestUnreal({
            context,
            method: args.method,
            params: args.params || {},
            timeoutMs: args.timeout_ms,
            host: args.host,
            port: args.port
          })
          return formatToolOutput(result, args.method, sessionID)
        }
      }),

      unreal_events_get: tool({
        description:
          "Read buffered Unreal bridge events for the current session. Returns an empty list until the bridge emits push events.",
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
            ? state.eventBuffer.filter((event) => names.has(event.name))
            : [...state.eventBuffer]

          if (args.clear) {
            if (names) {
              const rest = state.eventBuffer.filter((event) => !names.has(event.name))
              state.eventBuffer.length = 0
              state.eventBuffer.push(...rest)
            } else {
              state.eventBuffer.length = 0
            }
          }

          return JSON.stringify({ events, count: events.length }, null, 2)
        }
      }),

      unreal_events_wait: tool({
        description:
          "Wait for one or more Unreal bridge push events on the current persistent session.",
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
          const startedAt = Date.now()

          while (Date.now() - startedAt < timeout) {
            const events = names
              ? state.eventBuffer.filter((event) => names.has(event.name))
              : [...state.eventBuffer]

            if (events.length > 0) {
              if (args.clear) {
                if (names) {
                  const rest = state.eventBuffer.filter((event) => !names.has(event.name))
                  state.eventBuffer.length = 0
                  state.eventBuffer.push(...rest)
                } else {
                  state.eventBuffer.length = 0
                }
              }

              return JSON.stringify(
                {
                  events,
                  count: events.length,
                  waited_ms: Date.now() - startedAt,
                  timed_out: false
                },
                null,
                2
              )
            }

            await new Promise((resolve) => setTimeout(resolve, poll))
          }

          return JSON.stringify(
            { events: [], count: 0, waited_ms: Date.now() - startedAt, timed_out: true },
            null,
            2
          )
        }
      }),

      unreal_ping: tool({
        description:
          "Ping Unreal over the persistent socket connection and report the active endpoint.",
        args: {
          host: tool.schema.string().optional(),
          port: tool.schema.number().int().optional(),
          timeout_seconds: tool.schema.number().positive().optional()
        },
        async execute(args, context) {
          const sessionID = normalizeSessionId(context)
          const host = resolveHost(args.host)
          const port = resolvePort(args.port)
          const result = await requestUnreal({
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

export default {
  id: "unreal",
  server: UnrealPlugin
}
