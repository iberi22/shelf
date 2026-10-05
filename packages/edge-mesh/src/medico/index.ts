/**
 * Public surface of the medical layer.
 *
 * ─── SCOPE ──────────────────────────────────────────────────────────────────
 *
 * This directory owns the *data model* and its pure validation: the credential
 * type, the endorsement type, the professional record, and the fail-closed
 * registry seam. It does not own the wire protocol, the mesh integration, or the
 * authz decision. `TIPO_MENSAJE` in `src/types/index.ts` has no
 * `CREDENCIAL`/`AVAL` member yet — that file is owned by a parallel agent and is
 * deliberately untouched.
 *
 * Layering, per `docs/medico/modelo-datos.md` §0:
 *
 *   `types.ts`               the four layers as types, no logic
 *   `canonica.ts`            deterministic bytes + hashing (WebCrypto), no logic
 *   `credencial.ts`          layer 1: build, sign, validate (fail closed)
 *   `aval.ts`                layer 2: build, sign, validate, fold, adapt to karma
 *   `registro.ts`            the registry seam + fail-closed licence lookup
 *   `registro-profesional.ts` the aggregate record and its rules
 *
 * Everything is pure: no network, no filesystem, no clock read. `ahora` is always
 * injected, and randomness for an `Aval` nonce is the caller's, so the whole
 * layer is testable with fixtures and no I/O.
 */

export {
  aTransaccionKarma,
  avalCuentaParaPromocion,
  type BorradorAval,
  crearAval,
  idLicenciaDesdeNumero,
  MOTIVO_RECHAZO_AVAL,
  type MotivoRechazoAval,
  OBJETO_QUE_CUENTA,
  prepararCredencialParaAval,
  type ResultadoValidacionAval,
  resumirAvales,
  validarAval,
  validarAvalFirmado,
  verificarFirmaAval,
} from './aval.js';

export {
  bytesAHex,
  bytesAval,
  bytesCredencial,
  canonicalBytes,
  canonicalizarAval,
  canonicalizarCredencial,
  canonicalStringify,
  DOMINIO_ID_CREDENCIAL,
  hashCredencial,
  hashLicencia,
  hexABytes,
  idAval,
  idCredencial,
  normalizarLicencia,
  sha256,
  sha256Hex,
} from './canonica.js';

export {
  type BorradorCredencial,
  crearCredencial,
  esMedicoCertificado,
  hashDeCredencial,
  MOTIVO_RECHAZO_CREDENCIAL,
  type MotivoRechazoCredencial,
  type ResultadoValidacionCredencial,
  validarCredencial,
  validarCredencialFirmada,
  validarVinculoEmision,
  verificarFirmaCredencial,
  volcarCredencial,
} from './credencial.js';
export {
  ESTADO_VERIFICACION_REGISTRO,
  type EstadoVerificacionRegistro,
  type InstantaneaRegistroPais,
  PAISES_SOPORTADOS,
  type ResultadoVerificacionRegistro,
  VerificadorRegistroEnMemoria,
  type VerificadorRegistroPais,
  verificarCredencialContraRegistro,
  verificarHashContraRegistro,
  verificarLicenciaContraRegistro,
} from './registro.js';
export {
  MOTIVO_RECHAZO_REGISTRO,
  type MotivoRechazoRegistro,
  type ResultadoValidacionRegistro,
  recalcularAvalRecibido,
  validarRegistroProfesional,
} from './registro-profesional.js';
export {
  ALCANCE_AVAL,
  type AlcanceAval,
  CAMPOS_OBLIGATORIOS_CREDENCIAL,
  CLASE_VERIFICACION,
  type ClaseVerificacion,
  type CredencialMedica,
  type DeclaracionNodo,
  ESTADO_EMISION,
  type Especialidad,
  type EstadoEmision,
  type MetodoVerificacion,
  OBJETO_AVAL,
  type ObjetoAval,
  type RegistroProfesional,
  type ResumenAvales,
  TIPO_CREDENCIAL,
  type TipoCredencial,
  VERSION_MODELO,
} from './types.js';
