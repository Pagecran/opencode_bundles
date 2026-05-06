param(
    [string[]]$Bridge = @("all"),
    [string]$BlenderTargetRoot = "R:\Workgroup_Blender\Extension\System\opencode_blender_bridge",
    [string]$UnrealEngineRoot,
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot

function Ensure-Directory {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Invoke-RobocopyMirror {
    param(
        [string]$Source,
        [string]$Destination,
        [string[]]$ExcludeDirectories = @()
    )

    Ensure-Directory -Path (Split-Path -Parent $Destination)

    $args = @(
        $Source,
        $Destination,
        "/MIR",
        "/R:2",
        "/W:1",
        "/NFL",
        "/NDL",
        "/NJH",
        "/NJS",
        "/NP"
    )

    if ($ExcludeDirectories.Count -gt 0) {
        $args += "/XD"
        $args += $ExcludeDirectories
    }

    $proc = Start-Process -FilePath "robocopy.exe" -ArgumentList $args -Wait -PassThru
    if ($proc.ExitCode -gt 7) {
        throw "robocopy failed for $Source -> $Destination with exit code $($proc.ExitCode)"
    }
}

function Resolve-UnrealEngineRoot {
    param([string]$ExplicitRoot)

    if (-not [string]::IsNullOrWhiteSpace($ExplicitRoot)) {
        if (-not (Test-Path -LiteralPath $ExplicitRoot)) {
            throw "UnrealEngine root not found: $ExplicitRoot"
        }
        return $ExplicitRoot
    }

    $candidates = @(
        "D:\EpicGames\UnrealEngine",
        "D:\UnrealEngine"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    throw "Unable to resolve UnrealEngine root. Pass -UnrealEngineRoot explicitly."
}

function Get-BridgeDefinitions {
    param([string]$ResolvedUnrealEngineRoot)

    @(
        [pscustomobject]@{
            Name = "blender"
            SourceRoot = Join-Path $RepoRoot "bridges\opencode_blender_bridge"
            TargetRoot = $BlenderTargetRoot
            ExcludeDirectories = @("__pycache__")
        },
        [pscustomobject]@{
            Name = "unreal"
            SourceRoot = Join-Path $RepoRoot "bridges\opencode_unreal_bridge"
            TargetRoot = Join-Path $ResolvedUnrealEngineRoot "Engine\Plugins\Developer\opencode_unreal_bridge"
            ExcludeDirectories = @("Intermediate", "Binaries", "Saved")
        }
    )
}

function Resolve-Bridges {
    param(
        [string[]]$Requested,
        [object[]]$Definitions
    )

    if (($Requested.Count -eq 0) -or ($Requested -contains "all")) {
        return $Definitions
    }

    $selected = @()
    foreach ($name in $Requested) {
        $match = $Definitions | Where-Object { $_.Name -ieq $name } | Select-Object -First 1
        if ($null -eq $match) {
            throw "Unknown bridge: $name"
        }
        $selected += $match
    }

    return $selected
}

$resolvedUnrealEngineRoot = Resolve-UnrealEngineRoot -ExplicitRoot $UnrealEngineRoot
$allBridgeDefs = @(Get-BridgeDefinitions -ResolvedUnrealEngineRoot $resolvedUnrealEngineRoot)
$bridgeDefs = @(Resolve-Bridges -Requested $Bridge -Definitions $allBridgeDefs)

foreach ($bridgeDef in $bridgeDefs) {
    if (-not (Test-Path -LiteralPath $bridgeDef.SourceRoot)) {
        throw "Bridge source root not found: $($bridgeDef.SourceRoot)"
    }

    Write-Host "Bridge: $($bridgeDef.Name)"
    Write-Host "Source: $($bridgeDef.SourceRoot)"
    Write-Host "Target: $($bridgeDef.TargetRoot)"

    if ($CheckOnly) {
        continue
    }

    Invoke-RobocopyMirror -Source $bridgeDef.SourceRoot -Destination $bridgeDef.TargetRoot -ExcludeDirectories $bridgeDef.ExcludeDirectories
    Write-Host "Synced bridge: $($bridgeDef.Name)"
}
