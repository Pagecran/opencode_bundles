#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"
#include "PagecranBridgeMethodRegistry.h"

class FJsonObject;
class FPagecranBridgeServer;

class FPagecranUnrealBridgeModule : public IModuleInterface
{
public:
    virtual void StartupModule() override;
    virtual void ShutdownModule() override;

private:
    void RegisterMethods();
    void RegisterImplementedMethod(const FPagecranBridgeMethodSpec& Spec, TFunction<TSharedPtr<FJsonObject>(const TSharedPtr<FJsonObject>&, FString&)> Handler);
    void RegisterPlannedMethod(const FPagecranBridgeMethodSpec& Spec);

    TSharedPtr<FJsonObject> HandlePing(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleGetCapabilities(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleGetProjectInfo(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleGetEditorState(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleListLevelSequences(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleGetSequenceInfo(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleAddTrack(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleSetKeyframe(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleAddCameraCut(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleListMovieRenderGraphs(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleGetMovieRenderGraphInfo(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleConfigureMovieRenderGraphJob(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleRenderSequenceWithGraph(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleListMaterials(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleGetMaterialInfo(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleCreateMaterialInstance(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleSetMaterialParameter(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleAssignMaterialToActor(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleListMaterialParameterCollections(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleListDataLayers(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleGetDataLayerInfo(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleSetDataLayerLoaded(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleSetDataLayerVisible(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleNotImplemented(const FString& MethodName) const;

    TUniquePtr<FPagecranBridgeMethodRegistry> MethodRegistry;
    TUniquePtr<FPagecranBridgeServer> Server;
};
