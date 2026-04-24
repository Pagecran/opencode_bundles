import type { BlenderMethodDefinition } from "../runtime/types"

export const blenderMethodDefinitions: BlenderMethodDefinition[] = [
  {
    "name": "ping",
    "domain": "core",
    "description": "Health check for the Blender bridge.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "bridge_method",
      "method": "ping"
    },
    "requires": {
      "bridgeMethods": [
        "ping"
      ]
    }
  },
  {
    "name": "get_capabilities",
    "domain": "core",
    "description": "Return bundle-defined Blender methods and current bridge capabilities.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "bridge_method",
      "method": "get_capabilities"
    },
    "requires": {
      "bridgeMethods": [
        "get_capabilities"
      ]
    }
  },
  {
    "name": "execute_code",
    "domain": "core",
    "description": "Execute arbitrary Python code inside Blender.",
    "kind": "host-backed",
    "risk": "destructive",
    "execution": {
      "strategy": "bridge_method",
      "method": "execute_code"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "get_addon_status",
    "domain": "addons",
    "description": "Get addon status.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_addons",
      "function": "get_addon_status"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "search_blenderkit_assets",
    "domain": "addons",
    "description": "Search blenderkit assets.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_addons",
      "function": "search_blenderkit_assets"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "import_blenderkit_asset",
    "domain": "addons",
    "description": "Import blenderkit asset.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_addons",
      "function": "import_blenderkit_asset"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "get_blenderkit_import_status",
    "domain": "addons",
    "description": "Get blenderkit import status.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_addons",
      "function": "get_blenderkit_import_status"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "search_sketchfab_models",
    "domain": "addons",
    "description": "Search sketchfab models.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_addons",
      "function": "search_sketchfab_models"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "import_sketchfab_model",
    "domain": "addons",
    "description": "Import sketchfab model.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_addons",
      "function": "import_sketchfab_model"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "ensure_bradley_asset_library",
    "domain": "addons",
    "description": "Ensure bradley asset library.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_addons",
      "function": "ensure_bradley_asset_library"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "list_bradley_assets",
    "domain": "addons",
    "description": "List bradley assets.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_addons",
      "function": "list_bradley_assets"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "import_bradley_preset",
    "domain": "addons",
    "description": "Import bradley preset.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_addons",
      "function": "import_bradley_preset"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "set_timeline_settings",
    "domain": "animation",
    "description": "Set timeline settings.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_animation",
      "function": "set_timeline_settings"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "keyframe_object_transform",
    "domain": "animation",
    "description": "Keyframe object transform.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_animation",
      "function": "keyframe_object_transform"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "create_turntable_animation",
    "domain": "animation",
    "description": "Create turntable animation.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_animation",
      "function": "create_turntable_animation"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "get_object_animation_info",
    "domain": "animation",
    "description": "Get object animation info.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_animation",
      "function": "get_object_animation_info"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "list_asset_libraries",
    "domain": "assets",
    "description": "List asset libraries.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_assets",
      "function": "list_asset_libraries"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "list_current_file_assets",
    "domain": "assets",
    "description": "List current file assets.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_assets",
      "function": "list_current_file_assets"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "get_asset_info",
    "domain": "assets",
    "description": "Get asset info.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_assets",
      "function": "get_asset_info"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "mark_asset",
    "domain": "assets",
    "description": "Mark asset.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_assets",
      "function": "mark_asset"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "clear_asset",
    "domain": "assets",
    "description": "Clear asset.",
    "kind": "host-backed",
    "risk": "destructive",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_assets",
      "function": "clear_asset"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "list_library_blend_files",
    "domain": "assets",
    "description": "List library blend files.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_assets",
      "function": "list_library_blend_files"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "list_blend_file_assets",
    "domain": "assets",
    "description": "List blend file assets.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_assets",
      "function": "list_blend_file_assets"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "import_blend_asset",
    "domain": "assets",
    "description": "Import blend asset.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_assets",
      "function": "import_blend_asset"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "list_geometry_node_trees",
    "domain": "geometry_nodes",
    "description": "List geometry node trees.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_geometry_nodes",
      "function": "list_geometry_node_trees"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "list_geometry_nodes_modifiers",
    "domain": "geometry_nodes",
    "description": "List geometry nodes modifiers.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_geometry_nodes",
      "function": "list_geometry_nodes_modifiers"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "get_geometry_node_tree",
    "domain": "geometry_nodes",
    "description": "Get geometry node tree.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_geometry_nodes",
      "function": "get_geometry_node_tree"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "create_geometry_node_tree",
    "domain": "geometry_nodes",
    "description": "Create geometry node tree.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_geometry_nodes",
      "function": "create_geometry_node_tree"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "attach_geometry_node_tree",
    "domain": "geometry_nodes",
    "description": "Attach geometry node tree.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_geometry_nodes",
      "function": "attach_geometry_node_tree"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "add_geometry_node",
    "domain": "geometry_nodes",
    "description": "Add geometry node.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_geometry_nodes",
      "function": "add_geometry_node"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "remove_geometry_node",
    "domain": "geometry_nodes",
    "description": "Remove geometry node.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_geometry_nodes",
      "function": "remove_geometry_node"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "rename_geometry_node",
    "domain": "geometry_nodes",
    "description": "Rename geometry node.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_geometry_nodes",
      "function": "rename_geometry_node"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "set_geometry_node_location",
    "domain": "geometry_nodes",
    "description": "Set geometry node location.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_geometry_nodes",
      "function": "set_geometry_node_location"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "connect_geometry_nodes",
    "domain": "geometry_nodes",
    "description": "Connect geometry nodes.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_geometry_nodes",
      "function": "connect_geometry_nodes"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "disconnect_geometry_nodes",
    "domain": "geometry_nodes",
    "description": "Disconnect geometry nodes.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_geometry_nodes",
      "function": "disconnect_geometry_nodes"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "set_node_input",
    "domain": "geometry_nodes",
    "description": "Set node input.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_geometry_nodes",
      "function": "set_node_input"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "set_modifier_input",
    "domain": "geometry_nodes",
    "description": "Set modifier input.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_geometry_nodes",
      "function": "set_modifier_input"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "list_available_node_types",
    "domain": "geometry_nodes",
    "description": "List available node types.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_geometry_nodes",
      "function": "list_available_node_types"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "add_node_tree_socket",
    "domain": "geometry_nodes",
    "description": "Add node tree socket.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_geometry_nodes",
      "function": "add_node_tree_socket"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "create_gn_from_template",
    "domain": "geometry_nodes",
    "description": "Create gn from template.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_geometry_nodes",
      "function": "create_gn_from_template"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "list_gn_templates",
    "domain": "geometry_nodes",
    "description": "List gn templates.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_geometry_nodes",
      "function": "list_gn_templates"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "get_scene_info",
    "domain": "scene",
    "description": "Get scene info.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_scene",
      "function": "get_scene_info"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "get_full_scene_hierarchy",
    "domain": "scene",
    "description": "Get full scene hierarchy.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_scene",
      "function": "get_full_scene_hierarchy"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "get_object_info",
    "domain": "scene",
    "description": "Get object info.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_scene",
      "function": "get_object_info"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "get_object_modifiers",
    "domain": "scene",
    "description": "Get object modifiers.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_scene",
      "function": "get_object_modifiers"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "create_object",
    "domain": "scene",
    "description": "Create object.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_scene",
      "function": "create_object"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "delete_object",
    "domain": "scene",
    "description": "Delete object.",
    "kind": "host-backed",
    "risk": "destructive",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_scene",
      "function": "delete_object"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "transform_object",
    "domain": "scene",
    "description": "Transform object.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_scene",
      "function": "transform_object"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "set_active_camera",
    "domain": "scene",
    "description": "Set active camera.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_scene",
      "function": "set_active_camera"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "get_viewport_screenshot",
    "domain": "scene",
    "description": "Get viewport screenshot.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_scene",
      "function": "get_viewport_screenshot"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "get_node_editor_screenshot",
    "domain": "scene",
    "description": "Get node editor screenshot.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_scene",
      "function": "get_node_editor_screenshot"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "list_materials",
    "domain": "shader",
    "description": "List materials.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shader",
      "function": "list_materials"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "get_material_info",
    "domain": "shader",
    "description": "Get material info.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shader",
      "function": "get_material_info"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "create_material",
    "domain": "shader",
    "description": "Create material.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shader",
      "function": "create_material"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "delete_material",
    "domain": "shader",
    "description": "Delete material.",
    "kind": "host-backed",
    "risk": "destructive",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shader",
      "function": "delete_material"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "assign_material",
    "domain": "shader",
    "description": "Assign material.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shader",
      "function": "assign_material"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "list_shader_node_groups",
    "domain": "shader",
    "description": "List shader node groups.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shader",
      "function": "list_shader_node_groups"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "get_shader_node_group_info",
    "domain": "shader",
    "description": "Get shader node group info.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shader",
      "function": "get_shader_node_group_info"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "list_shader_node_types",
    "domain": "shader",
    "description": "List shader node types.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shader",
      "function": "list_shader_node_types"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "add_shader_node_group_socket",
    "domain": "shader",
    "description": "Add shader node group socket.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shader",
      "function": "add_shader_node_group_socket"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "add_shader_node",
    "domain": "shader",
    "description": "Add shader node.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shader",
      "function": "add_shader_node"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "remove_shader_node",
    "domain": "shader",
    "description": "Remove shader node.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shader",
      "function": "remove_shader_node"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "connect_shader_nodes",
    "domain": "shader",
    "description": "Connect shader nodes.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shader",
      "function": "connect_shader_nodes"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "disconnect_shader_nodes",
    "domain": "shader",
    "description": "Disconnect shader nodes.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shader",
      "function": "disconnect_shader_nodes"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "set_shader_node_input",
    "domain": "shader",
    "description": "Set shader node input.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shader",
      "function": "set_shader_node_input"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "create_shader_material_from_template",
    "domain": "shader",
    "description": "Create shader material from template.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shader",
      "function": "create_shader_material_from_template"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "get_shader_editor_screenshot",
    "domain": "shader",
    "description": "Get shader editor screenshot.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shader",
      "function": "get_shader_editor_screenshot"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "get_shot_manager_status",
    "domain": "shot_manager",
    "description": "Get shot manager status.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shot_manager",
      "function": "get_shot_manager_status"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "get_shot_list",
    "domain": "shot_manager",
    "description": "Get shot list.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shot_manager",
      "function": "get_shot_list"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "get_shot_details",
    "domain": "shot_manager",
    "description": "Get shot details.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shot_manager",
      "function": "get_shot_details"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "create_shot",
    "domain": "shot_manager",
    "description": "Create shot.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shot_manager",
      "function": "create_shot"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "modify_shot",
    "domain": "shot_manager",
    "description": "Modify shot.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shot_manager",
      "function": "modify_shot"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "enable_disable_shots",
    "domain": "shot_manager",
    "description": "Enable disable shots.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shot_manager",
      "function": "enable_disable_shots"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "set_shot_manager_render_path",
    "domain": "shot_manager",
    "description": "Set shot manager render path.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shot_manager",
      "function": "set_shot_manager_render_path"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "launch_batch_render",
    "domain": "shot_manager",
    "description": "Launch batch render.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_function",
      "package": "opencode_blender_bundle",
      "module": "handlers_shot_manager",
      "function": "launch_batch_render"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "create_material_and_assign",
    "domain": "workflows",
    "description": "Create material and assign.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_script",
      "script": "blender/workflows/create_material_and_assign.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "apply_library_material_to_object",
    "domain": "workflows",
    "description": "Apply library material to object.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_script",
      "script": "blender/workflows/apply_library_material_to_object.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "scatter_library_asset_on_surface",
    "domain": "workflows",
    "description": "Scatter library asset on surface.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_script",
      "script": "blender/workflows/scatter_library_asset_on_surface.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  },
  {
    "name": "create_string_to_curves_object",
    "domain": "workflows",
    "description": "Create string to curves object.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_script",
      "script": "blender/workflows/create_string_to_curves_object.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_code"
      ]
    }
  }
] as BlenderMethodDefinition[]
