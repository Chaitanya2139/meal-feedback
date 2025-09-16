// test-connection.js
require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME;

console.log('Testing MongoDB connection...');
console.log('MONGO_URI:', MONGO_URI);
console.log('DB_NAME:', DB_NAME);

async function test() {
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    console.log('✅ Connected to MongoDB successfully');
    
    const db = client.db(DB_NAME);
    const collections = await db.listCollections().toArray();
    console.log('📚 Collections found:', collections.map(c => c.name));
    
    const meals = await db.collection('meals').find().toArray();
    console.log('🍽️ Meals count:', meals.length);
    
    await client.close();
    console.log('✅ Connection closed successfully');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  }
}

test();