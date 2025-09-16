// seed.js
const { connect } = require('./lib/mongo');
const { ObjectId } = require('mongodb');

async function main() {
  const { client, db } = await connect();
  try {
    const canteens = db.collection('canteens');
    const meals = db.collection('meals');
    const users = db.collection('users');
    const ratings = db.collection('ratings');

    // Clear (CAUTION: for dev only)
    await canteens.deleteMany({});
    await meals.deleteMany({});
    await users.deleteMany({});
    await ratings.deleteMany({});

    // Sample canteen
    await canteens.insertOne({
      _id: 'canteen_01',
      name: 'Hall A Mess',
      location: 'Hall A Ground Floor'
    });

    // Sample meals (one per slot)
    await meals.insertMany([
      {
        _id: 'meal_2025-09-15_canteen_01_lunch',
        canteenId: 'canteen_01',
        date: '2025-09-15',
        slot: 'lunch',
        menu: ['Paneer Butter Masala', 'Rice', 'Salad'],
        createdAt: new Date('2025-09-15T11:00:00Z')
      },
      {
        _id: 'meal_2025-09-15_canteen_01_dinner',
        canteenId: 'canteen_01',
        date: '2025-09-15',
        slot: 'dinner',
        menu: ['Dal Tadka', 'Roti', 'Kheer'],
        createdAt: new Date('2025-09-15T18:30:00Z')
      }
    ]);

    // Sample users
    const user1 = await users.insertOne({
      rollNo: 'AE1234',
      name: 'Asha Kumar',
      email: 'asha.kumar@campus.edu',
      createdAt: new Date()
    });

    // Sample ratings
    await ratings.insertMany([
      {
        mealId: 'meal_2025-09-15_canteen_01_lunch',
        canteenId: 'canteen_01',
        userId: user1.insertedId,
        userHash: 'hash_asha', // in prod use HMAC or proper hash
        anonymous: false,
        rating: 4,
        taste: 4,
        quantity: 3,
        valueForMoney: 4,
        comment: 'Good, rice slightly dry',
        createdAt: new Date('2025-09-15T12:55:00Z')
      },
      {
        mealId: 'meal_2025-09-15_canteen_01_dinner',
        canteenId: 'canteen_01',
        anonymous: true,
        userHash: 'hash_anon1',
        rating: 5,
        taste: 5,
        quantity: 4,
        valueForMoney: 5,
        comment: 'Excellent!',
        createdAt: new Date('2025-09-15T19:15:00Z')
      }
    ]);

    console.log('Seeded sample data.');
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

main();
