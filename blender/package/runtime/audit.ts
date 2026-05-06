import { execFile } from "node:child_process"
import { existsSync, statSync } from "node:fs"
import { basename, resolve } from "node:path"
import { promisify } from "node:util"

import type { JsonObject } from "../_runtime/types"

const execFileAsync = promisify(execFile)
const RESULT_MARKER = "__PAGECRAN_BLENDER_RESULT__"
const DEFAULT_TIMEOUT_MS = 120_000

type AuditKind = "datablocks" | "missing_files" | "linked_libraries"

function requiredString(params: JsonObject, key: string) {
  const value = params[key]
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Parameter '${key}' is required`)
  }
  return value.trim()
}

function resolveBlendFile(params: JsonObject) {
  const blendFile = resolve(requiredString(params, "blend_file"))
  if (!existsSync(blendFile)) {
    throw new Error(`Blend file not found: ${blendFile}`)
  }
  if (!statSync(blendFile).isFile()) {
    throw new Error(`Blend path is not a file: ${blendFile}`)
  }
  if (!blendFile.toLowerCase().endsWith(".blend")) {
    throw new Error(`Expected a .blend file: ${blendFile}`)
  }
  return blendFile
}

function resolveBlenderBinary() {
  return (
    process.env.PAGECRAN_BLENDER_BIN ||
    process.env.BLENDER_PATH ||
    process.env.BLENDER_BIN ||
    "blender"
  )
}

function timeoutMs(params: JsonObject, timeoutMs?: number) {
  if (typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return Math.trunc(timeoutMs)
  }
  const raw = params.timeout_seconds
  const parsed = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? ""))
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.trunc(parsed * 1000)
  }
  return DEFAULT_TIMEOUT_MS
}

function buildAuditCode(kind: AuditKind) {
  const bodyByKind: Record<AuditKind, string> = {
    datablocks: `
counts = {
    "actions": len(bpy.data.actions),
    "cameras": len(bpy.data.cameras),
    "collections": len(bpy.data.collections),
    "curves": len(bpy.data.curves),
    "fonts": len(bpy.data.fonts),
    "images": len(bpy.data.images),
    "libraries": len(bpy.data.libraries),
    "lights": len(bpy.data.lights),
    "materials": len(bpy.data.materials),
    "meshes": len(bpy.data.meshes),
    "node_groups": len(bpy.data.node_groups),
    "objects": len(bpy.data.objects),
    "scenes": len(bpy.data.scenes),
    "textures": len(bpy.data.textures),
    "worlds": len(bpy.data.worlds),
}
result = {
    "blend_file": bpy.data.filepath,
    "counts": counts,
    "scenes": [scene.name for scene in bpy.data.scenes],
    "render_engines": sorted(set(scene.render.engine for scene in bpy.data.scenes)),
}
`,
    missing_files: `
missing = []
def add_missing(kind, name, filepath):
    if filepath and not bpy.path.exists(filepath):
        missing.append({"type": kind, "name": name, "path": bpy.path.abspath(filepath)})

for image in bpy.data.images:
    if image.source == 'FILE':
        add_missing("IMAGE", image.name, image.filepath)
for font in bpy.data.fonts:
    add_missing("FONT", font.name, font.filepath)
for sound in bpy.data.sounds:
    add_missing("SOUND", sound.name, sound.filepath)
for movieclip in bpy.data.movieclips:
    add_missing("MOVIE_CLIP", movieclip.name, movieclip.filepath)
for library in bpy.data.libraries:
    add_missing("LIBRARY", library.name, library.filepath)

result = {"blend_file": bpy.data.filepath, "count": len(missing), "missing_files": missing}
`,
    linked_libraries: `
libraries = []
for library in bpy.data.libraries:
    users_id = []
    for datablock in library.users_id:
        users_id.append({"name": datablock.name, "id_type": datablock.id_type})
    libraries.append({
        "name": library.name,
        "filepath": bpy.path.abspath(library.filepath),
        "users_id_count": len(users_id),
        "users_id": users_id,
    })
result = {"blend_file": bpy.data.filepath, "count": len(libraries), "libraries": libraries}
`
  }

  return [
    "import bpy",
    "import json",
    bodyByKind[kind],
    `print(${JSON.stringify(RESULT_MARKER)} + json.dumps(result, default=str))`
  ].join("\n")
}

async function runBlenderAudit(kind: AuditKind, params: JsonObject, requestTimeoutMs?: number) {
  const blendFile = resolveBlendFile(params)
  const blender = resolveBlenderBinary()
  const code = buildAuditCode(kind)
  const timeout = timeoutMs(params, requestTimeoutMs)

  try {
    const { stdout, stderr } = await execFileAsync(
      blender,
      ["--background", blendFile, "--python-expr", code],
      { timeout, maxBuffer: 32 * 1024 * 1024 }
    )

    const markerIndex = stdout.lastIndexOf(RESULT_MARKER)
    if (markerIndex === -1) {
      throw new Error(`No audit result marker found. stderr: ${stderr}`)
    }
    const rawJson = stdout.slice(markerIndex + RESULT_MARKER.length).trim().split(/\r?\n/)[0]
    return JSON.parse(rawJson) as JsonObject
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to run Blender audit with '${blender}': ${message}`)
  }
}

export function getBlendfileSummaryPathInfo(params: JsonObject) {
  const blendFile = resolveBlendFile(params)
  const stats = statSync(blendFile)
  return {
    blend_file: blendFile,
    basename: basename(blendFile),
    exists: true,
    size_bytes: stats.size,
    modified_at: stats.mtime.toISOString(),
    created_at: stats.birthtime.toISOString()
  }
}

export function getBlendfileSummaryDatablocks(params: JsonObject, timeoutMs?: number) {
  return runBlenderAudit("datablocks", params, timeoutMs)
}

export function getBlendfileSummaryMissingFiles(params: JsonObject, timeoutMs?: number) {
  return runBlenderAudit("missing_files", params, timeoutMs)
}

export function getBlendfileSummaryLinkedLibraries(params: JsonObject, timeoutMs?: number) {
  return runBlenderAudit("linked_libraries", params, timeoutMs)
}
