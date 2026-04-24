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
