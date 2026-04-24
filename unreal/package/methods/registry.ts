import type { UnrealMethodDefinition } from "../runtime/types"

export const unrealMethodDefinitions: UnrealMethodDefinition[] = [
  {
    "name": "ping",
    "domain": "core",
    "description": "Health check for the Pagecran Unreal bridge.",
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
    "description": "Return the method catalog exposed by the bridge.",
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
    "name": "execute_python",
    "domain": "core",
    "description": "Execute Unreal Editor Python code through the PythonScriptPlugin.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "bridge_method",
      "method": "execute_python"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  },
  {
    "name": "get_project_info",
    "domain": "editor",
    "description": "Read Unreal project metadata and active plugin state.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "bridge_method",
      "method": "get_project_info"
    },
    "requires": {
      "bridgeMethods": [
        "get_project_info"
      ]
    }
  },
  {
    "name": "get_editor_state",
    "domain": "editor",
    "description": "Read the current editor world and actor selection state.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "bridge_method",
      "method": "get_editor_state"
    },
    "requires": {
      "bridgeMethods": [
        "get_editor_state"
      ]
    }
  },
  {
    "name": "load_level",
    "domain": "editor",
    "description": "Open a level in the editor from an Unreal package or object path.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_script",
      "script": "unreal/editor/load_level.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  },
  {
    "name": "list_level_sequences",
    "domain": "sequencer",
    "description": "List Level Sequence assets available to the project.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_script",
      "script": "unreal/sequencer/list_level_sequences.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  },
  {
    "name": "get_sequence_info",
    "domain": "sequencer",
    "description": "Read playback range, frame rate, bindings, and track data for a Level Sequence.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_script",
      "script": "unreal/sequencer/get_sequence_info.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  },
  {
    "name": "open_level_sequence",
    "domain": "sequencer",
    "description": "Open a Level Sequence asset in the Sequencer editor.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_script",
      "script": "unreal/editor/open_level_sequence.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  },
  {
    "name": "add_track",
    "domain": "sequencer",
    "description": "Add a Sequencer track to a sequence or binding.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_script",
      "script": "unreal/sequencer/add_track.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  },
  {
    "name": "set_keyframe",
    "domain": "sequencer",
    "description": "Set a keyframe on a Sequencer channel.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_script",
      "script": "unreal/sequencer/set_keyframe.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  },
  {
    "name": "add_camera_cut",
    "domain": "sequencer",
    "description": "Create or update a camera cut section.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_script",
      "script": "unreal/sequencer/add_camera_cut.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  },
  {
    "name": "list_movie_render_graphs",
    "domain": "movie_render_graph",
    "description": "List Movie Render Graph assets available to the project.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_script",
      "script": "unreal/movie_render_graph/list_movie_render_graphs.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  },
  {
    "name": "get_movie_render_graph_info",
    "domain": "movie_render_graph",
    "description": "Read metadata and asset information for a Movie Render Graph asset.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_script",
      "script": "unreal/movie_render_graph/get_movie_render_graph_info.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  },
  {
    "name": "configure_movie_render_graph_job",
    "domain": "movie_render_graph",
    "description": "Configure a graph-driven render job with sequence and map selection.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_script",
      "script": "unreal/movie_render_graph/configure_movie_render_graph_job.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  },
  {
    "name": "render_sequence_with_graph",
    "domain": "movie_render_graph",
    "description": "Render a sequence through Movie Render Graph.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_script",
      "script": "unreal/movie_render_graph/render_sequence_with_graph.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  },
  {
    "name": "list_data_layers",
    "domain": "data_layers",
    "description": "List Data Layers in the active world.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_script",
      "script": "unreal/data_layers/list_data_layers.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  },
  {
    "name": "get_data_layer_info",
    "domain": "data_layers",
    "description": "Read state, visibility, and membership information for a Data Layer.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_script",
      "script": "unreal/data_layers/get_data_layer_info.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  },
  {
    "name": "set_data_layer_loaded",
    "domain": "data_layers",
    "description": "Set whether a Data Layer is loaded in the editor.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_script",
      "script": "unreal/data_layers/set_data_layer_loaded.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  },
  {
    "name": "set_data_layer_visible",
    "domain": "data_layers",
    "description": "Set whether a Data Layer is visible.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_script",
      "script": "unreal/data_layers/set_data_layer_visible.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  },
  {
    "name": "list_materials",
    "domain": "shading",
    "description": "List material and material instance assets.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_script",
      "script": "unreal/shading/list_materials.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  },
  {
    "name": "get_material_info",
    "domain": "shading",
    "description": "Read parent, parameters, usages, and shading metadata for a material or material instance.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_script",
      "script": "unreal/shading/get_material_info.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  },
  {
    "name": "create_material_instance",
    "domain": "shading",
    "description": "Create a material instance from a parent material.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_script",
      "script": "unreal/shading/create_material_instance.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  },
  {
    "name": "set_material_parameter",
    "domain": "shading",
    "description": "Set scalar, vector, or texture parameters on a material instance.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_script",
      "script": "unreal/shading/set_material_parameter.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  },
  {
    "name": "assign_material_to_actor",
    "domain": "shading",
    "description": "Assign a material to an actor component slot.",
    "kind": "host-backed",
    "risk": "write",
    "execution": {
      "strategy": "host_script",
      "script": "unreal/shading/assign_material_to_actor.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  },
  {
    "name": "list_material_parameter_collections",
    "domain": "shading",
    "description": "List available Material Parameter Collections.",
    "kind": "host-backed",
    "risk": "read",
    "execution": {
      "strategy": "host_script",
      "script": "unreal/shading/list_material_parameter_collections.py"
    },
    "requires": {
      "bridgeMethods": [
        "execute_python"
      ]
    }
  }
] as UnrealMethodDefinition[]
