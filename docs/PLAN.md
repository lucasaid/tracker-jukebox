# Tracker Jukebox — Plan

## Context

A nostalgic static site that plays music from old BBSes: tracker modules plus MIDI.

- **Pages:** a landing page linking to a music browser and a random-play jukebox.
- **Visualizers:** swappable, including a pattern view that shows how each track was made.
- **Player:** we write our own multi-format player. No third-party replayer ships; openmpt123 is a dev-only reference.
- **Commits:** the user makes every commit. Claude stops at the end of each phase (P1–P28) using the report format below.
- **Logging:** this plan lives in the repo at `docs/PLAN.md`; `CLAUDE.md` holds the ground rules summary.

## Rules for the implementer (read before every phase)

### Language and runtime

- **TypeScript 6.0.3**, with the compiler flags in **Engineering conventions → Configuration**, target ES2022. **Not TS 7.**
- **Node 24.x:** check `node --version` starts with `v24`. If it doesn't, stop (rule 13).
- **pnpm 11.5.0,** pinned via `packageManager`. Use no other package manager and no `npx`.
- **Browsers:** current Chrome, Firefox and Safari on desktop; Safari on iOS; Chrome on Android. Only the browser APIs listed in **Contracts → External services and tools** may be used.

### Commands, run in this order every phase

1. `pnpm install --frozen-lockfile`. In P1 only, run `pnpm install` to create the lockfile.
2. `pnpm format`: Prettier writes. Never hand-format.
3. `pnpm check` (= `tsc -b && eslint . && prettier --check . && vitest run`). This must pass.
4. `pnpm build` (= `tsc -b && vite build`). This must pass.
5. The phase's acceptance commands, exactly as written in the phase.
6. At the checkpoint, paste the final ~15 lines of output from steps 3–5 into the report.

While working, `pnpm test:watch` and `pnpm dev` may be used freely. Only the sequence above counts as the gate.

### Coding conventions

- **Exports:** named exports only. Default exports only where a tool requires one (`vite.config.ts`, `eslint.config.js`).
- **Files:** `camelCase.ts` for modules, except `669.ts` and the `PascalCase.ts` class file `AudioEngine.ts`. `PascalCase.tsx` (+ `PascalCase.module.css`) for components. There is one test file per folder (named in **Project layout**).
- **Imports:** relative paths, with no path aliases. The only barrel files are `formats/index.ts`, `engine/index.ts` and `viz/index.ts`, and other folders import those folders only through them. Use `import type` for types.
- **Types:**
  - No `any`.
  - `unknown` plus narrowing at every trust boundary: JSON, `postMessage`, localStorage, dropped files.
  - No `!` non-null assertions, and `as` casts only right after validation.
- **Classes:** only the error classes, `ByteReader`, `AudioEngine`, the AudioWorklet processor (the API requires a class) and `ErrorBoundary` (React requires a class). Everything else is functions and plain objects.
- **Pure modules** (`formats`, `engine`, `library`): no module-level mutable state, and no clocks (`Date.now`, `performance.now`). Randomness comes from an injected `rng`.
- **Audio thread:** no allocation inside `Player.render` or `process()`. Buffers are preallocated at creation.
- **Units in names:** `durationSec`, `frames`, `ms`, `Hz`, `Db`. Volumes are 0..64 in the file model and 0..1 in the mixer and settings.
- **React:**
  - Function components and hooks, except `ErrorBoundary`.
  - No `useEffect` for values that can be derived.
  - Styles go in CSS Modules using the `:root` tokens. Inline styles only for runtime values such as canvas size.
- **Errors:** throw only the error types in **Contracts**, and handle each as **Error handling** says. Never use an empty `catch`.
- **Logging:** no `console.log` in committed code (scripts print with `process.stdout.write`/`console.info`). `console.warn`/`console.error` only as **Logging** allows.
- **Comments:** explain _why_, not _what_. Deliberate shortcuts get a `// ponytail: <limit>, <upgrade path>` comment.
- **Lint suppression:** `eslint-disable-next-line <rule> -- <reason>` only. Never turn a rule off globally. Never weaken `tsconfig` flags.
- **Commit messages:** `type(scope): message`. Types: `feat` `fix` `chore` `docs` `test` `refactor`. Scope = the folder or area.

### Boundaries

- **Dependencies:** adding, removing or upgrading any npm package, CLI tool, font, CDN link or other asset → stop and ask. The lists in **Dependencies** are the only ones allowed.
- **Phase scope:**
  - Change only the files named in the phase's Scope and `docs/PLAN.md` (notes the phase asks to be recorded).
  - No refactors of earlier code, no features from later phases, no "for later" scaffolding, no TODO stubs in new code. (The P0 skeleton stubs are the exception: each phase replaces the stubs its Scope names.)
  - One exception: a bug in earlier-phase code that blocks this phase's gate may be fixed if the fix is ≤ 20 lines. List it under Deviations.
- **Contracts:** never change a signature, message shape, storage key, manifest schema or CLI exit code silently. Stop and propose the change.
  - Contracts describe the end state. A phase implements only the members its Scope names; a member that doesn't exist yet is left out, never stubbed.
- **Never touch:** `trackers/` (read-only), anything outside the repo, git (no `git add/commit/push/branch`; the user commits), or `public/music` and `public/manifest.json` by hand (only `scripts/manifest.ts` writes them).
- **Network:** allowed only for:
  - `pnpm install`
  - the font download (P2)
  - openmpt123 via brew (run by the user)
  - finding and downloading the SoundFont (P24)

### Stop and report (do not improvise) when

1. The same gate failure survives 3 fix attempts.
2. An acceptance check fails and the fix would go outside the phase's Scope.
3. A dependency, version, tool or asset change seems necessary.
4. A contract would need to change.
5. Parsed data disagrees with **Findings** or a phase's expected values. Don't edit the test to match; report the file and both values.
6. openmpt123 is missing, or its flags or output differ from **Contracts**.
7. `pnpm compare` still fails a file after 2 focused fix attempts on that file. Report the numbers so the user can listen and decide.
8. A license is unclear or restrictive (the SoundFont, the font, any asset).
9. The `?worker&url` worklet import fails in `pnpm preview`. There is no fallback in this plan.
10. The plan can be read two ways that lead to different code.
11. The phase is heading past 6 source files (CSS Modules, tests and `package.json` not counted) or about 600 changed lines. Stop and propose a split.
12. Something requires network access, writes outside the repo, a change to `trackers/` or a git operation not allowed above.
13. Node is not v24, or `pnpm install --frozen-lockfile` fails.

**Report format (for stops and checkpoints alike):**

```
## P<n> <name> — CHECKPOINT | STOPPED
Gate: pnpm check ✅/❌ · pnpm build ✅/❌   (last lines of output)
Acceptance: each listed check → pass/fail + evidence (command output, numbers, what was heard/seen)
Files changed: <list>
Deviations: none | <what and why>
If STOPPED: what was tried · exact error · options (recommended first)
Suggested commit: type(scope): message
```

## Findings: `trackers/` (38 music files + 2 `.DS_Store`, 6 formats)

| Format                  | Files               | Notes                                                                                               |
| ----------------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| MOD (ProTracker `M.K.`) | 4 + CANTINA         | 4ch, 31 samples. **`669/CANTINA.669` is an 8CHN MOD**, so detect by magic bytes, never by extension |
| S3M (ST 3.00/3.01)      | 10                  | 4–16ch, PCM only (no AdLib instruments). FINERUN and NIN-1 are mono (master-volume bit 7 clear)     |
| STM (ST 2.21)           | 1: `s3m/KTULHU.STM` | 4ch, 31 samples                                                                                     |
| 669 (Composer 669 `if`) | 8                   | 8ch, 3×36-char message, own effect set                                                              |
| MTM (MultiTracker 1.0)  | 7                   | 4–8ch, track-based patterns, comment block                                                          |
| MIDI (SMF type 1)       | 7                   | No samples. Needs a synth                                                                           |

**Trackers:** 31 files (5 MOD, 10 S3M, 1 STM, 8 669, 7 MTM).

**Metadata available:**

- Title, tracker version, channels, orders/patterns, speed/tempo, volumes, pan.
- Sample names. In these files they carry the messages: BBS ads with phone numbers, greetings, emails, dates.
- MTM comments, 669 messages, MIDI text/track/copyright meta events.
- Per-sample length, loop, volume, finetune/C2SPD.
- Full pattern cells.
- Song length is not stored, so compute it by dry-run.

**Effects actually used:**

- MOD/MTM: 0–4, 8, 9, A–D, F, E1/E2/E5/EA/EB.
- S3M: A–H, J, K, L, O, Q, T, SA, SD. The Future Crew files (`PANIC`, `2ND_PM`) are the stress test.
- 669: commands 0, 1, 3, 5.

**MIDI by target synth:**

- MT-32: 99WAYS, BLAKLDGE. Programs 60/61/64/66 are guitars and basses on an MT-32 but horns and saxes in GM.
- GM: JAZZVIBE, DANNYBOY.
- No program changes: BLACKCAT, JUNGLE.
- None of the files contain SysEx.

**Expected values used by the tests:**

| File              | Values                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------- |
| mod/12WARIOR.MOD  | 4ch, 30 orders, 23 patterns                                                                   |
| mod/90210.MOD     | title "Beverly Hills 90210", sample 1 "BASS.SAM", 4ch, 13 orders                              |
| mod/1CARESS.MOD   | sample 1 "Empire BBS", sample 2 "679-0488"                                                    |
| 669/CANTINA.669   | format `mod`, 8ch, 17 orders, 17 patterns, title "Cantina band"                               |
| s3m/KTULHU.STM    | title "the call of ktulu", 4ch, 42 patterns                                                   |
| s3m/PANIC.S3M     | title "" (blank in file), 16ch, 56 samples, 62 patterns                                       |
| s3m/NIN-1.S3M     | title "NIN Melody Re-Mix I", 16ch, stereo false                                               |
| s3m/NOTFKIDS.S3M  | 4ch                                                                                           |
| mtm/MASTER.MTM    | title "Master Of Puppets", 4ch, 106 patterns, 97 orders, message contains "Forensic Medicine" |
| 669/SIRIUS.669    | 6 samples, 10 patterns, title "Sirius of Canis Major"                                         |
| midi/99WAYS.MID   | track names Guitar 1 / Guitar 2 / Bass / Fill Guitar                                          |
| midi/JAZZVIBE.MID | ticksPerBeat 480                                                                              |

## User decisions

- **Stack:** React + TS + Vite, pnpm, Vitest, CSS Modules, Context for state.
- **Hosting:** a static host; responsive layout for desktop and mobile.
- **Library:** the bundled `trackers/` files plus drag & drop of local files.
- **Look:** four static HTML mockups first (P2). The user chose all four as switchable themes: bbs (default), tracker, demoscene, mix.
- **Sound:** authentic by default (no interpolation, full stereo), with interpolation and stereo toggles.
- **MIDI:** our own SF2 GM synth plus an MT-32 remap. The MT-32 ROM drop-in is unscheduled ("Later").
- **Testing:** openmpt123 as a dev-only reference.
- **Visualizers:** pattern view, scope + spectrum, per-channel scopes/VU, demo effects.
- **Jukebox:** shuffle, format filter, fade, auto-visualizer, each a toggle persisted in localStorage.
- **Browser:** search, filters, sortable list, favorites, info panel.
- **Extras:** message scroller, mute/solo, sample browser, modem intro, share links, Media Session, hotkeys.

## Project layout

One pnpm package and one Vite app; no monorepo. There is one deployable, and the only other consumer is `scripts/`, which imports `src/` by relative path, so a workspace would add config and nothing else.

```
tracker-jukebox/
├─ package.json          scripts added by the phase that creates each script (see Configuration)
├─ pnpm-lock.yaml  .nvmrc  .gitignore  .prettierrc  .prettierignore  eslint.config.js
├─ tsconfig.json         references tsconfig.app.json + tsconfig.node.json
├─ tsconfig.app.json     src/** except tests (lib: ES2022, DOM, DOM.Iterable)
├─ tsconfig.node.json    scripts/**, src/**/*.test.ts, vite.config.ts (lib: ES2022, DOM; types: node)
├─ vite.config.ts        base './', react plugin, vitest config
├─ index.html            ENTRY (browser) → /src/main.tsx
├─ CLAUDE.md          ground rules + commands (summary of this plan)
├─ docs/PLAN.md       this plan
├─ trackers/             source library, read-only
├─ mockups/              P2 → theme references until deleted in P22: bbs.html tracker.html demoscene.html mix.html
├─ public/
│  ├─ fonts/Web437_IBM_VGA_8x16.woff   committed (P2)
│  ├─ music/**           generated by scripts/manifest.ts (gitignored)
│  ├─ manifest.json      generated (gitignored)
│  └─ soundfonts/        fetched by scripts/fetch-soundfont.ts (gitignored)
├─ scripts/              ENTRIES (Node, run with tsx)
│  ├─ manifest.ts        trackers/ → public/music + public/manifest.json
│  ├─ render.ts          offline render to WAV with our engine
│  ├─ compare.ts         our render vs openmpt123
│  ├─ fetch-soundfont.ts downloads the GM bank
│  ├─ wav.ts             WAV writer/reader shared by render + compare
│  └─ midi-overrides.json  { "midi/99ways.mid": "mt32", "midi/blakldge.mid": "mt32" }   (P23)
└─ src/
   ├─ main.tsx           ENTRY: createRoot(<App/>), imports ui/theme.css (from P2)
   ├─ App.tsx            providers + route switch + hotkey listener
   ├─ net.ts             fetchBytes, fetchJson, LoadError. Imports nothing from src
   ├─ formats/           bytes → data. Pure TS
   │  ├─ index.ts        detectFormat, parseFile, parseSoundBank, MT32_TO_GM, errors, re-exported types
   │  ├─ song.ts         all model types and constants (Contracts → formats)
   │  ├─ bytes.ts        ByteReader, decodeCp437, ParseError, UnsupportedFormatError
   │  ├─ mod.ts stm.ts s3m.ts mtm.ts 669.ts   one parser each: (bytes) → Song
   │  ├─ midi.ts         (bytes, target) → MidiSong
   │  ├─ sf2.ts          (bytes) → SoundBank
   │  ├─ mt32-to-gm.ts   MT32_TO_GM
   │  └─ formats.test.ts
   ├─ engine/            Song → PCM. Pure TS; runs in the worklet, Node and Vitest
   │  ├─ index.ts        createTrackerPlayer, createMidiPlayer, computeLength, types
   │  ├─ sequencer.ts    orders/rows/ticks, flow effects, loop detection, length dry-run
   │  ├─ effects.ts      per-tick effect handlers with per-format quirks
   │  ├─ pitch.ts        period tables and period → Hz per format
   │  ├─ mixer.ts        voices, resampling, pan/separation, gain, clamp
   │  ├─ midi-synth.ts   MIDI timing (P23), SF2 voice synth implementing Player (P25)
   │  └─ engine.test.ts
   ├─ audio/             the only folder that touches Web Audio
   │  ├─ protocol.ts     ToWorklet / FromWorklet message types, PROCESSOR_NAME
   │  ├─ worklet.ts      ENTRY (AudioWorkletGlobalScope): hosts one Player per node
   │  ├─ AudioEngine.ts  AudioEngine class + AudioUnsupportedError, PlaybackError
   │  └─ modem.ts        playModemIntro
   ├─ library/           catalogue logic. Pure TS
   │  ├─ manifest.ts     ManifestEntry, Manifest, loadManifest, describe
   │  ├─ search.ts       Filters, filterEntries, sortEntries
   │  ├─ shuffle.ts      Queue, createQueue
   │  └─ library.test.ts
   ├─ viz/               drawing only. Canvas 2D; React only in the host
   │  ├─ types.ts        Frame, VisualizerDef, VisualizerInstance
   │  ├─ index.ts        visualizers registry, getVisualizer
   │  ├─ VisualizerHost.tsx
   │  ├─ pattern.ts      tracker pattern view (P15) + MIDI piano roll (P26)
   │  ├─ scope.ts        mix oscilloscope + spectrum
   │  ├─ channels.ts     per-channel scopes + VU
   │  └─ demo.ts         plasma, starfield, copper
   ├─ state/             React glue between UI and audio/library
   │  ├─ settings.ts     Settings, DEFAULTS, load/save settings + favorites
   │  ├─ route.ts        Route, parseRoute, formatRoute, useHashRoute
   │  ├─ SettingsContext.tsx  SettingsProvider, useSettings
   │  ├─ PlayerContext.tsx    PlayerProvider, usePlayer
   │  └─ state.test.ts
   └─ ui/                screens. Nothing imports from ui/
      ├─ theme.css       @font-face, shared tokens, one token set per theme on :root[data-theme], base styles (P2)
      ├─ pages/          Landing, Browse, Jukebox, NowPlaying, Credits
      └─ components/     ErrorBoundary, Toast, PlayerBar, InfoPanel, DropZone, ChannelStrip,
                         VizPicker, ConnectOverlay, MessageScroller, SampleBrowser
```

**Entry points:**

- Browser: `index.html` → `src/main.tsx`.
- Audio thread: `src/audio/worklet.ts`, loaded via `?worker&url`.
- Node: the `scripts/*.ts` files that `package.json` scripts run through `tsx`.

**Dependency rules** (one-way, enforced by ESLint `no-restricted-imports`):

```
net ← library, audio, state          (net imports nothing from src)
formats ← engine ← audio ← state ← ui
formats ← library ← state
engine, audio (types and AudioEngine) ← viz ← ui
scripts → net, formats, engine, library   (never audio/state/viz/ui)
App.tsx / main.tsx may import everything
```

**Why split this way:**

- **Folders follow where the code runs.**
  - `formats/`, `engine/` and `library/` must run in three places: the AudioWorklet (no DOM, no React), Node scripts and Vitest. So they're pure TS.
  - `audio/` is the only folder that touches Web Audio.
  - `state/` and `ui/` are the only folders that touch React, apart from `viz/VisualizerHost.tsx`.
- **`formats/` is separate from `engine/`** because the manifest script, info panel and sample browser need parsed data without playback.
- **`library/` is separate from `state/`** so search and shuffle are plain functions, testable without React.
- **`viz/` is plain draw functions**, so a new visualizer is one file plus a registry line, and drawing never re-renders React.
- **One `Player` interface** serves trackers and MIDI, so the worklet, jukebox and visualizers don't care which format is playing.
- **One file per format parser:** the formats share only `bytes.ts` and `song.ts`.

**Where things appear in the UI:**

- `PlayerBar` is shown on every page except Landing. Its VIEW button opens `#/play/<id>`.
- `NowPlaying` (`#/play/<id>`) is the full-screen view and the share-link target. It has three tabs:
  - VIZ: `VisualizerHost` + `VizPicker` + `ChannelStrip`
  - MESSAGE: `MessageScroller` (P27)
  - SAMPLES: `SampleBrowser` (P27), trackers only
- `Jukebox` embeds `VisualizerHost` + `VizPicker`.

## Dependencies

**Policy:**

- Exact versions in `package.json` (no `^`/`~`), with the lockfile committed.
- Versions were checked on npm on 2026-11-07, and each is ≥ 2 weeks old.
- Runtime dependencies are React only. Parsers, DSP, router, state and shuffle are our own code.

### Runtime (`dependencies`)

| Package   | Version | Why                |
| --------- | ------- | ------------------ |
| react     | 19.3.1  | UI (user's choice) |
| react-dom | 19.3.1  | DOM renderer       |

### Dev (`devDependencies`)

| Package                   | Version   | Why                                                            |
| ------------------------- | --------- | -------------------------------------------------------------- |
| vite                      | 8.3.5     | dev server, build, worklet bundling                            |
| @vitejs/plugin-react      | 6.1.2     | JSX + fast refresh (6.2.x is under 2 weeks old)                |
| typescript                | **6.0.3** | type checking (`tsc -b`). **Not 7.x** (see flags)              |
| vitest                    | 5.0.5     | unit tests, reusing the Vite config                            |
| eslint                    | 10.13.0   | linting                                                        |
| @eslint/js                | 10.0.1    | core recommended rules                                         |
| typescript-eslint         | 8.72.0    | TS parser + rules (supports TS < 6.1)                          |
| eslint-plugin-react-hooks | 7.1.1     | catches hook-dependency bugs                                   |
| prettier                  | 3.9.10    | formatting                                                     |
| tsx                       | 4.23.15   | runs `scripts/*.ts` in Node with no build step                 |
| @types/react              | 19.3.0    | React types                                                    |
| @types/react-dom          | 19.3.0    | ReactDOM types                                                 |
| @types/node               | 24.19.2   | types for scripts, tests and the Vite config, matching Node 24 |

- `packageManager`: `"pnpm@11.5.0"`.
- `engines.node`: `">=24.0.0 <25"`.

**Not used:** `eslint-plugin-react-refresh` (HMR warnings only), `globals` (TypeScript catches undefined names), `eslint-config-prettier` (the flat recommended configs have no formatting rules), jsdom (there are no component tests).

### Non-npm

| Item                                                     | Version                                  | Why                                                  | Where                       |
| -------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------- | --------------------------- |
| Node.js                                                  | 24 LTS (local v24.13.0)                  | tooling runtime                                      | `.nvmrc` = `24`             |
| openmpt123 (libopenmpt)                                  | 0.8.10, `brew install libopenmpt` (user) | dev-only reference renders                           | user's machine              |
| Web437 IBM VGA 8x16 (VileR, Oldschool PC Font Pack v2.2) | woff                                     | DOS look. CC BY-SA 4.0, credited on the Credits page | `public/fonts/`             |
| GeneralUser GS SoundFont                                 | v2.0.x                                   | GM bank for MIDI                                     | URL + SHA-256 pinned in P24 |

### ⚠ Flags

- **TypeScript 7 (the native Go compiler) breaks typescript-eslint,** whose peer range is `>=4.8.4 <6.1.0`. Stay on 6.0.3.
- **Vite and Vitest break often.** Vite has a major about once a year and 8 moved to Rolldown; Vitest went 3→4→5 in about 18 months; `@vitejs/plugin-react` 6 requires `vite ^8`. Upgrade the three together. P13 verifies the worklet import against the prod build.
- **ESLint 10 only supports flat config.** The config stays minimal so upgrades stay cheap.
- **pnpm blocks dependency install scripts by default.** If `pnpm install` in P1 reports ignored build scripts for esbuild, run `pnpm approve-builds` and approve esbuild only. That's part of P1.
- **GeneralUser GS is about 30MB, has a single maintainer, and its license warns about unknown sample origins.** P24 starts with a license gate, and the bank loads only on first MIDI playback.
- **The font is CC BY-SA:** it must be credited and stays unmodified.

## Engineering conventions

### Configuration

- **No `.env` and no build-time env vars.** It's a static site with no secrets.
- **User preferences:** `src/state/settings.ts` → localStorage (Contracts → Storage).
- **Engine options:** a `PlayerOptions` object (`interpolation`, `stereoSeparation`, `muteMask`) sent over `protocol.ts`.
- **Dev-tool constants** sit at the top of their script: compare thresholds in `compare.ts`; the SoundFont URL and SHA-256 in `fetch-soundfont.ts`.
- **Mixer gain constants** live in `FORMAT_GAIN` in `mixer.ts` (decision 17).
- **Debug flag:** `?debug=1` in `location.search`, before the hash.
- **`package.json` scripts,** each added in the phase shown:

```jsonc
// P1
"dev": "vite", "build": "tsc -b && vite build", "preview": "vite preview",
"test": "vitest run", "test:watch": "vitest", "lint": "eslint .", "format": "prettier --write .",
"check": "tsc -b && eslint . && prettier --check . && vitest run",
// P8
"manifest": "tsx scripts/manifest.ts", "predev": "tsx scripts/manifest.ts", "prebuild": "tsx scripts/manifest.ts",
// P9
"render": "tsx scripts/render.ts",
// P10
"compare": "tsx scripts/compare.ts",
// P24
"fetch-soundfont": "tsx scripts/fetch-soundfont.ts"
```

- **vite.config.ts:**

```ts
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'node', include: ['src/**/*.test.ts'], passWithNoTests: true }, // passWithNoTests removed in P3
})
```

- **tsconfig.app.json:**
  - `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `noEmit`.
  - `target ES2022`, `lib ["ES2022","DOM","DOM.Iterable"]`, `module ESNext`, `moduleResolution bundler`, `jsx react-jsx`.
  - `include ["src"]`, `exclude ["src/**/*.test.ts"]`.
- **tsconfig.node.json:** the same strictness flags, with `lib ["ES2022","DOM"]`, `types ["node"]`, `include ["scripts", "src/**/*.test.ts", "vite.config.ts"]`.
  - DOM is in the lib because `state.test.ts` uses `Storage`.
- **Worklet typing:** `src/audio/worklet.ts` declares `AudioWorkletProcessor`, `registerProcessor`, `currentFrame` and `sampleRate` in a local `declare global` block (about 10 lines). The DOM lib doesn't include the worklet scope, and adding a types package isn't allowed.
- **`.prettierrc`:** `{ "printWidth": 100, "singleQuote": true, "semi": false }`.
- **`.prettierignore`:** `trackers`, `public/music`, `public/manifest.json`, `public/soundfonts`, `dist`, `pnpm-lock.yaml`.
- **`.gitignore`:** `node_modules`, `dist`, `public/music`, `public/manifest.json`, `public/soundfonts`, `.DS_Store`, `*.wav`.

### Linting

```js
// eslint.config.js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import hooks from 'eslint-plugin-react-hooks'

const LAYERS = ['net', 'formats', 'engine', 'audio', 'library', 'state', 'viz', 'ui']
// files in src/<from>/ may not import the listed src folders (matches '../engine' and '../engine/x')
const deny = (from, banned, extra = []) => ({
  files: [`src/${from}/**`],
  rules: {
    'no-restricted-imports': [
      'error',
      { patterns: [...banned.flatMap((b) => [`**/${b}`, `**/${b}/**`]), ...extra] },
    ],
  },
})
const PURE = ['react', 'react-dom', 'react/*'] // must stay React-free (worklet + Node)
const others = (...allowed) => LAYERS.filter((l) => !allowed.includes(l))

export default tseslint.config(
  { ignores: ['dist', 'public', 'trackers', 'mockups'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['src/**/*.tsx'], ...hooks.configs['recommended-latest'] },
  {
    files: ['src/net.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['./*', ...PURE] }] },
  },
  deny('formats', others('formats'), PURE),
  deny('engine', others('engine', 'formats'), PURE),
  deny('library', others('library', 'formats', 'net'), PURE),
  deny('audio', others('audio', 'engine', 'formats', 'net'), PURE),
  deny('viz', others('viz', 'engine', 'audio', 'formats')),
  deny('state', others('state', 'audio', 'engine', 'formats', 'library', 'net')),
  {
    files: ['scripts/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['**/src/audio/**', '**/src/state/**', '**/src/viz/**', '**/src/ui/**'] },
      ],
    },
  },
)
```

- The non-type-checked `recommended` sets are used, because `tsc -b` already covers type errors.

### Error handling

- **Parsers:** throw `ParseError` or `UnsupportedFormatError`, never partial data. `ByteReader` throws `ParseError` on any read past the end.
- **Engine:** never throws while rendering.
  - Out-of-range values (sample positions, periods, volumes, unknown instruments) are clamped.
  - Unknown effects are ignored and counted in `stats.unknownFx`.
- **Worklet:** `process()` is wrapped in try/catch. On an exception it outputs silence, posts one `error` message, drops its player, and returns `true`.
- **AudioEngine:** rejects with the error types in **Contracts** and emits `error` events.
- **PlayerContext:** turns every error into a `Toast` with the text `<file>: <error.message>`, and `console.error`s it.
- **Jukebox:** a failed song is skipped. After 3 failures in a row, playback stops and a toast says so.
- **Unsupported browser:** if `AudioEngine.isSupported()` is false, or `unlock()` throws `AudioUnsupportedError`, the app renders a themed "UNSUPPORTED BROWSER" screen in place of the page.
- **Manifest fetch failure:** Browse shows the error with a RETRY button, and drag & drop still works.
- **Music file or SoundFont failure:** a toast; the user can press play again. Trackers are unaffected by a SoundFont failure.
- **React:** one `ErrorBoundary` around the route switch shows "SYSTEM HALTED — press any key". A key or click resets the boundary and navigates to `#/browse`.
- **localStorage:** accessed only via `settings.ts`; every access is in try/catch; failures fall back to defaults.
- **Drag & drop:** size (≤ 16 MiB) and `detectFormat` checks happen before parsing. Each rejected file gets a toast. Nothing is uploaded.
- **Scripts:** exit codes are listed in **Contracts → Script contracts**. Errors go to stderr.

### Logging

- No logging library and no telemetry.
- **Browser:**
  - `console.error` for errors shown to the user.
  - `console.warn` for skipped content: the manifest entries `loadManifest` rejects, and a visualizer that threw.
  - Nothing else.
  - With `?debug=1`, the worklet posts `stats` every second and `PlayerContext` prints them with `console.table`.
- **Scripts:** one line per file (`OK s3m/panic.s3m 16ch 4:31` or `SKIP midi/x.mid: Unsupported: midi`), then a summary line `N ok, M skipped`.

### Testing

- **Vitest in the Node environment,** with one test file per folder: `formats.test.ts`, `engine.test.ts`, `library.test.ts`, `state.test.ts`. There are no React component tests; UI is checked by each phase's acceptance steps.
- **Parser tests** read the real files in `trackers/` with `node:fs` and assert the **Findings → Expected values**.
- **Engine tests** build small `Song`s with a `songOf(...)` helper inside `engine.test.ts` and assert sequencer and mixer state (positions, periods, volumes, flags, lengths). No PCM snapshot tests.
- **SoundFont tests** run against the fetched bank and use `describe.skipIf(!existsSync(BANK_PATH))`. P24 acceptance requires them to actually run.
- **Audio correctness:** `pnpm compare` against openmpt123, run manually in P10–P12.

## Contracts

These are the exact public signatures. Anything not listed is module-private. A function throws only what its comment says.

### `src/net.ts`

```ts
export class LoadError extends Error {
  readonly name = 'LoadError'
  constructor(message: string, readonly url: string, readonly status?: number) // status = HTTP code; undefined = network failure
}
/** GET url → bytes. Non-2xx → LoadError(`HTTP ${status}`, url, status). Network failure → LoadError('Network error', url).
 *  Abort → the DOMException 'AbortError' is rethrown unchanged. onProgress is called per chunk (total from Content-Length or null). */
export function fetchBytes(url: string, opts?: { signal?: AbortSignal; onProgress?: (loaded: number, total: number | null) => void }): Promise<Uint8Array>
/** fetchBytes + UTF-8 decode + JSON.parse. Invalid JSON → LoadError('Invalid JSON', url). Caller validates the shape. */
export function fetchJson(url: string, signal?: AbortSignal): Promise<unknown>
```

### `src/formats` (exported only via `formats/index.ts`)

```ts
// song.ts
export type Format = 'mod' | 'stm' | 's3m' | 'mtm' | '669' | 'midi'
export type TrackerFormat = Exclude<Format, 'midi'>       // also selects the effect quirks
export const FORMATS: readonly Format[]                   // ['mod','s3m','stm','669','mtm','midi'] (display order)
export type MidiTarget = 'gm' | 'mt32'
export const NOTE_NONE = -1
export const NOTE_CUT = -2                                 // notes are otherwise 0..119, C-0 = 0, C-4 = 48
export const MAX_CHANNELS = 32

export const Fx = {
  None: 0, Arpeggio: 1, PortaUp: 2, PortaDown: 3, TonePorta: 4, Vibrato: 5,
  TonePortaVolSlide: 6, VibratoVolSlide: 7, Tremolo: 8, SetPan: 9, Offset: 10, VolSlide: 11,
  PosJump: 12, SetVolume: 13, PatBreak: 14, SetSpeed: 15, SetTempo: 16,
  FinePortaUp: 17, FinePortaDown: 18, FineVolUp: 19, FineVolDown: 20, PatLoop: 21,
  NoteCut: 22, NoteDelay: 23, PatDelay: 24, Retrig: 25, Tremor: 26, SetFinetune: 27,
  GlobalVolume: 28, VibratoWaveform: 29, TremoloWaveform: 30, StereoControl: 31, FreqAdjust: 32,
} as const
export type Fx = (typeof Fx)[keyof typeof Fx]
// The mapping from file commands to Fx is the table in decision 9.

export interface Cell {
  note: number     // 0..119 | NOTE_NONE | NOTE_CUT
  ins: number      // 1-based sample number, 0 = none
  vol: number      // 0..64 from a volume column, -1 = none (MOD/MTM always -1)
  fx: Fx
  param: number    // 0..255 as decision 9 specifies
  fxRaw: number    // command as stored (MOD/MTM 0..15, S3M/STM 1..26 = A..Z, 669 0..15); -1 = none
  paramRaw: number // param as stored
}
export interface Pattern {
  rows: number           // 64, or the 669 break row + 1
  speed: number | null   // 669 per-pattern ticks/row, applied at row 0; null for other formats
  cells: Cell[]          // cells[row * song.channels + ch], length rows * channels
}
export interface Sample {
  name: string
  data: Float32Array     // mono, [-1, 1)
  loopStart: number      // frames
  loopEnd: number        // frames, exclusive; loopEnd <= loopStart → no loop
  volume: number         // 0..64
  c2spd: number          // playback rate in Hz at note C-4 (48)
}
export interface Song {
  kind: 'tracker'
  format: TrackerFormat
  title: string          // as stored (may be ''); 669 = first non-empty message line
  tracker: string        // decision 11 gives the exact strings
  message: string        // non-empty sample names, then comment/message lines, '\n'-joined, CP437-decoded
  channels: number       // 1..MAX_CHANNELS
  channelPan: number[]   // length channels, -1..1 (decision 16)
  stereo: boolean        // false only for S3M with master-volume bit 7 clear
  initialSpeed: number   // ticks/row
  initialTempo: number   // BPM
  globalVolume: number   // 0..64
  mixGain: number        // 0..1: S3M (masterVolume & 0x7F) / 127, else 1
  orders: number[]       // pattern indices; S3M 0xFE removed and list cut at the first 0xFF; 669/STM cut at 0xFF/99
  patterns: Pattern[]
  samples: Sample[]      // samples[ins - 1]
}

export type MidiEvent =
  | { tick: number; ch: number; type: 'noteOn'; key: number; vel: number }   // vel 1..127; a noteOn with vel 0 is emitted as noteOff
  | { tick: number; ch: number; type: 'noteOff'; key: number }
  | { tick: number; ch: number; type: 'program'; program: number }
  | { tick: number; ch: number; type: 'cc'; cc: number; value: number }
  | { tick: number; ch: number; type: 'pitchBend'; value: number }          // -8192..8191
export interface MidiSong {
  kind: 'midi'
  format: 'midi'
  title: string          // first track-name (FF 03) in track 0, else first text (FF 01), else ''
  tracker: string        // `Standard MIDI File (type ${0|1})`
  message: string        // every text, copyright and track-name meta (FF 01–03) in file order, '\n'-joined
  ticksPerBeat: number
  tempoMap: { tick: number; usPerBeat: number }[]   // sorted; always starts with { tick: 0, usPerBeat: 500000 } unless the file sets tick 0
  events: MidiEvent[]    // all tracks merged, sorted by tick, stable by track order; ch 0..15
  channelsUsed: number[] // sorted channels that have noteOn
  target: MidiTarget
}

export interface SoundBank { name: string; presets: Map<number, Preset> }  // key = bank * 128 + program; drums are bank 128
export interface Preset { name: string; zones: Zone[] }   // preset- and instrument-level generators already combined
export interface Zone {
  keyLo: number; keyHi: number; velLo: number; velHi: number
  data: Float32Array     // subarray of one shared buffer for the whole bank
  sampleRate: number
  rootKey: number; tuneCents: number
  loopStart: number; loopEnd: number   // frames relative to data
  loopMode: 0 | 1 | 3                   // SF2 sampleModes: 0 = none, 1 = loop, 3 = loop until release
  attenuationDb: number
  pan: number                           // -1..1
  env: { delayS: number; attackS: number; holdS: number; decayS: number; sustainDb: number; releaseS: number }
  exclusiveClass: number
}
export type ParsedFile = Song | MidiSong

// bytes.ts
export class ParseError extends Error { readonly name = 'ParseError'; constructor(message: string, readonly offset?: number) }
export class UnsupportedFormatError extends Error {
  readonly name = 'UnsupportedFormatError'
  constructor(readonly what: string) // message = `Unsupported: ${what}`
}
export class ByteReader {
  constructor(bytes: Uint8Array, pos?: number)
  pos: number
  readonly length: number
  u8(): number; i8(): number; u16le(): number; u16be(): number; u32le(): number; u32be(): number
  bytes(n: number): Uint8Array   // subarray, no copy
  text(n: number): string        // CP437, cut at the first NUL, trailing spaces trimmed
  seek(pos: number): this
  // every read or seek past the end → ParseError('Unexpected end of file', pos)
}
export function decodeCp437(bytes: Uint8Array): string

// index.ts
/** Magic-byte sniff (decision 11). Never throws. null = not a supported format. */
export function detectFormat(bytes: Uint8Array): Format | null
/** Throws ParseError | UnsupportedFormatError (failure table below). Never returns partial data. */
export function parseFile(bytes: Uint8Array, opts?: { midiTarget?: MidiTarget }): ParsedFile
/** Throws ParseError. */
export function parseSoundBank(bytes: Uint8Array): SoundBank
export { MT32_TO_GM } from './mt32-to-gm'   // readonly number[] of length 128: MT-32 program → GM program (0-based)
```

**`parseFile` outcomes:**

| Situation                                          | Result                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `detectFormat` returns null                        | `UnsupportedFormatError('unknown format')`                                          |
| MIDI before P23                                    | `UnsupportedFormatError('midi')`                                                    |
| SMF format 2, or SMPTE division                    | `UnsupportedFormatError('SMF format 2')` / `UnsupportedFormatError('SMPTE timing')` |
| Header, order list or pattern data truncated       | `ParseError('Unexpected end of file', offset)`                                      |
| An order references a pattern that doesn't exist   | `ParseError('Bad pattern index')`                                                   |
| A cell references a sample beyond the sample count | Not an error: that cell's `ins` becomes 0                                           |
| Sample data truncated                              | Not an error: the sample is clamped to the available bytes (common in BBS files)    |
| S3M AdLib instrument (type ≥ 2), MTM 16-bit sample | Not an error: a zero-length sample, with its name kept                              |
| More than `MAX_CHANNELS` channels                  | `UnsupportedFormatError('more than 32 channels')`                                   |

### `src/engine` (exported only via `engine/index.ts`)

```ts
export type Interpolation = 'nearest' | 'linear' | 'cubic'
export interface PlayerOptions {
  interpolation: Interpolation
  stereoSeparation: number // 0..1; 1 = pan as stored (authentic), 0 = mono
  muteMask: number // bit n set = channel n muted (tracker: song channel; MIDI: MIDI channel)
}
export const DEFAULT_PLAYER_OPTIONS: PlayerOptions // { interpolation: 'nearest', stereoSeparation: 1, muteMask: 0 }
export const SCOPE_LEN = 256

export interface ChannelState {
  active: boolean // a voice is sounding on this channel
  note: number // last triggered note, NOTE_NONE if none
  ins: number // tracker: sample number; MIDI: program
  volume: number // 0..1 effective
  pan: number // -1..1
  triggered: boolean // a note started since the previous snapshot()
}
export type Position =
  | {
      kind: 'tracker'
      order: number
      pattern: number
      row: number
      tick: number
      speed: number
      tempo: number
    }
  | { kind: 'midi'; tick: number; tempo: number } // tempo in BPM
export interface Snapshot {
  frame: number // song-timeline frame (seek moves it)
  seconds: number // frame / sampleRate
  pos: Position
  ch: ChannelState[] // tracker: song.channels entries; MIDI: 16
  scopes: Float32Array[] // one per ch entry, SCOPE_LEN mono post-volume samples, oldest first
}
export interface PlayerStats {
  unknownFx: number
  voices: number
}
export type SeekTarget = { order: number } | { seconds: number }

export interface Player {
  readonly sampleRate: number
  readonly ended: boolean
  readonly stats: PlayerStats
  /** Fills left/right[0..frames). Returns the number of frames of real audio; after the end the rest are zeros. Never throws. */
  render(left: Float32Array, right: Float32Array, frames: number): number
  /** Clamped to the song's range. Resets state and fast-forwards silently, so effect memory is correct. Clears `ended`.
   *  On MIDI, { order } is treated as { seconds: 0 }. */
  seek(to: SeekTarget): void
  setOptions(o: Partial<PlayerOptions>): void
  /** Returns preallocated objects that are overwritten by the next call, so callers copy what they keep (postMessage copies).
   *  Resets ChannelState.triggered. */
  snapshot(): Snapshot
}
/** Throws RangeError if sampleRate <= 0. */
export function createTrackerPlayer(
  song: Song,
  sampleRate: number,
  opts?: Partial<PlayerOptions>,
): Player
/** Throws RangeError if sampleRate <= 0. */
export function createMidiPlayer(
  song: MidiSong,
  bank: SoundBank,
  sampleRate: number,
  opts?: Partial<PlayerOptions>,
): Player
/** Silent dry-run; never throws. Trackers stop at the end, the first loop (decision 18) or maxSeconds (default 1800).
 *  MIDI: seconds of the last event + 1, loops false. */
export function computeLength(
  song: ParsedFile,
  maxSeconds?: number,
): { seconds: number; loops: boolean; capped: boolean }
```

**Invariants:** the engine never mutates its input `Song`/`MidiSong`/`SoundBank`, and `render` allocates nothing.

### `src/audio/protocol.ts`

```ts
export const PROCESSOR_NAME = 'tj-player'
export const SNAPSHOT_EVERY_FRAMES = 512
// main → worklet (port.postMessage; structured clone copies the sample buffers)
export type ToWorklet =
  | { type: 'bank'; bank: SoundBank } // once per node, before its first MIDI load
  | { type: 'load'; id: string; song: ParsedFile; options: PlayerOptions; seek?: SeekTarget } // replaces the player; starts paused
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; to: SeekTarget }
  | { type: 'options'; options: Partial<PlayerOptions> }
  | { type: 'unload' }
  | { type: 'debug'; enabled: boolean }
// worklet → main
export type FromWorklet =
  | { type: 'loaded'; id: string }
  | { type: 'snapshot'; id: string; at: number; snap: Snapshot } // at = currentFrame at the end of the block; every SNAPSHOT_EVERY_FRAMES while playing
  | { type: 'ended'; id: string } // once, after the last real frame (again after a seek)
  | { type: 'error'; id: string | null; message: string } // MIDI load with no bank, or a render exception (the player is then dropped)
  | { type: 'stats'; id: string; stats: PlayerStats } // every ~1s of audio, only while debug is enabled
```

- **Node setup:** `new AudioWorkletNode(ctx, PROCESSOR_NAME, { numberOfInputs: 0, outputChannelCount: [2] })`.
- The main thread ignores any message whose `id` isn't the current one for that node.

### `src/audio/AudioEngine.ts`

```ts
export class AudioUnsupportedError extends Error { readonly name = 'AudioUnsupportedError' }
export class PlaybackError extends Error {
  readonly name = 'PlaybackError'
  constructor(message: string, readonly songId: string | null)
}
export type SongSource = { id: string; url: string } | { id: string; parsed: ParsedFile }
export interface Loaded { id: string; song: ParsedFile; durationSec: number }
export type EngineStatus = 'locked' | 'idle' | 'loading' | 'playing' | 'paused'
export type EngineEvent =
  | { type: 'status'; status: EngineStatus; current: Loaded | null }
  | { type: 'ended'; id: string }
  | { type: 'error'; error: LoadError | ParseError | UnsupportedFormatError | PlaybackError }
  | { type: 'bankProgress'; loaded: number; total: number | null }   // from P26
  | { type: 'stats'; stats: PlayerStats }                            // only when ?debug=1

export class AudioEngine {
  constructor(opts?: { debug?: boolean; soundFontUrl?: string /* default './soundfonts/GeneralUser-GS.sf2' */ })
  static isSupported(): boolean          // typeof AudioContext and AudioWorkletNode exist
  get status(): EngineStatus             // 'locked' until unlock() resolves
  get current(): Loaded | null
  get context(): AudioContext | null     // null until unlock()
  get analyser(): AnalyserNode | null    // fftSize 2048, after the deck gains
  /** Call from a user gesture. Creates/resumes the AudioContext and adds the worklet module; idempotent.
   *  Throws AudioUnsupportedError. */
  unlock(): Promise<void>
  /** Fetches (url) or uses the parsed song, then loads it onto a deck and (autoplay, default true) plays it.
   *  - fadeSec > 0 while something plays → crossfade to the other deck (from P21; before P21 fadeSec is ignored).
   *  - The first MIDI load fetches and parses the SoundFont (from P26; before P26 MIDI → PlaybackError('MIDI playback not available yet')).
   *  - opts.midiTarget re-parses a url source with that target (MIDI only).
   *  - Throws LoadError | ParseError | UnsupportedFormatError | PlaybackError('Audio is locked') if unlock() hasn't resolved.
   *  - A newer load() aborts an in-flight one: the old promise rejects with AbortError, and no 'error' event is emitted. */
  load(src: SongSource, opts?: { midiTarget?: MidiTarget; fadeSec?: number; seek?: SeekTarget; autoplay?: boolean }): Promise<Loaded>
  play(): void                           // no-op when nothing is loaded
  pause(): void
  seek(to: SeekTarget): void
  setOptions(o: Partial<PlayerOptions>): void   // applies to every deck
  /** From P21. Linear fade to silence, then pause. */
  fadeOut(sec: number): Promise<void>
  /** Newest snapshot with at / sampleRate <= ctx.currentTime - latency, where latency = ctx.outputLatency || ctx.baseLatency || 0.
   *  The last 32 snapshots are kept. null if nothing is loaded. */
  latest(): { snap: Snapshot; song: ParsedFile } | null
  on(listener: (e: EngineEvent) => void): () => void   // returns an unsubscribe function
  dispose(): Promise<void>               // closes the context; the instance is unusable afterwards
}
```

```ts
// modem.ts
/** About 4s synthesized handshake through ctx.destination. Resolves when finished or aborted; never rejects. */
export function playModemIntro(ctx: AudioContext, signal?: AbortSignal): Promise<void>
```

### `src/library`

```ts
// manifest.ts
export interface ManifestEntry {
  id: string // lowercased path under trackers/ ('mod/12warior.mod'), or 'local:<n>:<file name>'
  url: string | null // `./music/${id}`; null for local entries
  file: string // original file name
  format: Format
  title: string // parsed title, or the file name without extension if that's empty
  tracker: string
  channels: number // tracker channels; MIDI: channelsUsed.length
  sizeBytes: number
  durationSec: number
  loops: boolean
  sampleNames: string[] // non-empty names in order; [] for MIDI
  message: string
  midiTarget: MidiTarget | null // null for trackers
}
export interface Manifest {
  version: 1
  generatedAt: string
  entries: ManifestEntry[]
} // generatedAt = ISO 8601
/** Fetches and validates the manifest. Throws LoadError: network/HTTP/JSON errors, version !== 1 ('Unsupported manifest version'),
 *  or entries not an array ('Invalid manifest'). Entries with a missing or wrong-typed field are dropped with console.warn. */
export function loadManifest(url?: string /* default './manifest.json' */): Promise<ManifestEntry[]>
/** Builds an entry from a parsed file. Shared by scripts/manifest.ts and drag & drop. Never throws. */
export function describe(
  parsed: ParsedFile,
  meta: {
    id: string
    url: string | null
    file: string
    sizeBytes: number
    durationSec: number
    loops: boolean
  },
): ManifestEntry

// search.ts
export type SortKey = 'title' | 'format' | 'channels' | 'durationSec' | 'sizeBytes'
export interface Filters {
  query: string
  formats: Format[]
  channels: number[]
  favoritesOnly: boolean
} // an empty array means "all"
export const EMPTY_FILTERS: Filters
/** query: case-insensitive substring match against title, file, sampleNames and message; trimmed; '' matches all. */
export function filterEntries(
  entries: readonly ManifestEntry[],
  f: Filters,
  favorites: ReadonlySet<string>,
): ManifestEntry[]
/** Stable sort; returns a new array. Strings compare with localeCompare(undefined, { sensitivity: 'base' }). */
export function sortEntries(
  entries: readonly ManifestEntry[],
  key: SortKey,
  dir: 'asc' | 'desc',
): ManifestEntry[]

// shuffle.ts
export interface Queue {
  current(): string | null
  /** Advances and returns the new current id; null only when the queue is empty.
   *  When a pass is used up, a new pass starts (reshuffled if shuffle), and it never begins with the id just played if length > 1. */
  next(): string | null
  /** Moves back through play history; returns null (and stays put) at the start of the history. */
  prev(): string | null
  /** Replaces the id list. The current id stays current. The rest of this pass = new ids not yet played this pass. */
  rebuild(ids: readonly string[], shuffle: boolean): void
}
/** shuffle = false → ids are played in the given order. rng defaults to Math.random and is only used for Fisher–Yates. */
export function createQueue(ids: readonly string[], shuffle: boolean, rng?: () => number): Queue
```

### `src/viz`

```ts
// types.ts
/** CSS colours from the active theme's tokens: --fg --dim --accent, --pat-{rownum,note,inst,vol,fx,empty,sep,beat,cur}, --scope-{bg,grid,wave}. */
export interface Palette {
  fg: string
  dim: string
  accent: string
  rownum: string
  note: string
  inst: string
  vol: string
  fx: string
  empty: string
  sep: string
  beat: string
  cur: string
  bg: string
  grid: string
  wave: string
}
export interface Frame {
  snap: Snapshot
  song: ParsedFile
  time: Float32Array // analyser.getFloatTimeDomainData, length 2048
  freq: Uint8Array // analyser.getByteFrequencyData, length 1024
  width: number // CSS px
  height: number // CSS px; ctx is already scaled by dpr
  dpr: number
  reducedMotion: boolean
  palette: Palette
}
export interface VisualizerInstance {
  /** f = null when nothing is loaded: draw the idle screen. dt = seconds since the previous call (0 on the first). */
  draw(ctx: CanvasRenderingContext2D, f: Frame | null, dt: number): void
  /** Optional input: the host forwards canvas clicks/taps in CSS px. */
  click?(x: number, y: number): void
  dispose?(): void
}
export interface VisualizerDef {
  id: string
  name: string
  create(): VisualizerInstance
}
// index.ts
export const visualizers: readonly VisualizerDef[] // final order: pattern, scope, channels, plasma, starfield, copper
export function getVisualizer(id: string): VisualizerDef // unknown id → visualizers[0]
// VisualizerHost.tsx
export function VisualizerHost(props: {
  vizId: string
  engine: AudioEngine
  label: string
  className?: string
}): JSX.Element
```

**Host behaviour:**

- Creates the instance on mount and when `vizId` changes; disposes the old one.
- Sizes the canvas to its container with a ResizeObserver (× devicePixelRatio) and runs one rAF loop.
- Builds `Frame` from `engine.latest()` and `engine.analyser`.
- Reads `Frame.palette` from the computed tokens on `document.documentElement` once on mount and again when its `data-theme` attribute changes (a `MutationObserver`), never per frame. Pattern, scope and channels draw only with the palette; the demo effects keep their own colours.
- Sets `aria-label` to `${label}: ${title}, order ${order} row ${row}` for trackers, or `${label}: ${title}, ${m}:${ss}` for MIDI.
- If `draw` throws, logs once with `console.warn` and switches to `getVisualizer('scope')`.

### `src/state`

```ts
// settings.ts
export const THEMES = ['bbs', 'tracker', 'demoscene', 'mix'] as const
export type Theme = (typeof THEMES)[number]
export interface Settings {
  version: 1
  theme: Theme // applied as <html data-theme>
  player: { interpolation: Interpolation; stereoSeparation: number; lastViz: string }
  jukebox: {
    shuffle: boolean
    formats: Format[] // empty = all
    favoritesOnly: boolean
    fade: boolean
    maxLengthMin: number // integer 0..30; 0 = no cap
    autoViz: 'off' | 'perSong' | 'every2min'
  }
  intro: { skip: boolean }
}
export const DEFAULTS: Settings
// { version: 1, theme: 'bbs',
//   player: { interpolation: 'nearest', stereoSeparation: 1, lastViz: 'pattern' },
//   jukebox: { shuffle: true, formats: [], favoritesOnly: false, fade: true, maxLengthMin: 5, autoViz: 'perSong' },
//   intro: { skip: false } }
export const SETTINGS_KEY = 'tj.settings.v1'
export const FAVORITES_KEY = 'tj.favorites.v1'
/** Never throws. storage defaults to globalThis.localStorage (access in try/catch). Missing, blocked or invalid JSON → DEFAULTS.
 *  Otherwise merged per leaf: a missing, wrong-typed or out-of-range leaf → that leaf's default; unknown Format values are dropped. */
export function loadSettings(storage?: Storage | null): Settings
export function saveSettings(s: Settings, storage?: Storage | null): boolean // false if storage is missing, blocked or full
export function loadFavorites(storage?: Storage | null): Set<string> // non-array → empty; non-string items dropped
export function saveFavorites(ids: ReadonlySet<string>, storage?: Storage | null): boolean

// route.ts
export type Route =
  | { page: 'landing' }
  | { page: 'browse' }
  | { page: 'jukebox' }
  | { page: 'credits' }
  | { page: 'play'; id: string; seek: SeekTarget | null }
/** '' | '#' | '#/' → landing; '#/browse' | '#/jukebox' | '#/credits';
 *  '#/play/<encodeURIComponent(id)>[?order=<int ≥ 0> | ?t=<number ≥ 0>]'. Anything else → landing. */
export function parseRoute(hash: string): Route
export function formatRoute(r: Route): string // parseRoute(formatRoute(r)) deep-equals r
export function useHashRoute(): [Route, (r: Route) => void] // the setter assigns location.hash; listens to 'hashchange'

// SettingsContext.tsx
export function SettingsProvider(props: { children: ReactNode }): JSX.Element
export function useSettings(): { settings: Settings; update(fn: (s: Settings) => Settings): void } // update saves immediately

// PlayerContext.tsx
export interface PlayerApi {
  engine: AudioEngine
  status: EngineStatus
  current: ManifestEntry | null
  entries: ManifestEntry[] // manifest entries (sorted by id) followed by local entries in drop order
  manifestError: LoadError | null
  retryManifest(): void
  mode: 'single' | 'jukebox'
  muteMask: number
  /** Unlocks if needed (call from a gesture). Unknown id → rejects Error('Song not found'). Sets mode 'single'.
   *  opts.fadeSec is used by the jukebox. MIDI entries pass entry.midiTarget (or the InfoPanel override). */
  play(
    id: string,
    opts?: { seek?: SeekTarget; fadeSec?: number; midiTarget?: MidiTarget },
  ): Promise<void>
  toggle(): void // play/pause the current song
  setMuted(ch: number, muted: boolean): void
  solo(ch: number | null): void // ch → mute all others; null → unmute all
  favorites: ReadonlySet<string>
  toggleFavorite(id: string): void // local ids are ignored
  /** Rejects with Error('File too large (max 16 MB)') | Error('Not a supported music file') | the parse error. Never uploads. */
  addLocal(file: File): Promise<ManifestEntry>
  /** Builds the Queue from settings.jukebox and entries, sets mode 'jukebox' and plays the first song. Rejects Error('No songs match the jukebox filter'). */
  startJukebox(): Promise<void>
  next(): Promise<void> // jukebox mode only; no-op in single mode
  prev(): Promise<void>
}
export function PlayerProvider(props: { children: ReactNode }): JSX.Element
export function usePlayer(): PlayerApi
```

**Which phase adds each `PlayerApi` member:**

- P17: `engine`, `status`, `current`, `entries`, `manifestError`, `retryManifest`, `mode` (always `'single'`), `muteMask`, `play`, `toggle`, `setMuted`.
- P19: `favorites`, `toggleFavorite`, `addLocal`.
- P20: `solo`.
- P21: `startJukebox`, `next`, `prev`, and jukebox mode.

### Storage

| Key                               | Shape           | Writer          | When corrupt or blocked |
| --------------------------------- | --------------- | --------------- | ----------------------- |
| `localStorage['tj.settings.v1']`  | JSON `Settings` | `saveSettings`  | defaults; the app works |
| `localStorage['tj.favorites.v1']` | JSON `string[]` | `saveFavorites` | empty set               |

### Static files the app fetches (relative to `base './'`)

| Path                             | Producer                     | On failure                                                    |
| -------------------------------- | ---------------------------- | ------------------------------------------------------------- |
| `manifest.json`                  | `scripts/manifest.ts`        | `manifestError` → Browse shows RETRY; drag & drop still works |
| `music/<id>`                     | `scripts/manifest.ts`        | toast; jukebox skips (stops after 3 in a row)                 |
| `soundfonts/GeneralUser-GS.sf2`  | `scripts/fetch-soundfont.ts` | toast "Sound bank unavailable: …"; trackers unaffected        |
| `fonts/Web437_IBM_VGA_8x16.woff` | committed                    | CSS falls back to `monospace`                                 |

### Script contracts

| Command                                                                                     | Input                                                                                                                                   | Output                                                                                                                                                        | Exit                                                                                    |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm manifest`                                                                             | `trackers/**` (dotfiles skipped); from P23 `scripts/midi-overrides.json` (`Record<id, MidiTarget>`)                                     | deletes `public/music/`, copies each OK file to `public/music/<id>`, writes `public/manifest.json` (entries sorted by id), one stdout line per file + summary | 0 if ≥ 1 OK, else 1                                                                     |
| `pnpm render <in> [out.wav] [--interp nearest\|linear\|cubic] [--sep 0..100] [--rate <Hz>]` | a supported file (from P25 MIDI, using `public/soundfonts/GeneralUser-GS.sf2`)                                                          | 16-bit stereo WAV (default `./<basename>.wav`); prints `<seconds>s peak <dBFS> dBFS`                                                                          | 0 ok, 1 parse/IO error, 2 bad args                                                      |
| `pnpm compare [<format> \| <id substring>]`                                                 | tracker files in `trackers/` (an arg equal to a TrackerFormat filters by _detected_ format; otherwise it's an id substring; none = all) | one table row per file: `id · ours s · ref s · Δs · ΔdB · corr · PASS/FAIL/ERROR`                                                                             | 0 all PASS, 1 any FAIL/ERROR, 2 openmpt123 not found (prints `brew install libopenmpt`) |
| `pnpm fetch-soundfont`                                                                      | `SOUNDFONT_URL`, `SOUNDFONT_SHA256` in the script                                                                                       | `public/soundfonts/GeneralUser-GS.sf2`; skipped if present with the right hash                                                                                | 0 ok, 1 download or hash failure (partial file deleted)                                 |

```ts
// scripts/wav.ts
export function writeWav(
  path: string,
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
): void // 16-bit PCM, clamped to ±1
export function readWav(path: string): { sampleRate: number; channels: Float32Array[] } // 16-bit PCM or 32-bit float; anything else throws Error('Unsupported WAV')
```

### External services and tools

- **openmpt123** (spawned only by `compare.ts`):
  - Command: `openmpt123 --batch --render --force --samplerate 48000 --channels 2 --filter 1 --stereo 100 --repeat 0 <tmp>/<file>`. It writes `<tmp>/<file>.wav`.
  - `<tmp>` is `fs.mkdtempSync(os.tmpdir() + '/tj-compare-')`, and files are copied into it. `trackers/` is never written.
  - In P10, verify each flag against `openmpt123 --help` first. If any is missing or different, stop (rule 6).
  - A non-zero exit or missing output → `ERROR`.
  - P7 also uses `openmpt123 --info <file>` and reads its `Duration` line.
- **SoundFont download:** HTTPS GET of `SOUNDFONT_URL` with redirects followed. Non-200 → exit 1. SHA-256 mismatch → exit 1. The URL and hash are set in P24 after the license gate.
- **Browser APIs** (all feature-detected except AudioWorklet):
  - `AudioContext` + `AudioWorkletNode`: required.
  - `navigator.mediaSession` (P27), optional:
    - metadata `{ title, artist: entry.tracker, album: 'Tracker Jukebox' }`
    - handlers `play`, `pause`, and in jukebox mode `nexttrack`/`previoustrack`
  - `navigator.clipboard.writeText` (P20). Fallback: a read-only input with the link selected.
  - `matchMedia('(prefers-reduced-motion: reduce)')`.
  - Drag & drop: `DataTransfer.files`. Items that aren't files are ignored, with a toast "Only files can be dropped".
  - `localStorage`.

### UI events

- **Hotkeys:** a single `keydown` listener on `window` in `App.tsx`, ignored when the target is an input, textarea, select or contenteditable, or when Ctrl, Meta or Alt is held. Key map: decision 39.
- **Share links:** `formatRoute({ page: 'play', id, seek })`, where `seek` is `{ order }` for trackers (the current order) and `{ seconds }` for MIDI (floored).
  - An unknown id → toast "Song not found" and navigate to `#/browse`.
  - Opening one while the engine is `locked` shows `ConnectOverlay`. The first click or key unlocks and plays from `seek`.

## Implementation decisions

### Repo & tooling

1. **Repo:** the root is `tracker-jukebox/`; `trackers/` stays where it is. The user runs `git init` before committing P1.
2. **Runtime:** Node 24 (`.nvmrc` = `24`). There's no CI; the user runs everything locally.
3. **Byte access:** `formats/` and `engine/` read through `ByteReader`/`DataView` over a `Uint8Array`; there's no Node `Buffer`.
4. **Routing:** the hash routes in **Contracts → route.ts**. No router library. `base: './'` plus hash routing works on any static host with no rewrites.
   - Until P22, `App.tsx` renders Browse for the `landing` route and for routes whose page doesn't exist yet.
5. **IDs:** bundled songs use the lowercased path under `trackers/`. Dropped files get `local:<n>:<name>`, where n starts at 1 per session. Local IDs can't be shared or favorited.
6. **Manifest:** produced as **Contracts → Script contracts** describes, with entries built by `describe()` using `computeLength`.
   - Before P23, MIDI files are logged as SKIP. The script exits 1 only if no file parses.
7. **Text:** all names, titles and messages go through `decodeCp437`. Control bytes 0x01–0x1F map to their CP437 glyphs (e.g. 0x0E → ♫), and 0x00 ends a string.

### Parsing

8. **Model:** exactly as in **Contracts → src/formats**.
9. **Command → Fx mapping:** the parser fills `fx`/`param`. "x/y" = high/low nibble.

   | File command                                                                  | Fx (param)                                                                                                             |
   | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
   | **MOD/MTM** `0xy` (non-zero)                                                  | Arpeggio (xy); `000` → None                                                                                            |
   | `1xx` / `2xx` / `3xx` / `4xy`                                                 | PortaUp / PortaDown / TonePorta / Vibrato                                                                              |
   | `5xy` / `6xy` / `7xy`                                                         | TonePortaVolSlide / VibratoVolSlide / Tremolo                                                                          |
   | `8xx`                                                                         | SetPan (xx, 0..255)                                                                                                    |
   | `9xx` / `Axy` / `Bxx` / `Cxx`                                                 | Offset / VolSlide / PosJump / SetVolume (min(xx, 64))                                                                  |
   | `Dxy`                                                                         | PatBreak (row = x·10 + y)                                                                                              |
   | `Fxx`                                                                         | SetSpeed if xx < 0x20, else SetTempo; `F00` → None                                                                     |
   | `E1y` `E2y` `E4y` `E5y` `E6y` `E7y`                                           | FinePortaUp, FinePortaDown, VibratoWaveform, SetFinetune, PatLoop, TremoloWaveform (y)                                 |
   | `E8y`                                                                         | SetPan (y·17)                                                                                                          |
   | `E9y` `EAy` `EBy` `ECy` `EDy` `EEy`                                           | Retrig, FineVolUp, FineVolDown, NoteCut, NoteDelay, PatDelay (y)                                                       |
   | `E0y` `E3y` `EFy`                                                             | None (Amiga filter, glissando, invert loop are not emulated)                                                           |
   | **S3M/STM** `A`                                                               | SetSpeed (STM: param >> 4)                                                                                             |
   | `B` `C`                                                                       | PosJump; PatBreak (row = x·10 + y)                                                                                     |
   | `D`                                                                           | VolSlide (raw param; fine `DxF`/`DFx` and memory are decoded at runtime)                                               |
   | `E` `F`                                                                       | PortaDown, PortaUp (raw; `EFx`/`EEx` fine/extra-fine decoded at runtime)                                               |
   | `G` `H` `I` `J` `K` `L`                                                       | TonePorta, Vibrato, Tremor, Arpeggio, VibratoVolSlide, TonePortaVolSlide                                               |
   | `O` `Q` `R` `T` `V`                                                           | Offset, Retrig, Tremolo, SetTempo, GlobalVolume                                                                        |
   | `U`                                                                           | Vibrato with depth/4 (param kept; flagged by `fxRaw` = 21)                                                             |
   | `X`                                                                           | SetPan (xx, 0..128 → ×2 clamped to 255)                                                                                |
   | `S2y` `S3y` `S4y` `S8y` `SAy` `SBy` `SCy` `SDy` `SEy`                         | SetFinetune, VibratoWaveform, TremoloWaveform, SetPan (y·17), StereoControl, PatLoop, NoteCut, NoteDelay, PatDelay (y) |
   | other S / unknown letters                                                     | None (runtime counts `unknownFx`)                                                                                      |
   | **669** `0x` `1x` `2x` `3x` `4x` `5x` (cmd = high nibble, param = low nibble) | PortaUp, PortaDown, TonePorta, FreqAdjust, Vibrato, SetSpeed; byte `0xFF` → None                                       |

10. **Sample decoding** (to Float32 in [-1, 1)):
    - MOD and STM: signed 8-bit (`v/128`).
    - MTM and 669: unsigned 8-bit (`(v-128)/128`).
    - S3M: signed 8-bit if `ffi` = 1, unsigned 8-bit if `ffi` = 2; 16-bit flag (bit 2) → 16-bit LE with the same signedness (`/32768`); stereo flag (bit 1) → left half only (`// ponytail: mono, add stereo if a file needs it`).
    - MOD finetune (signed nibble ft) → `c2spd = 8363 · 2^(ft/96)`.
11. **Detection and per-format layout** (offsets in bytes):
    - **MOD:**
      - Detection: magic at 1080 = `M.K.` `M!K!` `FLT4` `4CHN` (4ch), `6CHN` (6), `8CHN` `FLT8` (8), or two digits + `CH` (10–32).
      - Layout: title 20; 31 sample headers × 30 (name 22, length u16be words, finetune, volume, loopStart u16be words, loopLength u16be words; loop only if loopLength > 1 word); song length @950, orders @952 (128), patterns @1084 = 64 rows × ch × 4 bytes.
      - Cell: period = `((b0&0x0F)<<8)|b1`, ins = `(b0&0xF0)|(b2>>4)`, cmd = `b2&0x0F`, param = `b3`. Period → nearest note, where period(n) = 428 · 2^((48−n)/12) and period 0 → NOTE_NONE.
      - `tracker`: `ProTracker (M.K.)`, or `ProTracker (<magic>)` for the other signatures. Speed 6, tempo 125.
    - **STM:**
      - Detection: `!Scream!` at 20 and byte 29 = 2.
      - Layout: title 20; tempo byte @32 → initialSpeed = tempo >> 4 (initialTempo 125); patterns @33; globalVolume @34; 31 samples × 32 @48 (name 12, data paragraph u16le @14 ×16 = file offset, length u16le @16, loopStart @18, loopEnd @20 with 0xFFFF = no loop, volume @22, c2spd u16le @24); orders 128 @1040, ending at the first value ≥ 99 or ≥ the pattern count (KTULHU lists pattern 42 of 42, so that order ends the list instead of throwing `Bad pattern index`); patterns @1168 = 64 × 4 × 4 bytes.
      - Cell: note b0 (251–255 = none, else `(b0>>4)*12 + (b0&15) + 36`), ins = `b1>>3`, vol = `(b1&7)|((b2&0xF0)>>1)` (65 = none), cmd = `b2&0x0F` (1 = A), param b3.
      - 4ch, `tracker` = `Scream Tracker 2.<minor>`.
    - **S3M:**
      - Detection: `SCRM` at 0x2C.
      - Header and layout: the standard ST3 header (ordNum @0x20, insNum, patNum, flags, cwt, ffi, global volume @0x30, initial speed @0x31, initial tempo @0x32, master volume @0x33, default-pan flag @0x35, channel settings @0x40 ×32); orders @0x60; parapointers ×16.
      - Channels: the channel settings that are < 16 are enabled, and the song channel count is the number of enabled channels, in order.
      - Patterns: packed (u16 length, then rows of `what` bytes: 0x20 note+ins, 0x40 vol, 0x80 cmd+param).
      - Notes: 255 none, 254 NOTE_CUT, else `(b>>4)*12 + (b&15)`.
      - Samples: type 1 = PCM (name @0x30, 28 bytes); types 0 and ≥2 = zero-length.
      - `tracker` = `Scream Tracker <major>.<minor:02>` from `cwt`.
    - **669:**
      - Detection: `if` at 0 and samples byte (0x6E) ≤ 64 and patterns byte (0x6F) ≤ 128.
      - Layout: message 3×36 @2; orders 128 @0x71 (end at 0xFF); tempo list @0xF1 → `Pattern.speed`; break list @0x171 → `Pattern.rows` = break + 1; samples × 25 @0x1F1 (name 13, length u32, loopStart u32, loopEnd u32; loop only if loopEnd ≤ length); patterns follow (64 × 8 × 3 bytes); then sample data.
      - Cell: b0 < 0xFE → note `(b0>>2)+36`, ins `((b0&3)<<4 | b1>>4) + 1`; b0 ≤ 0xFE → vol `round((b1&15)·64/15)`; b0 = 0xFF → empty.
      - 8ch, initialSpeed = tempo list[0], initialTempo 78, c2spd 8363, `tracker` = `Composer 669`.
    - **MTM:**
      - Detection: `MTM` at 0 and byte 3 = 0x10.
      - Layout: title 20 @4; tracks u16 @24; lastPattern @26; lastOrder @27; commentLength u16 @28; samples @30; beatsPerTrack @32; channels @33; pan ×32 @34 (0..15); samples × 37 @66 (name 22, length u32, loopStart, loopEnd, finetune i8, volume, attr with bit0 = 16-bit); orders 128; tracks × 192 (64 rows × 3 bytes); track sequence (lastPattern+1) × 32 × u16 (0 = empty track); comment (40-char lines); then unsigned 8-bit sample data.
      - Cell: note b0>>2 (0 = none, else +24), ins `((b0&3)<<4)|(b1>>4)`, cmd `b1&15`, param b2.
      - Speed 6, tempo 125, `tracker` = `MultiTracker 1.0`.
    - **MIDI:** detection `MThd` at 0. Layout in decision 42.
12. **Unsupported variants:** a MOD with no recognised magic is undetected → `UnsupportedFormatError('unknown format')`. There are no other format variants to handle in this library.

### Engine

13. **Timing:**
    - One tick = `2.5 / tempo` seconds. Song ticks are counted with frame-accurate fractional accumulation.
    - Default render rates: the `AudioContext` rate in the browser; 48000 for `render`, `compare` and tests.
14. **Pitch:**
    - MOD/MTM: Amiga periods. `period = 428 · 2^((48 − note)/12) · 8363 / c2spd`, `Hz = 3546895 / period`. Porta and vibrato operate on the period.
    - S3M/STM: ST3 periods. `period = 8363 · 16 · (TABLE[note % 12] >> floor(note / 12)) / c2spd`, with `TABLE = [1712,1616,1524,1440,1356,1280,1208,1140,1076,1016,960,907]`, and `Hz = 14317056 / period`. This gives C-4 = c2spd.
    - 669: as S3M, with c2spd 8363. FreqAdjust raises the period by `param` once on tick 0.
    - Voice step = `Hz / sampleRate`.
15. **Interpolation:** `nearest` (default), `linear`, or `cubic` (4-point Hermite). There's no volume ramping in any mode.
16. **Pan:**
    - Channel pan values by format:
      - MOD: L R R L, repeated, as ∓1.
      - STM: L R R L.
      - 669: L R L R.
      - MTM: header pan (p − 7.5) / 7.5.
      - S3M: channel settings 0–7 → −0.6, 8–15 → +0.6, overridden by the 32-byte pan table at `0x60 + ordNum + 2·insNum + 2·patNum` when byte 0x35 = 0xFC and the entry has bit 5 set: (p − 7.5) / 7.5.
    - `stereo = false` → everything centred.
    - Effective pan = channel/effect pan × `stereoSeparation`, with linear L/R gains `(1 − pan)/2`, `(1 + pan)/2`.
17. **Levels:**
    - Per voice: `sample · (vol/64) · (globalVolume/64)`.
    - Mix: `Σ / sqrt(channels) · mixGain · FORMAT_GAIN[format]`, hard-clamped to ±1.
    - `FORMAT_GAIN` starts at 1 for every format. P10 (MOD/MTM), P11 (STM/669) and P12 (S3M) each set their formats' value once, to the value that makes the mean ΔdB of that format's compare rows closest to 0. The value is recorded in docs/PLAN.md. P9 sets `mod` and `mtm` to a provisional 0.8 (at 1 the 90210 render peaked at 0 dBFS); P10 replaces it.
    - **P10 result:** `mod` 0.74 (mean ΔdB +0.66 at 0.8 over 5 files), `mtm` 0.88 (mean ΔdB −0.80 at 0.8 over 7 files; MTM effects are still incomplete until P11, so recheck then).
    - **P11 result:** `stm` 0.54 (ΔdB +0.1 on KTULHU), `669` 1 (mean ΔdB +0.21 over 8 files), `mtm` 0.88 kept (mean ΔdB −0.12 over 7 files).
    - **P12 result:** `s3m` 3.3 (mean ΔdB +0.01 over 10 files). Tick length is floored to whole frames (`Math.floor(sampleRate · 2.5 / tempo)`), as openmpt does; this removed the slow timing drift seen in P11.
18. **End and loops:**
    - Playback ends at the end of the order list, or when the sequencer reaches an (order, row) it has already played in this run because of a jump, break or end-of-list wrap. In the second case `loops = true`.
    - Pattern-loop (E6/SB) repeats are not counted as loops.
    - This matches openmpt123 `--repeat 0`.
19. **Seek:** `{ order }` → reset and silently fast-forward until that order starts. `{ seconds }` → fast-forward until frame ≥ seconds × sampleRate.
20. **Mute:** `muteMask` skips mixing a channel; sequencing and effects continue.

### Realtime playback

21. **Worklet:**
    - Loaded with `import workletUrl from './worklet.ts?worker&url'` and `ctx.audioWorklet.addModule(workletUrl)`. If that fails in `pnpm preview`, stop (rule 9).
    - The main thread parses (the UI needs the song too) and posts `ParsedFile` to the worklet.
22. **Sync:** snapshots arrive every 512 frames. `AudioEngine.latest()` picks the snapshot as its contract says.
23. **Unlock:**
    - Contexts are created only inside `unlock()`, called from click or keydown handlers: Landing's DIAL, ConnectOverlay, or any play button.
    - Before P22, play buttons and the dev player trigger unlock.
24. **Crossfade (P21):** two `AudioWorkletNode` decks, each feeding its own `GainNode` into the analyser. Load goes onto the idle deck; its gain ramps 0→1 while the old deck ramps 1→0 over `fadeSec` (`linearRampToValueAtTime`). Then the old deck is unloaded.
25. **Unsupported browsers:** see **Error handling**.

### Visualizers

26. **Host:** see **Contracts → src/viz**. Canvas 2D only.
27. **Pattern view (tracker, P15):**
    - The current row stays in a fixed highlighted line at 40% of the height, with rows above and below.
    - Cell text per format: `C-4 01 40 A0F`. Note is `C-4`, `^^^` for a cut, `---` for none. Instrument is two digits. Volume is two digits or `..`. Effect is `fxRaw` as a hex digit (MOD/MTM), letter (S3M/STM) or digit (669), plus two hex digits of param.
    - Layout: try full cells, then note + instrument, then note only, at an 8px glyph width (scaled down to a 6px minimum). If all channels still don't fit, show as many as fit; clicking or tapping the canvas pages to the next group of channels. A label shows `CH 1–8/16`.
    - Channel headers light up on `triggered` and dim when not `active`.
28. **Piano roll (MIDI, P26):**
    - Lanes for the channels in `channelsUsed`.
    - X spans the 8 seconds around now (now at 25%). Y within a lane is key 24..96.
    - Note blocks are drawn from `MidiSong.events`.
29. **Scope + spectrum:** an oscilloscope of `Frame.time` in the top 60%, and 32 log-spaced bars (40 Hz–16 kHz) from `Frame.freq` below it.
30. **Channels:** a grid of `snap.scopes`, one cell per channel, each with a VU bar. VU = max(|scope|), decaying linearly to 0 over 300 ms.
31. **Demo effects:**
    - Intensity = mix RMS of `Frame.time` (0..1 scaled ×4, clamped). A pulse (1 → 0 over 250 ms) happens when any channel has `triggered`.
    - Plasma: speed and brightness follow intensity.
    - Starfield: star speed = base + intensity, with a flash on pulse.
    - Copper: 8 bars whose amplitude follows intensity and whose colour shifts on pulse.
    - With `reducedMotion`, each draws one static frame and stops animating.
32. **Persistence:** VizPicker writes `settings.player.lastViz`. NowPlaying and Jukebox start from it.

### UI & pages

33. **Themes (tokens in P2, switching in P18):**
    - Four themes from the P2 mockups: `bbs` (default), `tracker`, `demoscene`, `mix`. `THEMES` order is the cycle order.
    - `ui/theme.css` holds the shared tokens (font, spacing) on `:root` and one token set per theme on `:root[data-theme='<name>']`; bare `:root` is bbs. Tokens cover colours, panels, headings, wells (sunken areas), buttons/chips, inputs, table, `PlayerBar`, logo fill, the header rule and its animation, pattern colours and scope colours.
    - Components and CSS Modules use only tokens and never test the theme name, so a new theme is one block in `theme.css` plus a `THEMES` entry.
    - Theme-specific shapes go through tokens too: bevels via `--panel-border-color`/`--well-border-color` four-value colours, `[ ]` brackets via `--btn-before`/`--btn-after` as `content`, the heading bar via `--heading-bg`/`--heading-bleed`.
    - `App.tsx` sets `document.documentElement.dataset.theme = settings.theme`. Before React loads, bare `:root` shows bbs. // ponytail: a flash of bbs on load for other themes; an inline script in index.html if it bothers.
    - The demoscene mockup's sine scroller isn't a theme feature; the demo visualizers (P16) cover that look.
    - `prefers-reduced-motion` turns off all CSS animations (header rule, cursor blink).
    - The font is `@font-face` Web437 IBM VGA 8x16, with `monospace` as fallback.
34. **Layout:**
    - Mobile-first, with one breakpoint at 600px.
    - `PlayerBar` is fixed to the bottom: title, play/pause, time / duration, VIEW, THEME (shows the current name, cycles to the next in `THEMES`), and in jukebox mode PREV/NEXT.
    - NowPlaying and Jukebox give the visualizer all the remaining height.
35. **Browse:**
    - A table with columns ★, Title, Format, Ch, Length, Size, and a row header Play button.
    - Clicking a column header sorts by it, and clicking again reverses the direction. The default sort is title ascending.
    - A search box using `filterEntries` semantics. Format chips come from `FORMATS`. Channel chips are the distinct `channels` values present.
    - `InfoPanel`: metadata, message, sample names, Play, ★, and for MIDI an "MT-32 mode" toggle (P26).
    - **Changed after P28 (user decision):** clicking a title opens `#/play/<id>` without playing. NowPlaying puts a compact `InfoPanel` (PLAY, ★, MT-32) at the top and shows the VIZ/MESSAGE/SAMPLES tabs before playing too: the file is fetched and parsed for a PREVIEW, and `VisualizerHost` takes an optional `preview` song that it draws still and silent (first pattern, row 0). Only share links (with `?order=`/`?t=`) auto-play or show `ConnectOverlay`.
36. **Favorites:** ★ toggles `toggleFavorite`. Local entries show no star.
37. **Drag & drop:**
    - `DropZone` covers the Browse and Jukebox pages. Dropped files go through `addLocal`.
    - Local entries appear in Browse under a "LOCAL (this session)" heading and take part in the jukebox like any other entry, except with `favoritesOnly`.
38. **Jukebox (P21):**
    - The page has a START/STOP button, the settings toggles bound to `settings.jukebox`, and `VisualizerHost`.
    - Queue ids are the entries filtered by `formats` (empty = all) and `favoritesOnly`, in `sortEntries(title, asc)` order, then passed to `createQueue(ids, shuffle)`.
    - When the settings change, the queue is rebuilt with `rebuild`.
    - On `ended`, or when playback reaches `maxLengthMin` (if > 0), the next song plays:
      - fade on: the current song fades out over the last 4s and the next is loaded with `fadeSec: 4`
      - fade off: the next is loaded with `fadeSec: 0`
    - `autoViz`:
      - `perSong`: the next visualizer in registry order on each new song
      - `every2min`: the next visualizer every 120s
      - `off`: no change
39. **Hotkeys:**

    | Key       | Action                             | From |
    | --------- | ---------------------------------- | ---- |
    | Space     | toggle                             | P20  |
    | ← / →     | seek order −1 / +1 (MIDI: ∓10 s)   | P20  |
    | V         | next visualizer                    | P20  |
    | T         | next theme                         | P20  |
    | 1–9       | toggle mute on channels 1–9        | P20  |
    | Shift+1–9 | solo channels 1–9; Shift+0 clears  | P20  |
    | N         | next song (jukebox)                | P21  |
    | B / J / C | go to Browse / Jukebox / Credits   | P22  |
    | M         | open the MESSAGE tab on NowPlaying | P27  |

40. **Landing (P22):**
    - It shows an ANSI-style header and a DIAL button.
    - DIAL unlocks audio and, unless `intro.skip`, plays the modem intro while typing `ATDT 555-1993`, then `CONNECT 14400`. A SKIP button aborts it.
    - It then shows the menu: [B]rowse, [J]ukebox, [C]redits, [T]heme (cycles), plus a "skip intro next time" checkbox bound to `intro.skip`.
41. **Modem intro sound:** one pre-rendered mono buffer, about 4.7s, modelled on a real call and band-limited to 300–3400 Hz:
    - DTMF for `5551993` (80ms tones, 50ms gaps), then a 0.3s pause.
    - A 2100Hz answer tone for 0.8s with a 180° phase reversal every 450ms.
    - 0.6s of V.21 FSK at 300 baud (980/1180Hz and 1650/1850Hz at once).
    - 0.55s of 8-PSK on a 2400Hz carrier at 1200 baud, then 1.25s on an 1800Hz carrier at 2400 baud (the long hiss).
42. **Credits (P22):**
    - For each manifest entry: title, file, and the first 3 non-empty lines of `message`.
    - Then: "Font: Web437 IBM VGA 8x16 by VileR, Oldschool PC Font Pack, CC BY-SA 4.0" with a link to int10h.org.
    - From P26: the GeneralUser GS credit line required by its license.
43. **Accessibility:**
    - Every control is a `<button>`, `<input>` or `<a>` with visible text or an `aria-label`.
    - `:focus-visible` outlines use the theme accent colour.
    - The canvas `aria-label` is as the host contract describes.

### MIDI

44. **SMF parsing (`midi.ts`):**
    - Supports format 0 and 1, `MThd` + `MTrk` chunks, VLQ delta times and running status.
    - Meta: 0x51 → tempoMap; 0x01–0x03 → title and message; 0x2F ends the track; other metas are skipped.
    - SysEx (F0/F7) is skipped by its length.
    - Channel events → `MidiEvent`. Aftertouch is dropped.
45. **SF2 parsing (`sf2.ts`):**
    - Reads RIFF `sfbk`: `sdta/smpl` (16-bit LE → Float32 `/32768`), and from `pdta` the chunks phdr, pbag, pgen, inst, ibag, igen and shdr.
    - Each preset zone × instrument zone is flattened into a `Zone`: key/velocity ranges intersected, generators summed (preset level is added to instrument level as the spec says).
    - Envelope timecents → seconds = `2^(tc/1200)`. Sustain centibels → dB = `cB/10`. Generators that are absent take SF2 default values.
    - Modulators are ignored.
46. **Synth (`midi-synth.ts`):**
    - **Voices:** 64; on overflow, the oldest voice is stolen. A new note with the same `exclusiveClass` on the same channel releases the earlier one.
    - **Programs:**
      - Channel index 9 → bank 128 (drums). Other channels → bank 0, or bank CC0 if that preset exists.
      - The default program is 0.
      - When `target` = `mt32`, program changes go through `MT32_TO_GM`. Drums are not remapped.
    - **Gain:** `(vel/127)² · (cc7/127)² · (cc11/127)² · 10^(−attenuationDb/20) · env`, and the mix is `Σ · 0.25`, clamped. CC7 defaults to 100 and CC11 to 127.
    - **Changed after P28 (MIDI was ~20 dB quieter than trackers):** `initialAttenuation` is scaled by 0.4 (the E-mu/FluidSynth convention the bank is voiced for), the mix is `Σ · 2`, and a peak limiter (instant attack, 0.3 s release, −1 dBFS) replaces the plain clamp. Measured over 2 min of each file: MIDI RMS −11 to −24 dB (median −20) vs trackers −11 to −20 dB (most −18); every MIDI peak ≤ −1 dBFS, no clipping.
    - **Pan:** `clamp(zone.pan + (cc10 − 64)/64)`, then `stereoSeparation`.
    - **Pitch:** rate = `2^((key − rootKey)·100 + tuneCents + bendCents)/1200) · zone.sampleRate / sampleRate`, where `bendCents = bend/8192 · range · 100`. The range defaults to 2 semitones and is set by RPN 0,0 (CC101 = 0, CC100 = 0, then CC6).
    - **Controllers:** CC64 ≥ 64 holds note-offs until it's released. CC121 resets CC7, CC11, CC64, the bend and the RPN. CC123 releases all notes on that channel.
    - **Envelope:** delay → attack (linear) → hold → decay (exponential to `sustainDb`) → sustain → release (exponential to −100 dB) → the voice frees.
    - **Loops:** loopMode 1 loops forever; 3 loops until release; 0 plays once.
47. **MT-32 remap:**
    - `MT32_TO_GM` is written by hand from the MT-32 owner's manual preset list, to the closest GM program (0-based). No third-party table is copied.
    - Guitar presets map into GM 24–31 and bass presets into GM 32–39.
    - `scripts/midi-overrides.json` (P23) marks 99WAYS and BLAKLDGE as `mt32`.
48. **Bank:** GeneralUser GS v2, subject to the P24 license gate. It's stored at `public/soundfonts/GeneralUser-GS.sf2`. It's fetched and parsed on the main thread once per session and posted once to each deck as a `bank` message.

### Deploy & content

49. **Deploy (P28):** `pnpm build` produces `dist/`. The user chooses GitHub Pages or Netlify, and only that host's config file is added: a `.github/workflows/pages.yml` that runs `pnpm install --frozen-lockfile`, `pnpm fetch-soundfont` and `pnpm build`, or a `netlify.toml` with the same build command.
50. **Music rights:** several files are 90s fan covers of commercial songs. In P28 the user decides whether to publish all of them; any excluded ids are added to `scripts/manifest.ts` as an exclusion list.
    - **Added after P28: library manager.** `pnpm manage` serves a local-only page (`scripts/manage.ts` + `scripts/manage.html`, Node `http` on 127.0.0.1:5198, never bundled) listing every file in `trackers/` with a publish checkbox, a title override and, for MIDI, GM/MT-32. Save writes `scripts/curation.json` (`{ exclude: id[], titles: Record<id, string> }`) and `scripts/midi-overrides.json`, then reruns `pnpm manifest`. `scripts/curation.ts` holds the shared file walk and validation. `pnpm manifest` skips excluded ids (`EXCLUDE <id>` lines; the summary adds `, K excluded` when K > 0) and applies title overrides. Each row has a ▶ preview: `GET /api/preview?id=<id>&midi=gm|mt32` renders the first 60 s at 44.1 kHz with our engine (MIDI with the fetched SoundFont) and serves it as WAV; ids are matched against the `trackers/` listing, never used as paths. `scripts/wav.ts` gains `encodeWav` (the bytes `writeWav` writes).

## Phases

**Every phase:**

- Follows **Rules for the implementer**.
- Passes the gate: `pnpm check` and `pnpm build`.
- Satisfies its acceptance checks, then stops with the report.
- Prerequisites the user must complete: `git init` before committing P1; `brew install libopenmpt` before P7.

### Foundation

**P0 · Skeleton (done, user-requested)**

Phase 0 was done as a user-requested exception, and it covers all of P1.

**What it delivered:**

- Every P1 config file, with dependencies installed at the pinned versions.
- The full `src/` and `scripts/` file tree from **Project layout**.
- Every **Contracts** type, constant and error class, written in full.
- Stubs for every contract function and method, each throwing `Error('Not implemented (P<n>)')`, where n is the phase that implements it.
- Components that render `null`, and internal engine/viz modules that are just `export {}` with a purpose comment.

**What later phases do with it:**

- Each phase **replaces** the stubs its Scope names. It doesn't create those files again.
- The rule "no TODO stubs" applies only to _new_ code.
- A `Not implemented` stub must never be reachable from a feature that a finished phase has accepted.

**Deviations from the plan's tooling details:**

- **pnpm 11 build approval** is recorded in `pnpm-workspace.yaml` (`allowBuilds: { esbuild: true }`), not in `package.json`.
- **The ESLint hooks config** is `hooks.configs.flat.recommended`.
- **The ESLint config adds `argsIgnorePattern: '^_'`,** so stub parameters can keep their contract names with a `_` prefix.
- **`vite.config.ts` imports `defineConfig` from `vitest/config`.**
- **`tsconfig.app.json` adds `types: ["vite/client"]` and `skipLibCheck`.**
- **The ESLint deny patterns also match `<layer>.ts`.**
- **`.gitignore` adds `*.tsbuildinfo`.**
- **Prettier also formats `docs/PLAN.md` and `CLAUDE.md`.**

**P1 · Scaffold** — completed by P0.

- **Scope:**
  - (Done before P1: this plan is at `docs/PLAN.md` and `CLAUDE.md` exists.)
  - Config: `package.json` (pinned versions, P1 scripts, `packageManager`, `engines`), `.nvmrc`, `.gitignore`, `.prettierrc`, `.prettierignore`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `eslint.config.js`.
  - App: `index.html` and `src/main.tsx`, plus `src/App.tsx` rendering `TRACKER JUKEBOX`.
- **Acceptance:**
  1. `pnpm dev` shows the text.
  2. Temporarily adding `import 'react'` to a new `src/formats/x.ts` makes `pnpm lint` fail with `no-restricted-imports`. Delete the file afterwards.
- `chore(scaffold): vite react-ts project with pinned tooling and import rules`

**P2 · Look mockups**

- **Scope:**
  - Download the Web437 IBM VGA 8x16 woff from VileR's Oldschool PC Font Pack v2.2 (int10h.org) to `public/fonts/`.
  - Create `mockups/bbs.html`, `tracker.html`, `demoscene.html` and `mix.html`.
- **Mockup requirements:**
  - Each file is self-contained HTML with inline CSS and JS, and uses the font via `../public/fonts/`.
  - Each has three sections: landing, browser list (8 real rows from Findings), and now-playing (a static pattern view of 4 channels × 16 rows plus a scope drawn on a canvas).
  - No audio.
- **Acceptance:**
  1. All four open from disk with networking disabled, and none scrolls horizontally at 375px or 1280px.
  2. The user picks one, and Claude records "Chosen look: <name>" in docs/PLAN.md.
- **Chosen look: all four, as switchable themes** (user decision, 2026-11-07). Added to P2 at the user's request: `src/ui/theme.css` (decision 33) imported by `main.tsx`, `THEMES`/`Settings.theme` in `state/settings.ts`, and `Palette`/`Frame.palette` in `viz/types.ts`.
- `docs(mockups): four visual style mockups`

### Parsing

**P3 · Byte reading + detection**

- **Scope:** `formats/song.ts` (all types and constants), `formats/bytes.ts`, `formats/index.ts` (exports + `detectFormat`), `formats/formats.test.ts`, and remove `passWithNoTests` from `vite.config.ts`.
- **Acceptance:** the tests show:
  1. `detectFormat` on all 38 files equals the expected map (CANTINA → `mod`, KTULHU → `stm`, `*.MID` → `midi`, the rest by folder), and returns `null` for a 100-byte zero buffer.
  2. `new ByteReader(new Uint8Array(2)).u32le()` throws `ParseError` with offset 0.
  3. `decodeCp437` maps 0x0E → ♫ and 0xB0 → ░, and leaves ASCII unchanged.
- `feat(formats): byte reader, cp437 decoding and magic-byte detection`

**P4 · MOD + STM parsers**

- **Scope:** `formats/mod.ts`, `formats/stm.ts`, `parseFile` in `index.ts` (MIDI and the not-yet-written formats → `UnsupportedFormatError`), tests.
- **Acceptance:** the tests show:
  1. The Expected values for 12WARIOR, 90210, 1CARESS, CANTINA and KTULHU.
  2. Each file truncated to 600 bytes throws `ParseError`. The tests call `parseMod`/`parseStm` directly: through `parseFile`, a 600-byte MOD is `UnsupportedFormatError('unknown format')` because `detectFormat` needs 1084 bytes to see the MOD signature.
- `feat(formats): MOD and STM parsers`

**P5 · S3M parser**

- **Scope:** `formats/s3m.ts`, `index.ts` wiring, tests.
- **Acceptance:** the tests show:
  1. The Expected values for PANIC, NIN-1 and NOTFKIDS.
  2. No order equals 254 or 255 in any S3M.
  3. For every S3M, the first sample with length > 0 has |mean| < 0.2 (NOTFKIDS has a real DC offset of -0.14 and ICEFRONT 0.10; a signedness error would give a mean near ±1).
- `feat(formats): S3M parser`

**P6 · MTM + 669 parsers**

- **Scope:** `formats/mtm.ts`, `formats/669.ts`, `index.ts` wiring, tests.
- **Acceptance:** the tests show:
  1. The Expected values for MASTER and SIRIUS.
  2. All 31 tracker files parse without throwing.
- `feat(formats): MTM and 669 parsers`

### Engine

**P7 · Sequencer + song length**

- **Scope:** `engine/sequencer.ts` (orders, rows, ticks, SetSpeed/SetTempo, PosJump, PatBreak, PatLoop, PatDelay, 669 `Pattern.speed`, loop detection), `computeLength` (trackers), `engine/index.ts`, `engine/engine.test.ts`.
- **Acceptance:**
  1. Tests built with `songOf` cover jump, break, pattern loop ×2, pattern delay, and that a song ending in a jump to order 0 has `loops = true`.
  2. For 12WARIOR.MOD, PANIC.S3M, MASTER.MTM, SIRIUS.669 and KTULHU.STM, `computeLength` is within ±1s of the Duration that `openmpt123 --info` prints (a table in the report).
- `feat(engine): sequencer and song length`

**P8 · Manifest**

- **Scope:** `src/net.ts`, `library/manifest.ts`, `library/library.test.ts` (tests for `describe` and the manifest validation logic), `scripts/manifest.ts`, P8 `package.json` scripts.
- **Acceptance:**
  1. `pnpm manifest` prints 31 OK and 7 SKIP, then `31 ok, 7 skipped`, and exits 0.
  2. `public/manifest.json` has `version: 1` and 31 entries.
  3. After creating `public/music/stale.txt`, a rerun removes it.
- `feat(library): build-time manifest of bundled music`

**P9 · Mixer + MOD playback (offline)**

- **Scope:** `engine/pitch.ts` (MOD/MTM), `engine/mixer.ts`, `engine/effects.ts` (every MOD/MTM row of decision 9), `createTrackerPlayer`, `scripts/wav.ts`, `scripts/render.ts`, the `render` script, tests.
- **Acceptance:**
  1. The tests show:
     - C-4 with c2spd 8363 gives period 428 and ≈ 8287 Hz (±1).
     - `nearest` at step 1.0 reproduces the sample data exactly.
     - A looped voice wraps to `loopStart`.
     - A muted channel contributes 0.
     - Vibrato and porta change the period on ticks > 0 only.
  2. `pnpm render trackers/mod/90210.MOD` writes `90210.wav` and prints a peak below 0 dBFS. The user listens and confirms the pitch and tempo.
- `feat(engine): mixer and ProTracker effects with offline render`

**P10 · Reference comparison**

- **Scope:** `scripts/compare.ts`, the `compare` script, `FORMAT_GAIN.mod` and `.mtm` (decision 17, recorded in docs/PLAN.md).
- **Thresholds:** Δduration ≤ 1s, |ΔdB| (whole-file RMS) ≤ 3, Pearson correlation of 100ms RMS envelopes ≥ 0.9.
- **Acceptance:** `pnpm compare mod` → 5/5 PASS, CANTINA included.
- `test(engine): openmpt123 reference comparison`

**P11 · MTM, STM and 669 playback**

- **Scope:** `effects.ts` and `pitch.ts` branches for MTM/STM/669 (the ST3 period path for STM/669), FreqAdjust, and `FORMAT_GAIN` for stm and 669.
- **Acceptance:** `pnpm compare mtm`, `pnpm compare stm` and `pnpm compare 669` all PASS, or each failing file is reported (rule 7) and approved by the user.
- `feat(engine): MTM, STM and 669 playback`

**P12 · S3M playback**

- **Scope:** `effects.ts` S3M branch (shared effect memory, D/E/F fine and extra-fine decoding, the S-commands from decision 9, the volume column, X/S8 pan, StereoControl, GlobalVolume, Tremor, Retrig), `stereo`/`mixGain`, `FORMAT_GAIN.s3m`.
- **Acceptance:**
  1. `pnpm compare s3m` all PASS, or each failure is reported and approved.
  2. Full `pnpm compare`: ≥ 28 of 31 PASS.
- `feat(engine): Scream Tracker 3 playback`

### Realtime and visuals

**P13 · Realtime playback (dev player)**

- **Scope:**
  - `audio/protocol.ts` and `audio/worklet.ts`.
  - `audio/AudioEngine.ts` with one deck: `isSupported`, `status`, `current`, `context`, `analyser`, `unlock`, `load` (url or parsed, `seek`, `autoplay`), `play`, `pause`, `seek`, `setOptions`, `latest`, `on`, `dispose`, debug stats.
  - `App.tsx` replaced by a dev player: `loadManifest` list, play/pause, order −/+, an interpolation select, a stereo slider and mute checkboxes, held in component state.
- **Acceptance:**
  1. In `pnpm dev` and in `pnpm build && pnpm preview`, one file of each tracker format plays, pauses and seeks by order, in Chrome, Firefox and Safari.
  2. Switching nearest ↔ cubic on 90210 is audible.
  3. `?debug=1` prints a stats table every second.
- `feat(audio): AudioWorklet playback engine`

**P14 · Visualizer host + scope + channels**

- **Scope:** `viz/types.ts`, `viz/index.ts`, `viz/VisualizerHost.tsx` (including `Frame.palette`), `viz/scope.ts`, `viz/channels.ts`, and a visualizer select in the dev player (`App.tsx`).
- **Acceptance:**
  1. Switching visualizers while playing causes no audible glitch.
  2. Muting channel 1 flattens its channel scope.
  3. Pausing freezes the scopes.
  4. Resizing the window keeps the canvas sharp.
- `feat(viz): visualizer host, scope/spectrum and channel scopes`

**P15 · Pattern view**

- **Scope:** `viz/pattern.ts` (tracker mode, decision 27), registry entry.
- **Acceptance:**
  1. When paused, the highlighted row's number equals `latest().snap.pos.row`.
  2. PANIC at 1280px shows 16 channels in a compact mode.
  3. At 375px a click pages through the channels, and the `CH x–y/16` label updates.
  4. 90210 shows hex effects, and PANIC shows letters.
- `feat(viz): tracker pattern view`

**P16 · Demo effects**

- **Scope:** `viz/demo.ts` (plasma, starfield, copper), registry entries.
- **Acceptance:**
  1. Each visibly pulses on drum hits in 90210.
  2. With reduced motion emulated in devtools, each shows a still frame.
  3. The devtools performance panel shows ≥ 55 fps on this Mac while playing PANIC.
- `feat(viz): plasma, starfield and copper demo effects`

### App

**P17 · App state**

- **Scope:** `state/settings.ts`, `state/route.ts`, `state/SettingsContext.tsx`, `state/PlayerContext.tsx` (P17 members), `state/state.test.ts`. `App.tsx`'s dev player switches to `usePlayer` and `useSettings`.
- **Acceptance:**
  1. Tests: `parseRoute(formatRoute(r))` round-trips for every Route kind, and bad hashes become landing. `loadSettings` returns DEFAULTS for `null` storage, invalid JSON and wrong-typed leaves (including an unknown `theme`), and keeps valid leaves.
  2. The dev player's interpolation choice survives a reload.
- `feat(state): settings, routing and player context`

**P18 · Themed shell + Browse v1**

- **Scope:** theme switching (decision 33: `data-theme` in `App.tsx`, THEME in `PlayerBar`; `ui/theme.css` exists from P2 and gets only token fixes); `ErrorBoundary`; `Toast`; `PlayerBar`; `pages/Browse` v1 (a table with title, format, length and play; manifest error with RETRY); `App.tsx` route switch (decision 4), replacing the dev player. The dev player's mute and visualizer controls go away and come back in P20.
- **Acceptance:**
  1. The app uses the font, and THEME cycles bbs → tracker → demoscene → mix → bbs, each matching its mockup's colours.
  2. The chosen theme survives a reload, and a pattern or scope visualizer redraws in the new theme's colours without a reload.
  3. Playback continues while navigating between `#/browse` and `#/jukebox` (which renders Browse until P21).
  4. Reloading with the dev server stopped and restarted after the HTML loads shows the manifest error, and RETRY recovers.
  5. In a Safari private window the app works.
  6. A forced render error (temporarily throwing in Browse, then removed) shows SYSTEM HALTED.
- `feat(ui): themed app shell and music list`

**P19 · Browse features + drag & drop**

- **Scope:** `library/search.ts` + tests; `pages/Browse` (search, format and channel chips, sortable headers, ★, LOCAL group); `InfoPanel`; `DropZone`; PlayerContext P19 members.
- **Acceptance:**
  1. Tests cover the `filterEntries` and `sortEntries` semantics.
  2. Searching `bbs` lists exactly 1CARESS, 90210 and FINERUN.
  3. The Length header sorts in both directions.
  4. A ★ survives a reload.
  5. A copy of PANIC.S3M renamed `panic.txt` and dropped plays. A dropped JPEG shows "Not a supported music file".
- `feat(ui): browse search, filters, favorites and drag & drop`

**P20 · NowPlaying, share links, hotkeys, mute/solo**

- **Scope:** `pages/NowPlaying` (VIZ tab only), `VizPicker`, `ChannelStrip` (M/S per channel), `ConnectOverlay`, a share button (clipboard + fallback), the P20 hotkeys in `App.tsx`, and `solo` in PlayerContext.
- **Acceptance:**
  1. A fresh tab at `#/play/s3m%2Fpanic.s3m?order=3` shows the overlay; one click plays PANIC from order 3.
  2. `#/play/nope` → toast and Browse.
  3. Each P20 hotkey works and none fires while typing in a text input.
  4. Shift+2 solos channel 2 audibly.
- `feat(ui): now playing view, share links, hotkeys and mute/solo`

**P21 · Jukebox**

- **Scope:** `library/shuffle.ts` + tests; second deck, crossfade and `fadeOut` in `AudioEngine`; `pages/Jukebox` (decision 38); PlayerContext P21 members; the `N` hotkey; PREV/NEXT in `PlayerBar`.
- **Acceptance:**
  1. Tests: with a seeded `rng`, one pass over 10 ids has no repeats; the next pass doesn't start with the last id; `rebuild` keeps the current id.
  2. The `mtm` filter plays only MTM files.
  3. A crossfade is audible.
  4. With `maxLengthMin = 1`, the song fades at 1:00.
  5. Every toggle survives a reload.
  6. A song whose `url` 404s (a temporarily renamed music file) is skipped.
- `feat(jukebox): shuffle queue, crossfade and jukebox settings`

**P22 · Landing + modem intro + credits**

- **Scope:** `audio/modem.ts`, `pages/Landing`, `pages/Credits`, `App.tsx` routes and the B/J/C hotkeys. Delete `mockups/`.
- **Acceptance:**
  1. DIAL plays the intro with the typed text; SKIP stops it.
  2. With "skip intro" checked, the next DIAL goes straight to the menu.
  3. On iOS Safari, DIAL produces sound.
  4. Credits lists the entries and the font attribution.
- `feat(ui): BBS landing page with modem intro and credits`

### MIDI

**P23 · MIDI file parser**

- **Scope:** `formats/midi.ts`, `parseFile` MIDI branch, `engine/midi-synth.ts` (the tick → seconds helper only) and computeLength's MIDI branch, `scripts/midi-overrides.json`, the overrides handling in `scripts/manifest.ts`, tests. `AudioEngine.load` rejects MIDI with `PlaybackError('MIDI playback not available yet')`.
- **Acceptance:**
  1. Tests: the 99WAYS and JAZZVIBE Expected values, and 99WAYS parsed with the override gives `target: 'mt32'`.
  2. `pnpm manifest` → `38 ok, 0 skipped`.
  3. Pressing play on a MIDI row in Browse shows the "not available yet" toast.
- `feat(formats): standard MIDI file parser`

**P24 · SoundFont license gate + parser**

- **Scope:**
  1. Find the official GeneralUser GS v2 release (the author's site or GitHub), read its LICENSE and report the URL and license text excerpt. **Stop for the user's decision.**
  2. If approved: `scripts/fetch-soundfont.ts` with the pinned URL and SHA-256 (from the downloaded file), the `fetch-soundfont` script, `formats/sf2.ts`, tests.
- **Acceptance:**
  1. `pnpm fetch-soundfont` downloads and verifies; a second run prints that it skipped.
  2. The sf2 tests run (not skipped) and show ≥ 128 presets in bank 0, a preset at bank 128 program 0, and every zone having keyLo ≤ keyHi and data length > 0.
- `feat(formats): SoundFont 2 parser and bank fetch`

**P25 · MIDI synth (offline)**

- **Scope:** `engine/midi-synth.ts` (decision 46), `createMidiPlayer`, `formats/mt32-to-gm.ts`, MIDI support in `scripts/render.ts`, tests.
- **Acceptance:**
  1. Tests: envelope stage timing, the 65th note steals the oldest voice, exclusive class releases, `MT32_TO_GM[61]` ∈ 24..31, `MT32_TO_GM[64]` ∈ 32..39.
  2. `pnpm render trackers/midi/JAZZVIBE.MID` and `trackers/midi/99WAYS.MID` both print a peak below 0 dBFS.
  3. The user hears vibes, piano and bass in JAZZVIBE, and guitars, not brass, in 99WAYS.
- `feat(engine): SoundFont MIDI synth with MT-32 remap`

**P26 · MIDI in the app**

- **Scope:** `AudioEngine` bank fetch with `bankProgress`, plus `bank` messages and the worklet's MIDI player; the piano roll in `viz/pattern.ts`; the MT-32 toggle in `InfoPanel` (passes `midiTarget`); a progress bar in `PlayerBar`; the GeneralUser GS credit line.
- **Acceptance:**
  1. The first MIDI play shows progress, then plays.
  2. The piano roll shows lanes for channels 1, 3, 5 and 7 on 99WAYS.
  3. The MT-32 toggle on BLAKLDGE audibly changes the instruments.
  4. A tracker plays normally while the bank is downloading.
- `feat(midi): MIDI playback in the app`

### Finish

**P27 · Extras**

- **Scope:** `MessageScroller` and `SampleBrowser` (waveform plus audition via an `AudioBufferSourceNode` at `c2spd`) as NowPlaying tabs; Media Session; the `M` hotkey.
- **Acceptance:**
  1. 1CARESS's MESSAGE tab scrolls "Empire BBS … 679-0488".
  2. Clicking a PANIC sample plays it.
  3. The macOS media keys pause and play, and skip while in the jukebox.
- `feat(extras): message scroller, sample browser and media keys`

**P28 · Deploy + mobile pass**

- **Scope:** the user's decisions on host and music rights (decisions 49–50), that host's single config file, any exclusion list, and CSS Module fixes for mobile.
- **Acceptance:**
  1. The deployed URL plays a tracker and a MIDI file in iOS Safari and desktop Chrome.
  2. No page scrolls horizontally at 375px.
- `chore(deploy): static hosting config`

**Later (unscheduled; requires a new plan):** MT-32 ROM drop-in (Munt→WASM vs our own synth), and an OPL3 "sound card" mode.

## Verification (whole project, after P28)

- `pnpm check` and `pnpm build` pass.
- `pnpm compare` ≥ 28/31 PASS.
- `pnpm manifest` → `38 ok`.
- Manual pass on the deployed site:
  - each format plays
  - the pattern view is in sync
  - visualizers swap
  - jukebox toggles persist
  - drag & drop works
  - hotkeys work
  - a share link opens at its order
  - a 375px layout
  - audio unlocks on iOS
