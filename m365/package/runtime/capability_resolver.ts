import { getAuthStatus } from "./auth"

export function resolveCapabilities() {
  const authStatus = getAuthStatus()

  return {
    authenticated: authStatus.authenticated,
    pending_auth: authStatus.pending_auth,
    scopes: authStatus.scope_list,
    auth_file: authStatus.auth_file,
    pending_auth_file: authStatus.pending_auth_file
  }
}
