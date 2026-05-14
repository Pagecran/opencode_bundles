import { buildPluginTools } from "../_runtime/plugin_tools"
import { toJson } from "../_runtime/output"

import { dispatchDeclaredMethod, listPublicMethods } from "../runtime/dispatcher"

export const ResolvePlugin = async () => ({
  tool: buildPluginTools(listPublicMethods(), async (manifest, args) => {
    const result = await dispatchDeclaredMethod(manifest.name, args)
    return toJson(result)
  })
})

export default ResolvePlugin
