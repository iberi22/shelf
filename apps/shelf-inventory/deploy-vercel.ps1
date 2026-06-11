# Script de despliegue a Vercel (CLI)
# Requiere: Node/NPM y acceso a Vercel (login o token)

param(
  [Parameter(Mandatory = $false)]
  [ValidateSet('preview', 'production')]
  [string]$Environment = 'preview',

  [Parameter(Mandatory = $false)]
  [string]$Token,

  [Parameter(Mandatory = $false)]
  [switch]$SkipInstall,

  [Parameter(Mandatory = $false)]
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

function Assert-Command {
  param([string]$Command)
  $null = Get-Command $Command -ErrorAction SilentlyContinue
  if (-not $?) {
    throw "Command not found: $Command"
  }
}

Assert-Command pnpm
Assert-Command node

Write-Host "Deploy to Vercel ($Environment)" -ForegroundColor Cyan

$resolvedToken = $Token
if (-not $resolvedToken -and $env:VERCEL_TOKEN) {
  $resolvedToken = $env:VERCEL_TOKEN
}

$tokenArg = @()
if ($resolvedToken) {
  $tokenArg = @("--token=$resolvedToken")
}

if (-not $SkipInstall) {
  Write-Host "Installing dependencies..." -ForegroundColor Cyan
  pnpm install --frozen-lockfile
}

if (-not $SkipBuild) {
  Write-Host "Building app (Vite)..." -ForegroundColor Cyan
  pnpm run build
}

# Sync Vercel project settings + env vars to local machine
Write-Host "Pulling Vercel project settings..." -ForegroundColor Cyan
pnpm dlx vercel@latest pull --yes --environment=$Environment @tokenArg

Write-Host "Building with Vercel (prebuilt output)..." -ForegroundColor Cyan
if ($Environment -eq 'production') {
  pnpm dlx vercel@latest build --prod @tokenArg
} else {
  pnpm dlx vercel@latest build @tokenArg
}

Write-Host "Deploying..." -ForegroundColor Cyan
if ($Environment -eq 'production') {
  pnpm dlx vercel@latest deploy --prebuilt --prod @tokenArg
} else {
  pnpm dlx vercel@latest deploy --prebuilt @tokenArg
}
