# VelkTrade online/player sidebar position fix

Direct CSS fix.

## File included

```txt
frontend/src/styles-unified-mosaic-overrides.css
```

## Fix

The online/player sidebar was being pulled to the top-left by the wide-layout rules. This patch forces:

- the ≡ player menu trigger to the top-right
- the expanded player/online panel to open below it, aligned right
- the menu to stay fixed to the browser viewport instead of the page shell

## Apply

Extract into repo root and overwrite:

```txt
frontend/src/styles-unified-mosaic-overrides.css
```

Then:

```bash
cd frontend
npm run build
npm run deploy
```

Commit:

```bash
cd ..
git add frontend/src/styles-unified-mosaic-overrides.css
git commit -m "Fix online player sidebar position"
git push
```
