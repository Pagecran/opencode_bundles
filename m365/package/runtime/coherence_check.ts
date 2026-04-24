import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { listHandledMethodNames, listPublicMethods } from "./dispatcher"
import { listMethodManifests } from "./method_registry"

type SkillSummary = {
  name: string,
  filePath: string,
  mentionedMethods: string[]
}

function getPackageRoot() {
  const runtimeDir = dirname(fileURLToPath(import.meta.url))
  return join(runtimeDir, "..")
}

function getSkillSummaries(packageRoot: string) {
  const skillsRoot = join(packageRoot, "skills")
  const entries = readdirSync(skillsRoot, { withFileTypes: true })
  const skills: SkillSummary[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const filePath = join(skillsRoot, entry.name, "SKILL.md")
    const content = readFileSync(filePath, "utf8")
    const mentionedMethods = Array.from(content.matchAll(/`(m365_[a-z0-9_]+)`/g)).map(
      (match) => match[1]
    )

    skills.push({
      name: entry.name,
      filePath,
      mentionedMethods: Array.from(new Set(mentionedMethods)).sort((a, b) => a.localeCompare(b))
    })
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

function buildCheckSummary() {
  const packageRoot = getPackageRoot()
  const manifests = listMethodManifests()
  const publicMethods = listPublicMethods()
  const handledMethods = listHandledMethodNames()
  const skills = getSkillSummaries(packageRoot)

  const manifestNames = new Set(manifests.map((manifest) => manifest.name))
  const publicMethodNames = new Set(publicMethods.map((manifest) => manifest.name))
  const handledMethodNames = new Set(handledMethods)
  const mentionedMethodNames = new Set(skills.flatMap((skill) => skill.mentionedMethods))

  const errors: string[] = []
  const warnings: string[] = []

  for (const manifest of publicMethods) {
    if (!handledMethodNames.has(manifest.name)) {
      errors.push(`Public method ${manifest.name} has no runtime handler.`)
    }

    if (!mentionedMethodNames.has(manifest.name)) {
      errors.push(`Public method ${manifest.name} is not mentioned in any skill.`)
    }

    if (manifest.execution.tool !== manifest.name) {
      errors.push(
        `Public method ${manifest.name} must expose execution.tool = ${manifest.name} for manifest-driven registration.`
      )
    }
  }

  for (const handledMethod of handledMethods) {
    if (!manifestNames.has(handledMethod)) {
      errors.push(`Runtime handler ${handledMethod} has no matching method manifest.`)
    }
  }

  for (const skill of skills) {
    if (skill.mentionedMethods.length === 0) {
      warnings.push(`Skill ${skill.name} does not mention any m365_* tools.`)
      continue
    }

    for (const methodName of skill.mentionedMethods) {
      if (!publicMethodNames.has(methodName)) {
        errors.push(`Skill ${skill.name} mentions unknown or non-public tool ${methodName}.`)
      }
    }
  }

  for (const manifest of manifests) {
    const verifyMethod =
      typeof manifest.verify?.method === "string" && manifest.verify.method.trim()
        ? manifest.verify.method.trim()
        : null
    if (verifyMethod && !manifestNames.has(verifyMethod)) {
      errors.push(`Method ${manifest.name} references missing verify.method ${verifyMethod}.`)
    }

    const executionTool =
      typeof manifest.execution?.tool === "string" && manifest.execution.tool.trim()
        ? manifest.execution.tool.trim()
        : null
    if (executionTool && !handledMethodNames.has(executionTool)) {
      errors.push(`Method ${manifest.name} references missing execution.tool handler ${executionTool}.`)
    }
  }

  return {
    ok: errors.length === 0,
    counts: {
      manifests: manifests.length,
      publicMethods: publicMethods.length,
      handledMethods: handledMethods.length,
      skills: skills.length
    },
    publicMethods: publicMethods.map((manifest) => manifest.name),
    handledMethods,
    skills: skills.map((skill) => ({
      name: skill.name,
      methods: skill.mentionedMethods
    })),
    warnings,
    errors
  }
}

export function runBundleCoherenceCheck() {
  return buildCheckSummary()
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url)

if (isDirectRun) {
  const summary = buildCheckSummary()
  if (!summary.ok) {
    console.error(JSON.stringify(summary, null, 2))
    process.exitCode = 1
  } else {
    console.log(JSON.stringify(summary, null, 2))
  }
}
