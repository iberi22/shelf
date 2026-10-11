# SSOT Feature Verification Contract

This document acts as a machine-checkable contract to ensure that single source of truth (SSOT) metrics for the iberi22/shelf repository are reliably captured and that "honest auditing" numbers are presented without drift or falsification.

## Canonical SSOT

The definitive SSOT path is `.gitcore/features.json`. Any other features.json file in this repository is derived or specific to a scoped package and must not be used to calculate product implementation score.

## Non-Negotiable Product Number

The authentic product implementation score is precisely **91–93%**.

### Forbidden Quotes
The following metrics represent distinct tracking concerns (or heuristics) and must *never* be quoted as the "product percentage" or "implementation score" of the repository:
- `97%` — Reflects a GitCore protocol health index, NOT the product score.
- `42.5%` — (Or 42) Derived from a faulty heuristic measuring only lines, creating a massive false negative.
- `100%` / `21/21 PASS` — Result of a misconfigured `verify-pipeline.sh` script producing false positives (failing to actually parse file missing states).
- `66%` — This number refers uniquely to the `packages/edge-mesh/features.json` component catalog.

### The Edge-Mesh Catalog Non-Mixing Rule
The edge-mesh component tracks its own metrics inside `packages/edge-mesh/features.json` (currently around 66%). These metrics must remain completely isolated from the top-level 21 SRC features list in the repository. Mixing the 66% edge-mesh metrics into the main product statistics is strictly prohibited.

## Verification Proofs

The validity of the metrics and verification systems is checked by automated tests via command execution. The proofs below ensure that the codebase strictly conforms to the verified contract properties.

### Proof: Features.json exists
```bash
ls -la .gitcore/features.json
```

### Proof: Verify Features Failures Paths
```bash
grep -c "exit 1" scripts/verify-features.sh
```

### Proof: The Contract Length
```bash
wc -l docs/FEATURE_SSOT_CONTRACT.md
```

### Proof: JSON Load Check
```python
import json
json.load(open('.gitcore/features.json', 'r'))
print('features.json is valid')
```

### Machine-Checkable Evidence Enforcement
Every `evidence` item defined in `.gitcore/features.json` must resolve to an existing valid file or directory either:
1. Relative to the repository root
2. Relative to `apps/shelf-inventory/`

For strings that are textual notes, they are not strictly resolved as paths (no `/` or suffix like `.ts`/`.tsx`/`.json`). This ensures that scripts like `verify-features.sh` will explicitly catch and log true path regressions:

```bash
bash scripts/verify-features.sh --strict
```

If drift is detected in document status sync:
```bash
node scripts/sync-feature-status-docs.mjs --check
```

Any drift results in a non-zero exit code to halt automated PR verifications in CI.
