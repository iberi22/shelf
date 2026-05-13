# Script de Despliegue - Shelf Application
# Este script automatiza el proceso de despliegue a Firebase

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("functions", "firestore", "hosting", "all")]
    [string]$Target = "all",
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipBuild,
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipTests
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Iniciando despliegue de Shelf Application..." -ForegroundColor Cyan
Write-Host "Target: $Target" -ForegroundColor Yellow
Write-Host ""

# Función para verificar si un comando existe
function Test-Command {
    param($Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

# Verificar dependencias
Write-Host "📋 Verificando dependencias..." -ForegroundColor Cyan

if (-not (Test-Command firebase)) {
    Write-Host "❌ Firebase CLI no está instalado" -ForegroundColor Red
    Write-Host "Instalarlo con: pnpm install -g firebase-tools" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Command pnpm)) {
    Write-Host "❌ pnpm no está instalado" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Dependencias verificadas" -ForegroundColor Green
Write-Host ""

# Verificar proyecto Firebase
Write-Host "🔍 Verificando proyecto Firebase..." -ForegroundColor Cyan
$project = firebase use | Select-String "easyinventary-d8dbd"
if (-not $project) {
    Write-Host "⚠️  Configurando proyecto Firebase..." -ForegroundColor Yellow
    firebase use easyinventary-d8dbd
}
Write-Host "✅ Proyecto: easyinventary-d8dbd" -ForegroundColor Green
Write-Host ""

# Verificar variables de entorno para Cloud Functions
if ($Target -eq "functions" -or $Target -eq "all") {
    Write-Host "🔑 Verificando variables de entorno..." -ForegroundColor Cyan
    
    $envFile = "functions\.env"
    if (-not (Test-Path $envFile)) {
        Write-Host "⚠️  Archivo .env no encontrado en functions/" -ForegroundColor Yellow
        Write-Host "📝 Copiando plantilla..." -ForegroundColor Yellow
        
        if (Test-Path "functions\.env.template") {
            Copy-Item "functions\.env.template" $envFile
            Write-Host "✅ Plantilla copiada. Por favor edita functions\.env con tus claves reales" -ForegroundColor Green
            Write-Host ""
            Write-Host "Necesitas agregar:" -ForegroundColor Cyan
            Write-Host "  - API_KEY (Gemini): https://aistudio.google.com/app/apikey" -ForegroundColor Gray
            Write-Host "  - STRIPE_SECRET_KEY: https://dashboard.stripe.com/apikeys" -ForegroundColor Gray
            Write-Host "  - STRIPE_WEBHOOK_SECRET: https://dashboard.stripe.com/webhooks" -ForegroundColor Gray
            Write-Host ""
            
            $continue = Read-Host "¿Ya configuraste las claves? (s/n)"
            if ($continue -ne "s" -and $continue -ne "S") {
                Write-Host "⏸️  Despliegue pausado. Configura .env y vuelve a ejecutar" -ForegroundColor Yellow
                exit 0
            }
        } else {
            Write-Host "❌ No se encontró .env.template" -ForegroundColor Red
            exit 1
        }
    }
    
    # Verificar que las claves no sean placeholders
    $envContent = Get-Content $envFile -Raw
    if ($envContent -match "your_.*_here") {
        Write-Host "❌ El archivo .env aún contiene placeholders" -ForegroundColor Red
        Write-Host "Por favor edita functions\.env con tus claves reales" -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "✅ Variables de entorno configuradas" -ForegroundColor Green
    Write-Host ""
}

# Ejecutar tests
if (-not $SkipTests) {
    Write-Host "🧪 Ejecutando linter..." -ForegroundColor Cyan
    pnpm run lint:fix
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Lint falló" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✅ Lint exitoso" -ForegroundColor Green
    Write-Host ""
}

# Build
if (-not $SkipBuild -and ($Target -eq "hosting" -or $Target -eq "all")) {
    Write-Host "📦 Construyendo aplicación..." -ForegroundColor Cyan
    pnpm run build
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build falló" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✅ Build exitoso" -ForegroundColor Green
    Write-Host ""
}

# Build functions
if ($Target -eq "functions" -or $Target -eq "all") {
    Write-Host "📦 Compilando Cloud Functions..." -ForegroundColor Cyan
    Push-Location functions
    pnpm run build
    Pop-Location
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Compilación de funciones falló" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✅ Funciones compiladas" -ForegroundColor Green
    Write-Host ""
}

# Despliegue
Write-Host "🚀 Desplegando a Firebase..." -ForegroundColor Cyan

switch ($Target) {
    "functions" {
        Write-Host "📤 Desplegando Cloud Functions..." -ForegroundColor Yellow
        firebase deploy --only functions
    }
    "firestore" {
        Write-Host "📤 Desplegando reglas de Firestore..." -ForegroundColor Yellow
        firebase deploy --only firestore:rules,firestore:indexes
    }
    "hosting" {
        Write-Host "📤 Desplegando Hosting..." -ForegroundColor Yellow
        firebase deploy --only hosting
    }
    "all" {
        Write-Host "📤 Desplegando todo..." -ForegroundColor Yellow
        firebase deploy
    }
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Despliegue falló" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ ¡Despliegue exitoso!" -ForegroundColor Green
Write-Host ""

# Mostrar URLs
Write-Host "🌐 URLs de la aplicación:" -ForegroundColor Cyan
Write-Host "  Hosting: https://easyinventary-d8dbd.web.app" -ForegroundColor White
Write-Host "  Firestore: https://console.firebase.google.com/project/easyinventary-d8dbd/firestore" -ForegroundColor White
Write-Host "  Functions: https://console.firebase.google.com/project/easyinventary-d8dbd/functions" -ForegroundColor White
Write-Host ""

# Verificar funciones desplegadas
if ($Target -eq "functions" -or $Target -eq "all") {
    Write-Host "📋 Funciones desplegadas:" -ForegroundColor Cyan
    firebase functions:list
}

Write-Host ""
Write-Host "🎉 ¡Despliegue completado!" -ForegroundColor Green
Write-Host ""
Write-Host "Próximos pasos:" -ForegroundColor Yellow
Write-Host "  1. Verificar en: https://console.firebase.google.com/project/easyinventary-d8dbd" -ForegroundColor Gray
Write-Host "  2. Configurar webhook de Stripe con la URL de la función stripeWebhook" -ForegroundColor Gray
Write-Host "  3. Probar el flujo completo de la aplicación" -ForegroundColor Gray
