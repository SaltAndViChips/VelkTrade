const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Use DATABASE_FILE on Render so SQLite survives rebuilds/redeploys.
// Recommended Render env var: DATABASE_FILE=/var/data/db.sqlite
const databaseFile = process.env.DATABASE_FILE || path.join(__dirname, 'db.sqlite');
const databaseDir = path.dirname(databaseFile);

if (!fs.existsSync(databaseDir)) {
  fs.mkdirSync(databaseDir, { recursive: true });
}

const db = new sqlite3.Database(databaseFile);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    title TEXT NOT NULL,
    image TEXT NOT NULL,
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roomId TEXT NOT NULL,
    fromUser INTEGER NOT NULL,
    toUser INTEGER NOT NULL,
    fromItems TEXT NOT NULL,
    toItems TEXT NOT NULL,
    chatHistory TEXT DEFAULT '[]',
    status TEXT NOT NULL,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.all(`PRAGMA table_info(trades)`, [], (err, columns) => {
    if (err || !Array.isArray(columns)) return;
    const names = columns.map(column => column.name);
    if (!names.includes('chatHistory')) {
      db.run(`ALTER TABLE trades ADD COLUMN chatHistory TEXT DEFAULT '[]'`);
    }
  });
});

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

module.exports = { db, get, all, run };
