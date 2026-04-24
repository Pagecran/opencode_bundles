#include "OpenCodeUnrealBridgeModule.h"

#include "PagecranBridgeMethodRegistry.h"
#include "PagecranBridgeServer.h"

#include "Dom/JsonObject.h"
#include "Engine/Selection.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "Interfaces/IPluginManager.h"
#include "Misc/App.h"
#include "Misc/EngineVersion.h"
#include "Misc/Paths.h"
#include "PythonScriptTypes.h"

#if WITH_EDITOR
#include "Editor.h"
#include "IPythonScriptPlugin.h"
#endif

IMPLEMENT_MODULE(FOpenCodeUnrealBridgeModule, OpenCodeUnrealBridge)

namespace
{
    FPagecranBridgeParamSpec MakeParam(const TCHAR* Name, const TCHAR* Type, bool bRequired, const TCHAR* Description)
    {
        FPagecranBridgeParamSpec Param;
        Param.Name = Name;
        Param.Type = Type;
        Param.bRequired = bRequired;
        Param.Description = Description;
        return Param;
    }

    FPagecranBridgeMethodSpec MakeMethod(const TCHAR* Name, const TCHAR* Description, const TCHAR* Domain, bool bImplemented = false)
    {
        FPagecranBridgeMethodSpec Spec;
        Spec.Name = Name;
        Spec.Description = Description;
        Spec.Domain = Domain;
        Spec.bImplemented = bImplemented;
        return Spec;
    }

}

void FOpenCodeUnrealBridgeModule::StartupModule()
{
    MethodRegistry = MakeUnique<FPagecranBridgeMethodRegistry>();
    RegisterMethods();

    Server = MakeUnique<FPagecranBridgeServer>(MethodRegistry.Get());
    if (!Server->Start(TEXT("127.0.0.1"), 9877))
    {
        UE_LOG(LogTemp, Error, TEXT("OpenCodeUnrealBridge failed to start the TCP bridge"));
    }
}

void FOpenCodeUnrealBridgeModule::ShutdownModule()
{
    if (Server.IsValid())
    {
        Server->Stop();
        Server.Reset();
    }

    MethodRegistry.Reset();
}

void FOpenCodeUnrealBridgeModule::RegisterMethods()
{
    RegisterImplementedMethod(MakeMethod(TEXT("ping"), TEXT("Health check for the Pagecran Unreal bridge."), TEXT("core"), true),
        [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
        {
            return HandlePing(Params, OutError);
        });

    RegisterImplementedMethod(MakeMethod(TEXT("get_capabilities"), TEXT("Return the method catalog exposed by the bridge."), TEXT("core"), true),
        [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
        {
            return HandleGetCapabilities(Params, OutError);
        });

    FPagecranBridgeMethodSpec Method = MakeMethod(TEXT("execute_python"), TEXT("Execute Unreal Editor Python code through the PythonScriptPlugin."), TEXT("core"), true);
    Method.Params = {
        MakeParam(TEXT("code"), TEXT("string"), true, TEXT("Python source code to execute inside the Unreal Editor."))
    };
    RegisterImplementedMethod(Method, [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        return HandleExecutePython(Params, OutError);
    });

    RegisterImplementedMethod(MakeMethod(TEXT("get_project_info"), TEXT("Read Unreal project metadata and active plugin state."), TEXT("editor"), true),
        [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
        {
            return HandleGetProjectInfo(Params, OutError);
        });

    RegisterImplementedMethod(MakeMethod(TEXT("get_editor_state"), TEXT("Read the current editor world and actor selection state."), TEXT("editor"), true),
        [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
        {
            return HandleGetEditorState(Params, OutError);
        });

    Method = MakeMethod(TEXT("load_level"), TEXT("Open a level in the editor from an Unreal package or object path."), TEXT("editor"));
    Method.Params = {
        MakeParam(TEXT("level_path"), TEXT("string"), true, TEXT("Unreal package path or object path for the map, for example /Game/Levels/MyLevel."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("get_viewport_screenshot"), TEXT("Capture the active editor viewport for verification."), TEXT("editor"));
    Method.Params = {
        MakeParam(TEXT("max_size"), TEXT("int"), false, TEXT("Optional max output dimension in pixels."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("list_level_sequences"), TEXT("List Level Sequence assets available to the project."), TEXT("sequencer"));
    Method.Params = {
        MakeParam(TEXT("root_path"), TEXT("string"), false, TEXT("Optional Unreal content root, default /Game.")),
        MakeParam(TEXT("limit"), TEXT("int"), false, TEXT("Optional result limit, default 100."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("get_sequence_info"), TEXT("Read playback range, frame rate, bindings, and track data for a Level Sequence."), TEXT("sequencer"));
    Method.Params = {
        MakeParam(TEXT("sequence_path"), TEXT("string"), true, TEXT("Asset path of the Level Sequence."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("open_level_sequence"), TEXT("Open a Level Sequence asset in the Sequencer editor."), TEXT("sequencer"));
    Method.Params = {
        MakeParam(TEXT("sequence_path"), TEXT("string"), true, TEXT("Asset path of the Level Sequence."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("create_level_sequence"), TEXT("Create a new Level Sequence asset."), TEXT("sequencer"));
    Method.Params = {
        MakeParam(TEXT("package_path"), TEXT("string"), true, TEXT("Destination package path.")),
        MakeParam(TEXT("asset_name"), TEXT("string"), true, TEXT("Sequence asset name."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("list_sequence_bindings"), TEXT("Inspect possessables and spawnables for a sequence."), TEXT("sequencer"));
    Method.Params = {
        MakeParam(TEXT("sequence_path"), TEXT("string"), true, TEXT("Asset path of the Level Sequence."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("add_actor_binding"), TEXT("Bind an actor into a Level Sequence."), TEXT("sequencer"));
    Method.Params = {
        MakeParam(TEXT("sequence_path"), TEXT("string"), true, TEXT("Asset path of the Level Sequence.")),
        MakeParam(TEXT("actor_name"), TEXT("string"), true, TEXT("Editor actor label or object name."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("add_track"), TEXT("Add a Sequencer track to a sequence or binding."), TEXT("sequencer"));
    Method.Params = {
        MakeParam(TEXT("sequence_path"), TEXT("string"), true, TEXT("Asset path of the Level Sequence.")),
        MakeParam(TEXT("track_type"), TEXT("string"), true, TEXT("Track type identifier.")),
        MakeParam(TEXT("binding_id"), TEXT("string"), false, TEXT("Optional binding identifier."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("set_section_range"), TEXT("Set the frame range of a Sequencer section."), TEXT("sequencer"));
    Method.Params = {
        MakeParam(TEXT("sequence_path"), TEXT("string"), true, TEXT("Asset path of the Level Sequence.")),
        MakeParam(TEXT("section_id"), TEXT("string"), true, TEXT("Section identifier.")),
        MakeParam(TEXT("start_frame"), TEXT("int"), true, TEXT("Start frame.")),
        MakeParam(TEXT("end_frame"), TEXT("int"), true, TEXT("End frame."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("set_keyframe"), TEXT("Set a keyframe on a Sequencer channel."), TEXT("sequencer"));
    Method.Params = {
        MakeParam(TEXT("sequence_path"), TEXT("string"), true, TEXT("Asset path of the Level Sequence.")),
        MakeParam(TEXT("channel_path"), TEXT("string"), true, TEXT("Channel identifier or path.")),
        MakeParam(TEXT("frame"), TEXT("int"), true, TEXT("Frame number.")),
        MakeParam(TEXT("value"), TEXT("any"), true, TEXT("Keyframe value."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("add_camera_cut"), TEXT("Create or update a camera cut section."), TEXT("sequencer"));
    Method.Params = {
        MakeParam(TEXT("sequence_path"), TEXT("string"), true, TEXT("Asset path of the Level Sequence.")),
        MakeParam(TEXT("camera_binding_id"), TEXT("string"), true, TEXT("Binding id of the camera.")),
        MakeParam(TEXT("start_frame"), TEXT("int"), true, TEXT("Start frame.")),
        MakeParam(TEXT("end_frame"), TEXT("int"), true, TEXT("End frame."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("render_sequence"), TEXT("Render a sequence via Movie Render Queue or an equivalent bridge workflow."), TEXT("rendering"));
    Method.Params = {
        MakeParam(TEXT("sequence_path"), TEXT("string"), true, TEXT("Asset path of the Level Sequence.")),
        MakeParam(TEXT("preset_path"), TEXT("string"), false, TEXT("Optional Movie Render Queue preset asset.")),
        MakeParam(TEXT("output_path"), TEXT("string"), false, TEXT("Output directory override."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("list_movie_render_graphs"), TEXT("List Movie Render Graph assets available to the project."), TEXT("movie_render_graph"));
    Method.Params = {
        MakeParam(TEXT("root_path"), TEXT("string"), false, TEXT("Optional Unreal content root, default /Game.")),
        MakeParam(TEXT("limit"), TEXT("int"), false, TEXT("Optional result limit, default 100."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("get_movie_render_graph_info"), TEXT("Read metadata and asset information for a Movie Render Graph asset."), TEXT("movie_render_graph"));
    Method.Params = {
        MakeParam(TEXT("graph_path"), TEXT("string"), true, TEXT("Asset path of the Movie Render Graph asset."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("create_movie_render_graph_config"), TEXT("Create a new Movie Render Graph configuration asset."), TEXT("movie_render_graph"));
    Method.Params = {
        MakeParam(TEXT("package_path"), TEXT("string"), true, TEXT("Destination package path.")),
        MakeParam(TEXT("asset_name"), TEXT("string"), true, TEXT("Graph asset name."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("configure_movie_render_graph_job"), TEXT("Configure a graph-driven render job with sequence and map selection."), TEXT("movie_render_graph"));
    Method.Params = {
        MakeParam(TEXT("graph_path"), TEXT("string"), true, TEXT("Asset path of the Movie Render Graph asset.")),
        MakeParam(TEXT("sequence_path"), TEXT("string"), true, TEXT("Asset path of the Level Sequence.")),
        MakeParam(TEXT("map_path"), TEXT("string"), false, TEXT("Optional map path override.")),
        MakeParam(TEXT("job_name"), TEXT("string"), false, TEXT("Optional job name override."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("render_sequence_with_graph"), TEXT("Render a sequence through Movie Render Graph."), TEXT("movie_render_graph"));
    Method.Params = {
        MakeParam(TEXT("graph_path"), TEXT("string"), true, TEXT("Asset path of the Movie Render Graph asset.")),
        MakeParam(TEXT("sequence_path"), TEXT("string"), true, TEXT("Asset path of the Level Sequence.")),
        MakeParam(TEXT("map_path"), TEXT("string"), false, TEXT("Optional map path override.")),
        MakeParam(TEXT("job_name"), TEXT("string"), false, TEXT("Optional job name override.")),
        MakeParam(TEXT("output_path"), TEXT("string"), false, TEXT("Requested output path; graph-authored output remains authoritative in the current scaffold."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("list_usd_stages"), TEXT("List opened or known USD stages."), TEXT("usd"));
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("open_usd_stage"), TEXT("Open a USD stage in the Unreal USD Stage Editor."), TEXT("usd"));
    Method.Params = {
        MakeParam(TEXT("file_path"), TEXT("string"), true, TEXT("Absolute path to the USD file."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("get_usd_stage_info"), TEXT("Read stage root layer, sublayers, time range, and evaluation state."), TEXT("usd"));
    Method.Params = {
        MakeParam(TEXT("stage_id"), TEXT("string"), true, TEXT("USD stage identifier."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("set_usd_stage_time"), TEXT("Set the evaluated frame or time code for a USD stage."), TEXT("usd"));
    Method.Params = {
        MakeParam(TEXT("stage_id"), TEXT("string"), true, TEXT("USD stage identifier.")),
        MakeParam(TEXT("time_code"), TEXT("number"), true, TEXT("Target time code."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("set_usd_purpose_visibility"), TEXT("Toggle render, proxy, or guide purpose visibility for a USD stage."), TEXT("usd"));
    Method.Params = {
        MakeParam(TEXT("stage_id"), TEXT("string"), true, TEXT("USD stage identifier.")),
        MakeParam(TEXT("purpose"), TEXT("string"), true, TEXT("render, proxy, or guide.")),
        MakeParam(TEXT("visible"), TEXT("bool"), true, TEXT("Desired visibility state."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("reload_usd_stage"), TEXT("Reload an opened USD stage from disk."), TEXT("usd"));
    Method.Params = {
        MakeParam(TEXT("stage_id"), TEXT("string"), true, TEXT("USD stage identifier."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("save_usd_stage"), TEXT("Save authored changes for the current USD stage edit target."), TEXT("usd"));
    Method.Params = {
        MakeParam(TEXT("stage_id"), TEXT("string"), true, TEXT("USD stage identifier."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("list_data_layers"), TEXT("List Data Layers in the active world."), TEXT("data_layers"));
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("get_data_layer_info"), TEXT("Read state, visibility, and membership information for a Data Layer."), TEXT("data_layers"));
    Method.Params = {
        MakeParam(TEXT("data_layer_name"), TEXT("string"), true, TEXT("Data Layer name."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("create_data_layer"), TEXT("Create a new Data Layer."), TEXT("data_layers"));
    Method.Params = {
        MakeParam(TEXT("data_layer_name"), TEXT("string"), true, TEXT("Data Layer name."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("set_data_layer_loaded"), TEXT("Set whether a Data Layer is loaded in the editor."), TEXT("data_layers"));
    Method.Params = {
        MakeParam(TEXT("data_layer_name"), TEXT("string"), true, TEXT("Data Layer name.")),
        MakeParam(TEXT("loaded"), TEXT("bool"), true, TEXT("Desired loaded state."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("set_data_layer_visible"), TEXT("Set whether a Data Layer is visible."), TEXT("data_layers"));
    Method.Params = {
        MakeParam(TEXT("data_layer_name"), TEXT("string"), true, TEXT("Data Layer name.")),
        MakeParam(TEXT("visible"), TEXT("bool"), true, TEXT("Desired visible state."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("assign_actor_to_data_layer"), TEXT("Assign an actor to a Data Layer."), TEXT("data_layers"));
    Method.Params = {
        MakeParam(TEXT("actor_name"), TEXT("string"), true, TEXT("Actor label or object name.")),
        MakeParam(TEXT("data_layer_name"), TEXT("string"), true, TEXT("Data Layer name."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("remove_actor_from_data_layer"), TEXT("Remove an actor from a Data Layer."), TEXT("data_layers"));
    Method.Params = {
        MakeParam(TEXT("actor_name"), TEXT("string"), true, TEXT("Actor label or object name.")),
        MakeParam(TEXT("data_layer_name"), TEXT("string"), true, TEXT("Data Layer name."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("get_project_color_settings"), TEXT("Read project and render settings relevant to ACEScg workflows."), TEXT("rendering"));
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("configure_acescg"), TEXT("Apply project-level settings for an ACEScg-oriented workflow."), TEXT("rendering"));
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("configure_viewport_rendering"), TEXT("Apply viewport rendering settings for lookdev and review."), TEXT("rendering"));
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("get_movie_render_queue_info"), TEXT("Read Movie Render Queue presets, jobs, and output settings."), TEXT("rendering"));
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("configure_movie_render_job"), TEXT("Configure a Movie Render Queue job for a sequence render."), TEXT("rendering"));
    Method.Params = {
        MakeParam(TEXT("sequence_path"), TEXT("string"), true, TEXT("Asset path of the Level Sequence.")),
        MakeParam(TEXT("map_path"), TEXT("string"), false, TEXT("Optional map path override.")),
        MakeParam(TEXT("preset_path"), TEXT("string"), false, TEXT("Optional preset asset path."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("set_render_output"), TEXT("Set output path and file naming for a render job."), TEXT("rendering"));
    Method.Params = {
        MakeParam(TEXT("output_path"), TEXT("string"), true, TEXT("Output directory.")),
        MakeParam(TEXT("file_name_format"), TEXT("string"), false, TEXT("Optional file naming pattern."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("list_materials"), TEXT("List material and material instance assets."), TEXT("shading"));
    Method.Params = {
        MakeParam(TEXT("root_path"), TEXT("string"), false, TEXT("Optional Unreal content root, default /Game.")),
        MakeParam(TEXT("limit"), TEXT("int"), false, TEXT("Optional result limit, default 100.")),
        MakeParam(TEXT("include_instances"), TEXT("bool"), false, TEXT("Whether to include material instances, default true."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("get_material_info"), TEXT("Read parent, parameters, usages, and shading metadata for a material or material instance."), TEXT("shading"));
    Method.Params = {
        MakeParam(TEXT("material_path"), TEXT("string"), true, TEXT("Asset path of the material or material instance."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("create_material_instance"), TEXT("Create a material instance from a parent material."), TEXT("shading"));
    Method.Params = {
        MakeParam(TEXT("parent_material_path"), TEXT("string"), true, TEXT("Asset path of the parent material.")),
        MakeParam(TEXT("package_path"), TEXT("string"), true, TEXT("Destination package path.")),
        MakeParam(TEXT("asset_name"), TEXT("string"), true, TEXT("Material instance asset name."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("set_material_parameter"), TEXT("Set scalar, vector, or texture parameters on a material instance."), TEXT("shading"));
    Method.Params = {
        MakeParam(TEXT("material_path"), TEXT("string"), true, TEXT("Asset path of the material instance.")),
        MakeParam(TEXT("parameter_name"), TEXT("string"), true, TEXT("Parameter name.")),
        MakeParam(TEXT("parameter_type"), TEXT("string"), true, TEXT("scalar, vector, or texture.")),
        MakeParam(TEXT("value"), TEXT("any"), true, TEXT("Parameter value."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("assign_material_to_actor"), TEXT("Assign a material to an actor component slot."), TEXT("shading"));
    Method.Params = {
        MakeParam(TEXT("actor_name"), TEXT("string"), true, TEXT("Actor label or object name.")),
        MakeParam(TEXT("material_path"), TEXT("string"), true, TEXT("Asset path of the material or material instance.")),
        MakeParam(TEXT("slot_name"), TEXT("string"), false, TEXT("Optional slot name."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("list_material_parameter_collections"), TEXT("List available Material Parameter Collections."), TEXT("shading"));
    Method.Params = {
        MakeParam(TEXT("root_path"), TEXT("string"), false, TEXT("Optional Unreal content root, default /Game.")),
        MakeParam(TEXT("limit"), TEXT("int"), false, TEXT("Optional result limit, default 100."))
    };
    RegisterPlannedMethod(Method);
}

void FOpenCodeUnrealBridgeModule::RegisterImplementedMethod(const FPagecranBridgeMethodSpec& Spec, TFunction<TSharedPtr<FJsonObject>(const TSharedPtr<FJsonObject>&, FString&)> Handler)
{
    MethodRegistry->Register(Spec, MoveTemp(Handler));
}

void FOpenCodeUnrealBridgeModule::RegisterPlannedMethod(const FPagecranBridgeMethodSpec& Spec)
{
    const FString MethodName = Spec.Name;
    MethodRegistry->Register(Spec, [this, MethodName](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        OutError = FString::Printf(TEXT("Method '%s' is not implemented yet in the Unreal bridge scaffold"), *MethodName);
        return HandleNotImplemented(MethodName);
    });
}

TSharedPtr<FJsonObject> FOpenCodeUnrealBridgeModule::HandlePing(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetBoolField(TEXT("ok"), true);
    Result->SetStringField(TEXT("plugin"), TEXT("opencode_unreal_bridge"));
    Result->SetStringField(TEXT("version"), TEXT("0.2.0"));
    Result->SetStringField(TEXT("engine_version"), FEngineVersion::Current().ToString());
    Result->SetStringField(TEXT("project_name"), FApp::GetProjectName());
    return Result;
}

TSharedPtr<FJsonObject> FOpenCodeUnrealBridgeModule::HandleGetCapabilities(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("plugin"), TEXT("opencode_unreal_bridge"));
    Result->SetStringField(TEXT("version"), TEXT("0.2.0"));
    Result->SetStringField(TEXT("transport"), TEXT("tcp-jsonl"));
    Result->SetStringField(TEXT("focus"), TEXT("linear-animation-rendering"));

    TArray<TSharedPtr<FJsonValue>> MethodsJson;
    for (const FPagecranBridgeMethodSpec& Spec : MethodRegistry->GetMethodSpecs())
    {
        TSharedPtr<FJsonObject> MethodObject = MakeShared<FJsonObject>();
        MethodObject->SetStringField(TEXT("name"), Spec.Name);
        MethodObject->SetStringField(TEXT("description"), Spec.Description);
        MethodObject->SetStringField(TEXT("domain"), Spec.Domain);
        MethodObject->SetBoolField(TEXT("implemented"), Spec.bImplemented);

        TArray<TSharedPtr<FJsonValue>> ParamsJson;
        for (const FPagecranBridgeParamSpec& Param : Spec.Params)
        {
            TSharedPtr<FJsonObject> ParamObject = MakeShared<FJsonObject>();
            ParamObject->SetStringField(TEXT("name"), Param.Name);
            ParamObject->SetStringField(TEXT("type"), Param.Type);
            ParamObject->SetBoolField(TEXT("required"), Param.bRequired);
            ParamObject->SetStringField(TEXT("description"), Param.Description);
            ParamsJson.Add(MakeShared<FJsonValueObject>(ParamObject));
        }

        MethodObject->SetArrayField(TEXT("params"), ParamsJson);
        MethodsJson.Add(MakeShared<FJsonValueObject>(MethodObject));
    }

    Result->SetArrayField(TEXT("methods"), MethodsJson);
    return Result;
}

TSharedPtr<FJsonObject> FOpenCodeUnrealBridgeModule::HandleExecutePython(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
#if WITH_EDITOR
    if (!Params.IsValid() || !Params->HasField(TEXT("code")))
    {
        OutError = TEXT("Missing required param 'code'");
        return nullptr;
    }

    IPythonScriptPlugin* PythonScriptPlugin = IPythonScriptPlugin::Get();
    if (PythonScriptPlugin == nullptr)
    {
        OutError = TEXT("PythonScriptPlugin is not loaded or not available");
        return nullptr;
    }

    PythonScriptPlugin->ForceEnablePythonAtRuntime();
    if (!PythonScriptPlugin->IsPythonAvailable())
    {
        OutError = TEXT("Python is not available in this Unreal Editor session");
        return nullptr;
    }

    FPythonCommandEx PythonCommand;
    PythonCommand.ExecutionMode = EPythonCommandExecutionMode::ExecuteFile;
    PythonCommand.FileExecutionScope = EPythonFileExecutionScope::Private;
    PythonCommand.Command = Params->GetStringField(TEXT("code"));

    const bool bSuccess = PythonScriptPlugin->ExecPythonCommandEx(PythonCommand);

    TArray<TSharedPtr<FJsonValue>> LogOutputJson;
    for (const FPythonLogOutputEntry& Entry : PythonCommand.LogOutput)
    {
        TSharedPtr<FJsonObject> EntryObject = MakeShared<FJsonObject>();
        EntryObject->SetStringField(TEXT("type"), LexToString(Entry.Type));
        EntryObject->SetStringField(TEXT("output"), Entry.Output);
        LogOutputJson.Add(MakeShared<FJsonValueObject>(EntryObject));
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetBoolField(TEXT("ok"), bSuccess);
    Result->SetStringField(TEXT("command_result"), PythonCommand.CommandResult);
    Result->SetStringField(TEXT("execution_mode"), LexToString(PythonCommand.ExecutionMode));
    Result->SetStringField(TEXT("file_execution_scope"), PythonCommand.FileExecutionScope == EPythonFileExecutionScope::Public ? TEXT("Public") : TEXT("Private"));
    Result->SetArrayField(TEXT("log_output"), LogOutputJson);
    return Result;
#else
    OutError = TEXT("execute_python is only available in editor builds");
    return nullptr;
#endif
}

TSharedPtr<FJsonObject> FOpenCodeUnrealBridgeModule::HandleGetProjectInfo(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("project_name"), FApp::GetProjectName());
    Result->SetStringField(TEXT("project_file"), FPaths::ConvertRelativePathToFull(FPaths::GetProjectFilePath()));
    Result->SetStringField(TEXT("engine_version"), FEngineVersion::Current().ToString());

    if (TSharedPtr<IPlugin> Plugin = IPluginManager::Get().FindPlugin(TEXT("opencode_unreal_bridge")))
    {
        Result->SetStringField(TEXT("plugin_base_dir"), Plugin->GetBaseDir());
    }

    return Result;
}

TSharedPtr<FJsonObject> FOpenCodeUnrealBridgeModule::HandleGetEditorState(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();

#if WITH_EDITOR
    UWorld* World = nullptr;
    if (GEditor != nullptr)
    {
        World = GEditor->GetEditorWorldContext().World();
    }

    Result->SetStringField(TEXT("world_name"), World != nullptr ? World->GetName() : FString());
    Result->SetStringField(TEXT("map_name"), World != nullptr ? World->GetMapName() : FString());

    TArray<TSharedPtr<FJsonValue>> SelectedActorsJson;
    if (GEditor != nullptr)
    {
        USelection* Selection = GEditor->GetSelectedActors();
        for (FSelectionIterator It(*Selection); It; ++It)
        {
            if (const AActor* Actor = Cast<AActor>(*It))
            {
                TSharedPtr<FJsonObject> ActorObject = MakeShared<FJsonObject>();
                ActorObject->SetStringField(TEXT("name"), Actor->GetName());
                ActorObject->SetStringField(TEXT("label"), Actor->GetActorLabel());
                SelectedActorsJson.Add(MakeShared<FJsonValueObject>(ActorObject));
            }
        }
    }

    Result->SetArrayField(TEXT("selected_actors"), SelectedActorsJson);
    Result->SetNumberField(TEXT("selected_actor_count"), SelectedActorsJson.Num());
#else
    TArray<TSharedPtr<FJsonValue>> EmptySelection;
    Result->SetStringField(TEXT("world_name"), FString());
    Result->SetStringField(TEXT("map_name"), FString());
    Result->SetArrayField(TEXT("selected_actors"), EmptySelection);
    Result->SetNumberField(TEXT("selected_actor_count"), 0);
#endif

    return Result;
}

TSharedPtr<FJsonObject> FOpenCodeUnrealBridgeModule::HandleNotImplemented(const FString& MethodName) const
{
    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetBoolField(TEXT("implemented"), false);
    Result->SetStringField(TEXT("method"), MethodName);
    Result->SetStringField(TEXT("status"), TEXT("planned"));
    return Result;
}
