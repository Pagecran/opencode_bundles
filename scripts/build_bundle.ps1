param(
    [string[]]$Bundle = @("all"),
    [string]$OutputRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) "dist"),
    [string]$PublishRoot = "\\truenas01\install\_Programmes\opencode_Bundles",
    [switch]$SkipPublish
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot

function Ensure-Directory {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Remove-PathIfExists {
    param([string]$Path)

    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
}

function Remove-DirectoryIfEmpty {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    $children = @(Get-ChildItem -LiteralPath $Path -Force)
    if ($children.Count -eq 0) {
        Remove-Item -LiteralPath $Path -Force
    }
}

function Get-BundleDirectories {
    Get-ChildItem -LiteralPath $RepoRoot -Directory | Where-Object {
        Test-Path -LiteralPath (Join-Path $_.FullName "bundle.json")
    } | Sort-Object Name
}

function Get-BundleManifest {
    param([string]$BundleRoot)

    $manifestPath = Join-Path $BundleRoot "bundle.json"
    Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
}

function Resolve-Bundles {
    param([string[]]$Requested)

    $allBundles = @(Get-BundleDirectories)
    if ($allBundles.Count -eq 0) {
        throw "No bundle.json files were found in $RepoRoot"
    }

    if (($Requested.Count -eq 0) -or ($Requested -contains "all")) {
        return @($allBundles | Where-Object {
            $manifest = Get-BundleManifest -BundleRoot $_.FullName
            -not [bool]$manifest.deprecated
        })
    }

    $selected = @()
    foreach ($name in $Requested) {
        $match = $allBundles | Where-Object { $_.Name -ieq $name } | Select-Object -First 1
        if ($null -eq $match) {
            throw "Unknown bundle: $name"
        }
        $selected += $match
    }

    return $selected
}

function Sync-SharedRuntime {
    $scriptPath = Join-Path $PSScriptRoot "sync_runtime.ps1"
    if (Test-Path -LiteralPath $scriptPath) {
        & powershell -ExecutionPolicy Bypass -File $scriptPath
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

Ensure-Directory -Path $OutputRoot
if (-not $SkipPublish) {
    Ensure-Directory -Path $PublishRoot
}

Sync-SharedRuntime

$bundleRoots = @(Resolve-Bundles -Requested $Bundle)

foreach ($bundleRoot in $bundleRoots) {
    $manifest = Get-BundleManifest -BundleRoot $bundleRoot.FullName
    $bundleName = $manifest.name
    if ([string]::IsNullOrWhiteSpace($bundleName)) {
        throw "Bundle name is missing in $($bundleRoot.FullName)\bundle.json"
    }

    $bundleVersion = $manifest.version
    if ([string]::IsNullOrWhiteSpace($bundleVersion)) {
        throw "Bundle version is missing in $($bundleRoot.FullName)\bundle.json"
    }

    $publishDirName = if ($manifest.publishDirName) { $manifest.publishDirName } else { $bundleName }

    $bundleOutputRoot = Join-Path $OutputRoot $bundleName
    $versionStageDir = Join-Path $bundleOutputRoot $bundleVersion
    $legacyStageZip = Join-Path $OutputRoot ($bundleName + ".zip")
    $legacyVersionZip = Join-Path $OutputRoot ($bundleName + "-" + $bundleVersion + ".zip")
    $legacyStageVersionsRoot = Join-Path (Join-Path $OutputRoot "versions") $bundleName
    $legacyStageCurrentDir = Join-Path $bundleOutputRoot "current"
    $legacyStageBundleVersionsDir = Join-Path $bundleOutputRoot "versions"

    $bundlePublishRoot = Join-Path $PublishRoot $publishDirName
    $versionPublishDir = Join-Path $bundlePublishRoot $bundleVersion
    $legacyPublishZip = Join-Path $PublishRoot ($publishDirName + ".zip")
    $legacyPublishVersionZip = Join-Path $PublishRoot ($publishDirName + "-" + $bundleVersion + ".zip")
    $legacyPublishVersionsRoot = Join-Path (Join-Path $PublishRoot "versions") $publishDirName
    $legacyPublishCurrentDir = Join-Path $bundlePublishRoot "current"
    $legacyPublishBundleVersionsDir = Join-Path $bundlePublishRoot "versions"

    $excludeDirs = @(
        ".git",
        ".codenomad",
        "dist",
        "package\node_modules",
        "package\bin\__pycache__"
    )

    Remove-PathIfExists -Path $versionStageDir
    Remove-PathIfExists -Path $legacyStageZip
    Remove-PathIfExists -Path $legacyVersionZip
    Remove-PathIfExists -Path $legacyStageVersionsRoot
    Remove-PathIfExists -Path $legacyStageCurrentDir
    Remove-PathIfExists -Path $legacyStageBundleVersionsDir

    Invoke-RobocopyMirror -Source $bundleRoot.FullName -Destination $versionStageDir -ExcludeDirectories $excludeDirs

    if (-not $SkipPublish) {
        Remove-PathIfExists -Path $legacyPublishZip
        Remove-PathIfExists -Path $legacyPublishVersionZip
        Remove-PathIfExists -Path $legacyPublishVersionsRoot
        Remove-PathIfExists -Path $legacyPublishCurrentDir
        Remove-PathIfExists -Path $legacyPublishBundleVersionsDir
        Invoke-RobocopyMirror -Source $versionStageDir -Destination $versionPublishDir
        Remove-DirectoryIfEmpty -Path (Join-Path $PublishRoot "versions")
    }

    Remove-DirectoryIfEmpty -Path (Join-Path $OutputRoot "versions")

    Write-Host "Built bundle: $bundleName@$bundleVersion"
    Write-Host "Local version dir: $versionStageDir"
    if (-not $SkipPublish) {
        Write-Host "Published version dir: $versionPublishDir"
    }
}
