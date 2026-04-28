import { getValidAuth, isRecord, parseJson, type JsonRecord } from "./auth"

export const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"

export type GraphRequestArgs = {
  path: string,
  method?: string,
  query?: JsonRecord,
  body?: JsonRecord,
  force_refresh?: boolean
}

export type GraphRequestResult = {
  ok: boolean,
  status: number,
  method: string,
  path: string,
  result: unknown
}

export type GraphRawRequestArgs = {
  path: string,
  method?: string,
  query?: JsonRecord,
  body?: string | Uint8Array,
  content_type?: string,
  force_refresh?: boolean
}

export type GraphDownloadResult = {
  ok: boolean,
  status: number,
  path: string,
  contentType: string | null,
  contentLength: number | null,
  bytes: Uint8Array
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null
}

function extractGraphMessage(payload: unknown, fallback: string) {
  if (!isRecord(payload)) {
    return fallback
  }

  const errorValue = payload.error
  if (isRecord(errorValue)) {
    return readString(errorValue.message) || fallback
  }

  return readString(errorValue) || fallback
}

export function buildGraphUrl(path: string, query?: JsonRecord) {
  const baseUrl = path.startsWith("https://")
    ? path
    : `${GRAPH_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`
  const url = new URL(baseUrl)

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) {
        continue
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, String(item))
        }
      } else {
        url.searchParams.set(key, String(value))
      }
    }
  }

  return url.toString()
}

export async function executeGraphRequest(args: GraphRequestArgs): Promise<GraphRequestResult> {
  let auth = await getValidAuth(Boolean(args.force_refresh))
  const method = (args.method || (args.body ? "POST" : "GET")).toUpperCase()

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const headers: Record<string, string> = {
      Authorization: `${auth.tokenType} ${auth.accessToken}`
    }
    let body: string | undefined

    if (args.body !== undefined) {
      headers["Content-Type"] = "application/json"
      body = JSON.stringify(args.body)
    }

    const response = await fetch(buildGraphUrl(args.path, args.query), {
      method,
      headers,
      body
    })

    const text = await response.text()
    const payload = parseJson(text)
    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        method,
        path: args.path,
        result: payload
      }
    }

    if (response.status === 401 && attempt === 0) {
      auth = await getValidAuth(true)
      continue
    }

    throw new Error(
      `Microsoft Graph request failed (${response.status}): ${extractGraphMessage(payload, text)}`
    )
  }

  throw new Error("Microsoft Graph request failed after token refresh.")
}

export async function executeGraphRawRequest(args: GraphRawRequestArgs): Promise<GraphRequestResult> {
  let auth = await getValidAuth(Boolean(args.force_refresh))
  const method = (args.method || (args.body ? "PUT" : "GET")).toUpperCase()

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const headers: Record<string, string> = {
      Authorization: `${auth.tokenType} ${auth.accessToken}`
    }

    if (args.content_type) {
      headers["Content-Type"] = args.content_type
    }

    const response = await fetch(buildGraphUrl(args.path, args.query), {
      method,
      headers,
      body: args.body
    })

    const text = await response.text()
    const payload = parseJson(text)
    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        method,
        path: args.path,
        result: payload
      }
    }

    if (response.status === 401 && attempt === 0) {
      auth = await getValidAuth(true)
      continue
    }

    throw new Error(
      `Microsoft Graph request failed (${response.status}): ${extractGraphMessage(payload, text)}`
    )
  }

  throw new Error("Microsoft Graph request failed after token refresh.")
}

export async function downloadGraphBytes(args: {
  path: string,
  query?: JsonRecord,
  force_refresh?: boolean
}): Promise<GraphDownloadResult> {
  let auth = await getValidAuth(Boolean(args.force_refresh))

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(buildGraphUrl(args.path, args.query), {
      method: "GET",
      headers: {
        Authorization: `${auth.tokenType} ${auth.accessToken}`
      }
    })

    if (response.ok) {
      const contentLengthText = response.headers.get("content-length")
      const contentLength = contentLengthText ? Number(contentLengthText) : null
      return {
        ok: true,
        status: response.status,
        path: args.path,
        contentType: response.headers.get("content-type"),
        contentLength: Number.isFinite(contentLength) ? contentLength : null,
        bytes: new Uint8Array(await response.arrayBuffer())
      }
    }

    const text = await response.text()
    const payload = parseJson(text)

    if (response.status === 401 && attempt === 0) {
      auth = await getValidAuth(true)
      continue
    }

    throw new Error(
      `Microsoft Graph download failed (${response.status}): ${extractGraphMessage(payload, text)}`
    )
  }

  throw new Error("Microsoft Graph download failed after token refresh.")
}

export async function graphResult(args: GraphRequestArgs) {
  const response = await executeGraphRequest(args)
  return response.result
}

export async function pingGraph(forceRefresh = false) {
  return executeGraphRequest({
    path: "/me",
    method: "GET",
    query: {
      "$select": "id,displayName,userPrincipalName,mail"
    },
    force_refresh: forceRefresh
  })
}
