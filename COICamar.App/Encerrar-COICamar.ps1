param(
  [int]$Port = 5095
)

$ErrorActionPreference = 'Stop'
$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $connections) {
  Write-Host "Nenhum servidor COICamar encontrado na porta $Port."
  exit 0
}

$processIds = $connections |
  Select-Object -ExpandProperty OwningProcess -Unique |
  Where-Object { $_ -gt 0 }

if (-not $processIds) {
  Write-Host "Nenhum processo válido encontrado para a porta $Port."
  exit 0
}

foreach ($processId in $processIds) {
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($process) {
    Stop-Process -Id $processId -Force
    Write-Host "Servidor encerrado. Processo: $processId"
  }
}
