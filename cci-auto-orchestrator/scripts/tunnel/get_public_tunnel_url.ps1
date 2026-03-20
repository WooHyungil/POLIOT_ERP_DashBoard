param(
	[switch]$RefreshFromNgrokApi
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runtimeDir = Join-Path $root "runtime"
$publicUrlPath = Join-Path $runtimeDir "public_url.txt"

function Get-UrlFromNgrokApi {
	try {
		$json = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 3
		$httpsTunnel = $json.tunnels | Where-Object { $_.public_url -like "https://*" } | Select-Object -First 1
		if ($httpsTunnel -and $httpsTunnel.public_url) {
			return "$($httpsTunnel.public_url)"
		}
	} catch {
		return ""
	}
	return ""
}

$url = ""

if ($RefreshFromNgrokApi.IsPresent) {
	$url = Get-UrlFromNgrokApi
	if (-not [string]::IsNullOrWhiteSpace($url)) {
		if (-not (Test-Path $runtimeDir)) {
			New-Item -ItemType Directory -Path $runtimeDir | Out-Null
		}
		$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
		[System.IO.File]::WriteAllText($publicUrlPath, $url, $utf8NoBom)
		Write-Output $url
		exit 0
	}
}

if (Test-Path $publicUrlPath) {
	$url = (Get-Content -Path $publicUrlPath -Raw -Encoding UTF8).Trim()
}

if ([string]::IsNullOrWhiteSpace($url)) {
	$url = Get-UrlFromNgrokApi
	if (-not [string]::IsNullOrWhiteSpace($url)) {
		if (-not (Test-Path $runtimeDir)) {
			New-Item -ItemType Directory -Path $runtimeDir | Out-Null
		}
		$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
		[System.IO.File]::WriteAllText($publicUrlPath, $url, $utf8NoBom)
	}
}

if ([string]::IsNullOrWhiteSpace($url)) {
	Write-Error "No active public tunnel URL found."
	exit 1
}

Write-Output $url
