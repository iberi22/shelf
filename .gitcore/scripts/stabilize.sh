#!/usr/bin/env bash
# =============================================================================
# stabilize.sh — SWAL Stability Protocol (SSP) — Ola A piloto
# Protocol: GitCore 3.8.0 (REQ-007) + SSP design docs/protocols/STABILIZATION-PROTOCOL.md
#
# Orquesta las fases F0-F8 del protocolo de estabilización:
#   F0 Metadata   verify-pipeline --check --test --json (features↔SRS↔US↔tests)
#   F1 Build      verify-pipeline (build ok)
#   F2 Unit       verify-pipeline (test ok)
#   F3 E2E core   specs críticos (serial, --workers=1)
#   F4 Security   audit deps (pnpm/npm/cargo) + secret scan + hooks
#   F5 Score      stability% · functionality% · security%
#   F6 Verdict    STABLE / BETA / UNSTABLE
#   F7 Tag        si STABLE y --tag → vX.Y.Z.DDMMYYYY (solo el script etiqueta)
#   F8 Index      POST a Xavier kind=stability_report (si --index y Xavier up)
#
# Uso:
#   bash .gitcore/scripts/stabilize.sh                # F0-F6 (veredicto, sin tag/index)
#   bash .gitcore/scripts/stabilize.sh --json         # salida JSON
#   bash .gitcore/scripts/stabilize.sh --full         # F0-F8 (index si disponible)
#   bash .gitcore/scripts/stabilize.sh --tag          # aplicar tag si STABLE
#   bash .gitcore/scripts/stabilize.sh --phase 3      # solo fase N
#   bash .gitcore/scripts/stabilize.sh --no-index     # saltar indexación
#   bash .gitcore/scripts/stabilize.sh --quick        # F0+F4+F5+F6 (sin build/test/e2e)
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG="$ROOT/.gitcore/stabilize.config.json"
VERIFY="$ROOT/.gitcore/scripts/verify-pipeline.sh"

DO_JSON=0; DO_FULL=0; DO_TAG=0; DO_INDEX=1; DO_QUICK=0; ONLY_PHASE=0
for arg in "$@"; do
  case "$arg" in
    --json)     DO_JSON=1 ;;
    --full)     DO_FULL=1 ;;
    --tag)      DO_TAG=1 ;;
    --no-index) DO_INDEX=0 ;;
    --quick)    DO_QUICK=1 ;;
    --phase)    ONLY_PHASE=-1 ;; # se setea en el siguiente arg
    *)
      if [ "$ONLY_PHASE" = "-1" ]; then ONLY_PHASE="$arg";
      elif [[ "$arg" =~ ^--phase=([0-9]+)$ ]]; then ONLY_PHASE="${BASH_REMATCH[1]}";
      else echo "Unknown arg: $arg" >&2; exit 2; fi ;;
  esac
done

# ── helpers ────────────────────────────────────────────────────────────────
phase_enabled() { [ "$ONLY_PHASE" = "0" ] || [ "$ONLY_PHASE" = "$1" ]; }
say() { [ "$DO_JSON" = "0" ] && echo "$*"; }
json_emit() { echo "$1"; }

# Cargar config con defaults
REPO="$(jq -r '.repo // "unknown"' "$CONFIG" 2>/dev/null)"
STACK="$(jq -r '.stack // "pnpm"' "$CONFIG" 2>/dev/null)"
BUILD_CMD="$(jq -r '.build_cmd // ""' "$CONFIG" 2>/dev/null)"
UNIT_CMD="$(jq -r '.unit_cmd // ""' "$CONFIG" 2>/dev/null)"
E2E_CMD="$(jq -r '.e2e_cmd // ""' "$CONFIG" 2>/dev/null)"
AUDIT_CMD="$(jq -r '.audit_cmd // "pnpm audit --prod"' "$CONFIG" 2>/dev/null)"
XAVIER_URL="$(jq -r '.xavier.url // "http://localhost:8006"' "$CONFIG" 2>/dev/null)"

declare -A RESULTS
RESULTS[f0]="skip"; RESULTS[f1]="skip"; RESULTS[f2]="skip"; RESULTS[f3]="skip"
RESULTS[f4]="skip"; RESULTS[f5]="skip"; RESULTS[f6]="skip"; RESULTS[f7]="skip"; RESULTS[f8]="skip"

cd "$ROOT"

# ── F0-F2: delegar a verify-pipeline (metadata + build + test) ─────────────
if phase_enabled 0 || phase_enabled 1 || phase_enabled 2; then
  say "── [F0-F2] verify-pipeline ($REPO) ────────────────────────"
  VERIFY_ARGS="--check --test"
  [ "$DO_QUICK" = "1" ] && VERIFY_ARGS=""
  VERIFY_OUT="$(bash "$VERIFY" $VERIFY_ARGS --json 2>/dev/null || echo '{"error":true}')"
  # El verify imprime logs + JSON pretty al final — extraer el bloque JSON
  VERIFY_JSON="$(echo "$VERIFY_OUT" | sed -n '/^{/,$p')"
  [ -z "$VERIFY_JSON" ] && VERIFY_JSON='{"error":true,"pass":0,"fail":0,"total":0}'
  V_PASS="$(echo "$VERIFY_JSON" | jq -r '.pass // "0"')"
  V_FAIL="$(echo "$VERIFY_JSON" | jq -r '.fail // "0"')"
  V_TOTAL="$(echo "$VERIFY_JSON" | jq -r '.total // "0"')"
  V_BUILD="$(echo "$VERIFY_JSON" | jq -r '.build // "unknown"')"
  V_TEST="$(echo "$VERIFY_JSON" | jq -r '.test // "unknown"')"
  if [ "$V_TOTAL" -gt 0 ] 2>/dev/null; then
    RESULTS[f0]="ok ($V_PASS/$V_TOTAL features)"
    case "$V_BUILD" in
      ok) RESULTS[f1]="ok" ;;
      skipped) RESULTS[f1]="skip (--quick)" ;;
      *) RESULTS[f1]="FAILED ($V_BUILD)" ;;
    esac
    case "$V_TEST" in
      ok) RESULTS[f2]="ok" ;;
      skipped) RESULTS[f2]="skip (--quick)" ;;
      *) RESULTS[f2]="FAILED ($V_TEST)" ;;
    esac
  else
    RESULTS[f0]="ERROR (verify-pipeline falló)"; RESULTS[f1]="error"; RESULTS[f2]="error"
  fi
fi

# ── F3: E2E core (serial) ──────────────────────────────────────────────────
if phase_enabled 3; then
  say "── [F3] E2E core (specs críticos, serial) ─────────────────"
  E2E_PASS=0; E2E_FAIL=0
  if [ -n "$E2E_CMD" ] && [ "$DO_QUICK" = "0" ]; then
    SPECS="$(jq -r '.e2e_core_specs[]' "$CONFIG" 2>/dev/null | tr '\n' ' ')"
    if [ -n "$SPECS" ]; then
      E2E_OUT="$(cd "$ROOT" && $E2E_CMD $SPECS --workers=1 --reporter=line 2>&1 | tail -3)"
      E2E_PASS="$(echo "$E2E_OUT" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' | head -1)"
      E2E_FAIL="$(echo "$E2E_OUT" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' | head -1)"
      E2E_PASS="${E2E_PASS:-0}"; E2E_FAIL="${E2E_FAIL:-0}"
    fi
  fi
  E2E_TOTAL=$((E2E_PASS + E2E_FAIL))
  if [ "$E2E_TOTAL" -gt 0 ] 2>/dev/null; then
    RESULTS[f3]="ok ($E2E_PASS/$E2E_TOTAL)"
    [ "$E2E_FAIL" -gt 0 ] && RESULTS[f3]="FAILED ($E2E_FAIL/$E2E_TOTAL fallos)"
  else
    RESULTS[f3]="skip (sin e2e_cmd o --quick)"
  fi
fi

# ── F4: Security ───────────────────────────────────────────────────────────
if phase_enabled 4; then
  say "── [F4] Security (audit + secrets + hooks) ────────────────"
  SEC_AUDIT="ok"; SEC_SECRETS="ok"; SEC_HOOKS="ok"
  # 4a: audit deps (0 high/critical)
  if [ "$DO_QUICK" = "0" ] && [ -n "$AUDIT_CMD" ]; then
    AUDIT_OUT="$(cd "$ROOT" && $AUDIT_CMD 2>&1 | tail -5)"
    A_HIGH="$(echo "$AUDIT_OUT" | grep -oiE '[0-9]+ high' | grep -oE '[0-9]+' | head -1)"
    A_CRIT="$(echo "$AUDIT_OUT" | grep -oiE '[0-9]+ critical' | grep -oE '[0-9]+' | head -1)"
    A_HIGH="${A_HIGH:-0}"; A_CRIT="${A_CRIT:-0}"
    [ "$A_HIGH" -gt 0 ] || [ "$A_CRIT" -gt 0 ] && SEC_AUDIT="FAILED (high=$A_HIGH critical=$A_CRIT)"
  fi
  # 4b: secret scan (patrones del config, excluye node_modules/dist/.git)
  PATTERNS="$(jq -r '.secret_patterns[]' "$CONFIG" 2>/dev/null | tr '\n' '|')"
  PATTERNS="${PATTERNS%|}"
  if [ -n "$PATTERNS" ]; then
    SECRET_HITS="$(grep -rniE "$PATTERNS" "$ROOT/src" "$ROOT/.gitcore" "$ROOT/apps" "$ROOT/packages" --include="*.ts" --include="*.tsx" --include="*.rs" --include="*.js" --include="*.json" --include="*.sh" --include="*.py" 2>/dev/null | grep -v node_modules | grep -v "/dist/" | grep -v "/.vercel/" | grep -v "stabilize.config" | wc -l)"
    if [ "${SECRET_HITS:-0}" -gt 0 ]; then
      SEC_SECRETS="FAILED ($SECRET_HITS hits)"
      grep -rniE "$PATTERNS" "$ROOT/src" "$ROOT/.gitcore" "$ROOT/apps" "$ROOT/packages" --include="*.ts" --include="*.tsx" --include="*.rs" --include="*.js" --include="*.json" --include="*.sh" --include="*.py" 2>/dev/null | grep -v node_modules | grep -v "/dist/" | grep -v "/.vercel/" | grep -v "stabilize.config" | head -6 | while read -r h; do say "    ⚠ $h"; done
    fi
  fi
  # 4c: hooks git funcionales (husky v9 usa core.hooksPath → .husky/_)
  HOOKS_DIR="$(git config core.hooksPath 2>/dev/null || echo ".husky/_")"
  if [ -f "$ROOT/$HOOKS_DIR/pre-commit" ] || [ -x "$ROOT/.husky/pre-commit" ]; then
    LINTSTAGED_OK="$(cd "$ROOT" && pnpm exec lint-staged --help >/dev/null 2>&1 && echo yes || echo no)"
    [ "$LINTSTAGED_OK" != "yes" ] && SEC_HOOKS="FAILED (lint-staged no resuelve biome)"
  else
    SEC_HOOKS="skip (sin pre-commit)"
  fi
  RESULTS[f4]="ok (audit=$SEC_AUDIT secrets=$SEC_SECRETS hooks=$SEC_HOOKS)"
  [ "$SEC_AUDIT" != "ok" ] || [ "$SEC_SECRETS" != "ok" ] || [ "$SEC_HOOKS" != "ok" ] && \
    { [ "$SEC_HOOKS" = "skip" ] || RESULTS[f4]="FAILED (audit=$SEC_AUDIT secrets=$SEC_SECRETS hooks=$SEC_HOOKS)"; }
fi

# ── F5: Score ──────────────────────────────────────────────────────────────
if phase_enabled 5; then
  STABILITY=0; FUNCTIONALITY=0; SECURITY=100
  # stability: media de unit pass% y e2e pass% (si corrieron)
  U_PASS=100; U_TOTAL=100
  case "${RESULTS[f2]}" in
    "ok"*) U_PASS=100; U_TOTAL=100 ;;
    FAILED*) U_PASS=0; U_TOTAL=1 ;;
  esac
  case "${RESULTS[f3]}" in
    skip*) E_PASS=100; E_TOTAL=100 ;;
    *) E_PASS="$E2E_PASS"; E_TOTAL="$E2E_TOTAL"; [ -z "$E_TOTAL" ] && E_TOTAL=1; [ "$E_TOTAL" = "0" ] && E_TOTAL=1 ;;
  esac
  U_PCT=$(( U_PASS * 100 / U_TOTAL )); E_PCT=$(( E_PASS * 100 / E_TOTAL ))
  STABILITY=$(( (U_PCT + E_PCT) / 2 ))
  # functionality: % de features verificadas del verify-pipeline
  V_TOTAL="${V_TOTAL:-0}"; V_FAIL="${V_FAIL:-0}"
  if [ "$V_TOTAL" -gt 0 ] 2>/dev/null; then FUNCTIONALITY=$(( (V_TOTAL - V_FAIL) * 100 / V_TOTAL )); fi
  # security: 100 - penalizaciones
  case "${RESULTS[f4]}" in
    FAILED*) SECURITY=0 ;;
    *audit=FAILED*) SECURITY=0 ;;
  esac
  RESULTS[f5]="stability=$STABILITY% functionality=$FUNCTIONALITY% security=$SECURITY%"
fi

# ── F6: Veredicto ──────────────────────────────────────────────────────────
if phase_enabled 6; then
  VERDICT="UNSTABLE"
  S_STABLE="$(jq -r '.thresholds.stable.stability // 95' "$CONFIG")"
  F_STABLE="$(jq -r '.thresholds.stable.functionality // 100' "$CONFIG")"
  SEC_STABLE="$(jq -r '.thresholds.stable.security // 100' "$CONFIG")"
  S_BETA="$(jq -r '.thresholds.beta.stability // 80' "$CONFIG")"
  F_BETA="$(jq -r '.thresholds.beta.functionality // 70' "$CONFIG")"
  SEC_BETA="$(jq -r '.thresholds.beta.security // 90' "$CONFIG")"
  if [ "$STABILITY" -ge "$S_STABLE" ] && [ "$FUNCTIONALITY" -ge "$F_STABLE" ] && [ "$SECURITY" -ge "$SEC_STABLE" ]; then
    # STABLE exige que TODAS las fases hayan corrido (ninguna en skip)
    case "${RESULTS[f1]}${RESULTS[f2]}${RESULTS[f3]}" in
      *skip*|*error*) VERDICT="UNSTABLE (fases sin verificar: build/test/e2e en skip)" ;;
      *) VERDICT="STABLE" ;;
    esac
  elif [ "$STABILITY" -ge "$S_BETA" ] && [ "$FUNCTIONALITY" -ge "$F_BETA" ] && [ "$SECURITY" -ge "$SEC_BETA" ]; then
    VERDICT="BETA"
  else
    VERDICT="UNSTABLE"
  fi
  RESULTS[f6]="$VERDICT"
fi

# ── F7: Tag estable ────────────────────────────────────────────────────────
if phase_enabled 7; then
  TAG=""
  if [ "${RESULTS[f6]}" = "STABLE" ] && [ "$DO_TAG" = "1" ]; then
    BASE="$(jq -r '.tag_base // "0.5"' "$CONFIG" 2>/dev/null)"
    TS="$(date +%d%m%Y)"
    # bump Z: contar tags existentes con la fecha de hoy
    Z="1"
    LAST="$(git tag -l "v${BASE}.*.${TS}" 2>/dev/null | sort -V | tail -1)"
    [ -n "$LAST" ] && Z="$(( ${LAST##*.} + 1 ))"
    TAG="v${BASE}.${Z}.${TS}"
    git tag "$TAG" 2>/dev/null && say "  tag creado: $TAG"
    RESULTS[f7]="ok ($TAG)"
  elif [ "${RESULTS[f6]}" = "STABLE" ]; then
    RESULTS[f7]="STABLE pero sin --tag (dry-run)"
  else
    RESULTS[f7]="no aplica (veredicto ${RESULTS[f6]})"
  fi
fi

# ── F8: Index Xavier ───────────────────────────────────────────────────────
if phase_enabled 8 && [ "$DO_INDEX" = "1" ]; then
  if [ "${RESULTS[f6]}" != "UNSTABLE" ] || [ "$DO_FULL" = "1" ]; then
    if curl -s -m 3 "$XAVIER_URL/health" >/dev/null 2>&1; then
      TOKEN="${XAVIER_TOKEN:-}"
      SUMMARY="{\"repo\":\"$REPO\",\"verdict\":\"${RESULTS[f6]}\",\"stability\":$STABILITY,\"functionality\":$FUNCTIONALITY,\"security\":$SECURITY,\"f0\":\"${RESULTS[f0]}\",\"f3\":\"${RESULTS[f3]}\",\"f4\":\"${RESULTS[f4]}\",\"tag\":\"$TAG\",\"ts\":\"$(date -Is)\"}"
      CODE="$(curl -s -m 10 -X POST "$XAVIER_URL/v1/memories" \
        -H "Content-Type: application/json" ${TOKEN:+-H "X-Xavier-Token: $TOKEN"} \
        -d "{\"content\":$(echo "$SUMMARY" | jq -Rsa .),\"kind\":\"stability_report\",\"path\":\"stability/$REPO/latest\"}" -o /dev/null -w "%{http_code}")"
      [ "$CODE" = "200" ] && RESULTS[f8]="ok (indexado en Xavier)" || RESULTS[f8]="HTTP $CODE"
    else
      RESULTS[f8]="skip (Xavier no disponible en $XAVIER_URL)"
    fi
  else
    RESULTS[f8]="skip (UNSTABLE)"
  fi
fi

# ── Reporte ────────────────────────────────────────────────────────────────
if [ "$DO_JSON" = "1" ]; then
  json_emit "{\"repo\":\"$REPO\",\"verdict\":\"${RESULTS[f6]}\",\"scores\":{\"stability\":$STABILITY,\"functionality\":$FUNCTIONALITY,\"security\":$SECURITY},\"phases\":{\"f0\":\"${RESULTS[f0]}\",\"f1\":\"${RESULTS[f1]}\",\"f2\":\"${RESULTS[f2]}\",\"f3\":\"${RESULTS[f3]}\",\"f4\":\"${RESULTS[f4]}\",\"f5\":\"${RESULTS[f5]}\",\"f6\":\"${RESULTS[f6]}\",\"f7\":\"${RESULTS[f7]}\",\"f8\":\"${RESULTS[f8]}\",\"tag\":\"$TAG\"}}"
else
  echo ""
  echo "══════════════════════════════════════════════════════"
  echo "  SSP — Stabilize Report  ($REPO)  $(date +%F\ %T)"
  echo "══════════════════════════════════════════════════════"
  printf "  F0 Metadata   %s\n" "${RESULTS[f0]}"
  printf "  F1 Build      %s\n" "${RESULTS[f1]}"
  printf "  F2 Unit       %s\n" "${RESULTS[f2]}"
  printf "  F3 E2E core   %s\n" "${RESULTS[f3]}"
  printf "  F4 Security   %s\n" "${RESULTS[f4]}"
  printf "  F5 Score      %s\n" "${RESULTS[f5]}"
  printf "  F6 Verdict    %s\n" "${RESULTS[f6]}"
  printf "  F7 Tag        %s\n" "${RESULTS[f7]}"
  printf "  F8 Index      %s\n" "${RESULTS[f8]}"
  echo "══════════════════════════════════════════════════════"
  [ "$DO_TAG" = "1" ] && echo "  (--tag activo: etiquetado automático si STABLE)"
fi
