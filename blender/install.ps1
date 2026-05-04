param(
    [string]$SourceRoot = (Join-Path $PSScriptRoot "package"),
    [string]$ConfigRoot = (Join-Path $env:USERPROFILE ".config\opencode"),
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

Ensure-Directory -Path $ConfigRoot

Merge-PackageJson

Install-DirectoryTree -RelativeSource "plugins" -RelativeTarget "bundles\blender\plugins"
Install-DirectoryTree -RelativeSource "runtime" -RelativeTarget "bundles\blender\runtime"
Install-DirectoryTree -RelativeSource "_runtime" -RelativeTarget "bundles\blender\_runtime"
Install-DirectoryTree -RelativeSource "methods" -RelativeTarget "bundles\blender\methods"
Install-DirectoryTree -RelativeSource "scripts" -RelativeTarget "bundles\blender\scripts"
Install-PluginShim -PluginName "blender" -BundleName "blender"
Write-GlobalTsConfig

# Clean up legacy files from previous versions
$legacyFiles = @(
    "plugins\pagecran.ts",
    "commands\blender-scene.md",
    "commands\blender-gn.md",
    "commands\blender-shader.md",
    "commands\blender-assets.md",
    "commands\blender-blenderkit.md",
    "commands\blender-sketchfab.md",
    "commands\blender-bradley.md",
    "commands\blender-animation.md",
    "commands\blender-shots.md"
)
foreach ($legacy in $legacyFiles) {
    $legacyPath = Join-Path $ConfigRoot $legacy
    if (Test-Path -LiteralPath $legacyPath) {
        Remove-Item -LiteralPath $legacyPath -Force
        Write-Host "Removed legacy file: $legacy"
    }
}

# Clean up skills merged into parent skills (Bradley→GN, BlenderKit→AssetBrowser, Sketchfab→AssetBrowser)
$legacySkills = @(
    "skills\pagecran-blender-blenderkit",
    "skills\pagecran-blender-sketchfab",
    "skills\pagecran-blender-bradley-presets"
)
foreach ($legacy in $legacySkills) {
    $legacyPath = Join-Path $ConfigRoot $legacy
    if (Test-Path -LiteralPath $legacyPath) {
        Remove-Item -LiteralPath $legacyPath -Recurse -Force
        Write-Host "Removed merged skill: $legacy"
    }
}

Install-File -RelativeSource "bin\pagecran_blender_cli.py" -RelativeTarget "bin\pagecran_blender_cli.py"

Install-DirectoryTree -RelativeSource "skills\pagecran-blender-scene" -RelativeTarget "skills\pagecran-blender-scene"
Install-DirectoryTree -RelativeSource "skills\pagecran-blender-geometry-nodes" -RelativeTarget "skills\pagecran-blender-geometry-nodes"
Install-DirectoryTree -RelativeSource "skills\pagecran-blender-shader-editor" -RelativeTarget "skills\pagecran-blender-shader-editor"
Install-DirectoryTree -RelativeSource "skills\pagecran-blender-asset-browser" -RelativeTarget "skills\pagecran-blender-asset-browser"
Install-DirectoryTree -RelativeSource "skills\pagecran-blender-animation" -RelativeTarget "skills\pagecran-blender-animation"
Install-DirectoryTree -RelativeSource "skills\pagecran-blender-shot-manager" -RelativeTarget "skills\pagecran-blender-shot-manager"

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

Write-Host "Pagecran OpenWork global bundle installed to $ConfigRoot"
