# Factory internals

Pipeline: discovery -> selection (G1) -> transcript -> analysis -> script + fact-check -> voice (G2) -> scene plan + sound (G3) -> approved render job (G4) -> assemble + QA (G5) -> thumbnail + package.

| Path | Purpose |
|---|---|
| `skills/` | 16 stage skills (`SKILL.md`): the instructions an agent (Muse, Claude) follows. Installed into Muse by `bin/install-muse.sh`. |
| `schemas/` | JSON Schemas for every stage artifact. |
| `config/` | channels, pipeline thresholds, voice, brand, visual modes, design tokens. Unconfirmed values are `null`/`UNVERIFIED`, never invented. |
| `lib/`, `bin/ffx.mjs` | Zero-dependency Node tools. Run `node factory/bin/ffx.mjs` for the command list. |
| `tests/` | `node --test factory/tests/*.test.mjs` |
| `docs/` | Architecture, status, Muse setup, history of the old pipeline. |
| `../src/` | The Remotion project (toolchain check today; motion components are pending). |
| `../.github/workflows/` | `factory-ci.yml` (tests) and `render-factory.yml` (approved, chunked render). |

Per-run data (transcripts, drafts, audio) lives in the private Muse workspace under `runs/<year>-W<week>/`, never in git.
