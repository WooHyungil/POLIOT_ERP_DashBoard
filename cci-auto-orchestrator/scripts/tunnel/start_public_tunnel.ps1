param(
	[ValidateSet("ngrok", "serveo", "localhostrun", "cloudflared", "localtunnel")]
	[string]$Provider = "localtunnel",
	[string]$NgrokDomain = "",
	[string]$Subdomain = "cci-dashboard",
	[string]$LocalTunnelSubdomain = "",
	[int]$LocalPort = 8000,
	[switch]$StopExisting,
	[bool]$EnableLocalhostRunFallback = $false,
	[bool]$EnableCloudflaredFallback = $true,
	[bool]$EnableLocalTunnelFallback = $true,
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

function Test-ResolvedPublicUrl {
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

	return $true
}

function Write-PublicUrl {
	param([string]$Url)

	if (-not [string]::IsNullOrWhiteSpace($Url)) {
		if (-not (Test-ResolvedPublicUrl -Url $Url)) {
			throw "Invalid public URL resolved: $Url"
		}
		$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
		[System.IO.File]::WriteAllText($publicUrlPath, $Url, $utf8NoBom)
	}
}

function Stop-AllTunnelProcesses {
	try {
		Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
	} catch {}
	try {
		Get-Process ssh -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
	} catch {}
	try {
		Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
	} catch {}
	try {
		$nodeLike = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
			$cmd = [string]$_.CommandLine
			if ([string]::IsNullOrWhiteSpace($cmd)) {
				return $false
			}
			return ($cmd -match 'localtunnel') -or ($cmd -match 'lt\.js')
		}
		foreach ($proc in @($nodeLike)) {
			try {
				Stop-Process -Id ([int]$proc.ProcessId) -Force -ErrorAction SilentlyContinue
			} catch {}
		}
	} catch {}
	Start-Sleep -Seconds 1
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

function Get-PublicUrlProbe {
	param([string]$BaseUrl)

	$result = [ordered]@{
		StatusCode = 0
		Body = ""
	}

	if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
		return [pscustomobject]$result
	}

	try {
		$resp = Invoke-WebRequest -Uri "$BaseUrl/auth/login" -UseBasicParsing -TimeoutSec 8 -MaximumRedirection 0
		$result.StatusCode = [int]$resp.StatusCode
		$result.Body = [string]$resp.Content
	} catch {
		if ($_.Exception.Response) {
			$result.StatusCode = [int]$_.Exception.Response.StatusCode
			try {
				$stream = $_.Exception.Response.GetResponseStream()
				if ($stream) {
					$reader = New-Object System.IO.StreamReader($stream)
					$result.Body = [string]$reader.ReadToEnd()
					$reader.Close()
				}
			} catch {
				$result.Body = ""
			}
		}
	}

	return [pscustomobject]$result
}

function Test-NgrokBandwidthExceeded {
	param([string]$Body)

	$text = [string]$Body
	if ([string]::IsNullOrWhiteSpace($text)) {
		return $false
	}

	if ($text -match "ERR_NGROK_725") { return $true }
	if ($text -match "bandwidth" -and $text -match "exceeded") { return $true }
	if ($text -match "네트워크 대역폭" -and $text -match "초과") { return $true }
	return $false
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
		Stop-AllTunnelProcesses
	}

	$targetUrl = "https://$SubdomainName.serveousercontent.com"
	$sshArgs = @("-o", "StrictHostKeyChecking=no", "-R", "$SubdomainName:80:localhost:$Port", "serveo.net")
	Start-Process -FilePath "ssh" -ArgumentList $sshArgs -WindowStyle Hidden -RedirectStandardOutput $tunnelLogPath -RedirectStandardError $tunnelErrLogPath | Out-Null

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

		$httpMatch = [regex]::Match($raw, 'https?://[^\s"''`]+')
		if ($httpMatch.Success) {
			$resolvedUrl = $httpMatch.Value.Trim()
			break
		}

		$tcpMatch = [regex]::Match($raw, "Forwarding TCP connections from\s+([^\s:]+):(\d+)")
		if ($tcpMatch.Success) {
			$forwardHost = $tcpMatch.Groups[1].Value
			$p = $tcpMatch.Groups[2].Value
			if ($forwardHost -and $p) {
				$resolvedUrl = "http://$forwardHost`:$p"
				break
			}
		}
	}

	if ([string]::IsNullOrWhiteSpace($resolvedUrl) -or $resolvedUrl -like "https://console.serveo.net/*") {
		$resolvedUrl = $targetUrl
	}

	Write-PublicUrl -Url $resolvedUrl
	Write-Host "Public URL: $resolvedUrl"
	Write-Host "Saved to: $publicUrlPath"
	return $resolvedUrl
}

function Start-LocalhostRunTunnel {
	param(
		[int]$Port,
		[switch]$StopBeforeStart
	)

	if ($StopBeforeStart.IsPresent) {
		Stop-AllTunnelProcesses
	}

	$ts = Get-Date -Format "yyyyMMdd_HHmmss"
	$lrLogPath = Join-Path $runtimeDir ("localhostrun_" + $ts + ".log")
	$lrErrLogPath = Join-Path $runtimeDir ("localhostrun_" + $ts + ".err.log")
	$sshArgs = @("-o", "StrictHostKeyChecking=no", "-R", "80:localhost:$Port", "nokey@localhost.run")
	Start-Process -FilePath "ssh" -ArgumentList $sshArgs -WindowStyle Hidden -RedirectStandardOutput $lrLogPath -RedirectStandardError $lrErrLogPath | Out-Null

	$resolvedUrl = ""
	$fallbackCandidate = ""
	for ($i = 0; $i -lt 120; $i++) {
		Start-Sleep -Milliseconds 500
		$raw = ""
		if (Test-Path $lrLogPath) {
			$raw += (Get-Content -Path $lrLogPath -Raw -ErrorAction SilentlyContinue)
		}
		if (Test-Path $lrErrLogPath) {
			$raw += "`n" + (Get-Content -Path $lrErrLogPath -Raw -ErrorAction SilentlyContinue)
		}
		if ([string]::IsNullOrWhiteSpace($raw)) {
			continue
		}

		# localhost.run 출력은 https://... 또는 xxxxx.lhr.life 형태로 나타날 수 있다.
		$matches = [regex]::Matches($raw, '(https://[^\s"''`]+)|([a-z0-9-]+\.lhr\.life)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
		foreach ($m in $matches) {
			$u = [string]$m.Value
			if ([string]::IsNullOrWhiteSpace($u)) {
				continue
			}
			$u = $u.Trim().TrimEnd(',', '.', ';', ')')
			if ($u -notmatch '^https?://') {
				$u = "https://$u"
			}

			$uriObj = $null
			if (-not [System.Uri]::TryCreate($u, [System.UriKind]::Absolute, [ref]$uriObj)) {
				continue
			}

			$parsedHost = [string]$uriObj.Host
			if ([string]::IsNullOrWhiteSpace($parsedHost)) {
				continue
			}
			$parsedHost = $parsedHost.ToLowerInvariant()

			# 안내/문서 포털 주소는 실제 서비스 URL이 아니다.
			if ($parsedHost -eq 'admin.localhost.run' -or $parsedHost -eq 'localhost.run') {
				continue
			}

			if ($parsedHost -like '*.lhr.life') {
				$resolvedUrl = "https://$parsedHost"
				break
			}

			if (($parsedHost -like '*.localhost.run') -and [string]::IsNullOrWhiteSpace($fallbackCandidate)) {
				$fallbackCandidate = "https://$parsedHost"
			}
		}
		if (-not [string]::IsNullOrWhiteSpace($resolvedUrl)) {
			break
		}
	}

	if ([string]::IsNullOrWhiteSpace($resolvedUrl) -and -not [string]::IsNullOrWhiteSpace($fallbackCandidate)) {
		$resolvedUrl = $fallbackCandidate
	}

	if ([string]::IsNullOrWhiteSpace($resolvedUrl)) {
		throw "Failed to resolve localhost.run public URL. Check $lrLogPath and $lrErrLogPath"
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
		Stop-AllTunnelProcesses
	}

	$args = @("http")
	if (-not [string]::IsNullOrWhiteSpace($Domain)) {
		$args += "--domain=$Domain"
	}
	$args += "$Port"

	Start-Process -FilePath $ngrokCmd.Source -ArgumentList $args -WindowStyle Hidden -RedirectStandardOutput $tunnelLogPath -RedirectStandardError $tunnelErrLogPath | Out-Null
	return (Resolve-NgrokUrl -PreferredDomain $Domain)
}

function Start-CloudflaredTunnel {
	param(
		[int]$Port,
		[switch]$StopBeforeStart
	)

	$cfCmd = Get-Command cloudflared -ErrorAction SilentlyContinue
	if (-not $cfCmd) {
		throw "cloudflared command not found. Install cloudflared first."
	}

	if ($StopBeforeStart.IsPresent) {
		Stop-AllTunnelProcesses
	}

	$ts = Get-Date -Format "yyyyMMdd_HHmmss"
	$cfLogPath = Join-Path $runtimeDir ("cloudflared_" + $ts + ".log")
	$cfErrLogPath = Join-Path $runtimeDir ("cloudflared_" + $ts + ".err.log")
	$args = @("tunnel", "--url", "http://127.0.0.1:$Port", "--no-autoupdate")
	Start-Process -FilePath $cfCmd.Source -ArgumentList $args -WindowStyle Hidden -RedirectStandardOutput $cfLogPath -RedirectStandardError $cfErrLogPath | Out-Null

	$resolvedUrl = ""
	for ($i = 0; $i -lt 120; $i++) {
		Start-Sleep -Milliseconds 500
		$raw = ""
		if (Test-Path $cfLogPath) {
			$raw += (Get-Content -Path $cfLogPath -Raw -ErrorAction SilentlyContinue)
		}
		if (Test-Path $cfErrLogPath) {
			$raw += "`n" + (Get-Content -Path $cfErrLogPath -Raw -ErrorAction SilentlyContinue)
		}
		if ([string]::IsNullOrWhiteSpace($raw)) {
			continue
		}

		$m = [regex]::Match($raw, 'https://[a-z0-9-]+\.trycloudflare\.com', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
		if ($m.Success) {
			$resolvedUrl = $m.Value.Trim().TrimEnd('/', '.', ',', ';', ')')
			break
		}
	}

	if ([string]::IsNullOrWhiteSpace($resolvedUrl)) {
		throw "Failed to resolve cloudflared public URL. Check $cfLogPath and $cfErrLogPath"
	}

	Write-PublicUrl -Url $resolvedUrl
	Write-Host "Public URL: $resolvedUrl"
	Write-Host "Saved to: $publicUrlPath"
	return $resolvedUrl
}

function Start-LocalTunnel {
	param(
		[int]$Port,
		[string]$SubdomainName,
		[switch]$StopBeforeStart
	)

	$npxCmd = Get-Command npx.cmd -ErrorAction SilentlyContinue
	if (-not $npxCmd) {
		throw "npx command not found. Install Node.js first."
	}

	if ($StopBeforeStart.IsPresent) {
		Stop-AllTunnelProcesses
	}

	$ts = Get-Date -Format "yyyyMMdd_HHmmss"
	$ltLogPath = Join-Path $runtimeDir ("localtunnel_" + $ts + ".log")
	$ltErrLogPath = Join-Path $runtimeDir ("localtunnel_" + $ts + ".err.log")
	$args = @("--yes", "localtunnel", "--port", "$Port")
	if (-not [string]::IsNullOrWhiteSpace($SubdomainName)) {
		$args += @("--subdomain", $SubdomainName)
	}
	Start-Process -FilePath $npxCmd.Source -ArgumentList $args -WindowStyle Hidden -RedirectStandardOutput $ltLogPath -RedirectStandardError $ltErrLogPath | Out-Null

	$resolvedUrl = ""
	for ($i = 0; $i -lt 120; $i++) {
		Start-Sleep -Milliseconds 500
		$raw = ""
		if (Test-Path $ltLogPath) {
			$raw += (Get-Content -Path $ltLogPath -Raw -ErrorAction SilentlyContinue)
		}
		if (Test-Path $ltErrLogPath) {
			$raw += "`n" + (Get-Content -Path $ltErrLogPath -Raw -ErrorAction SilentlyContinue)
		}
		if ([string]::IsNullOrWhiteSpace($raw)) {
			continue
		}

		$m = [regex]::Match($raw, 'https://[a-z0-9-]+\.loca\.lt', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
		if ($m.Success) {
			$resolvedUrl = $m.Value.Trim().TrimEnd('/', '.', ',', ';', ')')
			break
		}
	}

	if ([string]::IsNullOrWhiteSpace($resolvedUrl)) {
		throw "Failed to resolve localtunnel public URL. Check $ltLogPath and $ltErrLogPath"
	}

	Write-PublicUrl -Url $resolvedUrl
	Write-Host "Public URL: $resolvedUrl"
	Write-Host "Saved to: $publicUrlPath"
	return $resolvedUrl
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
		if ($EnableLocalhostRunFallback) {
			Write-Warning "Failed to resolve ngrok URL. Falling back to localhost.run..."
			$lrUrl = Start-LocalhostRunTunnel -Port $LocalPort -StopBeforeStart:$true
			Write-Host "Fallback URL: $lrUrl"
			exit 0
		}
		throw "Failed to resolve ngrok public URL. Check $tunnelLogPath"
	}

	$probe = Get-PublicUrlProbe -BaseUrl $url
	$status = [int]$probe.StatusCode
	$ngrokBandwidthExceeded = Test-NgrokBandwidthExceeded -Body $probe.Body
	if ($ngrokBandwidthExceeded) {
		Write-Warning "Detected ngrok bandwidth exceeded (ERR_NGROK_725)."
	}
	if ($ngrokBandwidthExceeded -or -not (Test-PublicUrlHealthy -BaseUrl $url)) {
		Write-Warning "ngrok URL check returned $status for $url"

		# Static domain failure case: retry with random ngrok URL.
		if (-not [string]::IsNullOrWhiteSpace($NgrokDomain) -and -not $ngrokBandwidthExceeded) {
			Write-Warning "Retrying ngrok without fixed domain..."
			$url2 = Start-NgrokTunnel -Domain "" -Port $LocalPort -StopBeforeStart:$true
			if (-not [string]::IsNullOrWhiteSpace($url2)) {
				$probe2 = Get-PublicUrlProbe -BaseUrl $url2
				$status2 = [int]$probe2.StatusCode
				if (-not (Test-NgrokBandwidthExceeded -Body $probe2.Body) -and (Test-PublicUrlHealthy -BaseUrl $url2)) {
					Write-PublicUrl -Url $url2
					Write-Host "Public URL: $url2"
					Write-Host "Saved to: $publicUrlPath"
					exit 0
				}
				Write-Warning "Random ngrok URL check returned $status2 for $url2"
			}
		}

		if ($EnableLocalhostRunFallback) {
			Write-Warning "Falling back to localhost.run tunnel..."
			$lrUrl = Start-LocalhostRunTunnel -Port $LocalPort -StopBeforeStart:$true
			Start-Sleep -Seconds 2
			$lrStatus = Test-PublicUrlStatus -BaseUrl $lrUrl
			if ((Test-PublicUrlHealthy -BaseUrl $lrUrl) -or $lrStatus -eq 0) {
				if ($lrStatus -eq 0) {
					Write-Warning "localhost.run health check returned 0 from this host, but issued URL will be kept."
				}
				Write-Host "Fallback URL: $lrUrl"
				exit 0
			}
			Write-Warning "localhost.run URL check returned $lrStatus for $lrUrl"
		}

		if ($EnableCloudflaredFallback) {
			Write-Warning "Falling back to cloudflared tunnel..."
			$cfUrl = Start-CloudflaredTunnel -Port $LocalPort -StopBeforeStart:$true
			Start-Sleep -Seconds 2
			$cfStatus = Test-PublicUrlStatus -BaseUrl $cfUrl
			if ((Test-PublicUrlHealthy -BaseUrl $cfUrl) -or $cfStatus -eq 0) {
				if ($cfStatus -eq 0) {
					Write-Warning "cloudflared health check returned 0 from this host, but issued URL will be kept."
				}
				Write-Host "Fallback URL: $cfUrl"
				exit 0
			}
			Write-Warning "cloudflared URL check returned $cfStatus for $cfUrl"
		}

		if ($EnableLocalTunnelFallback) {
			Write-Warning "Falling back to localtunnel..."
			$ltUrl = Start-LocalTunnel -Port $LocalPort -SubdomainName $LocalTunnelSubdomain -StopBeforeStart:$false
			Start-Sleep -Seconds 2
			$ltStatus = Test-PublicUrlStatus -BaseUrl $ltUrl
			if ((Test-PublicUrlHealthy -BaseUrl $ltUrl) -or $ltStatus -eq 0) {
				if ($ltStatus -eq 0) {
					Write-Warning "localtunnel health check returned 0 from this host, but issued URL will be kept."
				}
				Write-Host "Fallback URL: $ltUrl"
				exit 0
			}
			Write-Warning "localtunnel URL check returned $ltStatus for $ltUrl"
		}

		if ($EnableServeoFallback) {
			Write-Warning "Falling back to serveo tunnel..."
			$serveoUrl = Start-ServeoTunnel -SubdomainName $Subdomain -Port $LocalPort -StopBeforeStart:$true
			Start-Sleep -Seconds 2
			$serveoStatus = Test-PublicUrlStatus -BaseUrl $serveoUrl
			if ((Test-PublicUrlHealthy -BaseUrl $serveoUrl) -or $serveoStatus -eq 0) {
				if ($serveoStatus -eq 0) {
					Write-Warning "serveo health check returned 0 from this host, but issued URL will be kept."
				}
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

if ($Provider -eq "localhostrun") {
	$null = Start-LocalhostRunTunnel -Port $LocalPort -StopBeforeStart:$StopExisting
	exit 0
}

if ($Provider -eq "cloudflared") {
	$null = Start-CloudflaredTunnel -Port $LocalPort -StopBeforeStart:$StopExisting
	exit 0
}

if ($Provider -eq "localtunnel") {
	$null = Start-LocalTunnel -Port $LocalPort -SubdomainName $LocalTunnelSubdomain -StopBeforeStart:$StopExisting
	exit 0
}
