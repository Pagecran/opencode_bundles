#pragma once

#include "CoreMinimal.h"

class FJsonObject;

struct FPagecranBridgeParamSpec
{
    FString Name;
    FString Type;
    bool bRequired = false;
    FString Description;
};

struct FPagecranBridgeMethodSpec
{
    FString Name;
    FString Description;
    FString Domain;
    bool bImplemented = false;
    TArray<FPagecranBridgeParamSpec> Params;
};

using FPagecranBridgeMethodHandler = TFunction<TSharedPtr<FJsonObject>(const TSharedPtr<FJsonObject>&, FString&)>;

class PAGECRANUNREALBRIDGE_API FPagecranBridgeMethodRegistry
{
public:
    void Register(const FPagecranBridgeMethodSpec& Spec, FPagecranBridgeMethodHandler Handler);
    bool Execute(const FString& Method, const TSharedPtr<FJsonObject>& Params, TSharedPtr<FJsonObject>& OutResult, FString& OutError) const;
    TArray<FPagecranBridgeMethodSpec> GetMethodSpecs() const;

private:
    struct FRegisteredMethod
    {
        FPagecranBridgeMethodSpec Spec;
        FPagecranBridgeMethodHandler Handler;
    };

    TMap<FString, FRegisteredMethod> Methods;
};
