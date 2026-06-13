// Pi adapter (github.com/earendil-works/pi). Runs the `pi` CLI headlessly and
// reads its reported input tokens.
//
// Env: PI_BIN (default "pi"; may be "node /path/to/dist/cli.js"), PI_PROVIDER
//      (default "openai"), PI_MODEL (default "gpt-4o"). Needs the provider API key.

import {sh, jsonLines} from "../lib/run.mjs";
import {TARGET} from "../lib/fixtures.mjs";

const BIN = process.env.PI_BIN || "pi";
const PROVIDER = process.env.PI_PROVIDER || "openai";
const MODEL = process.env.PI_MODEL || "gpt-4o";

function binArgv(extra) {
  // PI_BIN may be "pi" or "node /path/to/dist/cli.js".
  const parts = BIN.split(" ");
  return {cmd: parts[0], pre: parts.slice(1).concat(extra)};
}

export default {
  name: `pi (${PROVIDER}/${MODEL})`,
  skillsSubpath: ".agents/skills",

  async available() {
    const {cmd, pre} = binArgv(["--version"]);
    return sh(cmd, pre).code === 0;
  },

  run({workdir, skillsRoot, prompt, withSkills}) {
    const args = ["--print", "--mode", "json", "--no-session"];
    if (withSkills) args.push("--skill", skillsRoot);
    else args.push("--no-skills");
    args.push("--provider", PROVIDER, "--model", MODEL, prompt);
    const {cmd, pre} = binArgv(args);
    return sh(cmd, pre, {
      cwd: workdir,
      // Isolate Pi's auto-discovered user skills so only our shelf counts.
      env: {...process.env, PI_CODING_AGENT_DIR: `${workdir}/empty-agent`},
    });
  },

  parse(stdout) {
    let promptTokens = null;
    let finalText = "";
    let readTargetFile = false;
    for (const o of jsonLines(stdout)) {
      if (o.type !== "message_end" || o.message?.role !== "assistant") continue;
      const u = o.message.usage ?? {};
      const total = (u.input ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0);
      if (total > 0) promptTokens = Math.max(promptTokens ?? 0, total);
      const content = o.message.content;
      if (Array.isArray(content)) {
        for (const p of content) {
          const name = p.name || p.toolName;
          const arg = JSON.stringify(p.arguments || p.input || p.args || {});
          // Discovery = the model read the target skill's SKILL.md.
          if (name === "read" && arg.includes(TARGET.file)) readTargetFile = true;
        }
        const txt = content.map((p) => p.text || "").join("");
        if (txt.trim()) finalText = txt;
      }
    }
    return {promptTokens, finalText, readTargetFile};
  },
};
