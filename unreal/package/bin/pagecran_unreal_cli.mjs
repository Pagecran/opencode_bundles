#!/usr/bin/env node

import crypto from "node:crypto"
import fs from "node:fs"
import net from "node:net"
import process from "node:process"

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

const DEFAULT_TIMEOUT_SECONDS = 30

function printUsage() {
  console.error(`Usage:
  pagecran_unreal_cli.mjs send <method> [--params-json <json> | --params-file <path>] [--host <host>] [--port <port>] [--timeout-seconds <seconds>] [--pretty]
  pagecran_unreal_cli.mjs ping [--host <host>] [--port <port>] [--timeout-seconds <seconds>] [--pretty]
  pagecran_unreal_cli.mjs capabilities [--host <host>] [--port <port>] [--timeout-seconds <seconds>] [--pretty]
  pagecran_unreal_cli.mjs endpoint [--pretty]`)
}

function parseBooleanFlag(argv, name) {
  const index = argv.indexOf(name)
  if (index === -1) {
    return false
  }
  argv.splice(index, 1)
  return true
}

function parseOption(argv, name) {
  const index = argv.indexOf(name)
  if (index === -1) {
    return undefined
  }
  if (index === argv.length - 1) {
    throw new Error(`Missing value for ${name}`)
  }
  const value = argv[index + 1]
  argv.splice(index, 2)
  return value
}

function parseCommonOptions(argv) {
  const pretty = parseBooleanFlag(argv, "--pretty")
  const host = parseOption(argv, "--host")
  const portValue = parseOption(argv, "--port")
  const timeoutValue = parseOption(argv, "--timeout-seconds")

  return {
    pretty,
    host: host || DEFAULT_HOST,
    port: portValue ? Number(portValue) : DEFAULT_PORT,
    timeoutSeconds: timeoutValue ? Number(timeoutValue) : DEFAULT_TIMEOUT_SECONDS
  }
}

function loadParams(paramsJson, paramsFile) {
  const raw = paramsFile ? fs.readFileSync(paramsFile, "utf8") : paramsJson || "{}"
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Command params must decode to a JSON object")
  }
  return parsed
}

function normalizeResponse(response) {
  if (response?.type === "event") {
    return { status: "event", event: response }
  }

  if (response?.type === "result") {
    return response.error
      ? {
          status: "error",
          id: response.id,
          message: response.error,
          error_code: response.error_code || "request_error"
        }
      : {
          status: "success",
          id: response.id,
          result: response.result
        }
  }

  if (typeof response?.status === "string") {
    return response
  }

  return response
}

async function sendRequest({ host, port, payload, timeoutSeconds }) {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port })
    let buffer = ""

    const timeout = setTimeout(() => {
      socket.destroy()
      reject(new Error(`Timeout after ${timeoutSeconds}s while waiting for Unreal bridge response`))
    }, timeoutSeconds * 1000)

    const cleanup = () => {
      clearTimeout(timeout)
      socket.removeAllListeners()
      if (!socket.destroyed) {
        socket.end()
        socket.destroy()
      }
    }

    socket.setNoDelay(true)
    socket.setKeepAlive(true, 10000)

    socket.on("connect", () => {
      socket.write(JSON.stringify(payload) + "\n", "utf8")
    })

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8")

      while (true) {
        const newlineIndex = buffer.indexOf("\n")
        let raw = null

        if (newlineIndex !== -1) {
          raw = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)
        } else {
          const trimmed = buffer.trim()
          if (!trimmed) {
            return
          }
          try {
            JSON.parse(trimmed)
            raw = trimmed
            buffer = ""
          } catch {
            return
          }
        }

        if (!raw) {
          continue
        }

        const response = normalizeResponse(JSON.parse(raw))
        if (response?.status === "event") {
          continue
        }

        cleanup()
        resolve(response)
        return
      }
    })

    socket.on("error", (error) => {
      cleanup()
      reject(error)
    })

    socket.on("close", () => {
      if (buffer.trim()) {
        try {
          const response = normalizeResponse(JSON.parse(buffer.trim()))
          if (response?.status !== "event") {
            cleanup()
            resolve(response)
            return
          }
        } catch {
          // ignore trailing invalid buffer
        }
      }
      cleanup()
      reject(new Error("No JSON response received from Unreal bridge"))
    })
  })
}

function dumpResponse(response, pretty) {
  const text = pretty ? JSON.stringify(response, null, 2) : JSON.stringify(response)
  process.stdout.write(text + "\n")
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printUsage()
    return 0
  }

  const subcommand = argv.shift()

  if (subcommand === "endpoint") {
    const pretty = parseBooleanFlag(argv, "--pretty")
    if (argv.length > 0) {
      throw new Error(`Unexpected arguments: ${argv.join(" ")}`)
    }
    dumpResponse(
      {
        status: "success",
        result: {
          host: DEFAULT_HOST,
          port: DEFAULT_PORT
        }
      },
      pretty
    )
    return 0
  }

  if (subcommand === "ping" || subcommand === "capabilities") {
    const options = parseCommonOptions(argv)
    if (argv.length > 0) {
      throw new Error(`Unexpected arguments: ${argv.join(" ")}`)
    }

    const response = await sendRequest({
      host: options.host,
      port: options.port,
      timeoutSeconds: options.timeoutSeconds,
      payload: {
        type: "request",
        id: crypto.randomUUID(),
        method: subcommand === "ping" ? "ping" : "get_capabilities",
        params: {}
      }
    })

    dumpResponse(response, options.pretty)
    return response?.status === "error" ? 2 : 0
  }

  if (subcommand === "send") {
    const method = argv.shift()
    if (!method) {
      throw new Error("Missing method name for send")
    }

    const paramsJson = parseOption(argv, "--params-json")
    const paramsFile = parseOption(argv, "--params-file")
    const options = parseCommonOptions(argv)

    if (argv.length > 0) {
      throw new Error(`Unexpected arguments: ${argv.join(" ")}`)
    }

    const response = await sendRequest({
      host: options.host,
      port: options.port,
      timeoutSeconds: options.timeoutSeconds,
      payload: {
        type: "request",
        id: crypto.randomUUID(),
        method,
        params: loadParams(paramsJson, paramsFile)
      }
    })

    dumpResponse(response, options.pretty)
    return response?.status === "error" ? 2 : 0
  }

  throw new Error(`Unknown subcommand: ${subcommand}`)
}

main()
  .then((exitCode) => {
    process.exit(exitCode)
  })
  .catch((error) => {
    process.stderr.write(String(error?.message || error) + "\n")
    process.exit(1)
  })
