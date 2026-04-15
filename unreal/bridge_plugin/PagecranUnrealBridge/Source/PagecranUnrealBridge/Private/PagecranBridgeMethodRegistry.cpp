#include "PagecranBridgeMethodRegistry.h"

#include "Dom/JsonObject.h"

void FPagecranBridgeMethodRegistry::Register(const FPagecranBridgeMethodSpec& Spec, FPagecranBridgeMethodHandler Handler)
{
    Methods.Add(Spec.Name, FRegisteredMethod{Spec, MoveTemp(Handler)});
}

bool FPagecranBridgeMethodRegistry::Execute(const FString& Method, const TSharedPtr<FJsonObject>& Params, TSharedPtr<FJsonObject>& OutResult, FString& OutError) const
{
    const FRegisteredMethod* Registered = Methods.Find(Method);
    if (Registered == nullptr)
    {
        OutError = FString::Printf(TEXT("Unknown method '%s'"), *Method);
        return false;
    }

    if (!Registered->Handler)
    {
        OutError = FString::Printf(TEXT("Method '%s' has no handler"), *Method);
        return false;
    }

    OutResult = Registered->Handler(Params.IsValid() ? Params : MakeShared<FJsonObject>(), OutError);
    return OutError.IsEmpty();
}

TArray<FPagecranBridgeMethodSpec> FPagecranBridgeMethodRegistry::GetMethodSpecs() const
{
    TArray<FPagecranBridgeMethodSpec> Result;
    for (const TPair<FString, FRegisteredMethod>& Pair : Methods)
    {
        Result.Add(Pair.Value.Spec);
    }
    Result.Sort([](const FPagecranBridgeMethodSpec& A, const FPagecranBridgeMethodSpec& B)
    {
        return A.Name < B.Name;
    });
    return Result;
}
