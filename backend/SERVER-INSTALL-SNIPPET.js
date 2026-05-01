// Copy this into backend/server.js after app, authMiddleware, and your DB helper/pool are defined.

const installVelkTradeCompatRoutes = require("./velktrade-compat-routes");

// Use this version if your backend uses a pg Pool named `pool`.
installVelkTradeCompatRoutes({
  app,
  authMiddleware,
  pool
});

// If your backend does NOT use `pool`, use only the helpers that actually exist.
// Example:
//
// installVelkTradeCompatRoutes({
//   app,
//   authMiddleware,
//   query,
//   run,
//   get
// });
