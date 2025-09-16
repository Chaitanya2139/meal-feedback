// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const admin = require('firebase-admin');
const fs = require('fs');

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME;

if (!fs.existsSync(process.env.SERVICE_ACCOUNT_PATH)) {
  console.error('Please place your Firebase service account JSON at', process.env.SERVICE_ACCOUNT_PATH);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(process.env.SERVICE_ACCOUNT_PATH)),
  projectId: process.env.FIREBASE_PROJECT_ID,
});

const firestore = admin.firestore();

// Mongo client
const client = new MongoClient(MONGO_URI);

async function start() {
  console.log('🚀 Starting server...');
  console.log('📦 Connecting to MongoDB...');
  await client.connect();
  console.log('✅ MongoDB connected');
  
  const db = client.db(DB_NAME);
  console.log('📊 Database selected:', DB_NAME);
  
  const app = express();
  app.use(cors());
  app.use(express.json());
  
  console.log('⚙️ Express app configured');

  // Middleware: verify Firebase ID Token
  async function authMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }
    const idToken = auth.split('Bearer ')[1];
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      req.user = decoded; // contains uid, email, etc.
      return next();
    } catch (err) {
      console.error('Token verification error', err);
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  // Simple ping endpoint for testing
  app.get('/ping', (req, res) => {
    console.log('🏓 PING endpoint hit');
    res.json({ message: 'pong', timestamp: new Date().toISOString() });
  });

  // Meals CRUD
  const mealsColl = db.collection('meals');
  app.get('/api/meals', async (req, res) => {
    console.log('🍽️ GET /api/meals - Request received');
    try {
      const list = await mealsColl.find().toArray();
      console.log('✅ Meals found:', list.length);
      res.json(list);
    } catch (err) {
      console.error('❌ Error fetching meals:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/meals', authMiddleware, async (req, res) => {
    // Only authenticated users can create meals (for demo). You can restrict further by uid/email.
    const doc = req.body;
    doc.createdAt = new Date();
    try {
      const r = await mealsColl.insertOne(doc);
      res.json({ insertedId: r.insertedId });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/meals/:id', authMiddleware, async (req, res) => {
    const id = req.params.id;
    const update = { $set: req.body };
    await mealsColl.updateOne({ _id: id }, update);
    res.json({ ok: true });
  });

  app.delete('/api/meals/:id', authMiddleware, async (req, res) => {
    const id = req.params.id;
    await mealsColl.deleteOne({ _id: id });
    res.json({ ok: true });
  });

  // Ratings: create (protected)
  const ratingsColl = db.collection('ratings');
  
  // Test endpoint for ratings (no auth required) - for debugging
  app.post('/api/test-rating', async (req, res) => {
    console.log('🧪 POST /api/test-rating - Request received');
    try {
      const testDoc = {
        mealId: 'meal_2025-09-15_canteen_01_lunch',
        canteenId: 'canteen_01',
        userId: 'test-user',
        userHash: 'test-hash',
        anonymous: false,
        rating: 5,
        comment: 'Test rating from debug endpoint',
        createdAt: new Date()
      };
      const r = await ratingsColl.insertOne(testDoc);
      console.log('✅ Test rating inserted:', r.insertedId);
      res.json({ success: true, insertedId: r.insertedId });
    } catch (err) {
      console.error('❌ Error inserting test rating:', err);
      res.status(500).json({ error: err.message });
    }
  });
  
  app.post('/api/ratings', authMiddleware, async (req, res) => {
    const payload = req.body;
    // add server-side fields
    const doc = {
      mealId: payload.mealId,
      canteenId: payload.canteenId,
      userId: req.user.uid,
      userHash: payload.userHash || ('uid:' + req.user.uid), // simple
      anonymous: !!payload.anonymous,
      rating: payload.rating,
      taste: payload.taste || null,
      quantity: payload.quantity || null,
      valueForMoney: payload.valueForMoney || null,
      comment: payload.comment || '',
      createdAt: new Date()
    };
    try {
      const r = await ratingsColl.insertOne(doc);

      // Write a small notification to Firestore for realtime UI
      await firestore.collection('notifications').add({
        type: 'new_rating',
        mealId: doc.mealId,
        canteenId: doc.canteenId,
        rating: doc.rating,
        comment: doc.comment,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      res.json({ insertedId: r.insertedId });
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.message });
    }
  });

  // A route to get raw ratings (admin only). For demo we'll allow any auth user.
  app.get('/api/ratings', authMiddleware, async (req, res) => {
    const rows = await ratingsColl.find().sort({ createdAt: -1 }).limit(200).toArray();
    res.json(rows);
  });

  // Weekly report aggregation (params: canteenId + weekStart YYYY-MM-DD optional)
  app.get('/api/weekly-report', authMiddleware, async (req, res) => {
    const canteenId = req.query.canteenId;
    const weekStart = req.query.weekStart; // optional
    if (!canteenId) return res.status(400).json({ error: 'canteenId required' });

    // compute start and end of weekStart (if provided) or this week
    let start;
    if (weekStart) {
      start = new Date(weekStart + 'T00:00:00Z');
    } else {
      const now = new Date();
      const day = now.getUTCDay(); // 0-6
      const diff = (day + 6) % 7;
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff));
    }
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);

    // aggregation similar to recompute script
    const pipeline = [
      { $match: { canteenId, createdAt: { $gte: start, $lt: end } } },
      { $addFields: { day: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone: "UTC" } } } },
      {
        $group: {
          _id: { mealId: "$mealId", day: "$day" },
          count: { $sum: 1 },
          avgRating: { $avg: "$rating" },
          sumRating: { $sum: "$rating" }
        }
      },
      {
        $group: {
          _id: "$_id.mealId",
          daily: { $push: { day: "$_id.day", count: "$count", avgRating: "$avgRating", sumRating: "$sumRating" } },
          avgRating: { $avg: "$avgRating" },
          count: { $sum: "$count" }
        }
      },
      { $sort: { avgRating: -1, count: -1 } }
    ];

    const byMeal = await ratingsColl.aggregate(pipeline).toArray();

    // prepare response
    const weeklySummary = {
      canteenId,
      weekStart: start.toISOString().slice(0,10),
      weekEnd: new Date(end.getTime()-1).toISOString().slice(0,10),
      totalRatings: 0,
      avgRating: 0,
      topMeals: [],
      daily: []
    };

    const dailyMap = {};
    for (const meal of byMeal) {
      weeklySummary.topMeals.push({ mealId: meal._id, avgRating: meal.avgRating, count: meal.count });
      weeklySummary.totalRatings += meal.count;
      for (const d of meal.daily) {
        if (!dailyMap[d.day]) dailyMap[d.day] = { count: 0, sumRating: 0 };
        dailyMap[d.day].count += d.count;
        dailyMap[d.day].sumRating += d.sumRating;
      }
    }

    weeklySummary.avgRating = weeklySummary.totalRatings ? (
      weeklySummary.topMeals.reduce((s,m) => s + m.avgRating * m.count, 0) / weeklySummary.totalRatings
    ) : 0;

    weeklySummary.daily = Object.keys(dailyMap).sort().map(day => ({
      date: day,
      count: dailyMap[day].count,
      avgRating: dailyMap[day].sumRating / dailyMap[day].count
    }));

    res.json(weeklySummary);
  });

  console.log('🌐 Starting HTTP server on port', PORT);
  app.listen(PORT, () => console.log(`✅ Backend listening on http://localhost:${PORT}`));
}

start().catch(err => {
  console.error('Startup error', err);
  process.exit(1);
});
