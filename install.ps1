$ErrorActionPreference = "Stop"

Set-Location -LiteralPath $PSScriptRoot

Write-Host "Streetlight installer (Windows experimental)"
Write-Host "This will run: npm install -> npm run build -> npm run setup"
Write-Host ""

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "Node.js was not found."
  Write-Host "Install Node.js 20 or newer, then run install.cmd again."
  Write-Host "https://nodejs.org/"
  Read-Host "Press Enter to close"
  exit 1
}

node scripts/install.mjs

Write-Host ""
Read-Host "Done. Press Enter to close"

