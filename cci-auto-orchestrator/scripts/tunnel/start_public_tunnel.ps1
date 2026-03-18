param(
	[ValidateSet("ngrok", "serveo")]
	[string]$Provider = "ngrok",
	[string]$NgrokDomain = "",
	[string]$Subdomain = "cci-dashboard",
	[int]$LocalPort = 8000,
	[switch]$StopExisting,
	[bool]$EnableServeoFallback = $true
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root "runtime"
if (-not (Test-Path $runtimeDir)) {
	New-Item -ItemType Directory -Path $runtimeDir | Out-Null
}

$publicUrlPath = Join-Path $runtimeDir "public_url.txt"
$tunnelLogPath = Join-Path $runtimeDir "public_tunnel.log"
$tunnelErrLogPath = Join-Path $runtimeDir "public_tunnel.err.log"

function Write-PublicUrl {
	param([string]$Url)

	if (-not [string]::IsNullOrWhiteSpace($Url)) {
		Set-Content -Path $publicUrlPath -Value $Url -Encoding UTF8
	}
}

function Test-PublicUrlStatus {
	param([string]$BaseUrl)

	if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
		return 0
	}

	try {
		$resp = Invoke-WebRequest -Uri "$BaseUrl/auth/login" -UseBasicParsing -TimeoutSec 8 -MaximumRedirection 0
		return [int]$resp.StatusCode
	} catch {
		if ($_.Exception.Response) {
			return [int]$_.Exception.Response.StatusCode
		}
		return 0
	}
}

function Start-ServeoTunnel {
	param(
		[string]$SubdomainName,
		[int]$Port,
		[switch]$StopBeforeStart
	)

	if ($StopBeforeStart.IsPresent) {
		Get-Process ssh -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
		Start-Sleep -Seconds 1
	}

	$targetUrl = "https://$SubdomainName.serveousercontent.com"
	$sshArgs = @("-o", "StrictHostKeyChecking=no", "-R", "$SubdomainName:80:localhost:$Port", "serveo.net")
	Start-Process -FilePath "ssh" -ArgumentList $sshArgs -RedirectStandardOutput $tunnelLogPath -RedirectStandardError $tunnelErrLogPath | Out-Null

	Write-PublicUrl -Url $targetUrl
	Write-Host "Public URL: $targetUrl"
	Write-Host "Saved to: $publicUrlPath"
	return $targetUrl
}

function Test-LocalServer {
	param([int]$Port)

	try {
		$resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/auth/login" -UseBasicParsing -TimeoutSec 5
		return $resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500
	} catch {
		return $false
	}
}

if (-not (Test-LocalServer -Port $LocalPort)) {
	Write-Warning "Local server seems offline on http://127.0.0.1:$LocalPort"
	Write-Warning "Start the server first, then run this script again."
}

if ($Provider -eq "ngrok") {
	$ngrokCmd = Get-Command ngrok -ErrorAction SilentlyContinue
	if (-not $ngrokCmd) {
		throw "ngrok command not found. Install ngrok and configure authtoken first."
	}

	if ($StopExisting.IsPresent) {
		Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
		Start-Sleep -Seconds 1
	}

	$args = @("http")
	if (-not [string]::IsNullOrWhiteSpace($NgrokDomain)) {
		$args += "--domain=$NgrokDomain"
	}
	$args += "$LocalPort"

	Start-Process -FilePath $ngrokCmd.Source -ArgumentList $args -RedirectStandardOutput $tunnelLogPath -RedirectStandardError $tunnelErrLogPath | Out-Null

	$url = ""
	for ($i = 0; $i -lt 20; $i++) {
		Start-Sleep -Milliseconds 500
		try {
			$json = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 3
			$httpsTunnel = $json.tunnels | Where-Object { $_.public_url -like "https://*" } | Select-Object -First 1
			if ($httpsTunnel -and $httpsTunnel.public_url) {
				$url = "$($httpsTunnel.public_url)"
				break
			}
		} catch {
			# retry until timeout
		}
	}

	if (-not [string]::IsNullOrWhiteSpace($NgrokDomain)) {
		$url = "https://$NgrokDomain"
	}

	if ([string]::IsNullOrWhiteSpace($url)) {
		throw "Failed to resolve ngrok public URL. Check $tunnelLogPath"
	}

	$status = Test-PublicUrlStatus -BaseUrl $url
	if ($status -eq 403 -or $status -eq 404) {
		Write-Warning "ngrok URL check returned $status for $url"
		if ($EnableServeoFallback) {
			Write-Warning "Falling back to serveo tunnel..."
			$serveoUrl = Start-ServeoTunnel -SubdomainName $Subdomain -Port $LocalPort -StopBeforeStart:$StopExisting
			Write-Host "Fallback URL: $serveoUrl"
			exit 0
		}
	}

	Write-PublicUrl -Url $url
	Write-Host "Public URL: $url"
	Write-Host "Saved to: $publicUrlPath"
	exit 0
}

if ($Provider -eq "serveo") {
	$null = Start-ServeoTunnel -SubdomainName $Subdomain -Port $LocalPort -StopBeforeStart:$StopExisting
	exit 0
}
