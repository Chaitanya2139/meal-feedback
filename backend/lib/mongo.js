// lib/mongo.js
const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
const dbName = process.env.DB_NAME || 'meal_feedback';
const client = new MongoClient(uri);

let _db;
async function connect() {
  if (_db) return { client, db: _db };
  await client.connect();
  _db = client.db(dbName);
  return { client, db: _db };
}

module.exports = { connect };
