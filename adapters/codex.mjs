// Codex CLI adapter (`codex exec --json`). Codex 0.139+ has a skills subsystem
// (~/.codex/skills/<name>/SKILL.md). We isolate it via a per-run CODEX_HOME
// rooted in the workdir so only our shelf is loaded (the real ~/.codex/skills
// has dozens that would confound the count).
//
// Skills dir = <workdir>/.codexhome/skills (matches skillsSubpath); the adapter
// also seeds <workdir>/.codexhome with the user's auth.json so exec can run.
//
// Env: CODEX_MODEL (optional). Uses the user's Codex auth.

import {existsSync, copyFileSync, writeFileSync, mkdirSync} from "node:fs";
import {join} from "node:path";
import {homedir} from "node:os";
import {sh, jsonLines} from "../lib/run.mjs";
import {TARGET} from "../lib/fixtures.mjs";

const MODEL = process.env.CODEX_MODEL || "";
const REAL_HOME = join(homedir(), ".codex");

export default {
  name: `codex${MODEL ? ` (${MODEL})` : ""}`,
  skillsSubpath: ".codexhome/skills",

  async available() {
    return sh("codex", ["--version"]).code === 0 && existsSync(join(REAL_HOME, "auth.json"));
  },

  run({workdir, prompt}) {
    const codexHome = join(workdir, ".codexhome");
    mkdirSync(join(codexHome, "skills"), {recursive: true});
    // Seed auth so exec can authenticate; a minimal config keeps MCP servers
    // (extra tool tokens + flaky network) out of the measurement.
    const auth = join(REAL_HOME, "auth.json");
    if (existsSync(auth) && !existsSync(join(codexHome, "auth.json"))) {
      copyFileSync(auth, join(codexHome, "auth.json"));
    }
    if (!existsSync(join(codexHome, "config.toml"))) {
      writeFileSync(join(codexHome, "config.toml"), "# isolated benchmark home — no mcp_servers\n");
    }
    const args = ["exec", "--json", "-s", "read-only", "--skip-git-repo-check", "-C", workdir];
    if (MODEL) args.push("-m", MODEL);
    args.push(prompt);
    return sh("codex", args, {
      cwd: workdir,
      env: {...process.env, CODEX_HOME: codexHome},
      input: "", // don't let codex read a prompt from stdin
    });
  },

  parse(stdout) {
    let promptTokens = null;
    let finalText = "";
    let readTargetFile = false;
    for (const o of jsonLines(stdout)) {
      if (o.type === "turn.completed" && o.usage?.input_tokens != null) {
        promptTokens = o.usage.input_tokens; // total prompt incl. cached
      }
      if (o.type === "item.completed" && o.item) {
        const it = o.item;
        if (it.type === "agent_message" && typeof it.text === "string" && it.text.trim()) {
          finalText = it.text;
        }
        // Any item that touched the target skill file (command output, file read,
        // or a skill-invocation item) counts as discovery.
        if (JSON.stringify(it).includes(TARGET.file) || JSON.stringify(it).toLowerCase().includes("zephyr-billing")) {
          readTargetFile = true;
        }
      }
    }
    return {promptTokens, finalText, readTargetFile};
  },
};
