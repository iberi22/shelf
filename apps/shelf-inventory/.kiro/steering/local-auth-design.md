# Diseño: Sistema de Autenticación Local con Recuperación P2P

## Problema Actual

- La app usa Firebase para autenticación (requiere backend externo)
- El usuario quiere cuentas 100% locales sin dependencias externas
- Necesita recuperación de cuenta mediante P2P entre dispositivos

## Solución Propuesta

### Arquitectura de Autenticación Local

```
Dispositivo A (Maestro)          Dispositivo B (Nuevo)
     │                                  │
     │  1. Crea cuenta local            │
     │     (email + password)           │
     │                                  │
     │  2. Genera seed de recuperación  │
     │     (almacenado localmente)      │
     │                                  │
     │◄─────────────────────────────────┤
     │  3. Conexión P2P (QR/PeerID)     │
     │                                  │
     ├─────────────────────────────────►│
     │  4. Solicitud de autorización    │
     │                                  │
     │  5. Usuario aprueba en A         │
     │                                  │
     ├─────────────────────────────────►│
     │  6. Envía seed encriptado        │
     │     (con password temporal)      │
     │                                  │
     │                                  │  7. Usuario ingresa password
     │                                  │     y recupera cuenta
```

## Componentes del Sistema

### 1. LocalAuthManager (`lib/localAuth.ts`)

```typescript
interface LocalAccount {
  id: string;                    // UUID único
  email: string;                 // Identificador de usuario
  passwordHash: string;          // SHA-256 del password
  seed: string;                  // Seed de recuperación (encriptado)
  createdAt: string;             // Timestamp
  devices: DeviceInfo[];         // Dispositivos autorizados
  subscriptionTier: 'free' | 'pro' | 'pyme';
}

interface DeviceInfo {
  deviceId: string;              // UUID del dispositivo
  deviceName: string;            // Nombre amigable
  peerId: string;                // PeerJS ID
  authorizedAt: string;          // Timestamp
  lastSeen: string;              // Última conexión
}
```

**Funciones principales:**
- `createAccount(email, password)` - Crea cuenta local
- `login(email, password)` - Verifica credenciales locales
- `generateRecoverySeed()` - Genera seed de 12 palabras (BIP39-style)
- `authorizeDevice(peerId, deviceName)` - Autoriza nuevo dispositivo
- `recoverAccount(seed, newPassword)` - Recupera cuenta con seed

### 2. P2P Recovery Protocol

**Mensajes nuevos para P2P:**

```typescript
type SyncMessage = 
  | { type: 'REQUEST_ACCOUNT_RECOVERY'; payload: { email: string; deviceName: string } }
  | { type: 'RECOVERY_APPROVED'; payload: { encryptedSeed: string; tempKey: string } }
  | { type: 'RECOVERY_DENIED'; payload: { reason: string } }
  | { type: 'DEVICE_AUTHORIZATION'; payload: { deviceId: string; deviceName: string } }
  // ... mensajes existentes
```

**Flujo de recuperación:**

1. **Dispositivo B** se conecta a **Dispositivo A** vía P2P
2. **B** envía `REQUEST_ACCOUNT_RECOVERY` con email
3. **A** muestra notificación al usuario: "¿Autorizar dispositivo X?"
4. Si aprueba, **A** envía `RECOVERY_APPROVED` con seed encriptado
5. **B** solicita password al usuario para desencriptar seed
6. **B** recrea cuenta local con el seed

### 3. Modificaciones a AuthContext

**Eliminar dependencia de Firebase:**

```typescript
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  
  // Métodos locales (sin Firebase)
  createLocalAccount: (email: string, password: string) => Promise<void>;
  loginLocal: (email: string, password: string) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
  
  // Recuperación P2P
  requestAccountRecovery: (email: string, targetPeerId: string) => Promise<void>;
  approveRecoveryRequest: (requestId: string) => Promise<void>;
  denyRecoveryRequest: (requestId: string) => Promise<void>;
  
  // Gestión de dispositivos
  getAuthorizedDevices: () => DeviceInfo[];
  revokeDevice: (deviceId: string) => Promise<void>;
  
  // Lock screen (ya existe)
  isLocked: boolean;
  unlockApp: (pin: string) => Promise<boolean>;
  setAppLock: (pin: string | null) => Promise<void>;
}
```

### 4. UI Components

**Nuevos componentes necesarios:**

- `LocalSignupModal.tsx` - Registro de cuenta local
  - Email + Password
  - Muestra seed de recuperación (12 palabras)
  - Usuario debe confirmar que guardó el seed

- `RecoveryRequestModal.tsx` - Solicitud de recuperación
  - Input: Email de la cuenta
  - Escanea QR o ingresa PeerID del dispositivo maestro
  - Espera aprobación

- `RecoveryApprovalModal.tsx` - Aprobación en dispositivo maestro
  - Muestra: "Dispositivo X solicita acceso a cuenta Y"
  - Botones: Aprobar / Rechazar

- `DeviceManagementPanel.tsx` - Gestión de dispositivos
  - Lista de dispositivos autorizados
  - Opción de revocar acceso

## Almacenamiento Local

### LocalStorage Structure

```javascript
// Cuenta principal
localStorage.setItem('local_account', JSON.stringify({
  id: 'uuid-v4',
  email: 'user@example.com',
  passwordHash: 'sha256-hash',
  seedEncrypted: 'encrypted-seed-with-password',
  createdAt: '2026-06-01T10:00:00Z',
  devices: [
    {
      deviceId: 'device-uuid',
      deviceName: 'Mi Laptop',
      peerId: 'peer-id-123',
      authorizedAt: '2026-06-01T10:00:00Z',
      lastSeen: '2026-06-01T12:00:00Z'
    }
  ],
  subscriptionTier: 'free'
}));

// Dispositivo actual
localStorage.setItem('device_info', JSON.stringify({
  deviceId: 'device-uuid',
  deviceName: 'Mi Laptop',
  createdAt: '2026-06-01T10:00:00Z'
}));
```

## Seguridad

### Encriptación del Seed

```typescript
// Usar Web Crypto API
async function encryptSeed(seed: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(seed);
  
  // Derivar key del password
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('shelf-salt'), // Usar salt único por usuario
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  // Retornar IV + encrypted data en base64
  return btoa(String.fromCharCode(...iv, ...new Uint8Array(encrypted)));
}
```

### Hashing de Passwords

- Usar **SHA-256** con salt único por usuario
- Almacenar solo el hash, nunca el password en texto plano
- Considerar **PBKDF2** con 100,000 iteraciones para mayor seguridad

## Flujo de Usuario

### Primera Vez (Crear Cuenta)

1. Usuario abre la app
2. Selecciona "Crear cuenta local"
3. Ingresa email + password
4. Sistema genera seed de 12 palabras
5. **CRÍTICO:** Usuario debe copiar y guardar el seed
6. Confirma que guardó el seed
7. Cuenta creada, puede usar la app

### Recuperación en Nuevo Dispositivo

1. Usuario abre app en dispositivo nuevo
2. Selecciona "Recuperar cuenta"
3. Ingresa email de la cuenta
4. Opciones:
   - **A) Con seed:** Ingresa las 12 palabras + nuevo password
   - **B) Con P2P:** Escanea QR del dispositivo maestro
5. Si elige P2P:
   - Conecta con dispositivo maestro
   - Solicita autorización
   - En dispositivo maestro aparece notificación
   - Usuario aprueba
   - Dispositivo nuevo recibe seed encriptado
   - Ingresa password para desencriptar
   - Cuenta recuperada

### Gestión de Dispositivos

1. Usuario va a Settings → Dispositivos
2. Ve lista de dispositivos autorizados
3. Puede revocar acceso a dispositivos perdidos/robados
4. Dispositivo revocado no puede sincronizar más

## Ventajas de este Enfoque

✅ **Sin backend externo** - Todo funciona localmente
✅ **Recuperación P2P** - No necesita servidor central
✅ **Seed de respaldo** - Usuario puede recuperar sin otro dispositivo
✅ **Multi-dispositivo** - Sincronización P2P ya implementada
✅ **Seguro** - Encriptación con Web Crypto API
✅ **Offline-first** - Funciona sin internet

## Desventajas / Consideraciones

⚠️ **Responsabilidad del usuario** - Debe guardar el seed
⚠️ **Sin recuperación de password** - Si pierde seed y dispositivos, pierde cuenta
⚠️ **Sincronización manual** - Dispositivos deben estar conectados simultáneamente
⚠️ **No hay backup en la nube** - Todo es local

## Migración desde Firebase

Para usuarios existentes con cuentas Firebase:

1. Detectar si hay cuenta Firebase activa
2. Ofrecer "Migrar a cuenta local"
3. Exportar datos de Firestore a localStorage
4. Crear cuenta local con mismo email
5. Generar seed de recuperación
6. Opcional: Mantener ambas cuentas (local + cloud)

## Implementación por Fases

### Fase 1: Core Local Auth
- [ ] Crear `lib/localAuth.ts`
- [ ] Modificar `AuthContext.tsx` para soportar auth local
- [ ] Crear `LocalSignupModal.tsx`
- [ ] Crear `LocalLoginModal.tsx`

### Fase 2: Recovery Seed
- [ ] Implementar generación de seed (12 palabras)
- [ ] Encriptación/desencriptación con Web Crypto API
- [ ] UI para mostrar y confirmar seed

### Fase 3: P2P Recovery
- [ ] Extender `p2p.ts` con mensajes de recuperación
- [ ] Crear `RecoveryRequestModal.tsx`
- [ ] Crear `RecoveryApprovalModal.tsx`
- [ ] Implementar flujo completo de recuperación

### Fase 4: Device Management
- [ ] Crear `DeviceManagementPanel.tsx`
- [ ] Implementar revocación de dispositivos
- [ ] Sincronizar lista de dispositivos vía P2P

### Fase 5: Migration & Polish
- [ ] Herramienta de migración desde Firebase
- [ ] Hacer Firebase opcional (solo para Pro tier)
- [ ] Testing exhaustivo
- [ ] Documentación de usuario

## Preguntas para Decidir

1. **¿Seed de 12 o 24 palabras?** (12 es más fácil, 24 más seguro)
2. **¿Permitir recuperación solo con seed o también con P2P?** (Ambos recomendado)
3. **¿Mantener Firebase como opción para Pro tier?** (Backup en la nube)
4. **¿Límite de dispositivos autorizados?** (Ej: 5 dispositivos máximo)
5. **¿Expiración de autorizaciones?** (Ej: reautorizar cada 90 días)
