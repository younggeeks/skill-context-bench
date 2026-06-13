// Claude Code adapter (`claude` CLI). Uses stream-json so we can see tool_use
// (Skill / Read of the target) for the discovery axis, and the final result +
// usage for the cost axis.
//
// NOTE: this drives the user's real `claude` CLI and consumes their quota.
// Env: CC_MODEL (optional, e.g. claude-sonnet-4-6).

import {sh, jsonLines} from "../lib/run.mjs";
import {TARGET} from "../lib/fixtures.mjs";

const MODEL = process.env.CC_MODEL || "";

export default {
  name: `claude-code${MODEL ? ` (${MODEL})` : ""}`,
  skillsSubpath: ".claude/skills",

  async available() {
    return sh("claude", ["--version"]).code === 0;
  },

  run({workdir, prompt}) {
    const args = ["-p", prompt, "--output-format", "stream-json", "--verbose"];
    if (MODEL) args.push("--model", MODEL);
    return sh("claude", args, {cwd: workdir, env: process.env});
  },

  parse(stdout) {
    let promptTokens = null;
    let finalText = "";
    let readTargetFile = false;
    for (const o of jsonLines(stdout)) {
      if (o.type === "assistant" && Array.isArray(o.message?.content)) {
        for (const block of o.message.content) {
          if (block.type === "tool_use") {
            const blob = JSON.stringify(block.input ?? {});
            if (
              (block.name === "Read" && blob.includes(TARGET.file)) ||
              (block.name === "Skill" && blob.toLowerCase().includes("zephyr"))
            ) readTargetFile = true;
          }
        }
      }
      if (o.type === "result") {
        if (typeof o.result === "string") finalText = o.result;
        const u = o.usage ?? {};
        const total =
          (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
        if (total > 0) promptTokens = total;
      }
    }
    return {promptTokens, finalText, readTargetFile};
  },
};
