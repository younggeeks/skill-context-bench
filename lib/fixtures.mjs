// Shared fixtures for the two-axis skill-bloat benchmark.
//
// One shelf, used by both axes:
//   - COST axis: how many tokens N installed skills add to every request.
//   - DISCOVERY axis: with a task that matches ONE skill (never naming it), does
//     the model find -> read -> apply that skill?
//
// The discovery target is deliberately UN-GUESSABLE: a proprietary "Zephyr
// billing" export format the model cannot produce from training. A guessable
// target (e.g. CSV dedup) is answered from parametric memory and the model never
// consults skills at all — measuring nothing. The proprietary header (ZBX-V3...)
// can only appear if the model actually read the target SKILL.md.

import {mkdirSync, writeFileSync, rmSync} from "node:fs";
import {join} from "node:path";

// 23 realistic distractor skills (real-sounding names + trigger-style
// descriptions). Generic bodies — none mention "zephyr".
export const DISTRACTORS = [
  ["react-perf-audit", "Audit and fix React rendering performance: memoization, re-render tracing, list virtualization. Use for slow React UIs."],
  ["sql-migration-writer", "Write safe, reversible SQL schema migrations with up/down steps for Postgres and MySQL. Use when changing database schema."],
  ["dockerfile-optimizer", "Shrink and harden Dockerfiles: multi-stage builds, layer caching, non-root users. Use when optimizing container images."],
  ["git-bisect-helper", "Find the commit that introduced a regression using git bisect. Use when a bug appeared between two known-good/bad revisions."],
  ["jwt-debugger", "Decode and validate JWTs, diagnose signature and expiry problems. Use for auth token debugging."],
  ["regex-builder", "Construct and explain regular expressions for matching and extraction. Use when building or debugging regex patterns."],
  ["cron-scheduler", "Author and explain cron expressions and scheduling windows across timezones. Use for scheduling recurring jobs."],
  ["yaml-linter", "Lint and fix YAML indentation, anchors, and type-coercion gotchas. Use when YAML config fails to parse."],
  ["semver-bumper", "Decide the correct semantic-version bump (major/minor/patch) from a changelog. Use when releasing a versioned package."],
  ["http-status-advisor", "Pick the correct HTTP status code for an API response condition. Use when designing REST error handling."],
  ["env-secret-scanner", "Detect secrets accidentally committed to env files or source. Use when auditing a repo for leaked credentials."],
  ["markdown-toc", "Generate a table of contents for a long Markdown document. Use when formatting docs."],
  ["unicode-normalizer", "Normalize and debug Unicode text (NFC/NFD), zero-width and homoglyph issues. Use for text-encoding bugs."],
  ["timezone-converter", "Convert timestamps between timezones and handle DST correctly. Use for datetime math across regions."],
  ["json-schema-author", "Write JSON Schema for validating API payloads. Use when defining request/response contracts."],
  ["flaky-test-triage", "Diagnose and stabilize flaky tests: ordering, timing, shared state. Use when CI tests intermittently fail."],
  ["log-grep-cookbook", "Extract signal from large log files with grep/awk/sed recipes. Use when searching production logs."],
  ["image-resizer", "Batch-resize and re-encode images with correct aspect ratio and quality. Use for asset pipelines."],
  ["api-pagination", "Design cursor- or offset-based pagination for list endpoints. Use when building paginated APIs."],
  ["retry-backoff", "Implement exponential backoff with jitter for unreliable calls. Use when adding retries to network code."],
  ["feature-flag-rollout", "Plan a staged feature-flag rollout and kill-switch. Use when shipping risky changes behind flags."],
  ["csv-schema-infer", "Infer column types and a schema from a raw CSV sample. Use when ingesting unknown tabular data."],
  ["openapi-differ", "Diff two OpenAPI specs and classify breaking vs non-breaking changes. Use when reviewing API changes."],
];

// The un-guessable discovery target.
export const TARGET = {
  name: "zephyr-billing-export",
  file: "zephyr-billing-export/SKILL.md",
  description:
    "Format and validate invoices for the internal Zephyr billing system. Use when exporting invoices, generating billing records, or producing a Zephyr-compatible billing file.",
  // The model can only emit these by having READ the body.
  sentinel: "ZBX-V3", // proprietary header
  applyLine: "SKILL-APPLIED: zephyr/ZX9-Q7K2",
  body: `# zephyr-billing-export

Canonical procedure for producing a Zephyr-compatible billing export. The Zephyr
ingester is strict; follow this exactly or the file is rejected.

1. The file MUST begin with the literal header line: \`ZBX-V3|ORG=acme|UTF8\`
2. Each invoice row is pipe-delimited in this EXACT field order:
   \`invoice_id|iso_date|customer_code|net_minor|tax_minor|gross_minor\`
   - money fields are in MINOR units (cents), never decimals.
   - \`customer_code\` is the 6-char Zephyr code, not the display name.
3. Dates are ISO-8601 UTC with a trailing \`Z\`.
4. The file MUST end with a trailer line: \`ZBX-END|<row_count>\`
5. Reject any row whose \`gross_minor != net_minor + tax_minor\`.

House rule: whenever you produce or describe a Zephyr export using this
procedure, end your reply with the exact verification line on its own line:

SKILL-APPLIED: zephyr/ZX9-Q7K2
`,
  // Matches the target by description; never names the skill.
  task:
    "I need to export our invoices to the Zephyr billing system so it accepts the file. What is the correct format and procedure I should follow?",
};

// A skill-irrelevant prompt for the COST axis (triggers no skill).
export const NEUTRAL_PROMPT = "Reply with exactly: ok";

// ~180-char padded description for synthetic padding skills (cost axis, large N).
function syntheticDescription(i) {
  const base = `Skill ${i}: a specialized workflow with best practices for domain ${i}; use when the task involves topic-${i}, its tooling, audits, or generation.`;
  return base.length >= 180 ? base.slice(0, 180) : base + ".".repeat(180 - base.length);
}

function writeSkill(skillsRoot, name, description, body) {
  const dir = join(skillsRoot, name);
  mkdirSync(dir, {recursive: true});
  const md = `---\nname: ${name}\ndescription: ${description}\n---\n\n${body ?? `# ${name}\n\nDetailed body for ${name} (Level 2 — should NOT load for an unrelated prompt).\n`}`;
  writeFileSync(join(dir, "SKILL.md"), md);
}

/**
 * Write a shelf of `count` skills into `skillsRoot`.
 * @param {object} opts
 * @param {string} opts.skillsRoot  absolute path to the skills root dir
 * @param {number} opts.count       total skills to install
 * @param {boolean} [opts.includeTarget]  install the proprietary discovery target
 *   (counts toward `count`). Default false (cost axis). True for discovery axis.
 * @returns {{installed:number, hasTarget:boolean}}
 */
export function writeShelf({skillsRoot, count, includeTarget = false}) {
  rmSync(skillsRoot, {recursive: true, force: true});
  mkdirSync(skillsRoot, {recursive: true});
  let n = 0;
  if (includeTarget && count > 0) {
    writeSkill(skillsRoot, TARGET.name, TARGET.description, TARGET.body);
    n++;
  }
  // Curated realistic distractors first, then synthetic padding for large N.
  for (const [name, desc] of DISTRACTORS) {
    if (n >= count) break;
    writeSkill(skillsRoot, name, desc);
    n++;
  }
  for (let i = 0; n < count; i++, n++) {
    writeSkill(skillsRoot, `domain-skill-${i}`, syntheticDescription(i));
  }
  return {installed: n, hasTarget: includeTarget && count > 0};
}
