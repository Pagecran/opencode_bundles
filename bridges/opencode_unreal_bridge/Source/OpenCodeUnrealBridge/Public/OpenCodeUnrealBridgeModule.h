#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"
#include "PagecranBridgeMethodRegistry.h"

class FJsonObject;
class FPagecranBridgeServer;

class FOpenCodeUnrealBridgeModule : public IModuleInterface
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
    TSharedPtr<FJsonObject> HandleExecutePython(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleGetProjectInfo(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleGetEditorState(const TSharedPtr<FJsonObject>& Params, FString& OutError) const;
    TSharedPtr<FJsonObject> HandleNotImplemented(const FString& MethodName) const;

    TUniquePtr<FPagecranBridgeMethodRegistry> MethodRegistry;
    TUniquePtr<FPagecranBridgeServer> Server;
};
