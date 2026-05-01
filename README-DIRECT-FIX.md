# Direct file replacement patch

This zip contains the corrected file directly:

```txt
frontend/src/components/UnifiedItemExperience.jsx
```

## Apply

Extract this zip into your repo root so it overwrites:

```txt
frontend/src/components/UnifiedItemExperience.jsx
```

Then run:

```bash
cd frontend
npm run build
```

If it passes:

```bash
npm run deploy
```

Then commit:

```bash
git add frontend/src/components/UnifiedItemExperience.jsx
git commit -m "Fix object render crash in unified item popout"
git push
```
