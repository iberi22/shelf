# Estado del Backend - Shelf Application

## ✅ Completado

### 1. Configuración de Google Cloud
- **Proyecto activo**: `easyinventary-d8dbd` (ID: 246628968661)
- **Servicios habilitados**:
  - ✅ Cloud Functions API
  - ✅ Cloud Firestore API
  - ✅ Firebase Hosting API
  - ✅ Cloud Storage API
  - ✅ Firebase Management API
  - ✅ Firebase Installations API

### 2. Código de Cloud Functions
- ✅ `functions/src/index.ts` con 4 funciones:
  - `chat` - AI assistant usando Gemini
  - `extractInvoice` - OCR de facturas con Gemini Vision
  - `createCheckoutSession` - Checkout de Stripe
  - `stripeWebhook` - Webhook de Stripe
- ✅ Dependencias instaladas:
  - @google/genai@1.29.1
  - firebase-admin@12.7.0
  - firebase-functions@5.1.1
  - stripe@15.12.0
  - typescript@5.9.3 (pnpm managed)

### 3. Configuración Firebase
- ✅ `firebase.json` configurado con rewrites a las 4 funciones
- ✅ `firestore.rules` creado con reglas de seguridad Pro/Pyme
- ✅ `firestore.indexes.json` disponible

### 4. Frontend
- ✅ Componentes OCR implementados (Arqueo, InvoiceScannerModal, InvoiceConfirmationModal)
- ✅ Rutas configuradas en `MainApp.tsx`
- ✅ Traducciones en 3 idiomas (EN, ES, PT)
- ✅ Build exitoso (1.4MB bundle, 510 módulos)
- ✅ Lint limpio (83 archivos)

### 5. Control de Versiones
- ✅ Rama `main` creada y pusheada a GitHub
- ✅ Commit ae060dd con feature completo

---

## ⏳ Pendiente de Despliegue

### 1. Cloud Functions - **NO DESPLEGADAS**
Estado: `firebase functions:list` retorna tabla vacía

**Acción requerida**:
```bash
# 1. Crear archivo .env en functions/
cd functions
echo "API_KEY=tu_api_key_de_gemini" > .env
echo "STRIPE_SECRET_KEY=tu_stripe_secret" >> .env
echo "STRIPE_WEBHOOK_SECRET=tu_webhook_secret" >> .env

# 2. Desplegar funciones
cd ..
firebase deploy --only functions
```

**Alternativa recomendada (Producción)**: Usar Google Secret Manager
```bash
# Ver pasos detallados en DEPLOYMENT_GUIDE.md sección 1
gcloud services enable secretmanager.googleapis.com
# ... crear secretos y dar permisos
```

### 2. Variables de Entorno
Estado: `functions/.env.example` creado pero falta `.env` con valores reales

**Valores necesarios**:
- `API_KEY`: Obtener de https://aistudio.google.com/app/apikey
- `STRIPE_SECRET_KEY`: Obtener de https://dashboard.stripe.com/apikeys
- `STRIPE_WEBHOOK_SECRET`: Obtener de https://dashboard.stripe.com/webhooks

### 3. Reglas de Firestore
Estado: Archivo creado pero no publicado

**Acción requerida**:
```bash
firebase deploy --only firestore:rules
```

### 4. Migración de Rama master → main
Estado: Rama `main` creada pero `master` aún existe

**Pasos restantes**:
1. Ir a GitHub → https://github.com/iberi22/shelf/settings/branches
2. Cambiar Default branch de `master` a `main`
3. Ejecutar: `git push origin :master` (esto ahora funcionará)

### 5. Configuración de Vercel
Estado: Archivo `vercel.json` configurado pero rama no actualizada

**Acción requerida**:
1. Dashboard de Vercel → Settings → Git → Production Branch → Cambiar a `main`
2. Settings → Environment Variables → Agregar variables de Firebase:
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=easyinventary-d8dbd.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=easyinventary-d8dbd
   VITE_FIREBASE_STORAGE_BUCKET=easyinventary-d8dbd.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=246628968661
   VITE_FIREBASE_APP_ID=...
   ```

---

## 🔍 Verificación

### Comandos de Verificación
```bash
# Ver funciones desplegadas
firebase functions:list

# Ver logs de funciones
firebase functions:log

# Ver reglas publicadas
firebase firestore:indexes

# Ver estado de Vercel
vercel inspect

# Ver servicios habilitados
gcloud services list --enabled --project=easyinventary-d8dbd
```

### URLs Esperadas (Post-Despliegue)

**Firebase Hosting**:
- Chat: `https://easyinventary-d8dbd.web.app/api/chat`
- Extract Invoice: `https://easyinventary-d8dbd.web.app/api/extractInvoice`
- Checkout: `https://easyinventary-d8dbd.web.app/api/createCheckoutSession`
- Webhook: `https://easyinventary-d8dbd.web.app/api/stripeWebhook`

**Cloud Functions Directas**:
- Chat: `https://us-central1-easyinventary-d8dbd.cloudfunctions.net/chat`
- Extract Invoice: `https://us-central1-easyinventary-d8dbd.cloudfunctions.net/extractInvoice`
- Checkout: `https://us-central1-easyinventary-d8dbd.cloudfunctions.net/createCheckoutSession`
- Webhook: `https://us-central1-easyinventary-d8dbd.cloudfunctions.net/stripeWebhook`

**Vercel** (Frontend):
- Production: `https://shelf-<hash>.vercel.app`

---

## 📋 Checklist de Despliegue

- [ ] Obtener API keys necesarias (Gemini, Stripe)
- [ ] Crear `functions/.env` con valores reales O configurar Secret Manager
- [ ] Desplegar Cloud Functions: `firebase deploy --only functions`
- [ ] Verificar funciones desplegadas: `firebase functions:list`
- [ ] Publicar reglas de Firestore: `firebase deploy --only firestore:rules`
- [ ] Cambiar default branch en GitHub a `main`
- [ ] Eliminar rama `master` remota: `git push origin :master`
- [ ] Actualizar Vercel para usar rama `main`
- [ ] Configurar environment variables en Vercel
- [ ] Redesplegar en Vercel desde rama `main`
- [ ] Configurar webhook de Stripe con URL de producción
- [ ] Probar flujo completo: registro → pago → OCR de factura

---

## 🚨 Bloqueadores Críticos

1. **Cloud Functions sin desplegar**: La feature de Arqueo no funcionará hasta que se desplieguen las funciones
2. **Variables de entorno faltantes**: Las funciones fallarán sin las API keys
3. **Rama master en GitHub**: No se puede eliminar hasta cambiar default branch

---

## 📚 Documentación Relacionada

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Guía completa de despliegue
- [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) - Configuración inicial de Firebase
- [STRIPE_SETUP.md](./docs/STRIPE_SETUP.md) - Configuración de Stripe
- [ARQUEO_IMPLEMENTATION.md](./ARQUEO_IMPLEMENTATION.md) - Implementación de feature OCR

---

## ⏭️ Próximos Pasos Inmediatos

1. **Configurar secrets**:
   ```bash
   firebase functions:secrets:set API_KEY
   firebase functions:secrets:set STRIPE_SECRET_KEY
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   ```

2. **Desplegar Cloud Functions**:
   ```bash
   firebase deploy --only functions
   ```

3. **Publicar reglas de Firestore**:
   ```bash
   firebase deploy --only firestore:rules
   ```

4. **Actualizar GitHub y Vercel**:
   - Cambiar default branch en GitHub
   - Actualizar Vercel para usar `main`
   - Configurar environment variables en Vercel

5. **Verificar despliegue**:
   ```bash
   firebase functions:list
   curl https://us-central1-easyinventary-d8dbd.cloudfunctions.net/chat \
     -H "Authorization: Bearer $(gcloud auth print-identity-token)"
   ```

---

**Fecha de verificación**: $(Get-Date -Format "yyyy-MM-dd HH:mm")
**Estado general**: ✅ Código listo | ⏳ Pendiente despliegue
