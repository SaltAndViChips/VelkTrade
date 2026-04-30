const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set. Postgres connection will fail until it is configured.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined
});

function convertPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function columnExists(tableName, columnName) {
  const result = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_name = $1
       AND lower(column_name) = lower($2)
     LIMIT 1`,
    [tableName, columnName]
  );

  return result.rowCount > 0;
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);

  if (!(await columnExists('users', 'is_admin'))) {
    await pool.query(`ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE`);
  }

  if (!(await columnExists('users', 'bio'))) {
    await pool.query(`ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''`);
  }

  if (await columnExists('users', 'isadmin')) {
    await pool.query(`
      UPDATE users
      SET is_admin = TRUE
      WHERE isadmin = TRUE
    `);
  }

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW()
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS show_bazaar_inventory BOOLEAN DEFAULT TRUE
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      image TEXT NOT NULL
    )
  `);

  if (!(await columnExists('items', 'price'))) {
    await pool.query(`ALTER TABLE items ADD COLUMN price TEXT DEFAULT ''`);
  }

  await pool.query(`
    ALTER TABLE items
    ADD COLUMN IF NOT EXISTS show_bazaar BOOLEAN DEFAULT TRUE
  `);

  await pool.query(`
    ALTER TABLE items
    ADD COLUMN IF NOT EXISTS createdAt TIMESTAMPTZ DEFAULT NOW()
  `);

  await pool.query(`
    ALTER TABLE items
    ADD COLUMN IF NOT EXISTS price TEXT DEFAULT ''
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trades (
      id SERIAL PRIMARY KEY,
      roomId TEXT NOT NULL,
      fromUser INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      toUser INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fromItems TEXT NOT NULL,
      toItems TEXT NOT NULL,
      chatHistory TEXT DEFAULT '[]',
      status TEXT NOT NULL,
      createdAt TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS buy_requests (
      id SERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(item_id, requester_id)
    )
  `);


  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      payload TEXT DEFAULT '{}',
      seen BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      offline_trades BOOLEAN DEFAULT TRUE,
      counters BOOLEAN DEFAULT TRUE,
      room_invites BOOLEAN DEFAULT TRUE,
      invite_responses BOOLEAN DEFAULT TRUE,
      sound_volume NUMERIC DEFAULT 0.5,
      flash_tab BOOLEAN DEFAULT TRUE,
      non_verified_notifications BOOLEAN DEFAULT FALSE
    )
  `);

  await pool.query(`
    ALTER TABLE notification_preferences
    ADD COLUMN IF NOT EXISTS non_verified_notifications BOOLEAN DEFAULT FALSE
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique
    ON users (LOWER(username))
  `);

  await pool.query(`
    UPDATE users
    SET is_admin = TRUE
    WHERE LOWER(username) = 'salt'
  `);
}

const ready = initDb()
  .then(() => console.log('Postgres schema ready'))
  .catch(error => {
    console.error('Postgres schema initialization failed:', error);
    throw error;
  });

async function query(sql, params = [], client = pool) {
  await ready;
  return client.query(convertPlaceholders(sql), params);
}

async function get(sql, params = []) {
  const result = await query(sql, params);
  return result.rows[0];
}

async function all(sql, params = []) {
  const result = await query(sql, params);
  return result.rows;
}

async function run(sql, params = []) {
  const result = await query(sql, params);
  return {
    lastID: result.rows?.[0]?.id,
    rowCount: result.rowCount,
    rows: result.rows
  };
}

async function transaction(callback) {
  await ready;

  const client = await pool.connect();

  const tx = {
    get: async (sql, params = []) => {
      const result = await client.query(convertPlaceholders(sql), params);
      return result.rows[0];
    },
    all: async (sql, params = []) => {
      const result = await client.query(convertPlaceholders(sql), params);
      return result.rows;
    },
    run: async (sql, params = []) => {
      const result = await client.query(convertPlaceholders(sql), params);
      return {
        lastID: result.rows?.[0]?.id,
        rowCount: result.rowCount,
        rows: result.rows
      };
    }
  };

  try {
    await client.query('BEGIN');
    const value = await callback(tx);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getDatabaseDiagnostics() {
  try {
    await ready;
    await pool.query('SELECT 1');
    return {
      type: 'postgres',
      connected: true
    };
  } catch (error) {
    return {
      type: 'postgres',
      connected: false,
      error: error.message
    };
  }
}

module.exports = {
  get,
  all,
  run,
  transaction,
  getDatabaseDiagnostics
};
