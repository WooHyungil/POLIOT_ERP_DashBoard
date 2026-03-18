param(
  [string]$HostAddr = "0.0.0.0",
  [int]$Port = 8000,
  [string]$ConfigPath = ".\config\devices.json",
  [bool]$AutoDetectAndroid = $true
)

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  Write-Error "Python not found. Install Python 3.10+ first."
  exit 1
}

if (-not (Test-Path ".venv")) {
  python -m venv .venv
}

. .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt | Out-Null

$bindHost = $HostAddr
$localUrl = "http://127.0.0.1:$Port"
$serverUrlForAgent = if ($bindHost -eq "0.0.0.0") { $localUrl } else { "http://$bindHost`:$Port" }

function Get-LanIPv4 {
  try {
    $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object {
        $_.IPAddress -ne "127.0.0.1" -and
        $_.PrefixOrigin -ne "WellKnown" -and
        $_.IPAddress -notlike "169.254.*"
      }
    if ($ips) {
      return ($ips | Select-Object -First 1).IPAddress
    }
  } catch {
    return ""
  }
  return ""
}

function Ensure-FirewallRule {
  param(
    [int]$Port
  )

  try {
    $ruleName = "CCI-Automation-$Port"
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if (-not $existing) {
      New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private | Out-Null
      Write-Host "Windows Firewall inbound rule added: $ruleName"
    }
  } catch {
    Write-Warning "Failed to configure firewall automatically. Allow inbound TCP $Port manually."
  }
}

if ($bindHost -eq "0.0.0.0") {
  Ensure-FirewallRule -Port $Port
}

function Get-AndroidSdkRoot {
  if ($env:ANDROID_SDK_ROOT -and (Test-Path $env:ANDROID_SDK_ROOT)) {
    return $env:ANDROID_SDK_ROOT
  }
  if ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) {
    return $env:ANDROID_HOME
  }

  $adbCmd = Get-Command adb -ErrorAction SilentlyContinue
  if ($adbCmd -and $adbCmd.Source) {
    $adbPath = $adbCmd.Source
    $platformToolsDir = Split-Path -Parent $adbPath
    $sdkRootGuess = Split-Path -Parent $platformToolsDir
    if (Test-Path (Join-Path $sdkRootGuess "platform-tools")) {
      return $sdkRootGuess
    }
  }
  return ""
}

$androidSdkRoot = Get-AndroidSdkRoot
if ($androidSdkRoot) {
  $env:ANDROID_HOME = $androidSdkRoot
  $env:ANDROID_SDK_ROOT = $androidSdkRoot
  Write-Host "Android SDK root detected: $androidSdkRoot"
} else {
  Write-Warning "Android SDK root not found. Set ANDROID_HOME or ANDROID_SDK_ROOT manually."
}

if ($AutoDetectAndroid) {
  try {
    & .\scripts\auto_detect_devices.ps1 -OutputPath $ConfigPath -StartPort 4723
  } catch {
    Write-Warning "Auto detect failed: $($_.Exception.Message)"
  }
}

Start-Process powershell -ArgumentList @(
  "-NoLogo",
  "-NoProfile",
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-File", ".\scripts\start_server.ps1",
  "-HostAddr", $bindHost,
  "-Port", "$Port"
)

Start-Sleep -Seconds 3
Start-Process $localUrl

if (-not (Test-Path $ConfigPath)) {
  Write-Warning "Device config not found: $ConfigPath"
  exit 0
}

$devices = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$deviceList = @($devices)
$enabledDevices = @($deviceList | Where-Object { $_.enabled })
if ($enabledDevices.Count -eq 0) {
  Write-Warning "No enabled devices in config. Connect device then run again."
  exit 0
}

$isWindows = $PSVersionTable.Platform -eq "Win32NT" -or $env:OS -eq "Windows_NT"
$startedLocalAppiumPorts = @{}

foreach ($d in $enabledDevices) {
  $platform = ("$($d.platform)").ToLower()
  if (-not $platform) {
    Write-Warning "Skipping device with missing platform: $($d.deviceId)"
    continue
  }

  $configuredUrl = ""
  if ($null -ne $d.PSObject.Properties["appiumUrl"] -and $d.appiumUrl) {
    $configuredUrl = "$($d.appiumUrl)"
  }

  $appiumPort = $null
  if ($null -ne $d.PSObject.Properties["appiumPort"] -and $d.appiumPort) {
    $appiumPort = [int]$d.appiumPort
  }

  $useRemoteAppium = $false
  if ($configuredUrl) {
    $useRemoteAppium = $true
    $appiumUrl = $configuredUrl
  } elseif ($appiumPort) {
    $appiumUrl = "http://127.0.0.1:$appiumPort"
  } else {
    Write-Warning "Skipping device $($d.deviceId): appiumUrl or appiumPort is required."
    continue
  }

  if (-not $useRemoteAppium) {
    if ($platform -eq "ios" -and $isWindows) {
      Write-Warning "Skipping iOS device $($d.deviceId) on Windows without remote appiumUrl. Configure a Mac Appium server and set appiumUrl."
      continue
    }

    if (-not (Get-Command appium -ErrorAction SilentlyContinue)) {
      Write-Error "Appium command not found. Run: npm install -g appium"
      exit 1
    }

    if (-not $startedLocalAppiumPorts.ContainsKey($appiumPort)) {
      $appiumCommand = "appium -p $appiumPort"
      if ($androidSdkRoot) {
        $appiumCommand = "`$env:ANDROID_HOME='$androidSdkRoot'; `$env:ANDROID_SDK_ROOT='$androidSdkRoot'; appium -p $appiumPort"
      }

      Start-Process powershell -ArgumentList @(
        "-NoLogo",
        "-NoProfile",
        "-NoExit",
        "-Command",
        $appiumCommand
      )

      $startedLocalAppiumPorts[$appiumPort] = $true
      Start-Sleep -Seconds 2
    }
  }

  Start-Process powershell -ArgumentList @(
    "-NoLogo",
    "-NoProfile",
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-File", ".\scripts\start_agent.ps1",
    "-Server", $serverUrlForAgent,
    "-DeviceId", "$($d.deviceId)",
    "-Name", "$($d.name)",
    "-Platform", $platform,
    "-AppiumUrl", $appiumUrl,
    "-Udid", "$($d.udid)"
  )
}

$lanIp = Get-LanIPv4
if ($bindHost -eq "0.0.0.0" -and $lanIp) {
  $lanUrl = "http://${lanIp}:$Port"
  Write-Host "All startup processes launched."
  Write-Host "Local Dashboard: $localUrl"
  Write-Host "LAN Share URL: $lanUrl"
  Write-Host "If others cannot connect, allow inbound TCP $Port in Windows Firewall."
} else {
  Write-Host "All startup processes launched. Dashboard: $serverUrlForAgent"
}
