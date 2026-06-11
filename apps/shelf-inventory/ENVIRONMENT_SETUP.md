# 🔧 Configuración Completa - Variables de Entorno y Publicidad

## 📝 VARIABLES DE ENTORNO NECESARIAS

### 1. Variables de Firebase (REQUERIDAS para autenticación online)

Ve a tu proyecto Firebase: https://console.firebase.google.com/project/easyinventary-d8dbd/settings/general

Copia estas variables y agrégalas en Vercel:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=AIza...tu-api-key
VITE_FIREBASE_AUTH_DOMAIN=easyinventary-d8dbd.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=easyinventary-d8dbd
VITE_FIREBASE_STORAGE_BUCKET=easyinventary-d8dbd.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=246628968661
VITE_FIREBASE_APP_ID=1:246628968661:web:...tu-app-id
```

### 2. Variables de Google AI (OPCIONAL - para chat IA)

Solo si quieres el chat con IA:

```env
VITE_GOOGLE_AI_API_KEY=tu-gemini-api-key
```

Obtén tu API key aquí: https://aistudio.google.com/app/apikey

### 3. Variables de Stripe (OPCIONAL - para pagos)

Solo si implementas suscripciones de pago:

```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

---

## 🚀 CÓMO AGREGAR VARIABLES EN VERCEL

### Método 1: Dashboard de Vercel

1. Ve a: https://vercel.com/iberi22s-projects/shelf/settings/environment-variables

2. Para cada variable:
   - Click "Add New"
   - Name: `VITE_FIREBASE_API_KEY`
   - Value: (pega tu valor)
   - Environment: Marca `Production`, `Preview`, y `Development`
   - Click "Save"

3. Repite para todas las variables

4. **IMPORTANTE**: Después de agregar, redesplegar:
   ```powershell
   vercel --prod
   ```

### Método 2: CLI de Vercel

```powershell
# Agregar variable individualmente
vercel env add VITE_FIREBASE_API_KEY production

# O agregar desde archivo
vercel env pull .env.local
```

---

## 📱 OBTENER CREDENCIALES DE FIREBASE

### Paso 1: Ve a Firebase Console

https://console.firebase.google.com/project/easyinventary-d8dbd/settings/general

### Paso 2: En "Your apps" (Tus aplicaciones)

1. Si no tienes una app web, click "Add app" > Web icon
2. Registra la app con nombre "Shelf Web"
3. Copia el `firebaseConfig` object

Ejemplo de lo que verás:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyBCd...",
  authDomain: "easyinventary-d8dbd.firebaseapp.com",
  projectId: "easyinventary-d8dbd",
  storageBucket: "easyinventary-d8dbd.appspot.com",
  messagingSenderId: "246628968661",
  appId: "1:246628968661:web:abc123..."
};
```

### Paso 3: Convertir a variables de entorno

Agrega `VITE_` al inicio de cada key:

```env
VITE_FIREBASE_API_KEY=AIzaSyBCd...
VITE_FIREBASE_AUTH_DOMAIN=easyinventary-d8dbd.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=easyinventary-d8dbd
VITE_FIREBASE_STORAGE_BUCKET=easyinventary-d8dbd.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=246628968661
VITE_FIREBASE_APP_ID=1:246628968661:web:abc123...
```

---

## 💰 CONFIGURAR GOOGLE ADSENSE

### Paso 1: Crear cuenta AdSense

1. Ve a: https://www.google.com/adsense/start/
2. Registra tu sitio: `shelf-3yw4dyrtj-iberi22s-projects.vercel.app`
3. Espera aprobación (puede tardar 1-2 semanas)

### Paso 2: Obtener Publisher ID

Una vez aprobado:

1. En AdSense Dashboard, ve a "Account" > "Account Information"
2. Copia tu Publisher ID: `ca-pub-XXXXXXXXXXXXXXXX`

### Paso 3: Actualizar el código

Edita `components/Ads.tsx`:

```typescript
// Línea 8-10
const AD_CLIENT_ID = "ca-pub-TU_PUBLISHER_ID_AQUI";
const DESKTOP_AD_SLOT_ID = "TU_DESKTOP_SLOT_ID";
const MOBILE_AD_SLOT_ID = "TU_MOBILE_SLOT_ID";
```

### Paso 4: Crear Ad Units

En AdSense Dashboard:

1. Ve a "Ads" > "By ad unit" > "Display ads"
2. Crea un ad unit "Shelf Desktop" (728x90 o Responsive)
   - Copia el Ad Slot ID
3. Crea un ad unit "Shelf Mobile" (320x50 o Responsive)
   - Copia el Ad Slot ID

### Paso 5: Agregar el script a index.html

El script de AdSense debe estar en el `<head>`:

```html
<head>
  ...
  <script
    async
    src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-TU_ID_AQUI"
    crossorigin="anonymous">
  </script>
</head>
```

**IMPORTANTE**: Reemplaza `ca-pub-TU_ID_AQUI` con tu Publisher ID real.

---

## 🐛 SOLUCIONAR PROBLEMA ACTUAL

El error "Loading..." y los 401 pueden ser por:

### Problema 1: Metadata.json inaccesible

Verifica que esté en producción:
- https://shelf-3yw4dyrtj-iberi22s-projects.vercel.app/metadata.json

Si da 401, el problema es la configuración de Vercel.

**Solución**:

Actualiza `vercel.json`:

```json
{
  "buildCommand": "pnpm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET,OPTIONS" }
      ]
    }
  ]
}
```

### Problema 2: Firebase no inicializa

Si la app se queda en "Loading...", revisa la consola del navegador.

**Solución temporal**: La app funciona sin Firebase en modo local.

**Solución permanente**: Agrega las variables de Firebase en Vercel.

---

## ✅ CHECKLIST DE CONFIGURACIÓN

### Firebase (Para autenticación online):
- [ ] Obtener credenciales de Firebase Console
- [ ] Agregar variables `VITE_FIREBASE_*` en Vercel
- [ ] Redesplegar con `vercel --prod`
- [ ] Verificar que login funcione

### AdSense (Para publicidad):
- [ ] Crear cuenta AdSense
- [ ] Esperar aprobación del sitio
- [ ] Obtener Publisher ID
- [ ] Crear Ad Units (Desktop y Mobile)
- [ ] Actualizar `components/Ads.tsx` con IDs reales
- [ ] Agregar script de AdSense en `index.html`
- [ ] Redesplegar

### Vercel (Configuración):
- [ ] Headers CORS correctos
- [ ] metadata.json accesible públicamente
- [ ] Rewrites configurados
- [ ] Variables de entorno agregadas

---

## 🔍 COMANDOS DE DIAGNÓSTICO

```powershell
# Ver variables actuales en Vercel
vercel env ls

# Probar build local
pnpm run build
pnpm run preview

# Ver el dist generado
Get-ChildItem dist -Recurse

# Probar metadata.json local
Test-Path "dist/metadata.json"

# Redesplegar
vercel --prod
```

---

## 🎯 PRÓXIMOS PASOS INMEDIATOS

1. **Agregar credenciales Firebase en Vercel**:
   - Ve a Firebase Console
   - Copia las credenciales
   - Agrégalas en Vercel Dashboard
   - Redesplegar

2. **Registrar sitio en AdSense**:
   - Crear cuenta
   - Agregar dominio de Vercel
   - Esperar aprobación

3. **Verificar despliegue**:
   - Probar URL de producción
   - Ver consola del navegador para errores
   - Verificar que metadata.json cargue

---

## 📞 LINKS ÚTILES

- **Firebase Console**: https://console.firebase.google.com/project/easyinventary-d8dbd
- **Vercel Dashboard**: https://vercel.com/iberi22s-projects/shelf
- **AdSense**: https://www.google.com/adsense
- **Gemini AI API**: https://aistudio.google.com/app/apikey

---

**Empieza agregando las variables de Firebase en Vercel para que la app cargue correctamente.** 🚀
