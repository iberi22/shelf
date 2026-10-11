#!/usr/bin/env bash
# =============================================================================
# scripts/verify-features.sh — Canonical SWAL SSOT Feature Verification Script
# Issue #471 — Single source of truth feature verification for Shelf
# SSOT: .gitcore/features.json
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FEATURES_JSON="$ROOT/.gitcore/features.json"
PYTHON="${PYTHON:-python3}"

DO_JSON=0
DO_STRICT=1
for arg in "$@"; do
  case "$arg" in
    --json) DO_JSON=1 ;;
    --strict) DO_STRICT=1 ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if [ ! -f "$FEATURES_JSON" ]; then
  echo "ERROR: SSOT file $FEATURES_JSON not found!" >&2
  exit 1
fi

"$PYTHON" - "$ROOT" "$FEATURES_JSON" "$DO_JSON" "$DO_STRICT" <<'PYEOF'
import json, sys, os

root = sys.argv[1]
features_json_path = sys.argv[2]
do_json = sys.argv[3] == "1"
do_strict = sys.argv[4] == "1"

with open(features_json_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

metadata = data.get('metadata', {})
features = data.get('features', [])

results = []
pct_sum = 0
passed_count = 0
failed_count = 0

def check_path_exists(root_dir, path_str):
    # Strip inline notes e.g., "path/file.ts (note)" or "path/file.ts note"
    clean_path = path_str.split(' ')[0].strip()
    if not clean_path:
        return True

    # Only check if it looks like a path
    if '/' not in clean_path and not clean_path.endswith(('.ts', '.tsx', '.json')):
        return True

    # Check absolute / root-relative path
    p1 = os.path.join(root_dir, clean_path)
    if os.path.exists(p1):
        return True

    # Check relative to apps/shelf-inventory
    p2 = os.path.join(root_dir, 'apps', 'shelf-inventory', clean_path)
    if os.path.exists(p2):
        return True

    return False

for feat in features:
    fid = feat.get('id', 'UNKNOWN')
    title = feat.get('name', feat.get('title', ''))
    pct = feat.get('progress_pct', feat.get('implementation_percentage', feat.get('implementation_pct', 0)))
    pct_sum += pct

    evidence = feat.get('evidence', [])
    missing_paths = []

    for ev in evidence:
        if not check_path_exists(root, ev):
            missing_paths.append(ev)

    is_pass = len(missing_paths) == 0
    if is_pass:
        passed_count += 1
    else:
        failed_count += 1

    results.append({
        "id": fid,
        "name": title,
        "progress_pct": pct,
        "status": feat.get('status', 'unknown'),
        "pass": is_pass,
        "missing_evidence": missing_paths,
        "verdict": "PASS" if is_pass else "FAIL",
        "missing_paths": missing_paths
    })

total_features = len(features)
avg_pct = round(pct_sum / total_features) if total_features > 0 else 0

if do_json:
    output = {
        "ssot": ".gitcore/features.json",
        "total_features": total_features,
        "verified_features": passed_count,
        "failed_features": failed_count,
        "overall_implementation_percentage": avg_pct,
        "closes_issue": 471,
        "features": results
    }
    print(json.dumps(output, indent=2, ensure_ascii=False))
else:
    print("==================================================================")
    print(f" SWAL SSOT Feature Verification (Issue #471) — Canonical Report")
    print(f" SSOT: .gitcore/features.json")
    print("==================================================================")
    for r in results:
        status_str = "PASS" if r["pass"] else "FAIL"
        print(f"  {r['id']:<14} {r['progress_pct']:>3}%  [{status_str}]  {r['name']}")
        if not r["pass"]:
            for m in r["missing_evidence"]:
                print(f"MISS: {r['id']} {m}")
    print("------------------------------------------------------------------")
    print(f" Total Features:                     {total_features}")
    print(f" Summary (passed_count/failed_count): {passed_count}/{failed_count}")
    print(f" Canonical Implementation Score:     {avg_pct}%")
    print("==================================================================")

if failed_count > 0:
    print(f"MISS summary: {failed_count} feature(s) missing evidence paths")
    sys.exit(1)
sys.exit(0)
PYEOF
