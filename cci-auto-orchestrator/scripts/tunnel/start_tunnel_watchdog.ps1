param(
	[ValidateSet("ngrok", "serveo", "localhostrun", "cloudflared", "localtunnel")]
	[string]$Provider = "localtunnel",
	[string]$NgrokDomain = "",
	[string]$Subdomain = "cci-dashboard",
	[string]$LocalTunnelSubdomain = "",
	[int]$LocalPort = 8000,
	[int]$CheckIntervalSec = 30,
	[int]$ForceRefreshMinutes = 240,
	[int]$MaxConsecutiveFailures = 2,
	[bool]$EnableLocalhostRunFallback = $false,
	[bool]$EnableCloudflaredFallback = $true,
	[bool]$EnableLocalTunnelFallback = $true,
	[bool]$EnableServeoFallback = $true
)

$ErrorActionPreference = "Continue"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runtimeDir = Join-Path $root "runtime"
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

$watchdogLogPath = Join-Path $runtimeDir "tunnel_watchdog.log"
$statePath = Join-Path $runtimeDir "tunnel_watchdog.state.json"
$publicUrlPath = Join-Path $runtimeDir "public_url.txt"
$startTunnelScript = Join-Path $root "scripts\tunnel\start_public_tunnel.ps1"
$lockPath = Join-Path $runtimeDir "tunnel_watchdog.lock"

function Get-ProviderSequence {
	param([string]$PreferredProvider)

	$order = New-Object System.Collections.Generic.List[string]
	$seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

	function Add-Provider([string]$Name) {
		if ([string]::IsNullOrWhiteSpace($Name)) {
			return
		}
		if ($seen.Add($Name)) {
			[void]$order.Add($Name)
		}
	}

	Add-Provider $PreferredProvider
	if ($EnableCloudflaredFallback) { Add-Provider "cloudflared" }
	if ($EnableLocalTunnelFallback) { Add-Provider "localtunnel" }
	if ($EnableServeoFallback) { Add-Provider "serveo" }
	if ($EnableLocalhostRunFallback) { Add-Provider "localhostrun" }
	if ($PreferredProvider -eq "ngrok") { Add-Provider "ngrok" }

	if ($order.Count -eq 0) {
		Add-Provider $Provider
	}

	return @($order)
}

function Test-UsablePublicUrl {
	param([string]$Url)

	if ([string]::IsNullOrWhiteSpace($Url)) {
		return $false
	}

	$uri = $null
	if (-not [System.Uri]::TryCreate($Url, [System.UriKind]::Absolute, [ref]$uri)) {
		return $false
	}

	$hostName = [string]$uri.Host
	if ([string]::IsNullOrWhiteSpace($hostName)) {
		return $false
	}
	$hostName = $hostName.ToLowerInvariant()
	if ($hostName -eq "localhost.run" -or $hostName -eq "admin.localhost.run") {
		return $false
	}
	if ($hostName -eq "trycloudflare.com" -or $hostName -eq "loca.lt") {
		return $false
	}

	return $true
}

function Wait-ForTunnelHealthy {
	param(
		[string]$BaseUrl,
		[string]$TunnelProvider,
		[int]$Attempts = 6,
		[int]$DelaySeconds = 2
	)

	$lastProbe = [pscustomobject]@{
		Healthy = $false
		StatusCode = 0
		ErrorCode = ""
	}

	for ($i = 0; $i -lt $Attempts; $i++) {
		$lastProbe = Test-UrlFromThisHost -BaseUrl $BaseUrl
		if ([bool]$lastProbe.Healthy) {
			return $lastProbe
		}

		$status = [int]$lastProbe.StatusCode
		if ($status -gt 0 -and $status -ne 502 -and $status -ne 503 -and $status -ne 504) {
			return $lastProbe
		}

		if ($i -lt ($Attempts - 1)) {
			Start-Sleep -Seconds $DelaySeconds
		}
	}

	return $lastProbe
}

function Test-ProviderAcceptsStatusZero {
	param([string]$TunnelProvider)

	$providerName = [string]$TunnelProvider
	return $providerName -in @("cloudflared")
}

function Write-WatchdogLog {
	param([string]$Message)
	$line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
	try {
		Add-Content -Path $watchdogLogPath -Value $line -Encoding UTF8 -ErrorAction Stop
	} catch {
		# 로그 파일이 잠겨 있어도 워치독 본체는 계속 동작해야 한다.
	}
	Write-Host $line
}

function Save-State {
	param([hashtable]$State)
	try {
		$State | ConvertTo-Json -Depth 6 | Set-Content -Path $statePath -Encoding UTF8
	} catch {
		Write-WatchdogLog "WARN failed to save state: $($_.Exception.Message)"
	}
}

function Read-PublicUrl {
	if (-not (Test-Path $publicUrlPath)) {
		return ""
	}
	try {
		return (Get-Content $publicUrlPath -Raw -ErrorAction Stop).Trim()
	} catch {
		return ""
	}
}

function Get-DefaultLocalTunnelSubdomain {
	$seed = [string]$env:COMPUTERNAME
	if ([string]::IsNullOrWhiteSpace($seed)) {
		$seed = "poliot"
	}
	$seed = $seed.ToLowerInvariant()
	$seed = [regex]::Replace($seed, "[^a-z0-9]+", "-")
	$seed = $seed.Trim('-')
	if ([string]::IsNullOrWhiteSpace($seed)) {
		$seed = "poliot"
	}

	$value = "cci-" + $seed
	if ($value.Length -gt 48) {
		$value = $value.Substring(0, 48)
		$value = $value.Trim('-')
	}
	return $value
}

function Enter-WatchdogLock {
	param([string]$Path)

	if (Test-Path $Path) {
		try {
			$raw = (Get-Content -Path $Path -Raw -ErrorAction Stop).Trim()
			$existingPid = 0
			[void][int]::TryParse($raw, [ref]$existingPid)
			if ($existingPid -gt 0) {
				$existing = Get-CimInstance Win32_Process -Filter "ProcessId=$existingPid" -ErrorAction SilentlyContinue
				if ($existing) {
					$cmd = [string]$existing.CommandLine
					if ($cmd -match 'start_tunnel_watchdog\.ps1') {
						Write-WatchdogLog "another tunnel watchdog already running pid=$existingPid; exit"
						exit 0
					}
				}
			}
		} catch {
			# stale or unreadable lock; overwrite below
		}
	}

	Set-Content -Path $Path -Value "$PID" -Encoding UTF8
}

function Exit-WatchdogLock {
	param([string]$Path)

	try {
		if (Test-Path $Path) {
			$raw = (Get-Content -Path $Path -Raw -ErrorAction SilentlyContinue).Trim()
			if ($raw -eq "$PID") {
				Remove-Item -Path $Path -Force -ErrorAction SilentlyContinue
			}
		}
	} catch {}
}

trap {
	Exit-WatchdogLock -Path $lockPath
	continue
}

function Test-UrlFromThisHost {
	param([string]$BaseUrl)

	$result = [ordered]@{
		Healthy = $false
		StatusCode = 0
		ErrorCode = ""
	}

	if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
		return [pscustomobject]$result
	}

	try {
		$resp = Invoke-WebRequest -Uri "$BaseUrl/auth/login" -UseBasicParsing -TimeoutSec 8 -MaximumRedirection 0 -ErrorAction Stop
		$result.StatusCode = [int]$resp.StatusCode
		$result.Healthy = ($result.StatusCode -ge 200 -and $result.StatusCode -lt 400)
		return [pscustomobject]$result
	} catch {
		if ($_.Exception.Response) {
			$status = [int]$_.Exception.Response.StatusCode
			$result.StatusCode = $status
			try {
				$ec = $_.Exception.Response.Headers["Ngrok-Error-Code"]
				if ($ec) {
					$result.ErrorCode = [string]$ec
				}
			} catch {}
			$result.Healthy = ($status -ge 200 -and $status -lt 400)
			return [pscustomobject]$result
		}
		# DNS/handshake/network 제한은 원격 사용자 환경에서 정상일 수 있으므로 0으로 남긴다.
		return [pscustomobject]$result
	}
}

function Invoke-TunnelBootstrap {
	param([string]$PreferredProvider = "")

	$ltSubdomain = $LocalTunnelSubdomain
	if ([string]::IsNullOrWhiteSpace($ltSubdomain)) {
		$ltSubdomain = Get-DefaultLocalTunnelSubdomain
	}

	$providerCandidates = Get-ProviderSequence -PreferredProvider ($(if ([string]::IsNullOrWhiteSpace($PreferredProvider)) { $Provider } else { $PreferredProvider }))
	$errors = New-Object System.Collections.Generic.List[string]

	foreach ($candidate in $providerCandidates) {
		Write-WatchdogLog "bootstrap attempt provider=$candidate"
		try {
			$args = @{
				Provider = $candidate
				NgrokDomain = $NgrokDomain
				Subdomain = $Subdomain
				LocalTunnelSubdomain = $ltSubdomain
				LocalPort = $LocalPort
				StopExisting = $true
				EnableLocalhostRunFallback = $false
				EnableCloudflaredFallback = $false
				EnableLocalTunnelFallback = $false
				EnableServeoFallback = $false
			}

			& $startTunnelScript @args
			if ($LASTEXITCODE -ne 0) {
				throw "start_public_tunnel exited with code $LASTEXITCODE"
			}

			$issuedUrl = Read-PublicUrl
			if (-not (Test-UsablePublicUrl -Url $issuedUrl)) {
				throw "issued URL is invalid or advisory: $issuedUrl"
			}

			$probe = Wait-ForTunnelHealthy -BaseUrl $issuedUrl -TunnelProvider $candidate
			if (-not [bool]$probe.Healthy) {
				$status = [int]$probe.StatusCode
				if ($status -eq 0 -and (Test-ProviderAcceptsStatusZero -TunnelProvider $candidate)) {
					Write-WatchdogLog "WARN status=0 accepted provider=$candidate url=$issuedUrl"
				} else {
					throw "issued URL unhealthy status=$status provider=$candidate url=$issuedUrl"
				}
			}

			return [pscustomobject]@{
				Provider = $candidate
				PublicUrl = $issuedUrl
			}
		} catch {
			$msg = $_.Exception.Message
			[void]$errors.Add("${candidate}: $msg")
			Write-WatchdogLog "WARN bootstrap attempt failed provider=$candidate message=$msg"
		}
	}

	throw ("All tunnel providers failed: " + ([string]::Join(" | ", $errors)))
}

Write-WatchdogLog "tunnel watchdog start provider=$Provider port=$LocalPort"
Enter-WatchdogLock -Path $lockPath
$lastBootstrapAt = [datetime]::MinValue
$consecutiveFailures = 0
$activeProvider = $Provider

# 재시작 직후에는 이전 만료 URL이 남아있을 수 있으므로 즉시 1회 재발급한다.
try {
	Write-WatchdogLog "bootstrap requested: startup refresh"
	$bootstrap = Invoke-TunnelBootstrap -PreferredProvider $activeProvider
	$lastBootstrapAt = Get-Date
	$activeProvider = [string]$bootstrap.Provider
	$urlInit = [string]$bootstrap.PublicUrl
	Write-WatchdogLog "bootstrap success provider=$activeProvider url=$urlInit"
	Save-State @{
		updated_at = (Get-Date).ToString("s")
		provider = $activeProvider
		port = $LocalPort
		public_url = $urlInit
		status = "ok"
		reason = "startup refresh"
	}
} catch {
	Write-WatchdogLog "ERROR startup bootstrap failed: $($_.Exception.Message)"
}

while ($true) {
	$needBootstrap = $false
	$reason = ""
	$url = Read-PublicUrl

	if ([string]::IsNullOrWhiteSpace($url)) {
		$needBootstrap = $true
		$reason = "public_url.txt missing/empty"
	} elseif (-not (Test-UsablePublicUrl -Url $url)) {
		$needBootstrap = $true
		$reason = "public_url.txt invalid/advisory url"
	} else {
		$probe = Test-UrlFromThisHost -BaseUrl $url
		$status = [int]$probe.StatusCode
		$errorCode = [string]$probe.ErrorCode

		if ($errorCode -eq "ERR_NGROK_725") {
			$needBootstrap = $true
			$reason = "ngrok bandwidth exceeded"
		} elseif ($status -eq 0 -and (Test-ProviderAcceptsStatusZero -TunnelProvider $activeProvider)) {
			$consecutiveFailures = 0
		} elseif (-not [bool]$probe.Healthy) {
			$consecutiveFailures += 1
			if ($consecutiveFailures -ge $MaxConsecutiveFailures) {
				$needBootstrap = $true
				if ($status -eq 0) {
					$reason = "status=0(network/handshake/dns) failures=$consecutiveFailures"
				} else {
					$reason = "status=$status failures=$consecutiveFailures"
				}
			}
		} else {
			$consecutiveFailures = 0
		}
	}

	if (-not $needBootstrap -and $ForceRefreshMinutes -gt 0 -and $lastBootstrapAt -ne [datetime]::MinValue) {
		$elapsedMin = ((Get-Date) - $lastBootstrapAt).TotalMinutes
		if ($elapsedMin -ge $ForceRefreshMinutes) {
			$needBootstrap = $true
			$reason = "periodic refresh elapsed=$([int]$elapsedMin)m"
		}
	}

	if ($needBootstrap) {
		Write-WatchdogLog "bootstrap requested: $reason"
		try {
			$bootstrap = Invoke-TunnelBootstrap -PreferredProvider $activeProvider
			$lastBootstrapAt = Get-Date
			$consecutiveFailures = 0
			$activeProvider = [string]$bootstrap.Provider
			$url2 = [string]$bootstrap.PublicUrl
			Write-WatchdogLog "bootstrap success provider=$activeProvider url=$url2"
			Save-State @{
				updated_at = (Get-Date).ToString("s")
				provider = $activeProvider
				port = $LocalPort
				public_url = $url2
				status = "ok"
				reason = $reason
			}
		} catch {
			Write-WatchdogLog "ERROR bootstrap failed: $($_.Exception.Message)"
			Save-State @{
				updated_at = (Get-Date).ToString("s")
				provider = $activeProvider
				port = $LocalPort
				public_url = (Read-PublicUrl)
				status = "error"
				reason = $reason
				error = $_.Exception.Message
			}
		}
	}

	Start-Sleep -Seconds $CheckIntervalSec
}
