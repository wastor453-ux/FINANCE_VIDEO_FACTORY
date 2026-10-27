# Architecture

Three layers (pattern learned from OpenMontage and the official Remotion/Anthropic skills; no code copied, OpenMontage is AGPL):

1. **Tools** (`lib/`, `bin/ffx.mjs`): deterministic, dependency-free, unit-tested. They do maths, validation, API calls; they make no creative decisions.
2. **Stage skills** (`skills/`): agent instructions per stage, each producing one schema-validated artifact and naming its checks.
3. **Renderer** (`src/` Remotion project, design tokens in `config/design_tokens.json`, chunked GitHub workflow `render-factory.yml`): turns the approved scene plan into frames.

Data flow: discovery -> selection (G1) -> transcript -> analysis -> script + fact-check -> voice (G2) -> scene plan + sound (G3) -> render job (G4, explicit authorization) -> assembly + QA (G5) -> thumbnail + package. Every arrow is a JSON artifact validated by `ffx validate`.

Principles: no stage may fabricate input; unverified things are labeled UNVERIFIED; configuration holds everything reversible (weights, thresholds, brand, voice); secrets live only in the vault/environment; per-run data lives in the private workspace.
