# Guía de Despliegue - Shelf Application

## Estado Actual del Backend

### ✅ Servicios de Google Cloud Habilitados
- Cloud Functions API
- Cloud Firestore API
- Firebase Hosting API
- Firebase Management API
- Cloud Storage API
- Firebase Installations API

### 📦 Proyecto Firebase
- **Proyecto ID**: `easyinventary-d8dbd`
- **Número de Proyecto**: `246628968661`
- **Nombre**: easyInventary

---

## Pasos de Despliegue Completo

### 1. Configurar Variables de Entorno para Cloud Functions

#### Opción A: Usar Google Secret Manager (Recomendado)

```bash
# 1. Habilitar Secret Manager API
gcloud services enable secretmanager.googleapis.com --project=easyinventary-d8dbd

# 2. Crear secretos
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create API_KEY --data-file=- --project=easyinventary-d8dbd
echo -n "YOUR_STRIPE_SECRET_KEY" | gcloud secrets create STRIPE_SECRET_KEY --data-file=- --project=easyinventary-d8dbd
echo -n "YOUR_STRIPE_WEBHOOK_SECRET" | gcloud secrets create STRIPE_WEBHOOK_SECRET --data-file=- --project=easyinventary-d8dbd

# 3. Dar permisos a Cloud Functions para acceder a los secretos
gcloud secrets add-iam-policy-binding API_KEY \
  --member="serviceAccount:easyinventary-d8dbd@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=easyinventary-d8dbd

gcloud secrets add-iam-policy-binding STRIPE_SECRET_KEY \
  --member="serviceAccount:easyinventary-d8dbd@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=easyinventary-d8dbd

gcloud secrets add-iam-policy-binding STRIPE_WEBHOOK_SECRET \
  --member="serviceAccount:easyinventary-d8dbd@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=easyinventary-d8dbd
```

#### Opción B: Usar archivo .env (Solo para desarrollo local)

```bash
cd functions
cp .env.example .env
# Editar .env con tus claves reales
```

### 2. Actualizar firebase.json para usar Secret Manager

El archivo `firebase.json` debe incluir la configuración de secretos:

```json
{
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log", ".env", ".env.*"],
      "predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build"],
      "runtime": "nodejs20"
    }
  ]
}
```

### 3. Desplegar Cloud Functions

```bash
# Asegurarse de estar en el directorio correcto
cd E:\scripts-python\shelf

# Compilar las funciones
cd functions
npm run build
cd ..

# Desplegar todas las funciones
firebase deploy --only functions

# O desplegar funciones específicas
firebase deploy --only functions:chat,functions:extractInvoice,functions:createCheckoutSession,functions:stripeWebhook
```

### 4. Desplegar Reglas de Firestore

```bash
firebase deploy --only firestore:rules
```

### 5. Desplegar Frontend a Firebase Hosting (Opcional, si no usas Vercel)

```bash
# Construir la aplicación
npm run build

# Desplegar hosting
firebase deploy --only hosting
```

### 6. Configurar Vercel para usar rama `main`

#### Vía CLI de Vercel:
```bash
# Instalar Vercel CLI si no está instalado
npm install -g vercel

# Iniciar sesión
vercel login

# Configurar el proyecto
vercel link

# Cambiar rama de producción a main
vercel --prod
```

#### Vía Dashboard de Vercel:
1. Ve a tu proyecto en https://vercel.com/dashboard
2. Settings → Git → Production Branch
3. Cambiar de `master` a `main`
4. Guardar cambios

### 7. Configurar Variables de Entorno en Vercel

En el dashboard de Vercel, ir a Settings → Environment Variables y agregar:

```
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=easyinventary-d8dbd.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=easyinventary-d8dbd
VITE_FIREBASE_STORAGE_BUCKET=easyinventary-d8dbd.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=246628968661
VITE_FIREBASE_APP_ID=your_firebase_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

---

## Verificación Post-Despliegue

### 1. Verificar Cloud Functions

```bash
# Listar funciones desplegadas
firebase functions:list

# Ver logs de funciones
firebase functions:log

# Probar función específica
curl -X POST https://us-central1-easyinventary-d8dbd.cloudfunctions.net/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TEST_TOKEN" \
  -d '{"prompt": "test", "inventoryData": {}}'
```

### 2. Verificar Reglas de Firestore

```bash
# Ver reglas actuales
firebase firestore:indexes

# Probar reglas localmente
firebase emulators:start --only firestore
```

### 3. Verificar Despliegue en Vercel

```bash
# Ver información del despliegue
vercel inspect

# Ver logs
vercel logs
```

---

## Estructura de URLs del Backend

Una vez desplegado, las Cloud Functions estarán disponibles en:

- **Chat AI**: `https://us-central1-easyinventary-d8dbd.cloudfunctions.net/chat`
- **Extract Invoice**: `https://us-central1-easyinventary-d8dbd.cloudfunctions.net/extractInvoice`
- **Create Checkout**: `https://us-central1-easyinventary-d8dbd.cloudfunctions.net/createCheckoutSession`
- **Stripe Webhook**: `https://us-central1-easyinventary-d8dbd.cloudfunctions.net/stripeWebhook`

Si usas Firebase Hosting, las URLs serán:
- `https://easyinventary-d8dbd.web.app/api/chat`
- `https://easyinventary-d8dbd.web.app/api/extractInvoice`
- etc.

---

## Checklist de Producción

- [ ] Variables de entorno configuradas en Secret Manager
- [ ] Cloud Functions desplegadas y funcionando
- [ ] Reglas de Firestore publicadas y seguras
- [ ] Rama `main` configurada como rama principal en GitHub
- [ ] Vercel configurado para desplegar desde rama `main`
- [ ] Variables de entorno configuradas en Vercel
- [ ] Certificados SSL activos
- [ ] Webhooks de Stripe configurados con la URL de producción
- [ ] Claves de API de Gemini con límites de producción
- [ ] Monitoreo de errores activo (Firebase Crashlytics o Sentry)

---

## Comandos Rápidos

```bash
# Despliegue completo
firebase deploy

# Solo functions
firebase deploy --only functions

# Solo hosting
firebase deploy --only hosting

# Solo firestore
firebase deploy --only firestore:rules,firestore:indexes

# Ver logs en tiempo real
firebase functions:log --only chat,extractInvoice

# Verificar estado de despliegue
firebase projects:list
gcloud services list --enabled --project=easyinventary-d8dbd
```

---

## Solución de Problemas Comunes

### Error: "API_KEY not found"
- Verificar que los secretos estén creados en Secret Manager
- Verificar permisos de la cuenta de servicio
- Redesplegar las funciones

### Error: "CORS"
- Verificar configuración CORS en `firebase.json`
- Verificar headers en Vercel
- Asegurarse de que las funciones permitan el origen de Vercel

### Error: "Function not found"
- Verificar que las funciones se hayan desplegado correctamente
- Verificar que el nombre de la función coincida con el código
- Revisar logs: `firebase functions:log`

### Error: Stripe webhook failing
- Verificar que el webhook secret sea correcto
- Verificar que la URL del webhook en Stripe apunte a la función correcta
- Revisar logs de Stripe Dashboard

---

## Migración de master a main - Completada ✅

- [x] Rama local renombrada a `main`
- [x] Rama `main` empujada a GitHub
- [ ] Rama `master` eliminada de GitHub (requiere cambio de rama por defecto en GitHub settings primero)
- [ ] Vercel configurado para desplegar desde `main`

### Próximos Pasos
1. Ir a GitHub → Settings → Branches → Cambiar default branch a `main`
2. Luego ejecutar: `git push origin :master` para eliminar rama master
3. Actualizar protecciones de rama para `main`
