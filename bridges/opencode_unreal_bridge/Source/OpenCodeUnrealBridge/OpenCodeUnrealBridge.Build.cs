using UnrealBuildTool;

public class OpenCodeUnrealBridge : ModuleRules
{
    public OpenCodeUnrealBridge(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new[]
        {
            "Core",
            "CoreUObject",
            "Engine"
        });

        PrivateDependencyModuleNames.AddRange(new[]
        {
            "AssetRegistry",
            "AssetTools",
            "Json",
            "JsonUtilities",
            "LevelSequence",
            "MovieRenderPipelineCore",
            "MovieScene",
            "MovieSceneTracks",
            "Networking",
            "Projects",
            "Sockets",
            "UnrealEd"
        });

        if (Target.bBuildEditor)
        {
            PrivateDependencyModuleNames.Add("PythonScriptPlugin");
        }
    }
}
