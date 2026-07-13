# SECURITY.md — Política de Seguridad de Shelf

**Última actualización:** 2026-07-09

---

## 🔒 Postura de Seguridad

Shelf toma la seguridad **muy en serio**. Como plataforma que maneja datos de inventario, ventas y clientes de negocios reales, hemos implementado:

- **Criptografía post-cuántica** (ML-KEM-768, ML-DSA-65, AES-GCM)
- **Cifrado en reposo y tránsito**
- **Offline-first** (los datos nunca dependen de un servidor central)
- **Firebase Auth** para autenticación segura
- **Stripe** para pagos (PCI compliant)

---

## 🐛 Reportar una Vulnerabilidad

Si encuentras una vulnerabilidad de seguridad en Shelf:

### 1. NO abras un Issue público
Las vulnerabilidades de seguridad **no** deben reportarse en GitHub Issues públicos.

### 2. Contacta directamente
**Email**: brahyan@iberi22.com (o el email de BELA en su perfil de GitHub)

### 3. Proporciona detalles
Incluye en tu reporte:
- Tipo de vulnerabilidad
- Pasos para reproducir
- Impacto potencial
- Versión afectada
- Posible solución (si la tienes)

### 4. Tiempo de respuesta
- **Confirmación de recepción**: < 48 horas
- **Evaluación inicial**: < 5 días hábiles
- **Parche de seguridad**: Dependiendo de severidad

---

## 🛡️ Prácticas de Seguridad

### Para Desarrolladores
1. **No commits de secrets** — .env está en .gitignore
2. **2FA en GitHub** — obligatorio para maintainers
3. **Code review** — todo PR requiere al menos una revisión
4. **Dependabot** — actualizaciones automáticas de seguridad
5. **Biome lint** — detecta patrones inseguros

### Para Usuarios
1. **Cambia tu contraseña regularmente**
2. **No compartas credenciales**
3. **Usa contraseñas fuertes** (recomendamos gestor de contraseñas)
4. **Mantén la app actualizada** (las PWA se actualizan automáticamente)

---

## 🔐 Stack de Seguridad

| Capa | Tecnología | Propósito |
|------|-----------|-----------|
| Autenticación | Firebase Auth | Login/registro seguro |
| Cifrado en reposo | AES-GCM + ML-KEM-768 | Datos locales protegidos |
| Cifrado en tránsito | AES-GCM sobre WebRTC | Comunicación P2P segura |
| Firmas digitales | ML-DSA-65 | Verificación de integridad |
| Pagos | Stripe | PCI-compliant |
| Dependencias | Dependabot + pnpm audit | Vulnerabilidades conocidas |

---

## 📋 Política de Divulgación

- Reportamos vulnerabilidades críticas en **< 7 días** después del parche
- Las vulnerabilidades se documentan en CHANGELOG (sin detalles explotables)
- Creditamos a quien reporta (si así lo desea)

---

## 🚫 Scope Fuera de Seguridad

Lo siguiente **no** está cubierto por esta política:
- Spam o phishing a usuarios
- Ataques de denegación de servicio (DoS)
- Versiones anteriores desactualizadas
- Issues de usabilidad sin implicaciones de seguridad

---

## 📬 Contacto

**Security contact**: brahyan@iberi22.com
**GitHub Security**: https://github.com/iberi22/shelf/security
