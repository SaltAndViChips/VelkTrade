const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./db.sqlite');

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
    status TEXT NOT NULL,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
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
