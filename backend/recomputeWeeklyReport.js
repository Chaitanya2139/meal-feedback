// recomputeWeeklyReport.js
const { connect } = require('./lib/mongo');

function isoDateOnly(d) {
  return d.toISOString().slice(0,10); // YYYY-MM-DD
}

function getWeekStartISO(date) {
  // Monday as week start (UTC)
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return isoDateOnly(d);
}

async function main() {
  // usage: node recomputeWeeklyReport.js <canteenId> <weekStartISO (YYYY-MM-DD)>
  const [, , canteenId, weekStartArg] = process.argv;
  if (!canteenId) {
    console.error('Usage: node recomputeWeeklyReport.js <canteenId> <weekStartISO (optional)>');
    process.exit(1);
  }

  const startISO = weekStartArg || getWeekStartISO(new Date());
  const start = new Date(startISO + 'T00:00:00Z');
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  const { client, db } = await connect();
  try {
    const ratings = db.collection('ratings');

    const pipeline = [
      {
        $match: {
          canteenId: canteenId,
          createdAt: { $gte: start, $lt: end }
        }
      },
      {
        $addFields: {
          day: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone: "UTC" } }
        }
      },
      {
        $group: {
          _id: { mealId: "$mealId", day: "$day" },
          count: { $sum: 1 },
          avgRating: { $avg: "$rating" },
          sumRating: { $sum: "$rating" },
          avgTaste: { $avg: "$taste" }
        }
      },
      {
        $group: {
          _id: "$_id.mealId",
          daily: {
            $push: {
              day: "$_id.day",
              count: "$count",
              avgRating: "$avgRating",
              sumRating: "$sumRating"
            }
          },
          avgRating: { $avg: "$avgRating" },
          count: { $sum: "$count" }
        }
      },
      {
        $sort: { avgRating: -1, count: -1 }
      }
    ];

    const byMeal = await ratings.aggregate(pipeline).toArray();

    // compute totals and daily summary
    const weeklySummary = {
      canteenId,
      weekStart: startISO,
      weekEnd: new Date(end.getTime() - 1).toISOString().slice(0,10),
      totalRatings: 0,
      avgRating: 0,
      topMeals: [],
      daily: {},
      lastUpdated: new Date()
    };

    for (const meal of byMeal) {
      weeklySummary.topMeals.push({
        mealId: meal._id,
        avgRating: meal.avgRating,
        count: meal.count
      });
      weeklySummary.totalRatings += meal.count;
      // merge daily
      for (const d of meal.daily) {
        if (!weeklySummary.daily[d.day]) weeklySummary.daily[d.day] = { count: 0, sumRating: 0 };
        weeklySummary.daily[d.day].count += d.count;
        weeklySummary.daily[d.day].sumRating += d.sumRating;
      }
    }

    weeklySummary.avgRating =
      weeklySummary.totalRatings > 0 ? (weeklySummary.topMeals.reduce((s, m) => s + m.avgRating * m.count, 0) / weeklySummary.totalRatings) : 0;

    // prepare daily array (sorted by date)
    weeklySummary.daily = Object.keys(weeklySummary.daily)
      .sort()
      .map(day => ({
        date: day,
        count: weeklySummary.daily[day].count,
        avgRating: weeklySummary.daily[day].sumRating / weeklySummary.daily[day].count
      }));

    // write to weekly_reports (upsert)
    const weeklyColl = db.collection('weekly_reports');
    await weeklyColl.updateOne(
      { canteenId, weekStart: startISO },
      { $set: weeklySummary },
      { upsert: true }
    );

    console.log('Weekly report recomputed and saved for', canteenId, startISO);
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

main();
