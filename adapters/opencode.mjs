// opencode adapter (github.com/sst/opencode). Runs `opencode run --format json`
// headlessly and reads its reported input tokens.
//
// XDG_CONFIG_HOME/XDG_DATA_HOME are pointed at a throwaway dir per run so the
// operator's global opencode skills/config don't count; only the shelf under
// the project dir (.agents/skills) does. --pure skips external plugins.
//
// Env: OPENCODE_BIN (default ~/.opencode/bin/opencode), OPENCODE_MODEL
//      (default openai/gpt-4o). Needs OPENAI_API_KEY.

import {existsSync} from "node:fs";
import {join} from "node:path";
import {homedir} from "node:os";
import {sh, jsonLines} from "../lib/run.mjs";

const BIN = process.env.OPENCODE_BIN || join(homedir(), ".opencode", "bin", "opencode");
const MODEL = process.env.OPENCODE_MODEL || "openai/gpt-4o";

export default {
  name: `opencode (${MODEL})`,
  skillsSubpath: ".agents/skills",

  async available() {
    if (!existsSync(BIN)) return false;
    return sh(BIN, ["--version"]).code === 0;
  },

  run({workdir, prompt}) {
    const xdg = join(workdir, "xdg");
    return sh(
      BIN,
      ["run", "--format", "json", "--pure", "-m", MODEL, "--dir", workdir, prompt],
      {
        cwd: workdir,
        env: {
          ...process.env,
          XDG_CONFIG_HOME: xdg,
          XDG_DATA_HOME: join(xdg, "data"),
        },
        input: "",
      },
    );
  },

  parse(stdout) {
    let promptTokens = null;
    let finalText = "";
    let readTargetFile = false;
    for (const o of jsonLines(stdout)) {
      if (o.type === "step_finish") {
        // Total input = fresh + cached (opencode reports cache separately; the
        // prompt prefix gets cached across runs, so input alone undercounts).
        const tk = o.part?.tokens;
        if (tk) {
          const total = (tk.input ?? 0) + (tk.cache?.read ?? 0) + (tk.cache?.write ?? 0);
          if (total > 0) promptTokens = Math.max(promptTokens ?? 0, total);
        }
      }
      if (o.type === "text" && typeof o.part?.text === "string" && o.part.text.trim()) {
        finalText = o.part.text;
      }
      // Discovery: opencode loads a skill via its `skill` tool.
      if (o.type === "tool_use" && JSON.stringify(o.part ?? o).toLowerCase().includes("zephyr")) {
        readTargetFile = true;
      }
    }
    return {promptTokens, finalText, readTargetFile};
  },
};
