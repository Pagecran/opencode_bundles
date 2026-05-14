import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const DEFAULT_TIMEOUT_MS = 30_000
const CANDIDATE_PROBE_TIMEOUT_MS = 10_000
const MAX_BUFFER_BYTES = 8 * 1024 * 1024
const RUNTIME_DIR = dirname(fileURLToPath(import.meta.url))
const HOST_SCRIPT = resolve(RUNTIME_DIR, "..", "scripts", "pagecran_resolve_host.py")

type JsonObject = Record<string, unknown>

type PythonCandidate = {
  command: string,
  argsPrefix: string[],
  label: string
}

type PythonSelection = {
  command: string,
  argsPrefix: string[],
  label: string,
  pythonHome: string | null
}

type CandidateStatus = {
  label: string,
  command: string,
  args_prefix: string[],
  ok: boolean,
  python_home?: string | null,
  probe?: unknown,
  error?: string
}

let cachedPythonSelection: PythonSelection | null = null

function normalizeTimeoutMs(params: JsonObject, requestTimeoutMs?: number) {
  if (typeof requestTimeoutMs === "number" && Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0) {
    return Math.trunc(requestTimeoutMs)
  }

  const timeoutMs = params.timeout_ms
  if (typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return Math.trunc(timeoutMs)
  }

  const timeoutSeconds = params.timeout_seconds
  if (typeof timeoutSeconds === "number" && Number.isFinite(timeoutSeconds) && timeoutSeconds > 0) {
    return Math.trunc(timeoutSeconds * 1000)
  }

  return DEFAULT_TIMEOUT_MS
}

function ensureHostScriptExists() {
  if (!existsSync(HOST_SCRIPT)) {
    throw new Error(`Resolve host script is missing: ${HOST_SCRIPT}`)
  }
}

function getPythonCandidates() {
  const candidates: PythonCandidate[] = []
  const seen = new Set<string>()

  function addCandidate(command: string, argsPrefix: string[], label: string) {
    const key = JSON.stringify([command, argsPrefix])
    if (seen.has(key)) {
      return
    }
    seen.add(key)
    candidates.push({ command, argsPrefix, label })
  }

  const configured = process.env.PAGECRAN_RESOLVE_PYTHON || process.env.PAGECRAN_RESOLVE_PYTHON_BIN
  if (configured?.trim()) {
    addCandidate(configured.trim(), [], `env:${configured.trim()}`)
  }

  addCandidate("py", ["-3.10"], "py -3.10")
  addCandidate("py", ["-3.11"], "py -3.11")
  addCandidate("python", [], "python")
  addCandidate("python3", [], "python3")

  return candidates
}

function encodePayload(params: JsonObject) {
  return Buffer.from(JSON.stringify(params), "utf8").toString("base64")
}

function buildExecEnv(pythonHome: string | null) {
  if (!pythonHome) {
    return process.env
  }

  return {
    ...process.env,
    PYTHONHOME: pythonHome
  }
}

async function getPythonHome(candidate: PythonCandidate, timeoutMs: number) {
  const { stdout } = await execFileAsync(
    candidate.command,
    [...candidate.argsPrefix, "-c", "import sys; print(sys.base_prefix or sys.prefix)"] ,
    {
      timeout: timeoutMs,
      maxBuffer: 16 * 1024,
      windowsHide: true
    }
  )

  const value = stdout.trim().split(/\r?\n/).at(-1)?.trim() || ""
  return value || null
}

function parseJsonOutput(raw: string, label: string) {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error(`${label} returned no JSON output`)
  }

  return JSON.parse(trimmed) as unknown
}

function formatExecError(error: unknown) {
  if (!(error instanceof Error)) {
    return String(error)
  }

  const stdout = "stdout" in error && typeof (error as { stdout?: unknown }).stdout === "string"
    ? ((error as { stdout: string }).stdout || "").trim()
    : ""
  const stderr = "stderr" in error && typeof (error as { stderr?: unknown }).stderr === "string"
    ? ((error as { stderr: string }).stderr || "").trim()
    : ""
  const extras = [stderr, stdout].filter(Boolean).join(" | ")

  return extras ? `${error.message} | ${extras}` : error.message
}

async function runHostActionWithSelection(
  selection: PythonSelection,
  action: string,
  params: JsonObject,
  timeoutMs: number
) {
  ensureHostScriptExists()
  const encodedPayload = encodePayload(params)
  const { stdout } = await execFileAsync(
    selection.command,
    [...selection.argsPrefix, HOST_SCRIPT, action, encodedPayload],
    {
      env: buildExecEnv(selection.pythonHome),
      timeout: timeoutMs,
      maxBuffer: MAX_BUFFER_BYTES,
      windowsHide: true
    }
  )

  return parseJsonOutput(stdout, `${selection.label} ${action}`)
}

async function probeCandidate(candidate: PythonCandidate, timeoutMs: number) {
  const pythonHome = await getPythonHome(candidate, timeoutMs)
  const selection: PythonSelection = {
    command: candidate.command,
    argsPrefix: candidate.argsPrefix,
    label: candidate.label,
    pythonHome
  }
  const probe = await runHostActionWithSelection(selection, "runtime_probe", {}, timeoutMs)
  return { selection, probe }
}

async function resolvePythonSelection(timeoutMs: number) {
  if (cachedPythonSelection) {
    return cachedPythonSelection
  }

  const errors: string[] = []
  for (const candidate of getPythonCandidates()) {
    try {
      const { selection } = await probeCandidate(candidate, Math.min(timeoutMs, CANDIDATE_PROBE_TIMEOUT_MS))
      cachedPythonSelection = selection
      return selection
    } catch (error) {
      errors.push(`${candidate.label}: ${formatExecError(error)}`)
    }
  }

  throw new Error(
    "Could not find a compatible Python runtime for Resolve/Fusion. " +
    "Prefer Python 3.10 on Windows and set PAGECRAN_RESOLVE_PYTHON if needed. " +
    `Details: ${errors.join(" || ")}`
  )
}

export async function getResolveHostStatus(params: JsonObject = {}, requestTimeoutMs?: number) {
  const timeoutMs = normalizeTimeoutMs(params, requestTimeoutMs)
  const candidateStatuses: CandidateStatus[] = []
  let selected: PythonSelection | null = null

  for (const candidate of getPythonCandidates()) {
    try {
      const { selection, probe } = await probeCandidate(candidate, Math.min(timeoutMs, CANDIDATE_PROBE_TIMEOUT_MS))
      candidateStatuses.push({
        label: candidate.label,
        command: candidate.command,
        args_prefix: candidate.argsPrefix,
        ok: true,
        python_home: selection.pythonHome,
        probe
      })
      if (!selected) {
        selected = selection
        cachedPythonSelection = selection
      }
    } catch (error) {
      candidateStatuses.push({
        label: candidate.label,
        command: candidate.command,
        args_prefix: candidate.argsPrefix,
        ok: false,
        error: formatExecError(error)
      })
    }
  }

  return {
    ok: true,
    host_script: HOST_SCRIPT,
    selected_python: selected
      ? {
          label: selected.label,
          command: selected.command,
          args_prefix: selected.argsPrefix,
          python_home: selected.pythonHome
        }
      : null,
    candidates: candidateStatuses
  }
}

export async function runResolveHostAction(action: string, params: JsonObject = {}, requestTimeoutMs?: number) {
  const timeoutMs = normalizeTimeoutMs(params, requestTimeoutMs)
  const selection = await resolvePythonSelection(timeoutMs)

  try {
    const result = await runHostActionWithSelection(selection, action, params, timeoutMs)
    if (typeof result === "object" && result !== null) {
      return {
        ...result as JsonObject,
        python_selection: {
          label: selection.label,
          command: selection.command,
          args_prefix: selection.argsPrefix
        }
      }
    }
    return result
  } catch (error) {
    throw new Error(`Resolve host action '${action}' failed: ${formatExecError(error)}`)
  }
}
