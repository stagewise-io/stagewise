$ErrorActionPreference = 'Stop'

Write-Host '[stagewise setup] started'
Write-Host "cwd: $(Get-Location)"
$sourceWorktreePath = if ([string]::IsNullOrWhiteSpace($env:STAGEWISE_SOURCE_WORKTREE_PATH)) { 'unset' } else { $env:STAGEWISE_SOURCE_WORKTREE_PATH }
$targetWorktreePath = if ([string]::IsNullOrWhiteSpace($env:STAGEWISE_TARGET_WORKTREE_PATH)) { 'unset' } else { $env:STAGEWISE_TARGET_WORKTREE_PATH }
$mainWorktreePath = if ([string]::IsNullOrWhiteSpace($env:STAGEWISE_MAIN_WORKTREE_PATH)) { 'unset' } else { $env:STAGEWISE_MAIN_WORKTREE_PATH }

Write-Host "source worktree: $sourceWorktreePath"
Write-Host "target worktree: $targetWorktreePath"
Write-Host "main worktree: $mainWorktreePath"

if ([string]::IsNullOrWhiteSpace($env:STAGEWISE_MAIN_WORKTREE_PATH)) {
  throw 'STAGEWISE_MAIN_WORKTREE_PATH is not set'
}

if ([string]::IsNullOrWhiteSpace($env:STAGEWISE_TARGET_WORKTREE_PATH)) {
  throw 'STAGEWISE_TARGET_WORKTREE_PATH is not set'
}

$mainEnvFile = Join-Path $env:STAGEWISE_MAIN_WORKTREE_PATH '.env.dev'
$targetEnvFile = Join-Path $env:STAGEWISE_TARGET_WORKTREE_PATH '.env.dev'

if (-not (Test-Path -LiteralPath $mainEnvFile -PathType Leaf)) {
  throw "Missing $mainEnvFile"
}

Write-Host '[stagewise setup] copying .env.dev from main worktree'
Copy-Item -LiteralPath $mainEnvFile -Destination $targetEnvFile -Force

$nucleoLicenseKey = $null
foreach ($line in Get-Content -LiteralPath $targetEnvFile) {
  if ($line -match '^\s*(?:export\s+)?NUCLEO_LICENSE_KEY\s*=\s*(.*)\s*$') {
    $nucleoLicenseKey = $matches[1].Trim()
    if (
      ($nucleoLicenseKey.StartsWith('"') -and $nucleoLicenseKey.EndsWith('"')) -or
      ($nucleoLicenseKey.StartsWith("'") -and $nucleoLicenseKey.EndsWith("'"))
    ) {
      $nucleoLicenseKey = $nucleoLicenseKey.Substring(1, $nucleoLicenseKey.Length - 2)
    } else {
      $nucleoLicenseKey = ($nucleoLicenseKey -replace '\s+#.*$', '').Trim()
    }
    break
  }
}

if ([string]::IsNullOrWhiteSpace($nucleoLicenseKey)) {
  throw 'NUCLEO_LICENSE_KEY is missing in .env.dev'
}

$env:NUCLEO_LICENSE_KEY = $nucleoLicenseKey

Set-Location -LiteralPath $env:STAGEWISE_TARGET_WORKTREE_PATH

Write-Host '[stagewise setup] running pnpm install'
pnpm install
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host '[stagewise setup] running pnpm build'
pnpm build
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host '[stagewise setup] finished'
