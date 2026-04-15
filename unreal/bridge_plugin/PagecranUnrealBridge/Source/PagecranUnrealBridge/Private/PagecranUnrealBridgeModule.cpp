#include "PagecranUnrealBridgeModule.h"

#include "PagecranBridgeMethodRegistry.h"
#include "PagecranBridgeServer.h"

#include "AssetRegistry/AssetData.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "Components/MeshComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/Selection.h"
#include "Engine/Texture.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "Factories/MaterialInstanceConstantFactoryNew.h"
#include "GameFramework/Actor.h"
#include "Interfaces/IPluginManager.h"
#include "LevelSequence.h"
#include "Materials/Material.h"
#include "Materials/MaterialExpressionParameter.h"
#include "Materials/MaterialInstance.h"
#include "Materials/MaterialInstanceConstant.h"
#include "Materials/MaterialInterface.h"
#include "Materials/MaterialParameterCollection.h"
#include "Misc/App.h"
#include "Misc/EngineVersion.h"
#include "Misc/Paths.h"
#include "MovieScene.h"
#include "MoviePipelineQueue.h"
#include "MoviePipelineQueueEngineSubsystem.h"
#include "Graph/MovieGraphConfig.h"
#include "Channels/MovieSceneDoubleChannel.h"
#include "Sections/MovieScene3DTransformSection.h"
#include "Sections/MovieSceneCameraCutSection.h"
#include "Sections/MovieSceneSkeletalAnimationSection.h"
#include "Tracks/MovieScene3DTransformTrack.h"
#include "Tracks/MovieSceneCameraCutTrack.h"
#include "Tracks/MovieSceneSkeletalAnimationTrack.h"
#include "Animation/AnimSequence.h"
#include "UObject/Package.h"
#include "WorldPartition/DataLayer/DataLayerInstance.h"
#include "WorldPartition/DataLayer/DataLayerManager.h"
#include "WorldPartition/WorldPartition.h"

#if WITH_EDITOR
#include "Editor.h"
#endif

IMPLEMENT_MODULE(FPagecranUnrealBridgeModule, PagecranUnrealBridge)

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

    FString ResolveSequenceObjectPath(const FString& SequencePath)
    {
        if (SequencePath.Contains(TEXT(".")))
        {
            return SequencePath;
        }

        FString AssetName;
        if (!SequencePath.Split(TEXT("/"), nullptr, &AssetName, ESearchCase::IgnoreCase, ESearchDir::FromEnd))
        {
            AssetName = SequencePath;
        }

        return FString::Printf(TEXT("%s.%s"), *SequencePath, *AssetName);
    }

    FString ResolveAssetObjectPath(const FString& AssetPath)
    {
        if (AssetPath.Contains(TEXT(".")))
        {
            return AssetPath;
        }

        FString AssetName;
        if (!AssetPath.Split(TEXT("/"), nullptr, &AssetName, ESearchCase::IgnoreCase, ESearchDir::FromEnd))
        {
            AssetName = AssetPath;
        }

        return FString::Printf(TEXT("%s.%s"), *AssetPath, *AssetName);
    }

    bool TryResolveActor(UWorld* World, const FString& ActorName, AActor*& OutActor)
    {
        OutActor = nullptr;
        if (World == nullptr || ActorName.IsEmpty())
        {
            return false;
        }

        for (TActorIterator<AActor> It(World); It; ++It)
        {
            AActor* Actor = *It;
            if (Actor == nullptr)
            {
                continue;
            }

            if (Actor->GetActorLabel().Equals(ActorName, ESearchCase::IgnoreCase) ||
                Actor->GetName().Equals(ActorName, ESearchCase::IgnoreCase) ||
                Actor->GetPathName().Equals(ActorName, ESearchCase::IgnoreCase))
            {
                OutActor = Actor;
                return true;
            }
        }

        return false;
    }

    int32 ResolveMaterialSlotIndex(UMeshComponent* MeshComponent, const FString& SlotName)
    {
        if (MeshComponent == nullptr)
        {
            return INDEX_NONE;
        }

        if (SlotName.IsEmpty())
        {
            return 0;
        }

        if (SlotName.IsNumeric())
        {
            return FCString::Atoi(*SlotName);
        }

        const TArray<FName> SlotNames = MeshComponent->GetMaterialSlotNames();
        for (int32 Index = 0; Index < SlotNames.Num(); ++Index)
        {
            if (SlotNames[Index].ToString().Equals(SlotName, ESearchCase::IgnoreCase))
            {
                return Index;
            }
        }

        return INDEX_NONE;
    }

    bool TryParseBindingGuid(const FString& Input, FGuid& OutGuid)
    {
        FString Candidate = Input.TrimStartAndEnd();
        if (Candidate.StartsWith(TEXT("binding:"), ESearchCase::IgnoreCase))
        {
            Candidate.RightChopInline(8, EAllowShrinking::No);
        }
        return FGuid::Parse(Candidate, OutGuid);
    }

    FFrameNumber DisplayFrameToTickFrame(const UMovieScene* MovieScene, const int32 DisplayFrame)
    {
        return FFrameRate::TransformTime(
            FFrameTime(FFrameNumber(DisplayFrame)),
            MovieScene->GetDisplayRate(),
            MovieScene->GetTickResolution()).FloorToFrame();
    }

    bool ResolveTransformChannelIndex(const FString& ChannelSpecifier, int32& OutIndex)
    {
        const FString Normalized = ChannelSpecifier.ToLower().Replace(TEXT("_"), TEXT(".")).Replace(TEXT("/"), TEXT("."));

        if (Normalized == TEXT("location.x")) { OutIndex = 0; return true; }
        if (Normalized == TEXT("location.y")) { OutIndex = 1; return true; }
        if (Normalized == TEXT("location.z")) { OutIndex = 2; return true; }
        if (Normalized == TEXT("rotation.roll")) { OutIndex = 3; return true; }
        if (Normalized == TEXT("rotation.pitch")) { OutIndex = 4; return true; }
        if (Normalized == TEXT("rotation.yaw")) { OutIndex = 5; return true; }
        if (Normalized == TEXT("scale.x")) { OutIndex = 6; return true; }
        if (Normalized == TEXT("scale.y")) { OutIndex = 7; return true; }
        if (Normalized == TEXT("scale.z")) { OutIndex = 8; return true; }

        return false;
    }

    UDataLayerInstance* FindDataLayerInstanceByName(UDataLayerManager* DataLayerManager, const FString& RequestedName)
    {
        if (DataLayerManager == nullptr || RequestedName.IsEmpty())
        {
            return nullptr;
        }

        for (UDataLayerInstance* LayerInstance : DataLayerManager->GetDataLayerInstances())
        {
            if (LayerInstance == nullptr)
            {
                continue;
            }

            if (LayerInstance->GetDataLayerShortName().Equals(RequestedName, ESearchCase::IgnoreCase) ||
                LayerInstance->GetDataLayerFullName().Equals(RequestedName, ESearchCase::IgnoreCase) ||
                LayerInstance->GetDataLayerFName().ToString().Equals(RequestedName, ESearchCase::IgnoreCase))
            {
                return LayerInstance;
            }
        }

        return nullptr;
    }

    TSharedPtr<FJsonObject> MakeDataLayerInfoObject(const UDataLayerInstance* LayerInstance, const UDataLayerManager* DataLayerManager)
    {
        TSharedPtr<FJsonObject> LayerObject = MakeShared<FJsonObject>();
        LayerObject->SetStringField(TEXT("short_name"), LayerInstance->GetDataLayerShortName());
        LayerObject->SetStringField(TEXT("full_name"), LayerInstance->GetDataLayerFullName());
        LayerObject->SetStringField(TEXT("class"), LayerInstance->GetClass()->GetName());
        LayerObject->SetBoolField(TEXT("is_visible"), LayerInstance->IsVisible());
        LayerObject->SetBoolField(TEXT("is_loaded_in_editor"), LayerInstance->IsLoadedInEditor());
        LayerObject->SetStringField(TEXT("runtime_state"), GetDataLayerRuntimeStateName(LayerInstance->GetRuntimeState()));
        LayerObject->SetStringField(
            TEXT("effective_runtime_state"),
            DataLayerManager ? GetDataLayerRuntimeStateName(DataLayerManager->GetDataLayerInstanceEffectiveRuntimeState(LayerInstance)) : GetDataLayerRuntimeStateName(LayerInstance->GetEffectiveRuntimeState()));
        return LayerObject;
    }

    UMoviePipelineExecutorJob* BuildMovieRenderGraphJob(
        UMoviePipelineQueueEngineSubsystem* QueueSubsystem,
        UMovieGraphConfig* GraphConfig,
        ULevelSequence* Sequence,
        const FString& MapPath,
        const FString& JobName,
        FString& OutError)
    {
        if (QueueSubsystem == nullptr)
        {
            OutError = TEXT("Movie render queue subsystem is not available");
            return nullptr;
        }
        if (QueueSubsystem->IsRendering())
        {
            OutError = TEXT("Movie render queue is already rendering");
            return nullptr;
        }

        UMoviePipelineQueue* Queue = QueueSubsystem->GetQueue();
        if (Queue == nullptr)
        {
            OutError = TEXT("Movie render queue is not available");
            return nullptr;
        }

        Queue->DeleteAllJobs();
        UMoviePipelineExecutorJob* Job = Queue->AllocateNewJob(UMoviePipelineExecutorJob::StaticClass());
        if (Job == nullptr)
        {
            OutError = TEXT("Failed to allocate movie render job");
            return nullptr;
        }

        Job->SetSequence(FSoftObjectPath(Sequence));
        Job->SetGraphPreset(GraphConfig, true);
        Job->JobName = JobName.IsEmpty() ? Sequence->GetName() : JobName;
        if (!MapPath.IsEmpty())
        {
            Job->Map = FSoftObjectPath(MapPath);
        }

        return Job;
    }

    FString ResolveBindingName(UMovieScene* MovieScene, const FMovieSceneBinding& Binding)
    {
        if (MovieScene != nullptr)
        {
            if (FMovieScenePossessable* Possessable = MovieScene->FindPossessable(Binding.GetObjectGuid()))
            {
                return Possessable->GetName();
            }

            if (FMovieSceneSpawnable* Spawnable = MovieScene->FindSpawnable(Binding.GetObjectGuid()))
            {
                return Spawnable->GetName();
            }
        }

        return Binding.GetObjectGuid().ToString();
    }

    TSharedPtr<FJsonObject> MakeSequenceBindingObject(UMovieScene* MovieScene, const FMovieSceneBinding& Binding)
    {
        TSharedPtr<FJsonObject> Object = MakeShared<FJsonObject>();
        Object->SetStringField(TEXT("name"), ResolveBindingName(MovieScene, Binding));
        Object->SetStringField(TEXT("binding_id"), Binding.GetObjectGuid().ToString());
        Object->SetNumberField(TEXT("track_count"), Binding.GetTracks().Num());
        return Object;
    }

    bool IsAllowedContentPath(const FString& Path)
    {
        return Path.StartsWith(TEXT("/Game/")) || Path.Equals(TEXT("/Game")) ||
            Path.StartsWith(TEXT("/Engine/")) || Path.Equals(TEXT("/Engine"));
    }

    bool HasUnsafePathSegments(const FString& Path)
    {
        return Path.Contains(TEXT("..")) || Path.Contains(TEXT("\\")) || Path.Contains(TEXT(":"));
    }

    bool NormalizeContentPath(const FString& InputPath, FString& OutPath)
    {
        FString Candidate = InputPath.TrimStartAndEnd();
        if (Candidate.IsEmpty())
        {
            return false;
        }

        if (!Candidate.StartsWith(TEXT("/")))
        {
            Candidate = TEXT("/Game/") + Candidate;
        }

        Candidate.ReplaceInline(TEXT("//"), TEXT("/"));
        if (HasUnsafePathSegments(Candidate) || !IsAllowedContentPath(Candidate))
        {
            return false;
        }

        OutPath = Candidate;
        return true;
    }

    FString DescribeBlendMode(const EBlendMode BlendMode)
    {
        switch (BlendMode)
        {
        case BLEND_Opaque:
            return TEXT("Opaque");
        case BLEND_Masked:
            return TEXT("Masked");
        case BLEND_Translucent:
            return TEXT("Translucent");
        case BLEND_Additive:
            return TEXT("Additive");
        case BLEND_Modulate:
            return TEXT("Modulate");
        case BLEND_AlphaComposite:
            return TEXT("AlphaComposite");
        case BLEND_AlphaHoldout:
            return TEXT("AlphaHoldout");
        default:
            return TEXT("Unknown");
        }
    }

    FString DescribeMaterialDomain(const EMaterialDomain Domain)
    {
        switch (Domain)
        {
        case MD_Surface:
            return TEXT("Surface");
        case MD_DeferredDecal:
            return TEXT("DeferredDecal");
        case MD_LightFunction:
            return TEXT("LightFunction");
        case MD_Volume:
            return TEXT("Volume");
        case MD_PostProcess:
            return TEXT("PostProcess");
        case MD_UI:
            return TEXT("UI");
        default:
            return TEXT("Unknown");
        }
    }

    FString DescribeMaterialAssociation(const EMaterialParameterAssociation Association)
    {
        switch (Association)
        {
        case EMaterialParameterAssociation::LayerParameter:
            return TEXT("LayerParameter");
        case EMaterialParameterAssociation::BlendParameter:
            return TEXT("BlendParameter");
        case EMaterialParameterAssociation::GlobalParameter:
        default:
            return TEXT("GlobalParameter");
        }
    }

    void AddParameterInfos(
        const UMaterialInterface* Material,
        const FString& ParameterType,
        void (UMaterialInterface::*Getter)(TArray<FMaterialParameterInfo>&, TArray<FGuid>&) const,
        TArray<TSharedPtr<FJsonValue>>& Parameters)
    {
        if (Material == nullptr)
        {
            return;
        }

        TArray<FMaterialParameterInfo> Infos;
        TArray<FGuid> Ids;
        (Material->*Getter)(Infos, Ids);

        for (int32 Index = 0; Index < Infos.Num(); ++Index)
        {
            TSharedPtr<FJsonObject> ParameterObject = MakeShared<FJsonObject>();
            ParameterObject->SetStringField(TEXT("name"), Infos[Index].Name.ToString());
            ParameterObject->SetStringField(TEXT("type"), ParameterType);
            ParameterObject->SetStringField(TEXT("association"), DescribeMaterialAssociation(Infos[Index].Association));
            if (Ids.IsValidIndex(Index))
            {
                ParameterObject->SetStringField(TEXT("id"), Ids[Index].ToString());
            }
            Parameters.Add(MakeShared<FJsonValueObject>(ParameterObject));
        }
    }

}

void FPagecranUnrealBridgeModule::StartupModule()
{
    MethodRegistry = MakeUnique<FPagecranBridgeMethodRegistry>();
    RegisterMethods();

    Server = MakeUnique<FPagecranBridgeServer>(MethodRegistry.Get());
    if (!Server->Start(TEXT("127.0.0.1"), 9877))
    {
        UE_LOG(LogTemp, Error, TEXT("PagecranUnrealBridge failed to start the TCP bridge"));
    }
}

void FPagecranUnrealBridgeModule::ShutdownModule()
{
    if (Server.IsValid())
    {
        Server->Stop();
        Server.Reset();
    }

    MethodRegistry.Reset();
}

void FPagecranUnrealBridgeModule::RegisterMethods()
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

    FPagecranBridgeMethodSpec Method = MakeMethod(TEXT("get_viewport_screenshot"), TEXT("Capture the active editor viewport for verification."), TEXT("editor"));
    Method.Params = {
        MakeParam(TEXT("max_size"), TEXT("int"), false, TEXT("Optional max output dimension in pixels."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("list_level_sequences"), TEXT("List Level Sequence assets available to the project."), TEXT("sequencer"), true);
    Method.Params = {
        MakeParam(TEXT("root_path"), TEXT("string"), false, TEXT("Optional Unreal content root, default /Game.")),
        MakeParam(TEXT("limit"), TEXT("int"), false, TEXT("Optional result limit, default 100."))
    };
    RegisterImplementedMethod(Method, [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        return HandleListLevelSequences(Params, OutError);
    });

    Method = MakeMethod(TEXT("get_sequence_info"), TEXT("Read playback range, frame rate, bindings, and track data for a Level Sequence."), TEXT("sequencer"), true);
    Method.Params = {
        MakeParam(TEXT("sequence_path"), TEXT("string"), true, TEXT("Asset path of the Level Sequence."))
    };
    RegisterImplementedMethod(Method, [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        return HandleGetSequenceInfo(Params, OutError);
    });

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

    Method = MakeMethod(TEXT("add_track"), TEXT("Add a Sequencer track to a sequence or binding."), TEXT("sequencer"), true);
    Method.Params = {
        MakeParam(TEXT("sequence_path"), TEXT("string"), true, TEXT("Asset path of the Level Sequence.")),
        MakeParam(TEXT("track_type"), TEXT("string"), true, TEXT("Track type identifier.")),
        MakeParam(TEXT("binding_id"), TEXT("string"), false, TEXT("Optional binding identifier."))
    };
    RegisterImplementedMethod(Method, [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        return HandleAddTrack(Params, OutError);
    });

    Method = MakeMethod(TEXT("set_section_range"), TEXT("Set the frame range of a Sequencer section."), TEXT("sequencer"));
    Method.Params = {
        MakeParam(TEXT("sequence_path"), TEXT("string"), true, TEXT("Asset path of the Level Sequence.")),
        MakeParam(TEXT("section_id"), TEXT("string"), true, TEXT("Section identifier.")),
        MakeParam(TEXT("start_frame"), TEXT("int"), true, TEXT("Start frame.")),
        MakeParam(TEXT("end_frame"), TEXT("int"), true, TEXT("End frame."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("set_keyframe"), TEXT("Set a keyframe on a Sequencer channel."), TEXT("sequencer"), true);
    Method.Params = {
        MakeParam(TEXT("sequence_path"), TEXT("string"), true, TEXT("Asset path of the Level Sequence.")),
        MakeParam(TEXT("channel_path"), TEXT("string"), true, TEXT("Channel identifier or path.")),
        MakeParam(TEXT("frame"), TEXT("int"), true, TEXT("Frame number.")),
        MakeParam(TEXT("value"), TEXT("any"), true, TEXT("Keyframe value."))
    };
    RegisterImplementedMethod(Method, [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        return HandleSetKeyframe(Params, OutError);
    });

    Method = MakeMethod(TEXT("add_camera_cut"), TEXT("Create or update a camera cut section."), TEXT("sequencer"), true);
    Method.Params = {
        MakeParam(TEXT("sequence_path"), TEXT("string"), true, TEXT("Asset path of the Level Sequence.")),
        MakeParam(TEXT("camera_binding_id"), TEXT("string"), true, TEXT("Binding id of the camera.")),
        MakeParam(TEXT("start_frame"), TEXT("int"), true, TEXT("Start frame.")),
        MakeParam(TEXT("end_frame"), TEXT("int"), true, TEXT("End frame."))
    };
    RegisterImplementedMethod(Method, [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        return HandleAddCameraCut(Params, OutError);
    });

    Method = MakeMethod(TEXT("render_sequence"), TEXT("Render a sequence via Movie Render Queue or an equivalent bridge workflow."), TEXT("rendering"));
    Method.Params = {
        MakeParam(TEXT("sequence_path"), TEXT("string"), true, TEXT("Asset path of the Level Sequence.")),
        MakeParam(TEXT("preset_path"), TEXT("string"), false, TEXT("Optional Movie Render Queue preset asset.")),
        MakeParam(TEXT("output_path"), TEXT("string"), false, TEXT("Output directory override."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("list_movie_render_graphs"), TEXT("List Movie Render Graph assets available to the project."), TEXT("movie_render_graph"), true);
    Method.Params = {
        MakeParam(TEXT("root_path"), TEXT("string"), false, TEXT("Optional Unreal content root, default /Game.")),
        MakeParam(TEXT("limit"), TEXT("int"), false, TEXT("Optional result limit, default 100."))
    };
    RegisterImplementedMethod(Method, [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        return HandleListMovieRenderGraphs(Params, OutError);
    });

    Method = MakeMethod(TEXT("get_movie_render_graph_info"), TEXT("Read metadata and asset information for a Movie Render Graph asset."), TEXT("movie_render_graph"), true);
    Method.Params = {
        MakeParam(TEXT("graph_path"), TEXT("string"), true, TEXT("Asset path of the Movie Render Graph asset."))
    };
    RegisterImplementedMethod(Method, [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        return HandleGetMovieRenderGraphInfo(Params, OutError);
    });

    Method = MakeMethod(TEXT("create_movie_render_graph_config"), TEXT("Create a new Movie Render Graph configuration asset."), TEXT("movie_render_graph"));
    Method.Params = {
        MakeParam(TEXT("package_path"), TEXT("string"), true, TEXT("Destination package path.")),
        MakeParam(TEXT("asset_name"), TEXT("string"), true, TEXT("Graph asset name."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("configure_movie_render_graph_job"), TEXT("Configure a graph-driven render job with sequence and map selection."), TEXT("movie_render_graph"), true);
    Method.Params = {
        MakeParam(TEXT("graph_path"), TEXT("string"), true, TEXT("Asset path of the Movie Render Graph asset.")),
        MakeParam(TEXT("sequence_path"), TEXT("string"), true, TEXT("Asset path of the Level Sequence.")),
        MakeParam(TEXT("map_path"), TEXT("string"), false, TEXT("Optional map path override.")),
        MakeParam(TEXT("job_name"), TEXT("string"), false, TEXT("Optional job name override."))
    };
    RegisterImplementedMethod(Method, [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        return HandleConfigureMovieRenderGraphJob(Params, OutError);
    });

    Method = MakeMethod(TEXT("render_sequence_with_graph"), TEXT("Render a sequence through Movie Render Graph."), TEXT("movie_render_graph"), true);
    Method.Params = {
        MakeParam(TEXT("graph_path"), TEXT("string"), true, TEXT("Asset path of the Movie Render Graph asset.")),
        MakeParam(TEXT("sequence_path"), TEXT("string"), true, TEXT("Asset path of the Level Sequence.")),
        MakeParam(TEXT("map_path"), TEXT("string"), false, TEXT("Optional map path override.")),
        MakeParam(TEXT("job_name"), TEXT("string"), false, TEXT("Optional job name override.")),
        MakeParam(TEXT("output_path"), TEXT("string"), false, TEXT("Requested output path; graph-authored output remains authoritative in the current scaffold."))
    };
    RegisterImplementedMethod(Method, [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        return HandleRenderSequenceWithGraph(Params, OutError);
    });

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

    Method = MakeMethod(TEXT("list_data_layers"), TEXT("List Data Layers in the active world."), TEXT("data_layers"), true);
    RegisterImplementedMethod(Method, [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        return HandleListDataLayers(Params, OutError);
    });

    Method = MakeMethod(TEXT("get_data_layer_info"), TEXT("Read state, visibility, and membership information for a Data Layer."), TEXT("data_layers"), true);
    Method.Params = {
        MakeParam(TEXT("data_layer_name"), TEXT("string"), true, TEXT("Data Layer name."))
    };
    RegisterImplementedMethod(Method, [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        return HandleGetDataLayerInfo(Params, OutError);
    });

    Method = MakeMethod(TEXT("create_data_layer"), TEXT("Create a new Data Layer."), TEXT("data_layers"));
    Method.Params = {
        MakeParam(TEXT("data_layer_name"), TEXT("string"), true, TEXT("Data Layer name."))
    };
    RegisterPlannedMethod(Method);

    Method = MakeMethod(TEXT("set_data_layer_loaded"), TEXT("Set whether a Data Layer is loaded in the editor."), TEXT("data_layers"), true);
    Method.Params = {
        MakeParam(TEXT("data_layer_name"), TEXT("string"), true, TEXT("Data Layer name.")),
        MakeParam(TEXT("loaded"), TEXT("bool"), true, TEXT("Desired loaded state."))
    };
    RegisterImplementedMethod(Method, [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        return HandleSetDataLayerLoaded(Params, OutError);
    });

    Method = MakeMethod(TEXT("set_data_layer_visible"), TEXT("Set whether a Data Layer is visible."), TEXT("data_layers"), true);
    Method.Params = {
        MakeParam(TEXT("data_layer_name"), TEXT("string"), true, TEXT("Data Layer name.")),
        MakeParam(TEXT("visible"), TEXT("bool"), true, TEXT("Desired visible state."))
    };
    RegisterImplementedMethod(Method, [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        return HandleSetDataLayerVisible(Params, OutError);
    });

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

    Method = MakeMethod(TEXT("list_materials"), TEXT("List material and material instance assets."), TEXT("shading"), true);
    Method.Params = {
        MakeParam(TEXT("root_path"), TEXT("string"), false, TEXT("Optional Unreal content root, default /Game.")),
        MakeParam(TEXT("limit"), TEXT("int"), false, TEXT("Optional result limit, default 100.")),
        MakeParam(TEXT("include_instances"), TEXT("bool"), false, TEXT("Whether to include material instances, default true."))
    };
    RegisterImplementedMethod(Method, [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        return HandleListMaterials(Params, OutError);
    });

    Method = MakeMethod(TEXT("get_material_info"), TEXT("Read parent, parameters, usages, and shading metadata for a material or material instance."), TEXT("shading"), true);
    Method.Params = {
        MakeParam(TEXT("material_path"), TEXT("string"), true, TEXT("Asset path of the material or material instance."))
    };
    RegisterImplementedMethod(Method, [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        return HandleGetMaterialInfo(Params, OutError);
    });

    Method = MakeMethod(TEXT("create_material_instance"), TEXT("Create a material instance from a parent material."), TEXT("shading"), true);
    Method.Params = {
        MakeParam(TEXT("parent_material_path"), TEXT("string"), true, TEXT("Asset path of the parent material.")),
        MakeParam(TEXT("package_path"), TEXT("string"), true, TEXT("Destination package path.")),
        MakeParam(TEXT("asset_name"), TEXT("string"), true, TEXT("Material instance asset name."))
    };
    RegisterImplementedMethod(Method, [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        return HandleCreateMaterialInstance(Params, OutError);
    });

    Method = MakeMethod(TEXT("set_material_parameter"), TEXT("Set scalar, vector, or texture parameters on a material instance."), TEXT("shading"), true);
    Method.Params = {
        MakeParam(TEXT("material_path"), TEXT("string"), true, TEXT("Asset path of the material instance.")),
        MakeParam(TEXT("parameter_name"), TEXT("string"), true, TEXT("Parameter name.")),
        MakeParam(TEXT("parameter_type"), TEXT("string"), true, TEXT("scalar, vector, or texture.")),
        MakeParam(TEXT("value"), TEXT("any"), true, TEXT("Parameter value."))
    };
    RegisterImplementedMethod(Method, [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        return HandleSetMaterialParameter(Params, OutError);
    });

    Method = MakeMethod(TEXT("assign_material_to_actor"), TEXT("Assign a material to an actor component slot."), TEXT("shading"), true);
    Method.Params = {
        MakeParam(TEXT("actor_name"), TEXT("string"), true, TEXT("Actor label or object name.")),
        MakeParam(TEXT("material_path"), TEXT("string"), true, TEXT("Asset path of the material or material instance.")),
        MakeParam(TEXT("slot_name"), TEXT("string"), false, TEXT("Optional slot name."))
    };
    RegisterImplementedMethod(Method, [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        return HandleAssignMaterialToActor(Params, OutError);
    });

    Method = MakeMethod(TEXT("list_material_parameter_collections"), TEXT("List available Material Parameter Collections."), TEXT("shading"), true);
    Method.Params = {
        MakeParam(TEXT("root_path"), TEXT("string"), false, TEXT("Optional Unreal content root, default /Game.")),
        MakeParam(TEXT("limit"), TEXT("int"), false, TEXT("Optional result limit, default 100."))
    };
    RegisterImplementedMethod(Method, [this](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        return HandleListMaterialParameterCollections(Params, OutError);
    });
}

void FPagecranUnrealBridgeModule::RegisterImplementedMethod(const FPagecranBridgeMethodSpec& Spec, TFunction<TSharedPtr<FJsonObject>(const TSharedPtr<FJsonObject>&, FString&)> Handler)
{
    MethodRegistry->Register(Spec, MoveTemp(Handler));
}

void FPagecranUnrealBridgeModule::RegisterPlannedMethod(const FPagecranBridgeMethodSpec& Spec)
{
    const FString MethodName = Spec.Name;
    MethodRegistry->Register(Spec, [this, MethodName](const TSharedPtr<FJsonObject>& Params, FString& OutError)
    {
        OutError = FString::Printf(TEXT("Method '%s' is not implemented yet in the Unreal bridge scaffold"), *MethodName);
        return HandleNotImplemented(MethodName);
    });
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandlePing(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetBoolField(TEXT("ok"), true);
    Result->SetStringField(TEXT("plugin"), TEXT("PagecranUnrealBridge"));
    Result->SetStringField(TEXT("version"), TEXT("0.1.0"));
    Result->SetStringField(TEXT("engine_version"), FEngineVersion::Current().ToString());
    Result->SetStringField(TEXT("project_name"), FApp::GetProjectName());
    return Result;
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleGetCapabilities(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("plugin"), TEXT("PagecranUnrealBridge"));
    Result->SetStringField(TEXT("version"), TEXT("0.1.0"));
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

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleGetProjectInfo(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("project_name"), FApp::GetProjectName());
    Result->SetStringField(TEXT("project_file"), FPaths::ConvertRelativePathToFull(FPaths::GetProjectFilePath()));
    Result->SetStringField(TEXT("engine_version"), FEngineVersion::Current().ToString());

    if (TSharedPtr<IPlugin> Plugin = IPluginManager::Get().FindPlugin(TEXT("PagecranUnrealBridge")))
    {
        Result->SetStringField(TEXT("plugin_base_dir"), Plugin->GetBaseDir());
    }

    return Result;
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleGetEditorState(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
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

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleListLevelSequences(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
    const FString RootPath = Params.IsValid() && Params->HasField(TEXT("root_path"))
        ? Params->GetStringField(TEXT("root_path"))
        : TEXT("/Game");
    const int32 Limit = Params.IsValid() && Params->HasField(TEXT("limit"))
        ? FMath::Clamp(static_cast<int32>(Params->GetNumberField(TEXT("limit"))), 1, 500)
        : 100;

    FAssetRegistryModule& AssetRegistryModule = FModuleManager::LoadModuleChecked<FAssetRegistryModule>(TEXT("AssetRegistry"));

    FARFilter Filter;
    Filter.bRecursivePaths = true;
    Filter.PackagePaths.Add(*RootPath);
    Filter.ClassPaths.Add(ULevelSequence::StaticClass()->GetClassPathName());

    TArray<FAssetData> Assets;
    AssetRegistryModule.Get().GetAssets(Filter, Assets);
    Assets.Sort([](const FAssetData& A, const FAssetData& B)
    {
        return A.AssetName.LexicalLess(B.AssetName);
    });

    TArray<TSharedPtr<FJsonValue>> SequenceArray;
    const int32 Count = FMath::Min(Assets.Num(), Limit);
    for (int32 Index = 0; Index < Count; ++Index)
    {
        const FAssetData& Asset = Assets[Index];
        TSharedPtr<FJsonObject> SequenceObject = MakeShared<FJsonObject>();
        SequenceObject->SetStringField(TEXT("asset_name"), Asset.AssetName.ToString());
        SequenceObject->SetStringField(TEXT("package_name"), Asset.PackageName.ToString());
        SequenceObject->SetStringField(TEXT("object_path"), Asset.GetObjectPathString());
        SequenceArray.Add(MakeShared<FJsonValueObject>(SequenceObject));
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("root_path"), RootPath);
    Result->SetNumberField(TEXT("count"), SequenceArray.Num());
    Result->SetArrayField(TEXT("sequences"), SequenceArray);
    return Result;
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleGetSequenceInfo(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
    if (!Params.IsValid() || !Params->HasField(TEXT("sequence_path")))
    {
        OutError = TEXT("Missing required param 'sequence_path'");
        return nullptr;
    }

    const FString SequenceObjectPath = ResolveSequenceObjectPath(Params->GetStringField(TEXT("sequence_path")));
    ULevelSequence* Sequence = LoadObject<ULevelSequence>(nullptr, *SequenceObjectPath);
    if (Sequence == nullptr)
    {
        OutError = FString::Printf(TEXT("Could not load Level Sequence '%s'"), *SequenceObjectPath);
        return nullptr;
    }

    UMovieScene* MovieScene = Sequence->GetMovieScene();
    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("name"), Sequence->GetName());
    Result->SetStringField(TEXT("path"), SequenceObjectPath);

    if (MovieScene == nullptr)
    {
        Result->SetBoolField(TEXT("has_movie_scene"), false);
        return Result;
    }

    Result->SetBoolField(TEXT("has_movie_scene"), true);
    const UMovieScene* ConstMovieScene = MovieScene;
    Result->SetNumberField(TEXT("master_track_count"), ConstMovieScene->GetTracks().Num());
    Result->SetNumberField(TEXT("binding_count"), ConstMovieScene->GetBindings().Num());

    TSharedPtr<FJsonObject> DisplayRateObject = MakeShared<FJsonObject>();
    DisplayRateObject->SetNumberField(TEXT("numerator"), MovieScene->GetDisplayRate().Numerator);
    DisplayRateObject->SetNumberField(TEXT("denominator"), MovieScene->GetDisplayRate().Denominator);
    Result->SetObjectField(TEXT("display_rate"), DisplayRateObject);

    TSharedPtr<FJsonObject> TickResolutionObject = MakeShared<FJsonObject>();
    TickResolutionObject->SetNumberField(TEXT("numerator"), MovieScene->GetTickResolution().Numerator);
    TickResolutionObject->SetNumberField(TEXT("denominator"), MovieScene->GetTickResolution().Denominator);
    Result->SetObjectField(TEXT("tick_resolution"), TickResolutionObject);

    const TRange<FFrameNumber> PlaybackRange = MovieScene->GetPlaybackRange();
    const FFrameNumber PlaybackStartDisplay = FFrameRate::TransformTime(
        FFrameTime(PlaybackRange.GetLowerBoundValue()),
        MovieScene->GetTickResolution(),
        MovieScene->GetDisplayRate()).FloorToFrame();
    const FFrameNumber PlaybackEndDisplay = FFrameRate::TransformTime(
        FFrameTime(PlaybackRange.GetUpperBoundValue()),
        MovieScene->GetTickResolution(),
        MovieScene->GetDisplayRate()).FloorToFrame();
    Result->SetNumberField(TEXT("playback_start"), PlaybackStartDisplay.Value);
    Result->SetNumberField(TEXT("playback_end"), PlaybackEndDisplay.Value);
    Result->SetNumberField(TEXT("playback_start_ticks"), PlaybackRange.GetLowerBoundValue().Value);
    Result->SetNumberField(TEXT("playback_end_ticks"), PlaybackRange.GetUpperBoundValue().Value);

    TArray<TSharedPtr<FJsonValue>> BindingArray;
    for (const FMovieSceneBinding& Binding : ConstMovieScene->GetBindings())
    {
        BindingArray.Add(MakeShared<FJsonValueObject>(MakeSequenceBindingObject(MovieScene, Binding)));
    }
    Result->SetArrayField(TEXT("bindings"), BindingArray);

    TArray<TSharedPtr<FJsonValue>> MasterTracks;
    for (UMovieSceneTrack* Track : ConstMovieScene->GetTracks())
    {
        TSharedPtr<FJsonObject> TrackObject = MakeShared<FJsonObject>();
        TrackObject->SetStringField(TEXT("class"), Track != nullptr ? Track->GetClass()->GetName() : FString());
        TrackObject->SetNumberField(TEXT("section_count"), Track != nullptr ? Track->GetAllSections().Num() : 0);
        MasterTracks.Add(MakeShared<FJsonValueObject>(TrackObject));
    }
    Result->SetArrayField(TEXT("master_tracks"), MasterTracks);

    return Result;
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleAddTrack(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
    if (!Params.IsValid() || !Params->HasField(TEXT("sequence_path")) || !Params->HasField(TEXT("track_type")))
    {
        OutError = TEXT("Missing required params 'sequence_path' and/or 'track_type'");
        return nullptr;
    }

    const FString SequenceObjectPath = ResolveSequenceObjectPath(Params->GetStringField(TEXT("sequence_path")));
    const FString TrackType = Params->GetStringField(TEXT("track_type")).ToLower();

    ULevelSequence* Sequence = LoadObject<ULevelSequence>(nullptr, *SequenceObjectPath);
    if (Sequence == nullptr)
    {
        OutError = FString::Printf(TEXT("Could not load Level Sequence '%s'"), *SequenceObjectPath);
        return nullptr;
    }

    UMovieScene* MovieScene = Sequence->GetMovieScene();
    if (MovieScene == nullptr)
    {
        OutError = TEXT("Sequence has no MovieScene");
        return nullptr;
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("sequence_path"), SequenceObjectPath);
    Result->SetStringField(TEXT("track_type"), TrackType);

    if (TrackType == TEXT("camera_cut"))
    {
        UMovieSceneTrack* ExistingCutTrack = MovieScene->GetCameraCutTrack();
        UMovieSceneCameraCutTrack* CameraCutTrack = ExistingCutTrack
            ? Cast<UMovieSceneCameraCutTrack>(ExistingCutTrack)
            : Cast<UMovieSceneCameraCutTrack>(MovieScene->AddCameraCutTrack(UMovieSceneCameraCutTrack::StaticClass()));

        if (CameraCutTrack == nullptr)
        {
            OutError = TEXT("Failed to create or find camera cut track");
            return nullptr;
        }

        MovieScene->Modify();
        Result->SetStringField(TEXT("track_class"), CameraCutTrack->GetClass()->GetName());
        Result->SetNumberField(TEXT("section_count"), CameraCutTrack->GetAllSections().Num());
        return Result;
    }

    if (!Params->HasField(TEXT("binding_id")))
    {
        OutError = TEXT("binding_id is required for this track type");
        return nullptr;
    }

    FGuid BindingGuid;
    if (!TryParseBindingGuid(Params->GetStringField(TEXT("binding_id")), BindingGuid) || MovieScene->FindBinding(BindingGuid) == nullptr)
    {
        OutError = TEXT("Invalid binding_id or binding not found in sequence");
        return nullptr;
    }

    Result->SetStringField(TEXT("binding_id"), BindingGuid.ToString());

    if (TrackType == TEXT("transform"))
    {
        UMovieScene3DTransformTrack* Track = MovieScene->FindTrack<UMovieScene3DTransformTrack>(BindingGuid, FName("Transform"));
        if (Track == nullptr)
        {
            Track = MovieScene->AddTrack<UMovieScene3DTransformTrack>(BindingGuid);
        }

        if (Track == nullptr)
        {
            OutError = TEXT("Failed to create transform track");
            return nullptr;
        }

        bool bSectionAdded = false;
        UMovieScene3DTransformSection* Section = Cast<UMovieScene3DTransformSection>(Track->FindOrAddSection(0, bSectionAdded));
        if (Section == nullptr)
        {
            OutError = TEXT("Failed to create transform section");
            return nullptr;
        }

        MovieScene->Modify();
        Result->SetStringField(TEXT("track_class"), Track->GetClass()->GetName());
        Result->SetBoolField(TEXT("section_added"), bSectionAdded);
        return Result;
    }

    if (TrackType == TEXT("skeletal_animation") || TrackType == TEXT("animation"))
    {
        UMovieSceneSkeletalAnimationTrack* Track = MovieScene->AddTrack<UMovieSceneSkeletalAnimationTrack>(BindingGuid);
        if (Track == nullptr)
        {
            OutError = TEXT("Failed to create skeletal animation track");
            return nullptr;
        }

        UMovieSceneSkeletalAnimationSection* Section = Cast<UMovieSceneSkeletalAnimationSection>(Track->CreateNewSection());
        if (Section != nullptr)
        {
            Track->AddSection(*Section);
        }

        MovieScene->Modify();
        Result->SetStringField(TEXT("track_class"), Track->GetClass()->GetName());
        Result->SetBoolField(TEXT("section_added"), Section != nullptr);
        return Result;
    }

    OutError = FString::Printf(TEXT("Unsupported track_type '%s' in current scaffold"), *TrackType);
    return nullptr;
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleSetKeyframe(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
    if (!Params.IsValid() || !Params->HasField(TEXT("sequence_path")) || !Params->HasField(TEXT("channel_path")) || !Params->HasField(TEXT("frame")))
    {
        OutError = TEXT("Missing required params for set_keyframe");
        return nullptr;
    }

    const FString SequenceObjectPath = ResolveSequenceObjectPath(Params->GetStringField(TEXT("sequence_path")));
    const FString ChannelPath = Params->GetStringField(TEXT("channel_path"));
    const int32 DisplayFrame = static_cast<int32>(Params->GetNumberField(TEXT("frame")));

    ULevelSequence* Sequence = LoadObject<ULevelSequence>(nullptr, *SequenceObjectPath);
    if (Sequence == nullptr)
    {
        OutError = FString::Printf(TEXT("Could not load Level Sequence '%s'"), *SequenceObjectPath);
        return nullptr;
    }

    UMovieScene* MovieScene = Sequence->GetMovieScene();
    if (MovieScene == nullptr)
    {
        OutError = TEXT("Sequence has no MovieScene");
        return nullptr;
    }

    TArray<FString> Tokens;
    ChannelPath.ParseIntoArray(Tokens, TEXT(":"), true);
    if (Tokens.Num() == 0)
    {
        OutError = TEXT("Invalid channel_path");
        return nullptr;
    }

    FString BindingToken;
    FString ChannelSpecifier;
    bool bWholeTransform = false;

    if (Tokens[0].Equals(TEXT("binding"), ESearchCase::IgnoreCase) && Tokens.Num() >= 2)
    {
        BindingToken = Tokens[1];
        if (Tokens.Num() == 2 || (Tokens.Num() == 3 && Tokens[2].Equals(TEXT("transform"), ESearchCase::IgnoreCase)))
        {
            bWholeTransform = true;
        }
        else if (Tokens.Num() >= 4 && Tokens[2].Equals(TEXT("transform"), ESearchCase::IgnoreCase))
        {
            ChannelSpecifier = Tokens[3];
        }
    }
    else
    {
        BindingToken = Tokens[0];
        if (Tokens.Num() == 1 || (Tokens.Num() == 2 && Tokens[1].Equals(TEXT("transform"), ESearchCase::IgnoreCase)))
        {
            bWholeTransform = true;
        }
        else if (Tokens.Num() >= 3 && Tokens[1].Equals(TEXT("transform"), ESearchCase::IgnoreCase))
        {
            ChannelSpecifier = Tokens[2];
        }
    }

    FGuid BindingGuid;
    if (!TryParseBindingGuid(BindingToken, BindingGuid) || MovieScene->FindBinding(BindingGuid) == nullptr)
    {
        OutError = TEXT("Invalid binding in channel_path");
        return nullptr;
    }

    UMovieScene3DTransformTrack* Track = MovieScene->FindTrack<UMovieScene3DTransformTrack>(BindingGuid, FName("Transform"));
    if (Track == nullptr)
    {
        Track = MovieScene->AddTrack<UMovieScene3DTransformTrack>(BindingGuid);
    }
    if (Track == nullptr)
    {
        OutError = TEXT("Failed to create transform track for keyframe");
        return nullptr;
    }

    bool bSectionAdded = false;
    UMovieScene3DTransformSection* Section = Cast<UMovieScene3DTransformSection>(Track->FindOrAddSection(0, bSectionAdded));
    if (Section == nullptr)
    {
        OutError = TEXT("Failed to create transform section for keyframe");
        return nullptr;
    }

    FMovieSceneChannelProxy& Proxy = Section->GetChannelProxy();
    TArrayView<FMovieSceneDoubleChannel*> Channels = Proxy.GetChannels<FMovieSceneDoubleChannel>();
    if (Channels.Num() < 9)
    {
        OutError = TEXT("Transform section does not expose expected channels");
        return nullptr;
    }

    const FFrameNumber TickFrame = DisplayFrameToTickFrame(MovieScene, DisplayFrame);
    bool bModified = false;

    if (bWholeTransform)
    {
        const TSharedPtr<FJsonObject>* ValueObject = nullptr;
        if (!Params->TryGetObjectField(TEXT("value"), ValueObject) || ValueObject == nullptr || !ValueObject->IsValid())
        {
            OutError = TEXT("Whole-transform keyframes require value object with location/rotation/scale fields");
            return nullptr;
        }

        const TSharedPtr<FJsonObject>* LocationObject = nullptr;
        if ((*ValueObject)->TryGetObjectField(TEXT("location"), LocationObject) && LocationObject && LocationObject->IsValid())
        {
            double X = 0.0, Y = 0.0, Z = 0.0;
            if ((*LocationObject)->TryGetNumberField(TEXT("x"), X)) { Channels[0]->GetData().AddKey(TickFrame, FMovieSceneDoubleValue(X)); bModified = true; }
            if ((*LocationObject)->TryGetNumberField(TEXT("y"), Y)) { Channels[1]->GetData().AddKey(TickFrame, FMovieSceneDoubleValue(Y)); bModified = true; }
            if ((*LocationObject)->TryGetNumberField(TEXT("z"), Z)) { Channels[2]->GetData().AddKey(TickFrame, FMovieSceneDoubleValue(Z)); bModified = true; }
        }

        const TSharedPtr<FJsonObject>* RotationObject = nullptr;
        if ((*ValueObject)->TryGetObjectField(TEXT("rotation"), RotationObject) && RotationObject && RotationObject->IsValid())
        {
            double Roll = 0.0, Pitch = 0.0, Yaw = 0.0;
            if ((*RotationObject)->TryGetNumberField(TEXT("roll"), Roll)) { Channels[3]->GetData().AddKey(TickFrame, FMovieSceneDoubleValue(Roll)); bModified = true; }
            if ((*RotationObject)->TryGetNumberField(TEXT("pitch"), Pitch)) { Channels[4]->GetData().AddKey(TickFrame, FMovieSceneDoubleValue(Pitch)); bModified = true; }
            if ((*RotationObject)->TryGetNumberField(TEXT("yaw"), Yaw)) { Channels[5]->GetData().AddKey(TickFrame, FMovieSceneDoubleValue(Yaw)); bModified = true; }
        }

        const TSharedPtr<FJsonObject>* ScaleObject = nullptr;
        if ((*ValueObject)->TryGetObjectField(TEXT("scale"), ScaleObject) && ScaleObject && ScaleObject->IsValid())
        {
            double X = 1.0, Y = 1.0, Z = 1.0;
            if ((*ScaleObject)->TryGetNumberField(TEXT("x"), X)) { Channels[6]->GetData().AddKey(TickFrame, FMovieSceneDoubleValue(X)); bModified = true; }
            if ((*ScaleObject)->TryGetNumberField(TEXT("y"), Y)) { Channels[7]->GetData().AddKey(TickFrame, FMovieSceneDoubleValue(Y)); bModified = true; }
            if ((*ScaleObject)->TryGetNumberField(TEXT("z"), Z)) { Channels[8]->GetData().AddKey(TickFrame, FMovieSceneDoubleValue(Z)); bModified = true; }
        }
    }
    else
    {
        int32 ChannelIndex = INDEX_NONE;
        if (!ResolveTransformChannelIndex(ChannelSpecifier, ChannelIndex))
        {
            OutError = TEXT("Unsupported transform channel in channel_path");
            return nullptr;
        }

        double ScalarValue = 0.0;
        if (!Params->TryGetNumberField(TEXT("value"), ScalarValue))
        {
            OutError = TEXT("Single-channel keyframes require numeric value");
            return nullptr;
        }

        Channels[ChannelIndex]->GetData().AddKey(TickFrame, FMovieSceneDoubleValue(ScalarValue));
        bModified = true;
    }

    if (!bModified)
    {
        OutError = TEXT("No keyframe values were applied");
        return nullptr;
    }

    MovieScene->Modify();
    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("sequence_path"), SequenceObjectPath);
    Result->SetStringField(TEXT("binding_id"), BindingGuid.ToString());
    Result->SetStringField(TEXT("channel_path"), ChannelPath);
    Result->SetNumberField(TEXT("frame"), DisplayFrame);
    return Result;
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleAddCameraCut(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
    if (!Params.IsValid() || !Params->HasField(TEXT("sequence_path")) || !Params->HasField(TEXT("camera_binding_id")) || !Params->HasField(TEXT("start_frame")) || !Params->HasField(TEXT("end_frame")))
    {
        OutError = TEXT("Missing required params for add_camera_cut");
        return nullptr;
    }

    const FString SequenceObjectPath = ResolveSequenceObjectPath(Params->GetStringField(TEXT("sequence_path")));
    const int32 StartFrame = static_cast<int32>(Params->GetNumberField(TEXT("start_frame")));
    const int32 EndFrame = static_cast<int32>(Params->GetNumberField(TEXT("end_frame")));
    if (EndFrame < StartFrame)
    {
        OutError = TEXT("end_frame must be greater than or equal to start_frame");
        return nullptr;
    }

    ULevelSequence* Sequence = LoadObject<ULevelSequence>(nullptr, *SequenceObjectPath);
    if (Sequence == nullptr)
    {
        OutError = FString::Printf(TEXT("Could not load Level Sequence '%s'"), *SequenceObjectPath);
        return nullptr;
    }

    UMovieScene* MovieScene = Sequence->GetMovieScene();
    if (MovieScene == nullptr)
    {
        OutError = TEXT("Sequence has no MovieScene");
        return nullptr;
    }

    FGuid CameraBindingGuid;
    if (!TryParseBindingGuid(Params->GetStringField(TEXT("camera_binding_id")), CameraBindingGuid) || MovieScene->FindBinding(CameraBindingGuid) == nullptr)
    {
        OutError = TEXT("Invalid camera_binding_id or binding not found in sequence");
        return nullptr;
    }

    UMovieSceneTrack* ExistingCutTrack = MovieScene->GetCameraCutTrack();
    UMovieSceneCameraCutTrack* CameraCutTrack = ExistingCutTrack
        ? Cast<UMovieSceneCameraCutTrack>(ExistingCutTrack)
        : Cast<UMovieSceneCameraCutTrack>(MovieScene->AddCameraCutTrack(UMovieSceneCameraCutTrack::StaticClass()));

    if (CameraCutTrack == nullptr)
    {
        OutError = TEXT("Failed to create or find camera cut track");
        return nullptr;
    }

    UMovieSceneCameraCutSection* Section = Cast<UMovieSceneCameraCutSection>(CameraCutTrack->CreateNewSection());
    if (Section == nullptr)
    {
        OutError = TEXT("Failed to create camera cut section");
        return nullptr;
    }

    CameraCutTrack->AddSection(*Section);
    Section->SetRange(TRange<FFrameNumber>(DisplayFrameToTickFrame(MovieScene, StartFrame), DisplayFrameToTickFrame(MovieScene, EndFrame)));
    Section->SetCameraBindingID(FMovieSceneObjectBindingID(CameraBindingGuid));
    MovieScene->Modify();

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("sequence_path"), SequenceObjectPath);
    Result->SetStringField(TEXT("camera_binding_id"), CameraBindingGuid.ToString());
    Result->SetNumberField(TEXT("start_frame"), StartFrame);
    Result->SetNumberField(TEXT("end_frame"), EndFrame);
    return Result;
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleListMovieRenderGraphs(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
    const FString RequestedRoot = Params.IsValid() && Params->HasField(TEXT("root_path"))
        ? Params->GetStringField(TEXT("root_path"))
        : TEXT("/Game");
    const int32 Limit = Params.IsValid() && Params->HasField(TEXT("limit"))
        ? FMath::Clamp(static_cast<int32>(Params->GetNumberField(TEXT("limit"))), 1, 500)
        : 100;

    FString RootPath;
    if (!NormalizeContentPath(RequestedRoot, RootPath))
    {
        OutError = FString::Printf(TEXT("Invalid root_path '%s'"), *RequestedRoot);
        return nullptr;
    }

    FAssetRegistryModule& AssetRegistryModule = FModuleManager::LoadModuleChecked<FAssetRegistryModule>(TEXT("AssetRegistry"));

    FARFilter Filter;
    Filter.bRecursivePaths = true;
    Filter.PackagePaths.Add(*RootPath);

    TArray<FAssetData> Assets;
    AssetRegistryModule.Get().GetAssets(Filter, Assets);
    Assets.Sort([](const FAssetData& A, const FAssetData& B)
    {
        return A.AssetName.LexicalLess(B.AssetName);
    });

    TArray<TSharedPtr<FJsonValue>> GraphArray;
    for (const FAssetData& Asset : Assets)
    {
        const FString ClassPath = Asset.AssetClassPath.ToString();
        if (!ClassPath.Contains(TEXT("MovieGraph"), ESearchCase::IgnoreCase) &&
            !ClassPath.Contains(TEXT("RenderGraph"), ESearchCase::IgnoreCase))
        {
            continue;
        }

        TSharedPtr<FJsonObject> GraphObject = MakeShared<FJsonObject>();
        GraphObject->SetStringField(TEXT("asset_name"), Asset.AssetName.ToString());
        GraphObject->SetStringField(TEXT("package_name"), Asset.PackageName.ToString());
        GraphObject->SetStringField(TEXT("object_path"), Asset.GetObjectPathString());
        GraphObject->SetStringField(TEXT("class"), ClassPath);
        GraphArray.Add(MakeShared<FJsonValueObject>(GraphObject));

        if (GraphArray.Num() >= Limit)
        {
            break;
        }
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("root_path"), RootPath);
    Result->SetNumberField(TEXT("count"), GraphArray.Num());
    Result->SetArrayField(TEXT("graphs"), GraphArray);
    return Result;
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleGetMovieRenderGraphInfo(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
    if (!Params.IsValid() || !Params->HasField(TEXT("graph_path")))
    {
        OutError = TEXT("Missing required param 'graph_path'");
        return nullptr;
    }

    FString GraphPath;
    if (!NormalizeContentPath(Params->GetStringField(TEXT("graph_path")), GraphPath))
    {
        OutError = TEXT("Invalid graph_path");
        return nullptr;
    }

    const FString GraphObjectPath = ResolveAssetObjectPath(GraphPath);
    UObject* GraphAsset = LoadObject<UObject>(nullptr, *GraphObjectPath);
    if (GraphAsset == nullptr)
    {
        OutError = FString::Printf(TEXT("Could not load graph asset '%s'"), *GraphObjectPath);
        return nullptr;
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("name"), GraphAsset->GetName());
    Result->SetStringField(TEXT("path"), GraphAsset->GetPathName());
    Result->SetStringField(TEXT("class"), GraphAsset->GetClass()->GetName());
    Result->SetStringField(TEXT("note"), TEXT("Graph node introspection is planned in a later implementation wave."));
    return Result;
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleConfigureMovieRenderGraphJob(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
#if WITH_EDITOR
    if (!Params.IsValid() || !Params->HasField(TEXT("graph_path")) || !Params->HasField(TEXT("sequence_path")))
    {
        OutError = TEXT("Missing required params for configure_movie_render_graph_job");
        return nullptr;
    }

    FString GraphPath;
    FString SequencePath;
    if (!NormalizeContentPath(Params->GetStringField(TEXT("graph_path")), GraphPath))
    {
        OutError = TEXT("Invalid graph_path");
        return nullptr;
    }
    if (!NormalizeContentPath(Params->GetStringField(TEXT("sequence_path")), SequencePath))
    {
        OutError = TEXT("Invalid sequence_path");
        return nullptr;
    }

    UMovieGraphConfig* GraphConfig = LoadObject<UMovieGraphConfig>(nullptr, *ResolveAssetObjectPath(GraphPath));
    if (GraphConfig == nullptr)
    {
        OutError = TEXT("Could not load Movie Render Graph asset");
        return nullptr;
    }

    ULevelSequence* Sequence = LoadObject<ULevelSequence>(nullptr, *ResolveSequenceObjectPath(SequencePath));
    if (Sequence == nullptr)
    {
        OutError = TEXT("Could not load Level Sequence");
        return nullptr;
    }

    FString MapPath;
    if (Params->HasField(TEXT("map_path")))
    {
        if (!NormalizeContentPath(Params->GetStringField(TEXT("map_path")), MapPath))
        {
            OutError = TEXT("Invalid map_path");
            return nullptr;
        }
    }

    UMoviePipelineQueueEngineSubsystem* QueueSubsystem = GEngine ? GEngine->GetEngineSubsystem<UMoviePipelineQueueEngineSubsystem>() : nullptr;
    UMoviePipelineExecutorJob* Job = BuildMovieRenderGraphJob(
        QueueSubsystem,
        GraphConfig,
        Sequence,
        MapPath.IsEmpty() ? FString() : ResolveAssetObjectPath(MapPath),
        Params->HasField(TEXT("job_name")) ? Params->GetStringField(TEXT("job_name")) : FString(),
        OutError);
    if (Job == nullptr)
    {
        return nullptr;
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("job_name"), Job->JobName);
    Result->SetStringField(TEXT("graph_path"), GraphConfig->GetPathName());
    Result->SetStringField(TEXT("sequence_path"), Job->Sequence.GetAssetPathString());
    Result->SetStringField(TEXT("map_path"), Job->Map.GetAssetPathString());
    Result->SetBoolField(TEXT("uses_graph_configuration"), Job->IsUsingGraphConfiguration());
    Result->SetNumberField(TEXT("queue_job_count"), QueueSubsystem && QueueSubsystem->GetQueue() ? QueueSubsystem->GetQueue()->GetJobs().Num() : 0);
    return Result;
#else
    OutError = TEXT("configure_movie_render_graph_job requires an editor build");
    return nullptr;
#endif
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleRenderSequenceWithGraph(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
#if WITH_EDITOR
    TSharedPtr<FJsonObject> ConfiguredJob = HandleConfigureMovieRenderGraphJob(Params, OutError);
    if (!ConfiguredJob.IsValid())
    {
        return nullptr;
    }

    UMoviePipelineQueueEngineSubsystem* QueueSubsystem = GEngine ? GEngine->GetEngineSubsystem<UMoviePipelineQueueEngineSubsystem>() : nullptr;
    if (QueueSubsystem == nullptr || QueueSubsystem->GetQueue() == nullptr)
    {
        OutError = TEXT("Movie render queue subsystem is not available");
        return nullptr;
    }

    TArray<UMoviePipelineExecutorJob*> Jobs = QueueSubsystem->GetQueue()->GetJobs();
    if (Jobs.Num() == 0 || Jobs[0] == nullptr)
    {
        OutError = TEXT("No configured movie render job was available to render");
        return nullptr;
    }

    if (Params.IsValid() && Params->HasField(TEXT("output_path")))
    {
        ConfiguredJob->SetStringField(TEXT("requested_output_path"), Params->GetStringField(TEXT("output_path")));
        ConfiguredJob->SetBoolField(TEXT("output_path_applied"), false);
        ConfiguredJob->SetStringField(TEXT("output_path_note"), TEXT("Current scaffold keeps graph-authored output settings authoritative."));
    }

    QueueSubsystem->RenderJob(Jobs[0]);
    ConfiguredJob->SetBoolField(TEXT("render_requested"), true);
    ConfiguredJob->SetBoolField(TEXT("is_rendering"), QueueSubsystem->IsRendering());
    return ConfiguredJob;
#else
    OutError = TEXT("render_sequence_with_graph requires an editor build");
    return nullptr;
#endif
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleListMaterials(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
    const FString RequestedRoot = Params.IsValid() && Params->HasField(TEXT("root_path"))
        ? Params->GetStringField(TEXT("root_path"))
        : TEXT("/Game");
    const int32 Limit = Params.IsValid() && Params->HasField(TEXT("limit"))
        ? FMath::Clamp(static_cast<int32>(Params->GetNumberField(TEXT("limit"))), 1, 500)
        : 100;
    const bool bIncludeInstances = !Params.IsValid() || !Params->HasField(TEXT("include_instances"))
        ? true
        : Params->GetBoolField(TEXT("include_instances"));

    FString RootPath;
    if (!NormalizeContentPath(RequestedRoot, RootPath))
    {
        OutError = FString::Printf(TEXT("Invalid root_path '%s'"), *RequestedRoot);
        return nullptr;
    }

    FAssetRegistryModule& AssetRegistryModule = FModuleManager::LoadModuleChecked<FAssetRegistryModule>(TEXT("AssetRegistry"));

    FARFilter Filter;
    Filter.bRecursivePaths = true;
    Filter.PackagePaths.Add(*RootPath);
    Filter.ClassPaths.Add(UMaterial::StaticClass()->GetClassPathName());
    if (bIncludeInstances)
    {
        Filter.ClassPaths.Add(UMaterialInstanceConstant::StaticClass()->GetClassPathName());
    }

    TArray<FAssetData> Assets;
    AssetRegistryModule.Get().GetAssets(Filter, Assets);
    Assets.Sort([](const FAssetData& A, const FAssetData& B)
    {
        return A.AssetName.LexicalLess(B.AssetName);
    });

    TArray<TSharedPtr<FJsonValue>> MaterialArray;
    const int32 Count = FMath::Min(Assets.Num(), Limit);
    for (int32 Index = 0; Index < Count; ++Index)
    {
        const FAssetData& Asset = Assets[Index];
        TSharedPtr<FJsonObject> MaterialObject = MakeShared<FJsonObject>();
        MaterialObject->SetStringField(TEXT("asset_name"), Asset.AssetName.ToString());
        MaterialObject->SetStringField(TEXT("package_name"), Asset.PackageName.ToString());
        MaterialObject->SetStringField(TEXT("object_path"), Asset.GetObjectPathString());
        MaterialObject->SetStringField(TEXT("class"), Asset.AssetClassPath.ToString());
        MaterialObject->SetBoolField(TEXT("is_instance"), Asset.AssetClassPath == UMaterialInstanceConstant::StaticClass()->GetClassPathName());
        MaterialArray.Add(MakeShared<FJsonValueObject>(MaterialObject));
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("root_path"), RootPath);
    Result->SetBoolField(TEXT("include_instances"), bIncludeInstances);
    Result->SetNumberField(TEXT("count"), MaterialArray.Num());
    Result->SetArrayField(TEXT("materials"), MaterialArray);
    return Result;
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleGetMaterialInfo(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
    if (!Params.IsValid() || !Params->HasField(TEXT("material_path")))
    {
        OutError = TEXT("Missing required param 'material_path'");
        return nullptr;
    }

    FString NormalizedPath;
    if (!NormalizeContentPath(Params->GetStringField(TEXT("material_path")), NormalizedPath))
    {
        OutError = FString::Printf(TEXT("Invalid material_path '%s'"), *Params->GetStringField(TEXT("material_path")));
        return nullptr;
    }

    const FString MaterialObjectPath = ResolveAssetObjectPath(NormalizedPath);
    UMaterialInterface* Material = LoadObject<UMaterialInterface>(nullptr, *MaterialObjectPath);
    if (Material == nullptr)
    {
        OutError = FString::Printf(TEXT("Could not load material '%s'"), *MaterialObjectPath);
        return nullptr;
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("name"), Material->GetName());
    Result->SetStringField(TEXT("path"), MaterialObjectPath);
    Result->SetStringField(TEXT("class"), Material->GetClass()->GetName());

    if (const UMaterialInstance* MaterialInstance = Cast<UMaterialInstance>(Material))
    {
        Result->SetBoolField(TEXT("is_instance"), true);
        Result->SetStringField(TEXT("parent_path"), MaterialInstance->Parent ? MaterialInstance->Parent->GetPathName() : FString());
    }
    else
    {
        Result->SetBoolField(TEXT("is_instance"), false);
    }

    if (const UMaterial* BaseMaterial = Material->GetMaterial())
    {
        Result->SetStringField(TEXT("base_material_path"), BaseMaterial->GetPathName());
        Result->SetStringField(TEXT("blend_mode"), DescribeBlendMode(BaseMaterial->BlendMode));
        Result->SetStringField(TEXT("material_domain"), DescribeMaterialDomain(BaseMaterial->MaterialDomain));
        Result->SetBoolField(TEXT("two_sided"), BaseMaterial->TwoSided);
    }

    TArray<TSharedPtr<FJsonValue>> Parameters;
    AddParameterInfos(Material, TEXT("scalar"), &UMaterialInterface::GetAllScalarParameterInfo, Parameters);
    AddParameterInfos(Material, TEXT("vector"), &UMaterialInterface::GetAllVectorParameterInfo, Parameters);
    AddParameterInfos(Material, TEXT("texture"), &UMaterialInterface::GetAllTextureParameterInfo, Parameters);
    AddParameterInfos(Material, TEXT("static_switch"), &UMaterialInterface::GetAllStaticSwitchParameterInfo, Parameters);

    Result->SetNumberField(TEXT("parameter_count"), Parameters.Num());
    Result->SetArrayField(TEXT("parameters"), Parameters);
    return Result;
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleCreateMaterialInstance(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
    if (!Params.IsValid() || !Params->HasField(TEXT("parent_material_path")) || !Params->HasField(TEXT("package_path")) || !Params->HasField(TEXT("asset_name")))
    {
        OutError = TEXT("Missing required params for create_material_instance");
        return nullptr;
    }

    FString ParentPath;
    FString PackageRoot;
    const FString AssetName = Params->GetStringField(TEXT("asset_name")).TrimStartAndEnd();
    if (!NormalizeContentPath(Params->GetStringField(TEXT("parent_material_path")), ParentPath))
    {
        OutError = TEXT("Invalid parent_material_path");
        return nullptr;
    }
    if (!NormalizeContentPath(Params->GetStringField(TEXT("package_path")), PackageRoot))
    {
        OutError = TEXT("Invalid package_path");
        return nullptr;
    }
    if (AssetName.IsEmpty() || AssetName.Contains(TEXT("/")) || AssetName.Contains(TEXT("\\")) || AssetName.Contains(TEXT(".")) || AssetName.Contains(TEXT(":")))
    {
        OutError = TEXT("Invalid asset_name");
        return nullptr;
    }

    const FString ParentObjectPath = ResolveAssetObjectPath(ParentPath);
    UMaterialInterface* ParentMaterial = LoadObject<UMaterialInterface>(nullptr, *ParentObjectPath);
    if (ParentMaterial == nullptr)
    {
        OutError = FString::Printf(TEXT("Could not load parent material '%s'"), *ParentObjectPath);
        return nullptr;
    }

    const FString PackageName = PackageRoot / AssetName;
    const FString ObjectPath = ResolveAssetObjectPath(PackageName);
    if (LoadObject<UObject>(nullptr, *ObjectPath) != nullptr)
    {
        OutError = FString::Printf(TEXT("Asset already exists at '%s'"), *ObjectPath);
        return nullptr;
    }

    UPackage* Package = CreatePackage(*PackageName);
    if (Package == nullptr)
    {
        OutError = TEXT("Failed to create asset package");
        return nullptr;
    }

    UMaterialInstanceConstantFactoryNew* Factory = NewObject<UMaterialInstanceConstantFactoryNew>();
    if (Factory == nullptr)
    {
        OutError = TEXT("Failed to create material instance factory");
        return nullptr;
    }
    Factory->InitialParent = ParentMaterial;

    UMaterialInstanceConstant* MaterialInstance = Cast<UMaterialInstanceConstant>(
        Factory->FactoryCreateNew(
            UMaterialInstanceConstant::StaticClass(),
            Package,
            FName(*AssetName),
            RF_Public | RF_Standalone | RF_Transactional,
            nullptr,
            GWarn));

    if (MaterialInstance == nullptr)
    {
        OutError = TEXT("Failed to create material instance asset");
        return nullptr;
    }

    MaterialInstance->PostEditChange();
    MaterialInstance->MarkPackageDirty();
    FAssetRegistryModule::AssetCreated(MaterialInstance);

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("asset_path"), MaterialInstance->GetPathName());
    Result->SetStringField(TEXT("parent_path"), ParentMaterial->GetPathName());
    return Result;
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleSetMaterialParameter(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
    if (!Params.IsValid() || !Params->HasField(TEXT("material_path")) || !Params->HasField(TEXT("parameter_name")) || !Params->HasField(TEXT("parameter_type")))
    {
        OutError = TEXT("Missing required params for set_material_parameter");
        return nullptr;
    }

    FString MaterialPath;
    if (!NormalizeContentPath(Params->GetStringField(TEXT("material_path")), MaterialPath))
    {
        OutError = TEXT("Invalid material_path");
        return nullptr;
    }

    const FString MaterialObjectPath = ResolveAssetObjectPath(MaterialPath);
    UMaterialInstanceConstant* MaterialInstance = LoadObject<UMaterialInstanceConstant>(nullptr, *MaterialObjectPath);
    if (MaterialInstance == nullptr)
    {
        OutError = TEXT("set_material_parameter currently requires a material instance asset");
        return nullptr;
    }

    const FString ParameterName = Params->GetStringField(TEXT("parameter_name"));
    const FString ParameterType = Params->GetStringField(TEXT("parameter_type")).ToLower();

    if (ParameterType == TEXT("scalar"))
    {
        double ScalarValue = 0.0;
        if (!Params->TryGetNumberField(TEXT("value"), ScalarValue))
        {
            OutError = TEXT("Scalar parameter updates require numeric value");
            return nullptr;
        }
        MaterialInstance->SetScalarParameterValueEditorOnly(FName(*ParameterName), static_cast<float>(ScalarValue));
    }
    else if (ParameterType == TEXT("vector"))
    {
        const TSharedPtr<FJsonObject>* ValueObject = nullptr;
        if (!Params->TryGetObjectField(TEXT("value"), ValueObject) || ValueObject == nullptr || !ValueObject->IsValid())
        {
            OutError = TEXT("Vector parameter updates require object value with r/g/b/a or x/y/z/w");
            return nullptr;
        }

        double X = 1.0, Y = 1.0, Z = 1.0, W = 1.0;
        (*ValueObject)->TryGetNumberField(TEXT("r"), X) || (*ValueObject)->TryGetNumberField(TEXT("x"), X);
        (*ValueObject)->TryGetNumberField(TEXT("g"), Y) || (*ValueObject)->TryGetNumberField(TEXT("y"), Y);
        (*ValueObject)->TryGetNumberField(TEXT("b"), Z) || (*ValueObject)->TryGetNumberField(TEXT("z"), Z);
        (*ValueObject)->TryGetNumberField(TEXT("a"), W) || (*ValueObject)->TryGetNumberField(TEXT("w"), W);
        MaterialInstance->SetVectorParameterValueEditorOnly(FName(*ParameterName), FLinearColor(X, Y, Z, W));
    }
    else if (ParameterType == TEXT("texture"))
    {
        FString TexturePath;
        if (!Params->TryGetStringField(TEXT("value"), TexturePath))
        {
            OutError = TEXT("Texture parameter updates require string texture path in value");
            return nullptr;
        }

        FString NormalizedTexturePath;
        if (!NormalizeContentPath(TexturePath, NormalizedTexturePath))
        {
            OutError = TEXT("Invalid texture path in value");
            return nullptr;
        }

        UTexture* Texture = LoadObject<UTexture>(nullptr, *ResolveAssetObjectPath(NormalizedTexturePath));
        if (Texture == nullptr)
        {
            OutError = TEXT("Could not load texture asset");
            return nullptr;
        }
        MaterialInstance->SetTextureParameterValueEditorOnly(FName(*ParameterName), Texture);
    }
    else
    {
        OutError = FString::Printf(TEXT("Unsupported parameter_type '%s' in current scaffold"), *ParameterType);
        return nullptr;
    }

    MaterialInstance->PostEditChange();
    MaterialInstance->MarkPackageDirty();

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("material_path"), MaterialInstance->GetPathName());
    Result->SetStringField(TEXT("parameter_name"), ParameterName);
    Result->SetStringField(TEXT("parameter_type"), ParameterType);
    return Result;
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleAssignMaterialToActor(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
#if WITH_EDITOR
    if (!Params.IsValid() || !Params->HasField(TEXT("actor_name")) || !Params->HasField(TEXT("material_path")))
    {
        OutError = TEXT("Missing required params for assign_material_to_actor");
        return nullptr;
    }

    if (GEditor == nullptr)
    {
        OutError = TEXT("Editor is not available");
        return nullptr;
    }

    UWorld* World = GEditor->GetEditorWorldContext().World();
    if (World == nullptr)
    {
        OutError = TEXT("No active editor world");
        return nullptr;
    }

    AActor* Actor = nullptr;
    if (!TryResolveActor(World, Params->GetStringField(TEXT("actor_name")), Actor) || Actor == nullptr)
    {
        OutError = TEXT("Actor not found");
        return nullptr;
    }

    FString MaterialPath;
    if (!NormalizeContentPath(Params->GetStringField(TEXT("material_path")), MaterialPath))
    {
        OutError = TEXT("Invalid material_path");
        return nullptr;
    }

    UMaterialInterface* Material = LoadObject<UMaterialInterface>(nullptr, *ResolveAssetObjectPath(MaterialPath));
    if (Material == nullptr)
    {
        OutError = TEXT("Could not load material asset");
        return nullptr;
    }

    TArray<UMeshComponent*> MeshComponents;
    Actor->GetComponents<UMeshComponent>(MeshComponents);
    if (MeshComponents.Num() == 0)
    {
        OutError = TEXT("Actor has no mesh components");
        return nullptr;
    }

    const FString SlotName = Params->HasField(TEXT("slot_name")) ? Params->GetStringField(TEXT("slot_name")) : FString();
    UMeshComponent* TargetComponent = nullptr;
    int32 MaterialIndex = INDEX_NONE;
    for (UMeshComponent* MeshComponent : MeshComponents)
    {
        const int32 CandidateIndex = ResolveMaterialSlotIndex(MeshComponent, SlotName);
        if (CandidateIndex != INDEX_NONE)
        {
            TargetComponent = MeshComponent;
            MaterialIndex = CandidateIndex;
            break;
        }
    }

    if (TargetComponent == nullptr || MaterialIndex == INDEX_NONE)
    {
        OutError = TEXT("Could not resolve target material slot on actor");
        return nullptr;
    }

    if (TargetComponent->GetNumMaterials() > 0 && MaterialIndex >= TargetComponent->GetNumMaterials())
    {
        OutError = TEXT("Resolved material slot index is out of bounds for the target component");
        return nullptr;
    }

    TargetComponent->SetMaterial(MaterialIndex, Material);
    TargetComponent->Modify();
    Actor->MarkPackageDirty();

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("actor_name"), Actor->GetActorLabel());
    Result->SetStringField(TEXT("component_name"), TargetComponent->GetName());
    Result->SetStringField(TEXT("material_path"), Material->GetPathName());
    Result->SetNumberField(TEXT("material_index"), MaterialIndex);
    return Result;
#else
    OutError = TEXT("assign_material_to_actor requires an editor build");
    return nullptr;
#endif
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleListMaterialParameterCollections(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
    const FString RequestedRoot = Params.IsValid() && Params->HasField(TEXT("root_path"))
        ? Params->GetStringField(TEXT("root_path"))
        : TEXT("/Game");
    const int32 Limit = Params.IsValid() && Params->HasField(TEXT("limit"))
        ? FMath::Clamp(static_cast<int32>(Params->GetNumberField(TEXT("limit"))), 1, 500)
        : 100;

    FString RootPath;
    if (!NormalizeContentPath(RequestedRoot, RootPath))
    {
        OutError = FString::Printf(TEXT("Invalid root_path '%s'"), *RequestedRoot);
        return nullptr;
    }

    FAssetRegistryModule& AssetRegistryModule = FModuleManager::LoadModuleChecked<FAssetRegistryModule>(TEXT("AssetRegistry"));

    FARFilter Filter;
    Filter.bRecursivePaths = true;
    Filter.PackagePaths.Add(*RootPath);
    Filter.ClassPaths.Add(UMaterialParameterCollection::StaticClass()->GetClassPathName());

    TArray<FAssetData> Assets;
    AssetRegistryModule.Get().GetAssets(Filter, Assets);
    Assets.Sort([](const FAssetData& A, const FAssetData& B)
    {
        return A.AssetName.LexicalLess(B.AssetName);
    });

    TArray<TSharedPtr<FJsonValue>> CollectionArray;
    const int32 Count = FMath::Min(Assets.Num(), Limit);
    for (int32 Index = 0; Index < Count; ++Index)
    {
        const FAssetData& Asset = Assets[Index];
        TSharedPtr<FJsonObject> CollectionObject = MakeShared<FJsonObject>();
        CollectionObject->SetStringField(TEXT("asset_name"), Asset.AssetName.ToString());
        CollectionObject->SetStringField(TEXT("package_name"), Asset.PackageName.ToString());
        CollectionObject->SetStringField(TEXT("object_path"), Asset.GetObjectPathString());
        CollectionArray.Add(MakeShared<FJsonValueObject>(CollectionObject));
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("root_path"), RootPath);
    Result->SetNumberField(TEXT("count"), CollectionArray.Num());
    Result->SetArrayField(TEXT("collections"), CollectionArray);
    return Result;
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleListDataLayers(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
#if WITH_EDITOR
    if (GEditor == nullptr)
    {
        OutError = TEXT("Editor is not available");
        return nullptr;
    }

    UWorld* World = GEditor->GetEditorWorldContext().World();
    if (World == nullptr)
    {
        OutError = TEXT("No active editor world");
        return nullptr;
    }

    UWorldPartition* WorldPartition = World->GetWorldPartition();
    if (WorldPartition == nullptr)
    {
        OutError = TEXT("World is not partitioned");
        return nullptr;
    }

    UDataLayerManager* DataLayerManager = WorldPartition->GetDataLayerManager();
    if (DataLayerManager == nullptr)
    {
        OutError = TEXT("DataLayerManager is not available");
        return nullptr;
    }

    TArray<TSharedPtr<FJsonValue>> Layers;
    DataLayerManager->ForEachDataLayerInstance([&Layers](UDataLayerInstance* LayerInstance)
    {
        if (LayerInstance == nullptr)
        {
            return true;
        }

        TSharedPtr<FJsonObject> LayerObject = MakeShared<FJsonObject>();
        LayerObject->SetStringField(TEXT("short_name"), LayerInstance->GetDataLayerShortName());
        LayerObject->SetStringField(TEXT("full_name"), LayerInstance->GetDataLayerFullName());
        LayerObject->SetStringField(TEXT("class"), LayerInstance->GetClass()->GetName());
        Layers.Add(MakeShared<FJsonValueObject>(LayerObject));
        return true;
    });

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("world_name"), World->GetName());
    Result->SetNumberField(TEXT("count"), Layers.Num());
    Result->SetArrayField(TEXT("data_layers"), Layers);
    return Result;
#else
    OutError = TEXT("list_data_layers requires an editor build");
    return nullptr;
#endif
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleGetDataLayerInfo(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
#if WITH_EDITOR
    if (!Params.IsValid() || !Params->HasField(TEXT("data_layer_name")))
    {
        OutError = TEXT("Missing required param 'data_layer_name'");
        return nullptr;
    }

    if (GEditor == nullptr)
    {
        OutError = TEXT("Editor is not available");
        return nullptr;
    }

    UWorld* World = GEditor->GetEditorWorldContext().World();
    if (World == nullptr)
    {
        OutError = TEXT("No active editor world");
        return nullptr;
    }

    UWorldPartition* WorldPartition = World->GetWorldPartition();
    if (WorldPartition == nullptr)
    {
        OutError = TEXT("World is not partitioned");
        return nullptr;
    }

    UDataLayerManager* DataLayerManager = WorldPartition->GetDataLayerManager();
    if (DataLayerManager == nullptr)
    {
        OutError = TEXT("DataLayerManager is not available");
        return nullptr;
    }

    UDataLayerInstance* LayerInstance = FindDataLayerInstanceByName(DataLayerManager, Params->GetStringField(TEXT("data_layer_name")));
    if (LayerInstance == nullptr)
    {
        OutError = TEXT("Data Layer not found");
        return nullptr;
    }

    return MakeDataLayerInfoObject(LayerInstance, DataLayerManager);
#else
    OutError = TEXT("get_data_layer_info requires an editor build");
    return nullptr;
#endif
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleSetDataLayerLoaded(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
#if WITH_EDITOR
    if (!Params.IsValid() || !Params->HasField(TEXT("data_layer_name")) || !Params->HasField(TEXT("loaded")))
    {
        OutError = TEXT("Missing required params for set_data_layer_loaded");
        return nullptr;
    }

    if (GEditor == nullptr)
    {
        OutError = TEXT("Editor is not available");
        return nullptr;
    }

    UWorld* World = GEditor->GetEditorWorldContext().World();
    if (World == nullptr)
    {
        OutError = TEXT("No active editor world");
        return nullptr;
    }

    UWorldPartition* WorldPartition = World->GetWorldPartition();
    if (WorldPartition == nullptr)
    {
        OutError = TEXT("World is not partitioned");
        return nullptr;
    }

    UDataLayerManager* DataLayerManager = WorldPartition->GetDataLayerManager();
    if (DataLayerManager == nullptr)
    {
        OutError = TEXT("DataLayerManager is not available");
        return nullptr;
    }

    UDataLayerInstance* LayerInstance = FindDataLayerInstanceByName(DataLayerManager, Params->GetStringField(TEXT("data_layer_name")));
    if (LayerInstance == nullptr)
    {
        OutError = TEXT("Data Layer not found");
        return nullptr;
    }

    LayerInstance->Modify();
    LayerInstance->SetIsLoadedInEditor(Params->GetBoolField(TEXT("loaded")), true);
    return MakeDataLayerInfoObject(LayerInstance, DataLayerManager);
#else
    OutError = TEXT("set_data_layer_loaded requires an editor build");
    return nullptr;
#endif
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleSetDataLayerVisible(const TSharedPtr<FJsonObject>& Params, FString& OutError) const
{
#if WITH_EDITOR
    if (!Params.IsValid() || !Params->HasField(TEXT("data_layer_name")) || !Params->HasField(TEXT("visible")))
    {
        OutError = TEXT("Missing required params for set_data_layer_visible");
        return nullptr;
    }

    if (GEditor == nullptr)
    {
        OutError = TEXT("Editor is not available");
        return nullptr;
    }

    UWorld* World = GEditor->GetEditorWorldContext().World();
    if (World == nullptr)
    {
        OutError = TEXT("No active editor world");
        return nullptr;
    }

    UWorldPartition* WorldPartition = World->GetWorldPartition();
    if (WorldPartition == nullptr)
    {
        OutError = TEXT("World is not partitioned");
        return nullptr;
    }

    UDataLayerManager* DataLayerManager = WorldPartition->GetDataLayerManager();
    if (DataLayerManager == nullptr)
    {
        OutError = TEXT("DataLayerManager is not available");
        return nullptr;
    }

    UDataLayerInstance* LayerInstance = FindDataLayerInstanceByName(DataLayerManager, Params->GetStringField(TEXT("data_layer_name")));
    if (LayerInstance == nullptr)
    {
        OutError = TEXT("Data Layer not found");
        return nullptr;
    }

    LayerInstance->Modify();
    LayerInstance->SetVisible(Params->GetBoolField(TEXT("visible")));
    return MakeDataLayerInfoObject(LayerInstance, DataLayerManager);
#else
    OutError = TEXT("set_data_layer_visible requires an editor build");
    return nullptr;
#endif
}

TSharedPtr<FJsonObject> FPagecranUnrealBridgeModule::HandleNotImplemented(const FString& MethodName) const
{
    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetBoolField(TEXT("implemented"), false);
    Result->SetStringField(TEXT("method"), MethodName);
    Result->SetStringField(TEXT("status"), TEXT("planned"));
    return Result;
}
