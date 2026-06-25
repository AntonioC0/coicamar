param(
  [int]$Port = 5095
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dotnet = (Get-Command dotnet).Source
$Url = "http://localhost:$Port"
$LogDir = Join-Path $Root 'Data'
$LogPath = Join-Path $LogDir 'server.log'
$ErrorLogPath = Join-Path $LogDir 'server-error.log'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existing) {
  Write-Host "COICamar ja esta rodando em $Url"
  exit 0
}

& $Dotnet build (Join-Path $Root 'COICamar.App.csproj') -v:m
if ($LASTEXITCODE -ne 0) {
  throw 'Build falhou. Corrija os erros antes de iniciar o servidor.'
}

$process = Start-Process -FilePath $Dotnet `
  -ArgumentList @('bin\Debug\net10.0\COICamar.App.dll', '--urls', $Url) `
  -WorkingDirectory $Root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $LogPath `
  -RedirectStandardError $ErrorLogPath `
  -PassThru

Write-Host "COICamar.App rodando em $Url"
Write-Host "Processo: $($process.Id)"
Write-Host "Logs: $LogPath"
