#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function getBridgeDir() {
  return process.env.PAGECRAN_AFTEREFFECTS_BRIDGE_DIR ||
    process.env.AE_BRIDGE_DIR ||
    join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Pagecran", "AfterEffectsBridge")
}

function ensureBridgeDir() {
  const bridgeDir = getBridgeDir()
  mkdirSync(join(bridgeDir, "commands"), { recursive: true })
  mkdirSync(join(bridgeDir, "results"), { recursive: true })
  return bridgeDir
}

function findAfterEffectsScriptsDirs() {
  const configured = process.env.PAGECRAN_AFTEREFFECTS_SCRIPTS_DIR
  if (configured?.trim()) {
    return [configured.trim()]
  }

  const adobeRoot = join(process.env.ProgramFiles || "C:\\Program Files", "Adobe")
  if (!existsSync(adobeRoot)) {
    return []
  }

  return readdirSync(adobeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("Adobe After Effects"))
    .sort((left, right) => right.name.localeCompare(left.name, undefined, { numeric: true }))
    .map((entry) => join(adobeRoot, entry.name, "Support Files", "Scripts", "ScriptUI Panels"))
    .filter((dir) => existsSync(dirname(dir)))
}

function print(value, pretty) {
  console.log(JSON.stringify(value, null, pretty ? 2 : 0))
}

function usage() {
  console.error("Usage: pagecran_aftereffects_cli.mjs <endpoint|bridge-dir|install-bridge> [--pretty] [--target <ScriptUI Panels dir>]")
}

const args = process.argv.slice(2)
const command = args[0]
const pretty = args.includes("--pretty")

try {
  if (!command || command === "help" || command === "--help") {
    usage()
    process.exit(command ? 0 : 1)
  }

  if (command === "endpoint" || command === "bridge-dir") {
    const bridgeDir = ensureBridgeDir()
    print({ ok: true, bridge_dir: bridgeDir }, pretty)
    process.exit(0)
  }

  if (command === "install-bridge") {
    const targetIndex = args.indexOf("--target")
    const targetDirs = targetIndex >= 0 ? [args[targetIndex + 1]] : findAfterEffectsScriptsDirs()
    const resolvedTargets = targetDirs.filter((target) => typeof target === "string" && target.trim().length > 0)
    if (resolvedTargets.length === 0) {
      throw new Error("Could not detect any After Effects ScriptUI Panels directory. Provide --target explicitly.")
    }
    const source = join(PACKAGE_ROOT, "scripts", "pagecran-ae-bridge.jsx")
    const targets = []
    for (const targetDir of resolvedTargets) {
      mkdirSync(targetDir, { recursive: true })
      const target = join(targetDir, "pagecran-ae-bridge.jsx")
      copyFileSync(source, target)
      targets.push(target)
    }
    print({ ok: true, source, targets }, pretty)
    process.exit(0)
  }

  usage()
  process.exit(1)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
