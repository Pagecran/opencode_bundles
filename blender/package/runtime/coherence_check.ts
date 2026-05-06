import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  printCoherenceReport,
  runCoherenceCheck,
  type CoherenceReport
} from "../_runtime/coherence_check"
import { loadMethodRegistry } from "../_runtime/method_registry"
import type { MethodManifest } from "../_runtime/types"

import { listLocalBlenderHandlers } from "./local_handlers"

function getPackageRoot() {
  const runtimeDir = dirname(fileURLToPath(import.meta.url))
  return join(runtimeDir, "..")
}

export function runBundleCoherenceCheck(): CoherenceReport {
  const packageRoot = getPackageRoot()
  const registry = loadMethodRegistry(join(packageRoot, "methods"))
  const report = runCoherenceCheck({
    bundleName: "blender",
    toolPrefix: "",
    skillsDir: join(packageRoot, "skills"),
    registry,
    handledMethodNames: registry.list().map((manifest) => manifest.name)
  })

  addBlenderSpecificChecks(report, packageRoot, registry.list())
  report.ok = report.errors.length === 0
  return report
}

function addBlenderSpecificChecks(
  report: CoherenceReport,
  packageRoot: string,
  manifests: MethodManifest[]
) {
  const localHandlers = new Set(listLocalBlenderHandlers())

  for (const manifest of manifests) {
    if (manifest.execution.strategy === "host_script") {
      const script = manifest.execution.script
      if (typeof script !== "string" || !script.trim()) {
        report.errors.push(`Method ${manifest.name} uses host_script without execution.script.`)
      } else if (!existsSync(join(packageRoot, "scripts", script))) {
        report.errors.push(`Method ${manifest.name} references missing script ${script}.`)
      }
    }

    if (manifest.execution.strategy === "local_handler" || manifest.execution.strategy === "host_cli") {
      const handler = manifest.execution.handler
      if (typeof handler !== "string" || !handler.trim()) {
        report.errors.push(`Method ${manifest.name} uses ${manifest.execution.strategy} without execution.handler.`)
      } else if (!localHandlers.has(handler)) {
        report.errors.push(`Method ${manifest.name} references missing local handler ${handler}.`)
      }
    }

    const localData = manifest.requires?.localData
    if (Array.isArray(localData)) {
      for (const dataset of localData) {
        if (typeof dataset !== "string" || !dataset.trim()) {
          report.errors.push(`Method ${manifest.name} declares an invalid requires.localData entry.`)
          continue
        }
        const datasetRoot = join(packageRoot, "data", dataset)
        if (!existsSync(datasetRoot)) {
          report.errors.push(`Method ${manifest.name} requires missing dataset ${dataset}.`)
          continue
        }
        const sourceJson = join(datasetRoot, "SOURCE.json")
        if (!existsSync(sourceJson)) {
          report.errors.push(`Dataset ${dataset} required by ${manifest.name} is missing SOURCE.json.`)
        }
      }
    }
  }

  const docsRoot = join(packageRoot, "data", "blender_docs")
  if (existsSync(docsRoot)) {
    for (const requiredPath of [
      join(docsRoot, "SOURCE.json"),
      join(docsRoot, "api", "index.rst"),
      join(docsRoot, "manual", "index.rst")
    ]) {
      if (!existsSync(requiredPath)) {
        report.errors.push(`Blender docs dataset is incomplete: missing ${requiredPath}.`)
      }
    }
  }
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url)

if (isDirectRun) {
  process.exitCode = printCoherenceReport(runBundleCoherenceCheck())
}
