import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { randomUUID } from "node:crypto"

const DEFAULT_TIMEOUT_MS = 30000
const DEFAULT_POLL_MS = 250

export type BridgeCommand = {
  id: string,
  method: string,
  args: Record<string, unknown>,
  createdAt: string
}

export type BridgeResult = {
  ok: boolean,
  id: string,
  method?: string,
  result?: unknown,
  error?: string,
  createdAt?: string,
  completedAt?: string
}

function readPositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return Math.floor(parsed)
}

export function getBridgeDir() {
  const configured = process.env.PAGECRAN_AFTEREFFECTS_BRIDGE_DIR || process.env.AE_BRIDGE_DIR
  if (configured?.trim()) {
    return configured.trim()
  }

  const root = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local") || tmpdir()
  return join(root, "Pagecran", "AfterEffectsBridge")
}

export function ensureBridgeDir() {
  const bridgeDir = getBridgeDir()
  mkdirSync(join(bridgeDir, "commands"), { recursive: true })
  mkdirSync(join(bridgeDir, "results"), { recursive: true })
  return bridgeDir
}

function writeJsonFile(filePath: string, value: unknown) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8")
}

function readJsonFile<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function getBridgeStatus() {
  const bridgeDir = ensureBridgeDir()
  const commandsDir = join(bridgeDir, "commands")
  const resultsDir = join(bridgeDir, "results")
  const statusPath = join(bridgeDir, "status.json")
  const status = existsSync(statusPath) ? readJsonFile<Record<string, unknown>>(statusPath) : null
  const commandCount = existsSync(commandsDir) ? readdirSync(commandsDir).filter((name) => name.endsWith(".json")).length : 0
  const resultCount = existsSync(resultsDir) ? readdirSync(resultsDir).filter((name) => name.endsWith(".json")).length : 0

  return {
    ok: true,
    bridge_dir: bridgeDir,
    commands_dir: commandsDir,
    results_dir: resultsDir,
    status,
    pending_commands: commandCount,
    stored_results: resultCount
  }
}

export async function sendBridgeCommand(
  method: string,
  args: Record<string, unknown> = {},
  options: { timeout_ms?: unknown } = {}
) {
  const bridgeDir = ensureBridgeDir()
  const id = randomUUID()
  const command: BridgeCommand = {
    id,
    method,
    args,
    createdAt: new Date().toISOString()
  }
  const commandPath = join(bridgeDir, "commands", `${id}.json`)
  const resultPath = join(bridgeDir, "results", `${id}.json`)
  const timeoutMs = readPositiveInt(options.timeout_ms, DEFAULT_TIMEOUT_MS)

  writeJsonFile(commandPath, command)

  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (existsSync(resultPath)) {
      const result = readJsonFile<BridgeResult>(resultPath)
      rmSync(resultPath, { force: true })
      if (!result.ok) {
        throw new Error(result.error || `After Effects bridge command failed: ${method}`)
      }
      return result.result ?? { ok: true }
    }
    await sleep(DEFAULT_POLL_MS)
  }

  throw new Error(
    `Timed out waiting for After Effects bridge result for ${method}. ` +
    `Open After Effects, load pagecran-ae-bridge.jsx from Window > ScriptUI Panels, and enable polling. Command file: ${commandPath}`
  )
}

export function cleanupOldBridgeFiles(maxAgeMs = 24 * 60 * 60 * 1000) {
  const bridgeDir = ensureBridgeDir()
  const cutoff = Date.now() - maxAgeMs
  let removed = 0
  for (const folder of ["commands", "results"]) {
    const dir = join(bridgeDir, folder)
    if (!existsSync(dir)) {
      continue
    }
    for (const name of readdirSync(dir)) {
      const filePath = join(dir, name)
      if (!name.endsWith(".json") || statSync(filePath).mtimeMs >= cutoff) {
        continue
      }
      rmSync(filePath, { force: true })
      removed += 1
    }
  }
  return { ok: true, bridge_dir: bridgeDir, removed }
}
