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

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      image TEXT NOT NULL
    )
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
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique
    ON users (LOWER(username))
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
