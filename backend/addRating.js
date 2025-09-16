// addRating.js
const { connect } = require('./lib/mongo');

async function main() {
  const { client, db } = await connect();
  try {
    const ratings = db.collection('ratings');

    const sample = {
      mealId: 'meal_2025-09-15_canteen_01_lunch',
      canteenId: 'canteen_01',
      userHash: 'hash_test_' + Math.floor(Math.random()*10000),
      anonymous: true,
      rating: Math.floor(Math.random() * 5) + 1,
      taste: 4,
      quantity: 3,
      valueForMoney: 4,
      comment: 'Test rating ' + new Date().toISOString(),
      createdAt: new Date()
    };

    const res = await ratings.insertOne(sample);
    console.log('Inserted rating:', res.insertedId);
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

main();
