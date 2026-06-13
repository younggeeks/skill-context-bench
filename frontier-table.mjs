#!/usr/bin/env node
// Aggregate frontier-*.json results into one markdown two-axis table.
// Usage: node frontier-table.mjs frontier-pi-eager.json frontier-pi-v1.json ...

import {readFileSync} from "node:fs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node frontier-table.mjs <result.json> [more.json ...]");
  process.exit(1);
}

const rows = [];
for (const f of files) {
  let j;
  try {
    j = JSON.parse(readFileSync(f, "utf8"));
  } catch {
    console.error(`skip (unreadable): ${f}`);
    continue;
  }
  const variant = f.replace(/.*frontier-/, "").replace(/\.json$/, "");
  const c = j.cost?.rows ?? [];
  const at = (n) => c.find((r) => r.skills === n)?.deltaVs0;
  const d = j.discovery;
  rows.push({
    variant,
    adapter: j.adapter,
    tax25: at(25),
    tax50: at(50),
    tax100: at(100),
    discovery: d ? `${d.discovered}/${d.trials}` : "-",
    applied: d ? `${d.applied}/${d.trials}` : "-",
    discoveryPct: d?.discoveryRate != null ? Math.round(d.discoveryRate * 100) : null,
  });
}

console.log("| variant | tax @25 | tax @50 | tax @100 | discovery | applied |");
console.log("|---|---:|---:|---:|---:|---:|");
for (const r of rows) {
  const t = (v) => (v == null ? "—" : `+${v}`);
  console.log(
    `| ${r.variant} | ${t(r.tax25)} | ${t(r.tax50)} | ${t(r.tax100)} | ${r.discovery}${r.discoveryPct != null ? ` (${r.discoveryPct}%)` : ""} | ${r.applied} |`,
  );
}
console.log("\n_tax = extra input tokens/call vs 0 skills (lower better). discovery = read the right skill on a matched task; applied = used it (higher better)._");
