import fs from "node:fs";

const ssot = JSON.parse(fs.readFileSync(".gitcore/features.json", "utf8"));
const avg = ssot.metadata.implementation_percentage;
const impl = ssot.metadata.features_implemented;
const partial = ssot.metadata.features_partial;
const fun = ssot.metadata.audit.product_core_fun_average;
const mesh = ssot.metadata.audit.mesh_pqc_edge_gpu_average;

let ola = fs.readFileSync(".gitcore/planning/OLA-H-PARTIALS.md", "utf8");
ola = ola.replaceAll("Jules triggered", "Integrated");
ola = ola.replace(
  "**Baseline SSOT:** ~88%",
  `**Baseline SSOT:** ~88% → **post-integration ~${avg}%**`,
);
fs.writeFileSync(".gitcore/planning/OLA-H-PARTIALS.md", ola);

for (const [file, replacer] of [
  [
    "AGENTS.md",
    (t) =>
      t
        .replace(
          /21 features, ~[0-9]+% real \([^)]+\)/,
          `21 features, ~${avg}% real (${impl} implemented / ${partial} partial / 0 skeleton)`,
        )
        .replace(/\*\*Última actualización:\*\* [^\n]+/, "**Última actualización:** 2026-07-18")
        .replace(/\*\*Versión del proyecto:\*\* [^\n]+/, "**Versión del proyecto:** 1.2.3"),
  ],
  [
    "README.md",
    (t) =>
      t.replace(
        /Feature registry \(21 features, ~[0-9]+% real —[^)]+\)/,
        `Feature registry (21 features, ~${avg}% real — ${impl} implemented / ${partial} partial)`,
      ),
  ],
  [
    "MEMORY.md",
    (t) =>
      t
        .replace(/\*\*Última actualización:\*\* [^\n]+/, "**Última actualización:** 2026-07-18")
        .replace(
          /\| Features[^\n]+\|/,
          `| Features (promedio AC) | ~${avg}% (${impl} implemented / ${partial} partial / 0 skeleton) |`,
        ),
  ],
  [
    "BOOTSTRAP.md",
    (t) =>
      t.replace(
        /21 features \([^)]+\)/,
        `21 features (~${avg}% AC average; ${impl} implemented / ${partial} partial)`,
      ),
  ],
]) {
  if (!fs.existsSync(file)) continue;
  fs.writeFileSync(file, replacer(fs.readFileSync(file, "utf8")));
}

let task = fs.readFileSync(".gitcore/planning/TASK.md", "utf8");
task = task.replace(
  /\*\*Promedio 21 features\*\* \| \*\*[0-9]+%\*\*[^\n]*/,
  `**Promedio 21 features** | **${avg}%** (post Ola H 2026-07-18)`,
);
task = task.replace(/Core FUN \(14\)\*\* \| ~[0-9]+%/, `Core FUN (14)** | ~${fun}%`);
task = task.replace(
  /P2P \/ Edge \/ PQC \/ GPU \(5\)\*\* \| ~[0-9]+%/,
  `P2P / Edge / PQC / GPU (5)** | ~${mesh}%`,
);
task = task.replace(
  /Implemented \/ Partial \/ Skeleton\*\* \| \*\*[0-9]+ \/ [0-9]+ \/ [0-9]+\*\*/,
  `Implemented / Partial / Skeleton** | **${impl} / ${partial} / 0**`,
);
task = task.replace(
  /Jules Ola H — close partials #297–#300\*\* \| .*/,
  "Jules Ola H — close partials #297–#300** | ✅ integrated |",
);
const rows = ssot.features
  .map(
    (f) =>
      `| ${f.id} | ${f.name} | ${f.priority} | ${f.status} | ${f.implementation_percentage} |`,
  )
  .join("\n");
task = task.replace(
  /## Features \(estado honesto[^\n]*\)[\s\S]*?(?=\n---\n)/,
  `## Features (estado honesto 2026-07-18)\n\n| ID | Feature | Prioridad | Estado | % |\n|----|---------|-----------|--------|---|\n${rows}\n\n`,
);
fs.writeFileSync(".gitcore/planning/TASK.md", task);

console.log({ avg, impl, partial, fun, mesh });
