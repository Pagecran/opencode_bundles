import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  printCoherenceReport,
  runCoherenceCheck,
  type CoherenceReport
} from "../_runtime/coherence_check"
import { loadMethodRegistry } from "../_runtime/method_registry"

function getPackageRoot() {
  const runtimeDir = dirname(fileURLToPath(import.meta.url))
  return join(runtimeDir, "..")
}

export function runBundleCoherenceCheck(): CoherenceReport {
  const packageRoot = getPackageRoot()
  const registry = loadMethodRegistry(join(packageRoot, "methods"))

  return runCoherenceCheck({
    bundleName: "unreal",
    toolPrefix: "",
    skillsDir: join(packageRoot, "skills"),
    registry,
    handledMethodNames: registry.list().map((manifest) => manifest.name)
  })
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url)

if (isDirectRun) {
  process.exitCode = printCoherenceReport(runBundleCoherenceCheck())
}
