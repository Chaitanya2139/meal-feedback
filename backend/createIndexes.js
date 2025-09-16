// createIndexes.js
const { connect } = require('./lib/mongo');

async function main() {
  const { client, db } = await connect();
  try {
    const ratings = db.collection('ratings');
    const meals = db.collection('meals');
    const weekly = db.collection('weekly_reports');

    console.log('Creating indexes...');

    await ratings.createIndex({ mealId: 1, createdAt: 1 });
    await ratings.createIndex({ canteenId: 1, createdAt: -1 });
    // Unique per-user-per-meal if you want one rating only (partial index to allow anonymous ratings)
    await ratings.createIndex(
      { userHash: 1, mealId: 1 },
      { unique: true, partialFilterExpression: { userHash: { $exists: true } } }
    );
    await ratings.createIndex({ comment: 'text' });

    await meals.createIndex({ canteenId: 1, date: 1, slot: 1 }, { unique: true });
    await weekly.createIndex({ canteenId: 1, weekStart: 1 }, { unique: true });

    console.log('Indexes created.');
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

main();


// backend/createIndexes.js
require('dotenv').config();
const { MongoClient } = require('mongodb');

async function main(){
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db(process.env.DB_NAME);
  const ratings = db.collection('ratings');
  const meals = db.collection('meals');
  const weekly = db.collection('weekly_reports');

  await ratings.createIndex({ mealId: 1, createdAt: 1 });
  await ratings.createIndex({ canteenId: 1, createdAt: -1 });
  await ratings.createIndex(
    { userHash: 1, mealId: 1 },
    { unique: true, partialFilterExpression: { userHash: { $exists: true } } }
  );
  await ratings.createIndex({ comment: 'text' });

  await meals.createIndex({ canteenId: 1, date: 1, slot: 1 }, { unique: true });
  await weekly.createIndex({ canteenId: 1, weekStart: 1 }, { unique: true });

  console.log('Indexes created.');
  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
