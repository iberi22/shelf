# 🚀 Guía Completa: Desplegar Backend a Firebase (FREE TIER)

## ✅ MCP CORREGIDO

El archivo `.vscode/mcp.json` ahora tiene la configuración correcta:

```json
{
   "servers": {
      "firebase": {
         "command": "npx",
         "args": ["-y", "firebase-tools@latest", "mcp"]
      }
   }
}
```

**El MCP ahora debería funcionar correctamente** después de reiniciar VS Code o el servidor MCP.

---

## 🔥 PASO 1: Configurar Proyecto Firebase

### 1.1 Login a Firebase

```powershell
firebase login
```

### 1.2 Inicializar el proyecto (si no está inicializado)

```powershell
firebase init
```

Selecciona:
- ✅ Firestore
- ✅ Functions
- ✅ Hosting (opcional, ya tienes Vercel)
- ✅ Storage (opcional)

**IMPORTANTE**: Cuando pregunte por el proyecto:
- Selecciona "Use an existing project"
- O crea uno nuevo si no tienes

### 1.3 Vincular proyecto existente

Si ya tienes un proyecto Firebase:

```powershell
firebase use --add
```

Selecciona tu proyecto y dale un alias (ej: `default`)

---

## 📦 PASO 2: Preparar Cloud Functions

### 2.1 Instalar dependencias de Functions

```powershell
cd functions
npm install
cd ..
```

### 2.2 Configurar Variables de Entorno para Functions

Firebase Functions usa **Secret Manager** en el free tier:

```powershell
# Para Gemini AI
firebase functions:secrets:set API_KEY

# Para Stripe (si usas pagos)
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

Te pedirá que ingreses cada valor. Presiona Enter cuando termines.

### 2.3 FREE TIER IMPORTANTE

Cloud Functions **tiene límites en el free tier**:

**Spark Plan (FREE):**
- ✅ 125,000 invocaciones/mes
- ✅ 40,000 GB-segundos
- ✅ 40,000 CPU-segundos
- ✅ 5 GB salida de red/mes
- ❌ NO permite conexiones externas (no puedes llamar APIs externas como Stripe o Gemini)

**Blaze Plan (PAY AS YOU GO - RECOMENDADO para FREE):**
- ✅ Incluye TODO del Spark plan GRATIS
- ✅ Solo pagas si excedes los límites (muy difícil en desarrollo)
- ✅ Permite conexiones externas (necesario para Gemini y Stripe)
- ✅ Requiere tarjeta de crédito pero NO te cobrarán si no pasas los límites

**Para usar Gemini AI o Stripe, necesitas Blaze Plan.**

---

## 💳 PASO 3: Actualizar a Blaze Plan (GRATIS hasta cierto límite)

### 3.1 En Firebase Console

1. Ve a https://console.firebase.google.com/
2. Selecciona tu proyecto
3. Click en "Upgrade" (arriba a la derecha)
4. Selecciona "Blaze Plan"
5. Agrega método de pago
6. **Configura presupuesto de alerta**: $0 o $1 para estar seguro

### 3.2 Límites Gratuitos en Blaze

Estos son GRATUITOS cada mes:
- 2,000,000 invocaciones
- 400,000 GB-segundos
- 200,000 CPU-segundos
- 5 GB salida de red

**Nota**: Es muy difícil exceder estos límites en desarrollo o apps pequeñas.

---

## 🚀 PASO 4: Desplegar Functions

### 4.1 Compilar Functions

```powershell
cd functions
npm run build
cd ..
```

### 4.2 Desplegar solo Functions

```powershell
firebase deploy --only functions
```

### 4.3 Desplegar Functions específicas

Si solo quieres desplegar una función:

```powershell
firebase deploy --only functions:chat
firebase deploy --only functions:createCheckoutSession
firebase deploy --only functions:stripeWebhook
```

---

## 📊 PASO 5: Verificar Despliegue

### 5.1 Ver URLs de las Functions

Después del despliegue, verás URLs como:

```
✔  functions[chat(us-central1)]: Successful create operation.
Function URL: https://us-central1-tu-proyecto.cloudfunctions.net/chat
```

### 5.2 Probar una Function

```powershell
# Probar chat function
curl -X POST https://us-central1-tu-proyecto.cloudfunctions.net/chat `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer TU_TOKEN_FIREBASE" `
  -d '{"message":"Hola"}'
```

---

## 🔐 PASO 6: Actualizar Frontend

### 6.1 Actualizar constantes con URLs de Functions

En `constants.ts`, agrega las URLs de tus functions:

```typescript
export const FUNCTIONS_URL = {
  chat: 'https://us-central1-tu-proyecto.cloudfunctions.net/chat',
  createCheckoutSession: 'https://us-central1-tu-proyecto.cloudfunctions.net/createCheckoutSession',
  stripeWebhook: 'https://us-central1-tu-proyecto.cloudfunctions.net/stripeWebhook'
};
```

### 6.2 Redesplegar Frontend a Vercel

```powershell
npm run build
vercel --prod
```

---

## 📋 RESUMEN DE COMANDOS

```powershell
# 1. Login
firebase login

# 2. Vincular proyecto
firebase use --add

# 3. Configurar secrets
firebase functions:secrets:set API_KEY
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET

# 4. Instalar dependencias
cd functions
npm install
cd ..

# 5. Desplegar
firebase deploy --only functions

# 6. Ver logs en tiempo real
firebase functions:log --only chat
```

---

## 🐛 Solución de Problemas

### Error: "Billing account not configured"

**Solución**: Necesitas habilitar Blaze Plan (es gratis hasta los límites).

```powershell
# Verificar plan actual
firebase projects:list
```

Luego ve a Firebase Console y actualiza a Blaze.

### Error: "Permission denied"

**Solución**: Verifica que estás autenticado:

```powershell
firebase login --reauth
```

### Error: "Secret not found"

**Solución**: Configura los secrets:

```powershell
firebase functions:secrets:set API_KEY
```

### Functions muy lentas (Cold Start)

**Normal en free tier**: La primera llamada después de inactividad es lenta (5-10 segundos).

**Soluciones**:
- Usar mínima función keep-alive (cuesta dinero)
- O aceptar el cold start en free tier

---

## 💰 Estimación de Costos FREE

Con **uso moderado** (desarrollo/pruebas):

```
Invocaciones: ~1,000/mes         → $0.00 (dentro de free tier)
Compute time: ~10 GB-segundos    → $0.00 (dentro de free tier)
Network: ~100 MB salida          → $0.00 (dentro de free tier)

TOTAL: $0.00/mes ✅
```

Con **uso real** (100 usuarios):

```
Invocaciones: ~50,000/mes        → $0.00 (dentro de free tier)
Compute time: ~200 GB-segundos   → $0.00 (dentro de free tier)
Network: ~2 GB salida            → $0.00 (dentro de free tier)

TOTAL: $0.00/mes ✅
```

**Solo pagarás si tienes miles de usuarios activos.**

---

## 🎯 Siguiente Paso

```powershell
# Verifica tu configuración actual
firebase projects:list

# Despliega las functions
firebase deploy --only functions
```

**¡Listo! Tu backend estará en Firebase FREE tier!** 🚀
