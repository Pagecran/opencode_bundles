using UnrealBuildTool;

public class PagecranUnrealBridge : ModuleRules
{
    public PagecranUnrealBridge(ReadOnlyTargetRules Target) : base(Target)
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
    }
}
