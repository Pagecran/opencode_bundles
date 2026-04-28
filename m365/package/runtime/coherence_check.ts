import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  printCoherenceReport,
  runCoherenceCheck,
  type CoherenceReport
} from "../_runtime/coherence_check"
import { loadMethodRegistry } from "../_runtime/method_registry"

import { listHandledMethodNames } from "./dispatcher"

function getPackageRoot() {
  const runtimeDir = dirname(fileURLToPath(import.meta.url))
  return join(runtimeDir, "..")
}

export function runBundleCoherenceCheck(): CoherenceReport {
  const packageRoot = getPackageRoot()
  return runCoherenceCheck({
    bundleName: "m365",
    toolPrefix: "m365_",
    skillsDir: join(packageRoot, "skills"),
    registry: loadMethodRegistry(join(packageRoot, "methods")),
    handledMethodNames: listHandledMethodNames()
  })
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url)

if (isDirectRun) {
  process.exitCode = printCoherenceReport(runBundleCoherenceCheck())
}
