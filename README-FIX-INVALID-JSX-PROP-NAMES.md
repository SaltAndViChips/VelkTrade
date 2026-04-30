# VelkTrade fix invalid JSX prop names

## Fix

Fixes this build error:

```txt
Expected `...` but found `}`
src/App.jsx
{}={{}}
```

A previous broad replacement accidentally changed the JSX prop name:

```jsx
tradeStatuses={{}}
```

into:

```jsx
{}={{}}
```

This patch restores invalid prop names:

```jsx
{}={{}}      -> tradeStatuses={{}}
[] = {[]}    -> notifications={[]}
0={0}        -> unseenCount={0}
```

## Changed file

- `frontend/src/App.jsx`

## Apply

```bash
git add frontend/src/App.jsx
git commit -m "Fix invalid JSX prop names"
git push
```

Then test:

```bash
cd frontend
npm run build
```
