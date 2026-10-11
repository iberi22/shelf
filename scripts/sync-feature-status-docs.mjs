/**
 * Sync human-readable feature status docs from .gitcore/features.json (SSOT).
 * Run: node scripts/sync-feature-status-docs.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const isCheck = args.includes("--check");
const isWrite = args.includes("--write");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function safeWriteFileSync(filePath, content) {
  if (isCheck) {
    if (fs.existsSync(filePath)) {
      const currentContent = fs.readFileSync(filePath, "utf8");
      if (currentContent !== content) {
        console.error(`Drift detected in ${filePath}`);
        process.exit(1);
      }
    } else {
      console.error(`Drift detected: ${filePath} does not exist`);
      process.exit(1);
    }
  }

  if (isWrite) {
    fs.writeFileSync(filePath, content);
  } else if (!isCheck) {
    console.warn(`Skipping write to ${filePath} (use --write to apply changes)`);
  }
}
const ssot = JSON.parse(fs.readFileSync(path.join(root, ".gitcore/features.json"), "utf8"));

const statusLabel = (s) =>
  s === "implemented" ? "Implemented" : s === "partial" ? "Partial" : s === "skeleton" ? "Skeleton" : s;

const byId = Object.fromEntries(ssot.features.map((f) => [f.id, f]));
const m = ssot.metadata;
const a = m.audit;

function funDisplayName(f) {
  if (f.id === "SRC-FUN-008") return "Authentication (Local) & Device Security";
  if (f.id === "SRC-FUN-013") return "Multi-user Access (P2P Team)";
  return f.name;
}

// --- FEATURES_STATUS.md ---
const featuresStatus = `# Features Implementation Status

**Last updated:** ${m.updated} (honest codebase audit)  
**SSOT:** \`.gitcore/features.json\` + \`.gitcore/features-details.json\`  
**Project average:** **~${m.implementation_percentage}%** (${m.features_implemented} implemented / ${m.features_partial} partial / ${m.features_skeleton} skeleton)

> Percentages are code + tests vs acceptance criteria. Residual work lives in per-feature \`gaps\` and \`future_roadmap\`.

## Summary counts

| Bucket | Count |
|--------|------:|
| Implemented (≥85%) | **${m.features_implemented}** |
| Partial (40–84%) | **${m.features_partial}** |
| Skeleton (<40%) | **${m.features_skeleton}** |
| **Average** | **${m.implementation_percentage}%** |
| FUN average | **${a.product_core_fun_average}%** |
| Mesh/PQC/EDGE/GPU average | **${a.mesh_pqc_edge_gpu_average}%** |

## All SRC features

| ID | Feature | Status | % | Maturity |
|----|---------|--------|--:|----------|
${ssot.features
  .map(
    (f) =>
      `| ${f.id} | ${funDisplayName(f)} | ${f.status} | ${f.implementation_percentage} | ${f.maturity} |`,
  )
  .join("\n")}

## Top residual gaps (partial features)

${ssot.features
  .filter((f) => f.status === "partial")
  .map((f) => `- **${f.id} (${f.implementation_percentage}%)**: ${(f.gaps || []).join("; ") || "see SSOT"}`)
  .join("\n")}

## Audit notes

- Method: ${a.method}
- Playwright specs: ${a.playwright_specs} · Cypress E2E: ${a.cypress_e2e_specs} · edge-mesh units: ${a.edge_mesh_unit_tests}
- Auth runtime: ${a.auth_runtime}
- Subscription: ${a.subscription_runtime}
- Claims corrected this audit: ${(a.claims_debunked || []).join(" · ")}
`;

safeWriteFileSync(path.join(root, "apps/shelf-inventory/FEATURES_STATUS.md"), featuresStatus);

// --- docs/src/index.md tables ---
const indexPath = path.join(root, "docs/src/index.md");
let index = fs.readFileSync(indexPath, "utf8");
index = index.replace(
  /\*\*Project average:\*\*[^\n]*/,
  `**Project average:** **~${m.implementation_percentage}%** (${m.features_implemented} implemented / ${m.features_partial} partial / ${m.features_skeleton} skeleton)`,
);

const funTable = `| SRC ID | Document | Priority | Status | Implementation |
| --- | --- | --- | --- | ---: |
${ssot.features
  .filter((f) => f.category === "FUN")
  .map((f) => {
    const slug = f.id;
    const docName =
      f.id === "SRC-FUN-008"
        ? "Auth (Local)"
        : f.id === "SRC-FUN-013"
          ? "Multi-user (P2P)"
          : f.name.split(" (")[0];
    return `| ${slug} | [${docName}](features/${slug}.md) | ${f.priority} | ${statusLabel(f.status)} | ${f.implementation_percentage}% |`;
  })
  .join("\n")}`;

index = index.replace(
  /## Core Features \(FUN\)\n\n\| SRC ID \| Document \| Priority \| Status \| Implementation \|[\s\S]*?(?=\n## )/,
  `## Core Features (FUN)\n\n${funTable}\n\n`,
);

const nfTable = `| SRC ID | Document | Priority | Status | Implementation |
| --- | --- | --- | --- | ---: |
${ssot.features
  .filter((f) => f.category !== "FUN")
  .map(
    (f) =>
      `| ${f.id} | [${f.name.split(" (")[0]}](non-functional/${f.id}.md) | ${f.priority} | ${statusLabel(f.status)} | ${f.implementation_percentage}% |`,
  )
  .join("\n")}`;

if (/## Non-Functional/.test(index)) {
  index = index.replace(
    /## Non-Functional[\s\S]*?(?=\n## |$)/,
    `## Non-Functional\n\n${nfTable}\n\n`,
  );
} else if (/## Infrastructure/.test(index)) {
  index = index.replace(
    /## Infrastructure[\s\S]*?(?=\n## |$)/,
    `## Infrastructure / Non-Functional\n\n${nfTable}\n\n`,
  );
}

safeWriteFileSync(indexPath, index);

// --- docs/src/REQUIREMENTS.md ---
const reqPath = path.join(root, "docs/src/REQUIREMENTS.md");
let req = fs.readFileSync(reqPath, "utf8");
const reqSummary = `## Status Summary

| SRC ID | Feature | Priority | Status | Implementation |
| --- | --- | --- | --- | ---: |
${ssot.features
  .filter((f) => f.category === "FUN")
  .map(
    (f) =>
      `| ${f.id} | ${funDisplayName(f)} | ${f.priority} | ${statusLabel(f.status)} | ${f.implementation_percentage}% |`,
  )
  .join("\n")}
`;
req = req.replace(/## Status Summary[\s\S]*?(?=\n## SRC-FUN-001)/, `${reqSummary}\n`);
req = req.replace(
  /^> Honest audit[\s\S]*?(?=\n\n## Status Summary)/m,
  `> Honest audit ${m.updated} (deep codebase scan): percentages reflect code + tests vs acceptance criteria (not aspirational 100%).
> **SSOT:** \`.gitcore/features.json\` and \`.gitcore/features-details.json\`
> Project average (all 21 SRC): **~${m.implementation_percentage}%** · FUN avg **~${a.product_core_fun_average}%** · ${m.features_implemented} implemented / ${m.features_partial} partial / ${m.features_skeleton} skeleton
> Human-readable mirror: \`apps/shelf-inventory/FEATURES_STATUS.md\``,
);

// Update per-feature **Priority:** ... **Implementation:** NN% lines after each SRC-FUN heading
for (const f of ssot.features.filter((x) => x.category === "FUN")) {
  const re = new RegExp(
    `(## ${f.id}:[^\\n]*\\n\\n\\*\\*Priority:\\*\\*\\s*)${f.priority}\\s*\\|\\s*\\*\\*Status:\\*\\*\\s*[^|\\n]+(\\s*\\|\\s*\\*\\*Implementation:\\*\\*\\s*)\\d+%`,
  );
  if (re.test(req)) {
    req = req.replace(
      re,
      `$1${f.priority} | **Status:** ${statusLabel(f.status)} $2${f.implementation_percentage}%`.replace(
        /\|\s+\|/g,
        "|",
      ),
    );
  } else {
    // looser: any status line near this heading within next 400 chars
    const idx = req.indexOf(`## ${f.id}:`);
    if (idx >= 0) {
      const slice = req.slice(idx, idx + 500);
      const fixed = slice.replace(
        /(\*\*Priority:\*\*\s*P\d+\s*\|\s*\*\*Status:\*\*\s*)([^|\n]+)(\s*\|\s*\*\*Implementation:\*\*\s*)\d+%/,
        `$1${statusLabel(f.status)}$3${f.implementation_percentage}%`,
      );
      req = req.slice(0, idx) + fixed + req.slice(idx + slice.length);
    }
  }
}
req = req.replace(/## SRC-FUN-008: Authentication & Cloud Sync/, "## SRC-FUN-008: Authentication (Local) & Device Security");
req = req.replace(/## SRC-FUN-013: Multi-user Access \(Pyme Plan\)/, "## SRC-FUN-013: Multi-user Access (P2P Team)");
safeWriteFileSync(reqPath, req);

// --- docs/src/NON-FUNCTIONAL.md summary if present ---
const nfPath = path.join(root, "docs/src/NON-FUNCTIONAL.md");
if (fs.existsSync(nfPath)) {
  let nf = fs.readFileSync(nfPath, "utf8");
  const table = `| SRC ID | Feature | Priority | Status | Implementation |
| --- | --- | --- | --- | ---: |
${ssot.features
  .filter((f) => f.category !== "FUN")
  .map(
    (f) =>
      `| ${f.id} | ${f.name} | ${f.priority} | ${statusLabel(f.status)} | ${f.implementation_percentage}% |`,
  )
  .join("\n")}`;
  if (/## Status Summary/.test(nf)) {
    nf = nf.replace(/## Status Summary[\s\S]*?(?=\n## )/, `## Status Summary\n\n${table}\n\n`);
  } else if (/## Overview/.test(nf)) {
    nf = nf.replace(/## Overview/, `## Status Summary\n\n${table}\n\n## Overview`);
  } else {
    nf = `# Non-Functional Requirements\n\n## Status Summary\n\n${table}\n\n` + nf.replace(/^# Non-Functional[^\n]*\n+/, "");
  }
  // banner
  if (!nf.includes("Honest audit")) {
    nf = nf.replace(
      /^(# [^\n]+\n)/,
      `$1\n> Honest audit ${m.updated}: non-functional average ~${a.mesh_pqc_edge_gpu_average}% (PQC/P2P/CRDT/EDGE/GPU). SSOT: \`.gitcore/features.json\`.\n`,
    );
  } else {
    nf = nf.replace(
      /> Honest audit[^\n]*/,
      `> Honest audit ${m.updated}: non-functional (PQC/P2P/CRDT/EDGE/GPU) avg ~${a.mesh_pqc_edge_gpu_average}%. Project avg ~${m.implementation_percentage}%. SSOT: \`.gitcore/features.json\`.`,
    );
  }
  safeWriteFileSync(nfPath, nf);
}

// --- .gitcore/planning/TASK.md executive + table ---
const taskPath = path.join(root, ".gitcore/planning/TASK.md");
let task = fs.readFileSync(taskPath, "utf8");
const exec = `## 🟢 Resumen Ejecutivo

| Estado | % |
|--------|---|
| **Promedio 21 features** | **${m.implementation_percentage}%** (honest audit ${m.updated}) |
| **Core FUN (14)** | ~${a.product_core_fun_average}% |
| **P2P / Edge / PQC / GPU (5)** | ~${a.mesh_pqc_edge_gpu_average}% |
| **Implemented / Partial / Skeleton** | **${m.features_implemented} / ${m.features_partial} / ${m.features_skeleton}** |
| **SSOT** | \`.gitcore/features.json\` + \`features-details.json\` |

> No reclamar 100% project-wide mientras existan partial. Plan histórico de sesión: \`.gitcore/planning/PLAN-SESSION-FEATURES-2026-07-17.md\`.
`;
task = task.replace(/## 🟢 Resumen Ejecutivo[\s\S]*?(?=\n---\n)/, `${exec}\n`);

const featTable = `## Features (estado honesto ${m.updated})

| ID | Feature | Prioridad | Estado | % |
|----|---------|-----------|--------|---|
${ssot.features
  .map(
    (f) =>
      `| ${f.id} | ${funDisplayName(f)} | ${f.priority} | ${f.status} | ${f.implementation_percentage} |`,
  )
  .join("\n")}
`;
task = task.replace(/## Features \(estado honesto[^\n]*\)[\s\S]*?(?=\n---\n)/, `${featTable}\n`);
// Phase G row
task = task.replace(
  /\| G \| QA CI hardened → 100% \| .*/,
  `| G | QA CI hardened + honest SSOT audit | ✅ |`,
);
safeWriteFileSync(taskPath, task);

// --- per-SRC docs Implementation % if present ---
const funDir = path.join(root, "docs/src/features");
const nfDir = path.join(root, "docs/src/non-functional");
for (const f of ssot.features) {
  const dir = f.category === "FUN" ? funDir : nfDir;
  const p = path.join(dir, `${f.id}.md`);
  if (!fs.existsSync(p)) continue;
  let body = fs.readFileSync(p, "utf8");
  body = body.replace(
    /(\*\*Implementation:\*\*\s*)\d+%/gi,
    `$1${f.implementation_percentage}%`,
  );
  body = body.replace(
    /(\*\*Status:\*\*\s*)(Implemented|Partial|Skeleton|implemented|partial|skeleton)/gi,
    `$1${statusLabel(f.status)}`,
  );
  body = body.replace(
    /(Implementation percentage:\s*)\d+/gi,
    `$1${f.implementation_percentage}`,
  );
  // banner line
  if (/Audit|audit|%/.test(body.slice(0, 400))) {
    body = body.replace(
      /> \*\*Audit[^\n]*/i,
      `> **Audit ${m.updated}:** ${f.implementation_percentage}% · ${f.status} · maturity \`${f.maturity}\`. SSOT: \`.gitcore/features.json\`.`,
    );
  }
  safeWriteFileSync(p, body);
}

console.log(
  JSON.stringify(
    {
      avg: m.implementation_percentage,
      implemented: m.features_implemented,
      partial: m.features_partial,
      fun: a.product_core_fun_average,
      mesh: a.mesh_pqc_edge_gpu_average,
    },
    null,
    2,
  ),
);
