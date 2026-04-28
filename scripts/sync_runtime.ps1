param(
    [string[]]$Bundles = @("blender", "unreal", "m365"),
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$source = Join-Path $repoRoot "packages\bundle-runtime\src"

function Get-FileSha256 {
    param([string]$Path)

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $hashBytes = $sha256.ComputeHash($stream)
        return [System.BitConverter]::ToString($hashBytes).Replace("-", "")
    }
    finally {
        $stream.Dispose()
        $sha256.Dispose()
    }
}

function Get-RelativeFileHashes {
    param([string]$Root)

    $hashes = @{}
    if (-not (Test-Path -LiteralPath $Root)) {
        return $hashes
    }

    $rootPrefix = (Resolve-Path -LiteralPath $Root).Path.TrimEnd("\") + "\"
    $files = @(Get-ChildItem -LiteralPath $Root -Recurse -File | Sort-Object FullName)

    foreach ($file in $files) {
        $relativePath = $file.FullName.Substring($rootPrefix.Length).Replace("\", "/")
        $hashes[$relativePath] = Get-FileSha256 -Path $file.FullName
    }

    return $hashes
}

function Compare-RuntimeCopy {
    param(
        [string]$Source,
        [string]$Target
    )

    $errors = [System.Collections.Generic.List[string]]::new()

    if (-not (Test-Path -LiteralPath $Target)) {
        $errors.Add("Missing runtime copy: $Target")
        return $errors
    }

    $sourceHashes = Get-RelativeFileHashes -Root $Source
    $targetHashes = Get-RelativeFileHashes -Root $Target

    foreach ($path in ($sourceHashes.Keys | Sort-Object)) {
        if (-not $targetHashes.ContainsKey($path)) {
            $errors.Add("Missing file in ${Target}: $path")
            continue
        }

        if ($sourceHashes[$path] -ne $targetHashes[$path]) {
            $errors.Add("Outdated file in ${Target}: $path")
        }
    }

    foreach ($path in ($targetHashes.Keys | Sort-Object)) {
        if (-not $sourceHashes.ContainsKey($path)) {
            $errors.Add("Extra file in ${Target}: $path")
        }
    }

    return $errors
}

$allErrors = [System.Collections.Generic.List[string]]::new()

if (-not (Test-Path -LiteralPath $source)) {
    throw "Source not found: $source"
}

foreach ($bundle in $Bundles) {
    $target = Join-Path $repoRoot "$bundle\package\_runtime"

    if ($CheckOnly) {
        Write-Host "Checking $source -> $target" -ForegroundColor Cyan
        $errors = Compare-RuntimeCopy -Source $source -Target $target
        foreach ($errorMessage in $errors) {
            $allErrors.Add("${bundle}: $errorMessage")
        }
        continue
    }

    Write-Host "Syncing $source -> $target" -ForegroundColor Cyan

    if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Recurse -Force
    }

    New-Item -ItemType Directory -Path $target -Force | Out-Null
    Copy-Item -Path (Join-Path $source "*") -Destination $target -Recurse -Force
}

if ($CheckOnly) {
    if ($allErrors.Count -gt 0) {
        throw "Runtime sync check failed:`n$($allErrors -join "`n")"
    }

    Write-Host "Runtime copies are up to date." -ForegroundColor Green
    exit 0
}

Write-Host "Done." -ForegroundColor Green
