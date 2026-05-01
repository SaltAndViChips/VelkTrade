# Direct full-file replacement patch

No scripts. No manual appending. No `main.jsx` edit required.

## Files included

```txt
frontend/src/components/UnifiedItemExperience.jsx
frontend/src/styles-unified-mosaic-overrides.css
```

`UnifiedItemExperience.jsx` imports the CSS itself:

```js
import "../styles-unified-mosaic-overrides.css";
```

## Apply

Extract this zip into your repo root and allow it to overwrite files.

Then run:

```bash
cd frontend
npm run build
```

If it passes:

```bash
npm run deploy
```

Commit:

```bash
cd ..
git add frontend/src/components/UnifiedItemExperience.jsx frontend/src/styles-unified-mosaic-overrides.css
git commit -m "Unify item mosaic across all item screens"
git push
```

## Important

This assumes `UnifiedItemExperience` is already mounted in `App.jsx` from the previous patch. If it is not mounted, add it once in `App.jsx` later; this zip itself does not modify `App.jsx`.
