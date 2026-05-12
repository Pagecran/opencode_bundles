param(
    [string]$SourceRoot = (Join-Path $PSScriptRoot "package"),
    [string]$ConfigRoot = (Join-Path $env:USERPROFILE ".config\opencode"),
    [string[]]$AfterEffectsScriptsDir = @(),
    [switch]$SkipBridgeInstall,
    [switch]$SkipBunInstall
)

$ErrorActionPreference = "Stop"

function Ensure-Directory {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Install-File {
    param(
        [string]$RelativeSource,
        [string]$RelativeTarget
    )

    $sourcePath = Join-Path $SourceRoot $RelativeSource
    $targetPath = Join-Path $ConfigRoot $RelativeTarget
    $targetDir = Split-Path -Parent $targetPath

    if (-not (Test-Path -LiteralPath $sourcePath)) {
        throw "Missing source file: $sourcePath"
    }

    Ensure-Directory -Path $targetDir
    Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
    Write-Host "Installed file: $RelativeTarget"
}

function Install-DirectoryTree {
    param(
        [string]$RelativeSource,
        [string]$RelativeTarget
    )

    $sourcePath = Join-Path $SourceRoot $RelativeSource
    $targetPath = Join-Path $ConfigRoot $RelativeTarget

    if (-not (Test-Path -LiteralPath $sourcePath)) {
        throw "Missing source directory: $sourcePath"
    }

    if (Test-Path -LiteralPath $targetPath) {
        Remove-Item -LiteralPath $targetPath -Recurse -Force
    }

    Ensure-Directory -Path (Split-Path -Parent $targetPath)
    Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Recurse -Force
    Write-Host "Installed directory: $RelativeTarget"
}

function ConvertTo-PlainObject {
    param($Value)

    if ($null -eq $Value) {
        return $null
    }

    if (
        $Value -is [string] -or
        $Value -is [char] -or
        $Value -is [bool] -or
        $Value -is [byte] -or
        $Value -is [int16] -or
        $Value -is [int32] -or
        $Value -is [int64] -or
        $Value -is [uint16] -or
        $Value -is [uint32] -or
        $Value -is [uint64] -or
        $Value -is [single] -or
        $Value -is [double] -or
        $Value -is [decimal]
    ) {
        return $Value
    }

    if ($Value -is [System.Collections.IDictionary]) {
        $result = @{}
        foreach ($key in $Value.Keys) {
            $result[$key] = ConvertTo-PlainObject -Value $Value[$key]
        }
        return $result
    }

    if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
        $items = @()
        foreach ($item in $Value) {
            $items += ,(ConvertTo-PlainObject -Value $item)
        }
        return $items
    }

    if ($Value.PSObject -and $Value.PSObject.Properties.Count -gt 0) {
        $result = @{}
        foreach ($property in $Value.PSObject.Properties) {
            $result[$property.Name] = ConvertTo-PlainObject -Value $property.Value
        }
        return $result
    }

    return $Value
}

function Merge-PackageJson {
    $sourcePath = Join-Path $SourceRoot "package.json"
    $targetPath = Join-Path $ConfigRoot "package.json"

    if (-not (Test-Path -LiteralPath $sourcePath)) {
        return
    }

    $sourceJson = ConvertTo-PlainObject -Value (Get-Content -LiteralPath $sourcePath -Raw | ConvertFrom-Json)
    $targetJson = @{}

    if (Test-Path -LiteralPath $targetPath) {
        $targetJson = ConvertTo-PlainObject -Value (Get-Content -LiteralPath $targetPath -Raw | ConvertFrom-Json)
    }

    foreach ($key in @("name", "private", "type")) {
        if (-not $targetJson.ContainsKey($key) -and $sourceJson.ContainsKey($key)) {
            $targetJson[$key] = $sourceJson[$key]
        }
    }

    foreach ($depSection in @("dependencies", "devDependencies")) {
        if (-not $sourceJson.ContainsKey($depSection)) {
            continue
        }

        if (-not $targetJson.ContainsKey($depSection)) {
            $targetJson[$depSection] = @{}
        }

        foreach ($depName in $sourceJson[$depSection].Keys) {
            $targetJson[$depSection][$depName] = $sourceJson[$depSection][$depName]
        }
    }

    $jsonOut = $targetJson | ConvertTo-Json -Depth 20
    Set-Content -LiteralPath $targetPath -Value $jsonOut -Encoding UTF8
    Write-Host "Merged package.json"
}

function Write-GlobalTsConfig {
    $targetPath = Join-Path $ConfigRoot "tsconfig.json"
    $jsonOut = @'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "types": [
      "node"
    ]
  },
  "include": [
    "plugins/**/*.ts",
    "bundles/**/*.ts"
  ]
}
'@

    Set-Content -LiteralPath $targetPath -Value $jsonOut -Encoding UTF8
    Write-Host "Installed file: tsconfig.json"
}

function Install-PluginShim {
    param(
        [string]$PluginName,
        [string]$BundleName
    )

    $targetPath = Join-Path $ConfigRoot "plugins\$PluginName.ts"
    $contents = @"
export { default } from "../bundles/$BundleName/plugins/$PluginName"
export * from "../bundles/$BundleName/plugins/$PluginName"
"@

    Ensure-Directory -Path (Split-Path -Parent $targetPath)
    Set-Content -LiteralPath $targetPath -Value $contents -Encoding UTF8
    Write-Host "Installed file: plugins\$PluginName.ts"
}

function Get-AfterEffectsBridgeRoot {
    $configured = $env:PAGECRAN_AFTEREFFECTS_BRIDGE_DIR
    if ([string]::IsNullOrWhiteSpace($configured)) {
        $configured = $env:AE_BRIDGE_DIR
    }

    if (-not [string]::IsNullOrWhiteSpace($configured)) {
        return $configured.Trim()
    }

    $localAppData = $env:LOCALAPPDATA
    if ([string]::IsNullOrWhiteSpace($localAppData)) {
        $localAppData = Join-Path $env:USERPROFILE "AppData\Local"
    }

    return (Join-Path $localAppData "Pagecran\AfterEffectsBridge")
}

function Initialize-AfterEffectsBridgeFolder {
    $bridgeRoot = Get-AfterEffectsBridgeRoot
    Ensure-Directory -Path $bridgeRoot
    Ensure-Directory -Path (Join-Path $bridgeRoot "commands")
    Ensure-Directory -Path (Join-Path $bridgeRoot "results")
    Write-Host "Prepared bridge folder: $bridgeRoot"
}

function Get-AfterEffectsScriptUIPanelDirectories {
    param([string[]]$RequestedDirectories = @())

    $targets = @()

    foreach ($requested in $RequestedDirectories) {
        if (-not [string]::IsNullOrWhiteSpace($requested)) {
            $targets += $requested.Trim()
        }
    }

    if ($targets.Count -gt 0) {
        return @($targets | Select-Object -Unique)
    }

    $configured = $env:PAGECRAN_AFTEREFFECTS_SCRIPTS_DIR
    if (-not [string]::IsNullOrWhiteSpace($configured)) {
        return @($configured.Trim())
    }

    $programFiles = $env:ProgramFiles
    if ([string]::IsNullOrWhiteSpace($programFiles)) {
        return @()
    }

    $adobeRoot = Join-Path $programFiles "Adobe"
    if (-not (Test-Path -LiteralPath $adobeRoot)) {
        return @()
    }

    $installs = @(Get-ChildItem -LiteralPath $adobeRoot -Directory | Where-Object {
        $_.Name -like "Adobe After Effects*"
    } | Sort-Object Name -Descending)

    foreach ($install in $installs) {
        $scriptsRoot = Join-Path $install.FullName "Support Files\Scripts"
        if (-not (Test-Path -LiteralPath $scriptsRoot)) {
            continue
        }

        $targets += Join-Path $scriptsRoot "ScriptUI Panels"
    }

    return @($targets | Select-Object -Unique)
}

function Install-AfterEffectsBridge {
    param([string[]]$RequestedDirectories = @())

    $sourcePath = Join-Path $SourceRoot "scripts\pagecran-ae-bridge.jsx"
    if (-not (Test-Path -LiteralPath $sourcePath)) {
        throw "Missing After Effects bridge source: $sourcePath"
    }

    $targets = @(Get-AfterEffectsScriptUIPanelDirectories -RequestedDirectories $RequestedDirectories)
    if ($targets.Count -eq 0) {
        Write-Warning "No After Effects ScriptUI Panels directory was detected. Use -AfterEffectsScriptsDir or run pagecran_aftereffects_cli.mjs install-bridge --target <dir>."
        return
    }

    foreach ($targetDir in $targets) {
        Ensure-Directory -Path $targetDir
        $targetPath = Join-Path $targetDir "pagecran-ae-bridge.jsx"
        Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
        Write-Host "Installed After Effects bridge: $targetPath"
    }
}

Ensure-Directory -Path $ConfigRoot

Merge-PackageJson

Install-DirectoryTree -RelativeSource "plugins" -RelativeTarget "bundles\aftereffects\plugins"
Install-DirectoryTree -RelativeSource "runtime" -RelativeTarget "bundles\aftereffects\runtime"
Install-DirectoryTree -RelativeSource "_runtime" -RelativeTarget "bundles\aftereffects\_runtime"
Install-DirectoryTree -RelativeSource "methods" -RelativeTarget "bundles\aftereffects\methods"
Install-DirectoryTree -RelativeSource "scripts" -RelativeTarget "bundles\aftereffects\scripts"
Install-PluginShim -PluginName "aftereffects" -BundleName "aftereffects"
Write-GlobalTsConfig
Initialize-AfterEffectsBridgeFolder

Install-File -RelativeSource "bin\pagecran_aftereffects_cli.mjs" -RelativeTarget "bin\pagecran_aftereffects_cli.mjs"
Install-DirectoryTree -RelativeSource "skills\pagecran-aftereffects-project" -RelativeTarget "skills\pagecran-aftereffects-project"

if (-not $SkipBridgeInstall) {
    Install-AfterEffectsBridge -RequestedDirectories $AfterEffectsScriptsDir
}

if (-not $SkipBunInstall) {
    $bun = Get-Command bun -ErrorAction SilentlyContinue
    if ($null -ne $bun) {
        Push-Location $ConfigRoot
        try {
            & $bun.Source install
            if ($LASTEXITCODE -ne 0) {
                throw "bun install failed with exit code $LASTEXITCODE"
            }
            Write-Host "Ran bun install in $ConfigRoot"
        }
        finally {
            Pop-Location
        }
    }
    else {
        Write-Warning "bun was not found. Skipping dependency installation."
    }
}

Write-Host "Pagecran After Effects bundle installed to $ConfigRoot"
