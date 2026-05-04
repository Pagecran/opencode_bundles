param(
    [switch]$IncludeDeprecated
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Ensure-Bun {
    $bun = Get-Command bun -ErrorAction SilentlyContinue
    if ($null -eq $bun) {
        throw "bun is required to run repo checks."
    }

    return $bun.Source
}

function Invoke-BunScript {
    param(
        [string]$WorkingDirectory,
        [string[]]$Arguments,
        [string]$Label
    )

    Write-Host "==> $Label" -ForegroundColor Cyan
    Push-Location $WorkingDirectory
    try {
        & $script:BunPath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "bun $($Arguments -join ' ') failed in $WorkingDirectory with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

function Invoke-PowerShellScript {
    param(
        [string]$ScriptPath,
        [string[]]$Arguments,
        [string]$Label
    )

    Write-Host "==> $Label" -ForegroundColor Cyan
    & powershell -ExecutionPolicy Bypass -File $ScriptPath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$ScriptPath failed with exit code $LASTEXITCODE"
    }
}

$script:BunPath = Ensure-Bun

Invoke-BunScript -WorkingDirectory (Join-Path $RepoRoot "packages\bundle-runtime") -Arguments @("run", "check:types") -Label "Type-check shared runtime"
Invoke-BunScript -WorkingDirectory (Join-Path $RepoRoot "blender\package") -Arguments @("run", "check") -Label "Check Blender bundle"
Invoke-BunScript -WorkingDirectory (Join-Path $RepoRoot "m365\package") -Arguments @("run", "check") -Label "Check M365 bundle"
Invoke-BunScript -WorkingDirectory (Join-Path $RepoRoot "unreal\package") -Arguments @("run", "check") -Label "Check Unreal bundle"

if ($IncludeDeprecated) {
    Invoke-BunScript -WorkingDirectory (Join-Path $RepoRoot "teams\package") -Arguments @("run", "check:types") -Label "Type-check deprecated Teams bundle"
}

Invoke-PowerShellScript -ScriptPath (Join-Path $PSScriptRoot "sync_runtime.ps1") -Arguments @("-CheckOnly") -Label "Verify vendored runtime copies"
Invoke-PowerShellScript -ScriptPath (Join-Path $PSScriptRoot "build_bundle.ps1") -Arguments @("-Bundle", "all", "-SkipPublish") -Label "Build active bundles"

if ($IncludeDeprecated) {
    Invoke-PowerShellScript -ScriptPath (Join-Path $PSScriptRoot "build_bundle.ps1") -Arguments @("-Bundle", "teams", "-SkipPublish") -Label "Build deprecated Teams bundle"
}

Write-Host "All requested checks passed." -ForegroundColor Green
