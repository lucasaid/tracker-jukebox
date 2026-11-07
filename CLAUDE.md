# Tracker Jukebox

A static site that plays 90s BBS tracker music (MOD, S3M, STM, 669, MTM) and MIDI through our own player. React + TypeScript + Vite.

## Before each phase

1. **Read `docs/PLAN.md` before starting any phase.** It is the source of truth. Read in full:
   - **Rules for the implementer**
   - **Contracts**
   - the **Implementation decisions** the phase refers to
   - the phase's own section (Scope, Acceptance, commit message)
2. Work only on the current phase (P1–P28, in order). Don't start the next phase until the user says so.
3. End the phase with the checkpoint report from `docs/PLAN.md`, including a suggested commit message `type(scope): message`. **The user makes every commit**: never run `git add`, `commit`, `push` or `branch`.

## After each phase

Once a phase's checkpoint report is done, overwrite `prompt.md` (repo root, gitignored) with the kick-off prompt for the **next** phase. Use this template, filling in N and the phase name from `docs/PLAN.md`:

```
Read CLAUDE.md and docs/PLAN.md. We are starting Phase N: <phase name>.
Phases 1 to N-1 are complete and committed. Check git log and the current code to confirm the state matches the plan before changing anything.

Implement Phase N only. Follow the ground rules. Do not modify code belonging to other phases unless the plan says to.

When done:
1. Run the build, lint, format and test commands from CLAUDE.md
2. Run the Phase N acceptance check
3. Report: what you changed (files), check results, and any deviations from the plan or open questions

If anything in the plan is ambiguous or wrong, stop and report rather than improvising.
```

## Runtime

- Node **24.x**. Check that `node --version` starts with `v24`.
- pnpm **11.5.0**. Use no other package manager and no `npx`.
- TypeScript **6.0.3**. **Not 7.x**: typescript-eslint doesn't support it.
- Exact dependency versions are pinned in `package.json`. The approved list is in the **Dependencies** section of `docs/PLAN.md`.

## Commands (the gate, in this order, every phase)

```sh
pnpm install --frozen-lockfile   # P1 only: pnpm install
pnpm format                      # prettier --write .
pnpm check                       # tsc -b && eslint . && prettier --check . && vitest run
pnpm build                       # tsc -b && vite build
# then the phase's acceptance commands, e.g.:
pnpm manifest                    # from P8: trackers/ → public/music + public/manifest.json
pnpm render <file> [out.wav]     # from P9: offline render with our engine
pnpm compare [format|id]         # from P10: compare against openmpt123 (dev-only reference)
pnpm fetch-soundfont             # from P24
```

- `pnpm check` and `pnpm build` must both pass before a checkpoint. Paste the last ~15 lines of their output into the report.
- While working: `pnpm dev`, `pnpm test:watch`.

## Ground rules

- **Scope:**
  - Change only the files in the current phase's Scope, plus docs/PLAN.md notes the phase asks for.
  - No refactors of earlier code, no features from later phases, no new stubs or TODO scaffolding. The P0 skeleton already has a stub for every contract function (`Not implemented (P<n>)`); each phase replaces the stubs its Scope names.
  - One exception: a fix of 20 lines or fewer for an earlier-phase bug that blocks the gate. Report it under Deviations.
- **Dependencies:** never add, remove or upgrade an npm package, tool, font or asset without stopping to ask.
- **Contracts:** the signatures, message shapes, storage keys, manifest schema and exit codes in `docs/PLAN.md` are fixed. To change one, stop and propose the change.
- **Never touch:**
  - `trackers/`, which is read-only.
  - anything outside the repo.
  - `public/music` and `public/manifest.json` by hand. Only `scripts/manifest.ts` writes them.
- **Network:** only for `pnpm install`, the font download (P2) and the SoundFont (P24).
- **Import direction** is enforced by ESLint:
  - `net` ← `library`, `audio`, `state`
  - `formats` ← `engine` ← `audio` ← `state` ← `ui`
  - `formats` ← `library` ← `state`
  - `viz` uses `engine`/`audio`
  - `scripts` never import `audio`/`state`/`viz`/`ui`
  - `formats`, `engine` and `library` stay React- and DOM-free.

## Coding conventions

- Named exports only, except for config files that need a default export.
- No `any`. Use `unknown` plus narrowing at trust boundaries (JSON, postMessage, localStorage, dropped files). No `!`, and `as` only right after validation.
- Classes are allowed only for the error classes, `ByteReader`, `AudioEngine`, the worklet processor and `ErrorBoundary`.
- Pure modules have no module-level mutable state and no clocks. Randomness comes from an injected `rng`.
- Nothing is allocated in `Player.render` or the worklet's `process()`.
- Put units in names (`durationSec`, `frames`, `Hz`, `Db`).
- React: function components, CSS Modules, theme tokens on `:root`.
- Throw only the error types listed in Contracts. No empty `catch`. No `console.log`.
- Deliberate shortcuts get a comment: `// ponytail: <limit>, <upgrade path>`.
- Lint suppression only as `eslint-disable-next-line <rule> -- <reason>`. Never weaken `tsconfig`.
- There is one test file per folder (`formats.test.ts`, `engine.test.ts`, `library.test.ts`, `state.test.ts`). Parser tests use the real files in `trackers/`. No PCM snapshot tests.

## Stop and report (don't improvise) when

- The same gate failure survives 3 attempts.
- An acceptance fix would go outside the phase's scope.
- A dependency, tool or asset change seems necessary.
- A contract would have to change.
- Parsed data disagrees with the expected values in `docs/PLAN.md`. Don't edit the test to match.
- openmpt123 is missing, or its flags or output differ from the plan.
- `pnpm compare` still fails a file after 2 focused attempts.
- A license is unclear.
- The `?worker&url` worklet import fails in `pnpm preview`.
- The plan can be read two ways that lead to different code.
- A phase grows past 6 source files or about 600 changed lines.
- Something needs network access, writes outside the repo, or a git operation.
- Node is not v24, or `pnpm install --frozen-lockfile` fails.

Use the report format in `docs/PLAN.md` for both stops and checkpoints.
