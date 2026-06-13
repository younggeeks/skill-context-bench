// Shared run helpers + the adapter contract for the two-axis benchmark.
//
// An ADAPTER teaches the driver how to drive one agent:
//   {
//     name: string,
//     skillsSubpath: string,                  // where this agent discovers skills
//     async available(): boolean,             // is the CLI runnable?
//     run({workdir, skillsRoot, prompt, withSkills}): {stdout, stderr, code},
//     parse(stdout): { promptTokens, finalText, readTargetFile }
//   }
// The driver owns the shelf, the prompts, the trials, and the scoring — so every
// agent is measured identically.

import {spawnSync} from "node:child_process";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

export function median(xs) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function mkWorkdir(tag) {
  return mkdtempSync(join(tmpdir(), `skillbench-${tag}-`));
}

export function cleanup(dir) {
  rmSync(dir, {recursive: true, force: true});
}

export function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    ...opts,
  });
  return {stdout: res.stdout ?? "", stderr: res.stderr ?? "", code: res.status};
}

// Iterate parsed JSON lines from a stdout blob, skipping non-JSON noise.
export function* jsonLines(stdout) {
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      yield JSON.parse(t);
    } catch {
      /* not a JSON line */
    }
  }
}
