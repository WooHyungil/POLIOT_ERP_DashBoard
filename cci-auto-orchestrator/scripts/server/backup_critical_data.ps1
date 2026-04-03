param(
  [string]$BackupRoot = "",
  [int]$KeepLatest = 40
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $BackupRoot) {
  $BackupRoot = Join-Path $root "runtime\backups"
}

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$targetDir = Join-Path $BackupRoot $stamp
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null

$critical = @(
  "config\users.json",
  "config\core\users.json",
  "config\core\employees.json",
  "config\dashboard_updates.json",
  "config\dashboard_update_state.json",
  "config\device_memory.json",
  "config\manage_schedules.json",
  "config\assets.json",
  "config\board_posts.json",
  "server\uploads\defectlist_raw_upload.xlsx",
  "server\uploads\full_tc_upload.xlsx"
)

foreach ($rel in $critical) {
  $src = Join-Path $root $rel
  if (-not (Test-Path $src)) {
    continue
  }
  $dest = Join-Path $targetDir $rel
  $destDir = Split-Path -Parent $dest
  New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  try {
    Copy-Item -Path $src -Destination $dest -Force
  } catch {
    Write-Warning "Backup skip: $rel ($($_.Exception.Message))"
  }
}

# retention
try {
  $dirs = Get-ChildItem -Path $BackupRoot -Directory | Sort-Object LastWriteTime
  $overflow = $dirs.Count - $KeepLatest
  if ($overflow -gt 0) {
    $dirs | Select-Object -First $overflow | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  }
} catch {
  Write-Warning "Backup retention skipped: $($_.Exception.Message)"
}

Write-Host "Backup completed: $targetDir"
