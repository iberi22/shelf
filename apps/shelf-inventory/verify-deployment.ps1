# Deployment Verification Script
Write-Host "🔍 Verificando despliegue de Shelf Inventory..." -ForegroundColor Cyan
Write-Host ""

# Check if dist exists
Write-Host "📦 Verificando carpeta dist..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Write-Host "  ✅ dist/ existe" -ForegroundColor Green

    # Check critical files
    $criticalFiles = @("index.html", "metadata.json", "template.csv")
    foreach ($file in $criticalFiles) {
        if (Test-Path "dist/$file") {
            Write-Host "  ✅ $file encontrado" -ForegroundColor Green
        } else {
            Write-Host "  ❌ $file NO encontrado" -ForegroundColor Red
        }
    }

    # Check assets folder
    if (Test-Path "dist/assets") {
        $jsFiles = (Get-ChildItem "dist/assets/*.js").Count
        $cssFiles = (Get-ChildItem "dist/assets/*.css").Count
        Write-Host "  ✅ assets/ con $jsFiles archivos JS y $cssFiles archivos CSS" -ForegroundColor Green
    } else {
        Write-Host "  ❌ assets/ NO encontrado" -ForegroundColor Red
    }
} else {
    Write-Host "  ❌ dist/ NO existe. Ejecuta 'npm run build'" -ForegroundColor Red
}

Write-Host ""
Write-Host "🔧 Verificando configuración..." -ForegroundColor Yellow

# Check if .env.local exists
if (Test-Path ".env.local") {
    Write-Host "  ✅ .env.local configurado" -ForegroundColor Green
    Write-Host "  ℹ️  Firebase en modo ONLINE" -ForegroundColor Blue
} else {
    Write-Host "  ⚠️  .env.local NO encontrado" -ForegroundColor Yellow
    Write-Host "  ℹ️  Firebase en modo LOCAL (sin cloud)" -ForegroundColor Blue
}

# Check vercel.json
if (Test-Path "vercel.json") {
    Write-Host "  ✅ vercel.json configurado" -ForegroundColor Green
} else {
    Write-Host "  ❌ vercel.json NO encontrado" -ForegroundColor Red
}

# Check firebase-tools
Write-Host ""
Write-Host "🔥 Verificando Firebase Tools..." -ForegroundColor Yellow
try {
    $firebaseVersion = firebase --version 2>$null
    if ($firebaseVersion) {
        Write-Host "  ✅ firebase-tools instalado: $firebaseVersion" -ForegroundColor Green
    }
} catch {
    Write-Host "  ⚠️  firebase-tools NO instalado (opcional)" -ForegroundColor Yellow
    Write-Host "  💡 Instalar con: npm install -g firebase-tools" -ForegroundColor Blue
}

# Check vercel CLI
Write-Host ""
Write-Host "🚀 Verificando Vercel CLI..." -ForegroundColor Yellow
try {
    $vercelVersion = vercel --version 2>$null
    if ($vercelVersion) {
        Write-Host "  ✅ vercel CLI instalado: $vercelVersion" -ForegroundColor Green
    }
} catch {
    Write-Host "  ⚠️  vercel CLI NO instalado" -ForegroundColor Yellow
    Write-Host "  💡 Instalar con: npm install -g vercel" -ForegroundColor Blue
}

Write-Host ""
Write-Host "📋 Resumen:" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if (Test-Path "dist") {
    Write-Host "✅ Proyecto compilado y listo para desplegar" -ForegroundColor Green
    Write-Host ""
    Write-Host "Para desplegar a Vercel:" -ForegroundColor White
    Write-Host "  vercel --prod" -ForegroundColor Cyan
} else {
    Write-Host "⚠️  Primero ejecuta el build:" -ForegroundColor Yellow
    Write-Host "  npm run build" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Para más información, consulta:" -ForegroundColor White
Write-Host "  📄 QUICK_START.md - Guía rápida" -ForegroundColor Blue
Write-Host "  📄 FIREBASE_SETUP.md - Configurar Firebase" -ForegroundColor Blue
Write-Host "  📄 DEPLOYMENT.md - Desplegar a Vercel" -ForegroundColor Blue
Write-Host ""
