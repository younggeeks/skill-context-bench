#!/usr/bin/env node
// Two-axis skill-bloat benchmark: COST (tokens/call as skills 0->N) AND
// DISCOVERY (does a skill-matched task actually find -> read -> apply the right
// skill). Cheap savings that wreck discovery are not a win; this scores both.
//
// Usage:
//   node frontier.mjs --adapter pi [--skills 0,25,50,100] [--runs 3]
//                     [--discovery-count 24] [--trials 6]
//                     [--cost-only|--discovery-only] [--out result.json]
//
// Adapters: pi | mini-harness | claude-code  (see ./adapters/*.mjs)

import {writeFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {median, mkWorkdir, cleanup} from "./lib/run.mjs";
import {writeShelf, TARGET, NEUTRAL_PROMPT} from "./lib/fixtures.mjs";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : def;
};
const has = (name) => process.argv.includes(`--${name}`);

const adapterName = arg("adapter", "pi");
const counts = arg("skills", "0,25,50,100").split(",").map((n) => parseInt(n, 10));
const runs = parseInt(arg("runs", "3"), 10);
const discoveryCount = parseInt(arg("discovery-count", "24"), 10);
const trials = parseInt(arg("trials", "6"), 10);
const outPath = arg("out", `frontier-${adapterName}-result.json`);

const adapter = (await import(`./adapters/${adapterName}.mjs`)).default;

if (!(await adapter.available())) {
  console.error(`Adapter "${adapterName}" is not runnable in this env (CLI missing or no key).`);
  process.exit(2);
}

console.log(`# Two-axis skill-bloat — adapter=${adapter.name}`);

// ---------- COST axis ----------
let cost = null;
if (!has("discovery-only")) {
  console.log(`\n## COST (median of ${runs} runs; total input incl. cache)`);
  console.log("skills\ttokens\tdelta_vs_0\tper_skill");
  const workdir = mkWorkdir("cost");
  const skillsRoot = join(workdir, adapter.skillsSubpath);
  const rows = [];
  let base = null;
  try {
    for (const k of counts) {
      writeShelf({skillsRoot, count: k, includeTarget: false});
      const samples = [];
      for (let r = 0; r < runs; r++) {
        const {stdout, code} = adapter.run({
          workdir, skillsRoot, prompt: NEUTRAL_PROMPT, withSkills: k > 0,
        });
        if (code !== 0) continue;
        const {promptTokens} = adapter.parse(stdout);
        if (promptTokens && promptTokens > 0) samples.push(promptTokens);
      }
      const tokens = median(samples);
      if (tokens == null) {
        console.log(`${k}\t(all ${runs} runs failed)`);
        rows.push({skills: k, tokens: null});
        continue;
      }
      if (base == null) base = tokens;
      const delta = tokens - base;
      rows.push({skills: k, tokens, deltaVs0: delta, perSkill: k > 0 ? +(delta / k).toFixed(1) : null});
      console.log(`${k}\t${tokens}\t${delta}\t\t${k > 0 ? (delta / k).toFixed(1) : "-"}`);
    }
  } finally {
    cleanup(workdir);
  }
  cost = {base, rows};
}

// ---------- DISCOVERY axis ----------
let discovery = null;
if (!has("cost-only")) {
  console.log(`\n## DISCOVERY (${discoveryCount} skills incl. 1 proprietary target; ${trials} trials)`);
  console.log(`task: "${TARGET.task}"`);
  const workdir = mkWorkdir("disco");
  const skillsRoot = join(workdir, adapter.skillsSubpath);
  let discovered = 0;
  let applied = 0;
  let ok = 0;
  try {
    writeShelf({skillsRoot, count: discoveryCount, includeTarget: true});
    for (let i = 0; i < trials; i++) {
      const {stdout, code} = adapter.run({
        workdir, skillsRoot, prompt: TARGET.task, withSkills: true,
      });
      if (code !== 0) {
        console.log(`  trial ${i + 1}: run failed`);
        continue;
      }
      ok++;
      const {finalText, readTargetFile} = adapter.parse(stdout);
      const didRead = readTargetFile;
      const didApply = finalText.includes(TARGET.sentinel);
      if (didRead) discovered++;
      if (didApply) applied++;
      console.log(`  trial ${i + 1}: read-target=${didRead ? "YES" : "no "}  applied=${didApply ? "YES" : "no "}`);
    }
  } finally {
    cleanup(workdir);
  }
  discovery = {
    count: discoveryCount,
    trials: ok,
    discovered,
    applied,
    discoveryRate: ok ? +(discovered / ok).toFixed(2) : null,
    applyRate: ok ? +(applied / ok).toFixed(2) : null,
  };
  console.log(`RESULT discovery ${discovered}/${ok} (read target) | applied ${applied}/${ok} (used it)`);
}

// ---------- Frontier point ----------
if (cost && discovery) {
  const at = cost.rows.find((r) => r.skills === discoveryCount) ||
    cost.rows.reduce((a, b) => (Math.abs(b.skills - discoveryCount) < Math.abs(a.skills - discoveryCount) ? b : a));
  console.log(`\n## FRONTIER POINT @~${discoveryCount} skills`);
  console.log(`  per-call skill tax: ${at?.deltaVs0 ?? "?"} tok   |   discovery: ${Math.round((discovery.discoveryRate ?? 0) * 100)}%   |   applied: ${Math.round((discovery.applyRate ?? 0) * 100)}%`);
  console.log(`  (a fix is only good if it pushes tax DOWN without pushing discovery DOWN)`);
}

const outAbs = resolve(process.cwd(), outPath);
writeFileSync(outAbs, JSON.stringify({adapter: adapter.name, cost, discovery}, null, 2));
console.log(`\nWrote ${outAbs}`);
