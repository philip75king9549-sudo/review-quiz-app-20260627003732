$ErrorActionPreference = "Stop"

$projectDirectory = Split-Path -Parent $PSScriptRoot
$errorLog = Join-Path $projectDirectory "launcher-error.log"
$url = "http://127.0.0.1:4173/?build=20260627-eraser-pwa"
$vitePath = Join-Path $projectDirectory "node_modules\vite\bin\vite.js"

function Test-AppReady {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1
    return $response.StatusCode -eq 200
  }
  catch {
    return $false
  }
}

try {
  if (-not (Test-AppReady)) {
    $nodeCandidates = @(
      (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"),
      (Join-Path $env:ProgramFiles "nodejs\node.exe")
    )

    $nodePath = $nodeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

    if (-not $nodePath) {
      $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
      if ($nodeCommand) {
        $nodePath = $nodeCommand.Source
      }
    }

    if (-not $nodePath) {
      throw "Node.js was not found."
    }

    if (-not (Test-Path -LiteralPath $vitePath)) {
      throw "Project dependencies are incomplete. Run pnpm install first."
    }

    Start-Process `
      -FilePath $nodePath `
      -ArgumentList @($vitePath, "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort") `
      -WorkingDirectory $projectDirectory `
      -WindowStyle Hidden

    for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
      Start-Sleep -Milliseconds 250
      if (Test-AppReady) {
        break
      }
    }
  }

  if (-not (Test-AppReady)) {
    throw "The local server did not start in time."
  }

  $browserCandidates = @(
    (Join-Path ${env:ProgramFiles} "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path ${env:ProgramFiles} "Microsoft\Edge\Application\msedge.exe")
  )
  $browserPath = $browserCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

  if ($browserPath) {
    Start-Process -FilePath $browserPath -ArgumentList @("--new-window", $url)
  }
  else {
    Start-Process $url
  }

  Remove-Item -LiteralPath $errorLog -Force -ErrorAction SilentlyContinue
  exit 0
}
catch {
  @(
    (Get-Date -Format "yyyy-MM-dd HH:mm:ss"),
    $_.Exception.Message,
    $_.ScriptStackTrace
  ) | Set-Content -LiteralPath $errorLog -Encoding UTF8
  exit 1
}
