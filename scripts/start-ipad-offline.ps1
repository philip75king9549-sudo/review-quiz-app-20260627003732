$ErrorActionPreference = "Stop"

$projectDirectory = Split-Path -Parent $PSScriptRoot
$toolsDirectory = Join-Path $projectDirectory "tools"
$outputDirectory = Join-Path $projectDirectory "ipad-install"
$sessionFile = Join-Path $outputDirectory "session.json"
$errorLog = Join-Path $projectDirectory "ipad-launcher-error.log"
$cloudflaredPath = Join-Path $toolsDirectory "cloudflared.exe"
$vitePath = Join-Path $projectDirectory "node_modules\vite\bin\vite.js"
$qrScript = Join-Path $PSScriptRoot "create-qr.mjs"
$port = 4174
$localUrl = "http://127.0.0.1:$port"

function Get-NodePath {
  $candidates = @(
    (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"),
    (Join-Path $env:ProgramFiles "nodejs\node.exe")
  )
  $path = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $path) {
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($command) { $path = $command.Source }
  }
  return $path
}

function Stop-PreviousSession {
  if (-not (Test-Path -LiteralPath $sessionFile)) { return }
  try {
    $session = Get-Content -Raw -LiteralPath $sessionFile | ConvertFrom-Json
    foreach ($entry in @(
      @{ Id = $session.tunnelPid; Expected = $cloudflaredPath },
      @{ Id = $session.serverPid; Expected = $session.nodePath }
    )) {
      if (-not $entry.Id) { continue }
      $process = Get-Process -Id $entry.Id -ErrorAction SilentlyContinue
      if ($process -and $process.Path -and
          ([IO.Path]::GetFullPath($process.Path) -eq [IO.Path]::GetFullPath($entry.Expected))) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {
    # A stale or incomplete session file can be safely ignored.
  }
}

function Test-LocalServer {
  try {
    return (Invoke-WebRequest -Uri $localUrl -UseBasicParsing -TimeoutSec 1).StatusCode -eq 200
  } catch {
    return $false
  }
}

try {
  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
  Stop-PreviousSession

  $nodePath = Get-NodePath
  if (-not $nodePath) { throw "Node.js was not found." }
  if (-not (Test-Path -LiteralPath $cloudflaredPath)) { throw "cloudflared.exe is missing." }
  if (-not (Test-Path -LiteralPath $vitePath)) { throw "Project dependencies are incomplete." }
  if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory "dist\index.html"))) {
    throw "Build files are missing. Run pnpm build first."
  }

  $serverOut = Join-Path $outputDirectory "server.log"
  $serverError = Join-Path $outputDirectory "server-error.log"
  $tunnelOut = Join-Path $outputDirectory "tunnel.log"
  $tunnelError = Join-Path $outputDirectory "tunnel-error.log"
  Remove-Item -LiteralPath $serverOut,$serverError,$tunnelOut,$tunnelError -Force -ErrorAction SilentlyContinue

  $server = Start-Process `
    -FilePath $nodePath `
    -ArgumentList @($vitePath, "preview", "--host", "127.0.0.1", "--port", "$port", "--strictPort") `
    -WorkingDirectory $projectDirectory `
    -WindowStyle Hidden `
    -RedirectStandardOutput $serverOut `
    -RedirectStandardError $serverError `
    -PassThru

  for ($attempt = 0; $attempt -lt 50 -and -not (Test-LocalServer); $attempt += 1) {
    Start-Sleep -Milliseconds 200
  }
  if (-not (Test-LocalServer)) { throw "The local server did not start." }

  $tunnel = Start-Process `
    -FilePath $cloudflaredPath `
    -ArgumentList @("tunnel", "--url", $localUrl, "--no-autoupdate") `
    -WorkingDirectory $projectDirectory `
    -WindowStyle Hidden `
    -RedirectStandardOutput $tunnelOut `
    -RedirectStandardError $tunnelError `
    -PassThru

  $publicUrl = $null
  for ($attempt = 0; $attempt -lt 120 -and -not $publicUrl; $attempt += 1) {
    Start-Sleep -Milliseconds 500
    $logText = @(
      (Get-Content -Raw -LiteralPath $tunnelOut -ErrorAction SilentlyContinue),
      (Get-Content -Raw -LiteralPath $tunnelError -ErrorAction SilentlyContinue)
    ) -join "`n"
    $match = [regex]::Match($logText, "https://[-a-z0-9]+\.trycloudflare\.com")
    if ($match.Success) { $publicUrl = $match.Value }
    if ($tunnel.HasExited) { break }
  }
  if (-not $publicUrl) { throw "Could not create the HTTPS tunnel. Check the network connection." }

  $qrPage = & $nodePath $qrScript $publicUrl $outputDirectory
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $qrPage)) {
    throw "Could not generate the QR page."
  }

  @{
    url = $publicUrl
    serverPid = $server.Id
    tunnelPid = $tunnel.Id
    nodePath = $nodePath
    createdAt = (Get-Date).ToString("s")
  } | ConvertTo-Json | Set-Content -LiteralPath $sessionFile -Encoding UTF8

  Start-Process -FilePath $qrPage
  Remove-Item -LiteralPath $errorLog -Force -ErrorAction SilentlyContinue
  exit 0
} catch {
  @(
    (Get-Date -Format "yyyy-MM-dd HH:mm:ss"),
    $_.Exception.Message,
    $_.ScriptStackTrace
  ) | Set-Content -LiteralPath $errorLog -Encoding UTF8
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    "The iPad installer could not start: $($_.Exception.Message)`nSee ipad-launcher-error.log.",
    "Review Quiz",
    "OK",
    "Error"
  ) | Out-Null
  exit 1
}
