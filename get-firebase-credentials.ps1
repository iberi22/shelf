# Script para obtener credenciales de Firebase
Write-Host "🔥 Obteniendo credenciales de Firebase..." -ForegroundColor Cyan
Write-Host ""

Write-Host "✅ Proyecto configurado: easyinventary-d8dbd" -ForegroundColor Green
Write-Host ""

Write-Host "📋 Para obtener tus credenciales Firebase:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Ve a: https://console.firebase.google.com/project/easyinventary-d8dbd/settings/general" -ForegroundColor White
Write-Host ""
Write-Host "2. Baja hasta 'Your apps' (Tus aplicaciones)" -ForegroundColor White
Write-Host ""
Write-Host "3. Si no tienes una app web:" -ForegroundColor White
Write-Host "   - Click en el ícono </> (Web)" -ForegroundColor Gray
Write-Host "   - Nombre: 'Shelf Web'" -ForegroundColor Gray
Write-Host "   - Click 'Register app'" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Copia el objeto firebaseConfig" -ForegroundColor White
Write-Host ""
Write-Host "5. Convierte a variables de entorno (agrega VITE_ al inicio):" -ForegroundColor White
Write-Host ""

Write-Host "# 📝 Formato para Vercel (.env):" -ForegroundColor Cyan
Write-Host ""
Write-Host "VITE_FIREBASE_API_KEY=AIza..." -ForegroundColor Green
Write-Host "VITE_FIREBASE_AUTH_DOMAIN=easyinventary-d8dbd.firebaseapp.com" -ForegroundColor Green
Write-Host "VITE_FIREBASE_PROJECT_ID=easyinventary-d8dbd" -ForegroundColor Green
Write-Host "VITE_FIREBASE_STORAGE_BUCKET=easyinventary-d8dbd.appspot.com" -ForegroundColor Green
Write-Host "VITE_FIREBASE_MESSAGING_SENDER_ID=246628968661" -ForegroundColor Green
Write-Host "VITE_FIREBASE_APP_ID=1:246628968661:web:..." -ForegroundColor Green
Write-Host ""

Write-Host "🚀 Para agregar a Vercel:" -ForegroundColor Cyan
Write-Host ""
Write-Host "Método 1 - Dashboard:" -ForegroundColor White
Write-Host "  https://vercel.com/iberi22s-projects/shelf/settings/environment-variables" -ForegroundColor Blue
Write-Host ""
Write-Host "Método 2 - CLI:" -ForegroundColor White
Write-Host "  vercel env add VITE_FIREBASE_API_KEY production" -ForegroundColor Gray
Write-Host ""

Write-Host "📌 IMPORTANTE: Después de agregar variables, redesplega:" -ForegroundColor Yellow
Write-Host "  vercel --prod" -ForegroundColor Cyan
Write-Host ""

# Abrir Firebase Console
$response = Read-Host "¿Abrir Firebase Console en el navegador? (s/n)"
if ($response -eq 's' -or $response -eq 'S' -or $response -eq 'y' -or $response -eq 'Y') {
    Start-Process "https://console.firebase.google.com/project/easyinventary-d8dbd/settings/general"
    Write-Host "✅ Abriendo Firebase Console..." -ForegroundColor Green
}

Write-Host ""
Write-Host "📚 Para más detalles, lee: ENVIRONMENT_SETUP.md" -ForegroundColor Blue
