# Finance Video Factory

A weekly, human-approved system that finds the best new video across 7 finance channels, writes an original script, narrates it (Gemini TTS, voice "Koda"), plans and renders real Remotion motion graphics on GitHub, checks the actual output, and prepares the thumbnail and metadata. **It never publishes, merges or starts a production render without an explicit yes.**

Start with [factory/README.md](factory/README.md) (layout and commands), then [factory/docs/STATUS.md](factory/docs/STATUS.md) (what is built, tested and still pending, stated honestly).

```
npm test                 # unit + media tests (needs ffmpeg)
npm run doctor           # capability audit; add --online --live in Muse
npm run check:bundle     # Remotion bundle check (needs npm ci)
```
