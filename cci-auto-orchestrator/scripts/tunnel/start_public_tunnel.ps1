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

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
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
		$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
		[System.IO.File]::WriteAllText($publicUrlPath, $Url, $utf8NoBom)
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

function Test-PublicUrlHealthy {
	param([string]$BaseUrl)

	$status = Test-PublicUrlStatus -BaseUrl $BaseUrl
	return $status -ge 200 -and $status -lt 400
}

function Resolve-NgrokUrl {
	param([string]$PreferredDomain)

	for ($i = 0; $i -lt 20; $i++) {
		Start-Sleep -Milliseconds 500
		try {
			$json = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 3
			$httpsTunnels = @($json.tunnels | Where-Object { $_.public_url -like "https://*" })
			if ($httpsTunnels.Count -eq 0) {
				continue
			}

			if (-not [string]::IsNullOrWhiteSpace($PreferredDomain)) {
				$preferred = $httpsTunnels | Where-Object { $_.public_url -eq "https://$PreferredDomain" } | Select-Object -First 1
				if ($preferred -and $preferred.public_url) {
					return "$($preferred.public_url)"
				}
			}

			$first = $httpsTunnels | Select-Object -First 1
			if ($first -and $first.public_url) {
				return "$($first.public_url)"
			}
		} catch {
			# retry until timeout
		}
	}

	return ""
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

	$resolvedUrl = ""
	for ($i = 0; $i -lt 20; $i++) {
		Start-Sleep -Milliseconds 500
		if (-not (Test-Path $tunnelLogPath)) {
			continue
		}
		$raw = (Get-Content -Path $tunnelLogPath -Raw -ErrorAction SilentlyContinue)
		if ([string]::IsNullOrWhiteSpace($raw)) {
			continue
		}

		$httpMatch = [regex]::Match($raw, "https?://[^\s`\"']+")
		if ($httpMatch.Success) {
			$resolvedUrl = $httpMatch.Value.Trim()
			break
		}

		$tcpMatch = [regex]::Match($raw, "Forwarding TCP connections from\s+([^\s:]+):(\d+)")
		if ($tcpMatch.Success) {
			$host = $tcpMatch.Groups[1].Value
			$p = $tcpMatch.Groups[2].Value
			if ($host -and $p) {
				$resolvedUrl = "http://$host`:$p"
				break
			}
		}
	}

	if ([string]::IsNullOrWhiteSpace($resolvedUrl)) {
		$resolvedUrl = $targetUrl
	}

	Write-PublicUrl -Url $resolvedUrl
	Write-Host "Public URL: $resolvedUrl"
	Write-Host "Saved to: $publicUrlPath"
	return $resolvedUrl
}

function Start-NgrokTunnel {
	param(
		[string]$Domain,
		[int]$Port,
		[switch]$StopBeforeStart
	)

	$ngrokCmd = Get-Command ngrok -ErrorAction SilentlyContinue
	if (-not $ngrokCmd) {
		throw "ngrok command not found. Install ngrok and configure authtoken first."
	}

	if ($StopBeforeStart.IsPresent) {
		Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
		Start-Sleep -Seconds 1
	}

	$args = @("http")
	if (-not [string]::IsNullOrWhiteSpace($Domain)) {
		$args += "--domain=$Domain"
	}
	$args += "$Port"

	Start-Process -FilePath $ngrokCmd.Source -ArgumentList $args -RedirectStandardOutput $tunnelLogPath -RedirectStandardError $tunnelErrLogPath | Out-Null
	return (Resolve-NgrokUrl -PreferredDomain $Domain)
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
	$url = Start-NgrokTunnel -Domain $NgrokDomain -Port $LocalPort -StopBeforeStart:$StopExisting
	if ([string]::IsNullOrWhiteSpace($url)) {
		throw "Failed to resolve ngrok public URL. Check $tunnelLogPath"
	}

	$status = Test-PublicUrlStatus -BaseUrl $url
	if (-not (Test-PublicUrlHealthy -BaseUrl $url)) {
		Write-Warning "ngrok URL check returned $status for $url"

		# Static domain failure case: retry with random ngrok URL.
		if (-not [string]::IsNullOrWhiteSpace($NgrokDomain)) {
			Write-Warning "Retrying ngrok without fixed domain..."
			$url2 = Start-NgrokTunnel -Domain "" -Port $LocalPort -StopBeforeStart:$true
			if (-not [string]::IsNullOrWhiteSpace($url2)) {
				$status2 = Test-PublicUrlStatus -BaseUrl $url2
				if (Test-PublicUrlHealthy -BaseUrl $url2) {
					Write-PublicUrl -Url $url2
					Write-Host "Public URL: $url2"
					Write-Host "Saved to: $publicUrlPath"
					exit 0
				}
				Write-Warning "Random ngrok URL check returned $status2 for $url2"
			}
		}

		if ($EnableServeoFallback) {
			Write-Warning "Falling back to serveo tunnel..."
			$serveoUrl = Start-ServeoTunnel -SubdomainName $Subdomain -Port $LocalPort -StopBeforeStart:$true
			Start-Sleep -Seconds 2
			$serveoStatus = Test-PublicUrlStatus -BaseUrl $serveoUrl
			if (Test-PublicUrlHealthy -BaseUrl $serveoUrl) {
				Write-Host "Fallback URL: $serveoUrl"
				exit 0
			}
			Write-Warning "Serveo URL check returned $serveoStatus for $serveoUrl"
			throw "All public tunnel options failed. Last statuses: ngrok=$status, serveo=$serveoStatus"
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
