param(
    [string]$Ref = "main",
    [string]$SourceUrl = "https://projects.blender.org/lab/blender_mcp.git",
    [string]$WorkRoot = "",
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

function Invoke-Git {
    param(
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )

    $previousLocation = Get-Location
    try {
        Set-Location -LiteralPath $WorkingDirectory
        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $output = & git @Arguments 2>&1 | Out-String
        $ErrorActionPreference = $previousErrorActionPreference
        if ($LASTEXITCODE -ne 0) {
            throw "git $($Arguments -join ' ') failed: $output"
        }
        return $output
    }
    finally {
        Set-Location -LiteralPath $previousLocation
    }
}

function Ensure-Repository {
    param(
        [string]$RepositoryPath
    )

    if (Test-Path -LiteralPath $RepositoryPath) {
        Invoke-Git -Arguments @("fetch", "--tags", "origin") -WorkingDirectory $RepositoryPath | Out-Null
        Set-RepositoryRef -RepositoryPath $RepositoryPath
        return
    }

    $parentPath = Split-Path -Parent $RepositoryPath
    if (-not (Test-Path -LiteralPath $parentPath)) {
        New-Item -ItemType Directory -Path $parentPath | Out-Null
    }

    & git clone $SourceUrl $RepositoryPath
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to clone $SourceUrl"
    }
    Set-RepositoryRef -RepositoryPath $RepositoryPath
}

function Set-RepositoryRef {
    param(
        [string]$RepositoryPath
    )

    $previousLocation = Get-Location
    try {
        Set-Location -LiteralPath $RepositoryPath
        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $remoteBranch = & git rev-parse --verify --quiet "origin/$Ref" 2>$null
        $remoteBranchExitCode = $LASTEXITCODE
        $ErrorActionPreference = $previousErrorActionPreference
    }
    finally {
        Set-Location -LiteralPath $previousLocation
    }

    if ($remoteBranchExitCode -eq 0 -and $remoteBranch) {
        Invoke-Git -Arguments @("checkout", "-B", $Ref, "origin/$Ref") -WorkingDirectory $RepositoryPath | Out-Null
        return
    }

    Invoke-Git -Arguments @("checkout", $Ref) -WorkingDirectory $RepositoryPath | Out-Null
}

function Get-RelativePathForSource {
    param(
        [string]$Path
    )

    return $Path.Replace("\", "/")
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$repoDriveRoot = (Split-Path -Qualifier $repoRoot) + "\"
if (-not $WorkRoot) {
    $WorkRoot = $repoDriveRoot
}
$targetRoot = Join-Path $repoRoot "blender\package\data\blender_docs"
$sourceRepo = Join-Path $WorkRoot "blender_mcp"

Ensure-Repository -RepositoryPath $sourceRepo

$commit = (Invoke-Git -Arguments @("rev-parse", "HEAD") -WorkingDirectory $sourceRepo).Trim()
$sourceApi = Join-Path $sourceRepo "mcp\blmcp\data\api"
$sourceManual = Join-Path $sourceRepo "mcp\blmcp\data\manual"
$sourcePaths = @($sourceApi, $sourceManual)

foreach ($sourcePath in $sourcePaths) {
    if (-not (Test-Path -LiteralPath $sourcePath)) {
        throw "Expected source path not found: $sourcePath"
    }
}

$sourceJsonPath = Join-Path $targetRoot "SOURCE.json"

if ($CheckOnly) {
    $errors = @()
    if (-not (Test-Path -LiteralPath $targetRoot)) {
        $errors += "Missing target dataset: $targetRoot"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $targetRoot "api\index.rst"))) {
        $errors += "Missing API docs index: api/index.rst"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $targetRoot "manual\index.rst"))) {
        $errors += "Missing manual docs index: manual/index.rst"
    }
    if (-not (Test-Path -LiteralPath $sourceJsonPath)) {
        $errors += "Missing provenance file: SOURCE.json"
    }
    else {
        $sourceJson = Get-Content -LiteralPath $sourceJsonPath -Raw | ConvertFrom-Json
        if ($sourceJson.commit -ne $commit) {
            $errors += "Blender docs are out of date. SOURCE.json commit=$($sourceJson.commit), upstream $Ref commit=$commit"
        }
    }

    if ($errors.Count -gt 0) {
        $errors | ForEach-Object { Write-Error $_ }
        exit 1
    }

    Write-Output "Blender docs are present and match $SourceUrl@$commit"
    exit 0
}

if (Test-Path -LiteralPath $targetRoot) {
    Remove-Item -LiteralPath $targetRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $targetRoot | Out-Null

Copy-Item -LiteralPath $sourceApi -Destination (Join-Path $targetRoot "api") -Recurse
Copy-Item -LiteralPath $sourceManual -Destination (Join-Path $targetRoot "manual") -Recurse

$sourceInfo = [ordered]@{
    source = $SourceUrl
    ref = $Ref
    commit = $commit
    updated_at = (Get-Date).ToUniversalTime().ToString("o")
    paths = @(
        [ordered]@{
            source = "mcp/blmcp/data/api"
            target = "api"
        },
        [ordered]@{
            source = "mcp/blmcp/data/manual"
            target = "manual"
        }
    )
}

$sourceJson = $sourceInfo | ConvertTo-Json -Depth 6
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($sourceJsonPath, $sourceJson + [Environment]::NewLine, $utf8NoBom)
Write-Output "Updated Blender docs from $SourceUrl@$commit into $targetRoot"
