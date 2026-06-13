# skill-context-bench

## The problem

Coding agents (Claude Code, Codex, Pi, …) let you install **skills** — reusable
instructions for specific tasks. So the model knows which skills exist, the agent
doesn't load each skill's full instructions up front. It keeps only a short entry
per skill — the **name and a one-line description** — and puts that list in every
message it sends to the model.

One entry is tiny. But the list is sent on *every* call, and it grows with every
skill you install. Install dozens and the name-and-description list by itself
becomes a large fixed cost on each request — more tokens, more latency, and less
room for the actual task — even on calls that never use a skill.

This benchmark measures how big that fixed cost gets, per agent, as the number of
installed skills grows.

## Results

Tokens each agent adds to a single request just for its skill list, going from 0
to 100 installed skills (gpt-4o, measured):

| agent | 25 skills | 50 skills | 100 skills |
|---|---:|---:|---:|
| Claude Code 2.1 | +66 | +164 | +322 |
| Codex 0.139 | +171 | +171 | +171 |
| Pi 0.79 | +6,918 | +6,918 | +6,918 |

Claude Code grows slowly with skill count; Codex caps its list; **Pi sends about
6,900 tokens of skill list on every call**, whether or not a skill is used.

The benchmark also confirms each agent can still pick the right skill for a
matching task (all three can), so these numbers reflect a working skill system,
not a broken one.

## Run it

```bash
export OPENAI_API_KEY=...
node frontier.mjs --adapter pi --skills 0,25,50,100 --trials 6
node frontier-table.mjs results/*.json     # render results as a table
```

Adapters: `pi`, `claude-code`, `codex`.

## How the discovery check works

The shelf is 23 ordinary skills plus one **made-up** target,
`zephyr-billing-export`: a fictional `ZBX-V3` file format the model can't know
from training. The task asks how to produce that format without naming the skill.
It counts as found only if the agent opens that skill's file and uses its specific
format in the answer — something it can't fake. (A familiar task like "dedupe a
CSV" gets answered from memory and never touches the skill system, so it would
prove nothing.)

## Add an agent

Drop `adapters/<name>.mjs` exporting `{ name, skillsSubpath, available, run, parse }`
(contract in `lib/run.mjs`). The shelf and scoring live in `lib/fixtures.mjs`, so
every agent is measured the same way.

## Not included

Antigravity (`agy`): its `--print` mode reports no per-call token usage, so cost
can't be measured.

## Scope

This repo measures the problem only — it does not implement a fix. A reduction is
being proposed upstream; the link will go here once it lands.

## License

MIT
