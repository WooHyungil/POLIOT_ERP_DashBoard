param(
  [string]$Server = "http://127.0.0.1:8000",
  [string]$DeviceId,
  [string]$Name,
  [ValidateSet("android", "ios")]
  [string]$Platform,
  [string]$AppiumUrl,
  [string]$Udid
)

if (-not $DeviceId -or -not $Name -or -not $Platform -or -not $AppiumUrl -or -not $Udid) {
  Write-Error "DeviceId, Name, Platform, AppiumUrl, Udid are required"
  exit 1
}

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path ".venv")) {
  python -m venv .venv
}

. .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python .\agent\device_agent.py --server $Server --device-id $DeviceId --name $Name --platform $Platform --appium-url $AppiumUrl --udid $Udid
