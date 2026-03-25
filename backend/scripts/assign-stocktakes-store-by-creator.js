require('dotenv').config();
const mongoose = require('mongoose');
const Stocktake = require('../models/Stocktake');
const User = require('../models/User');

async function run() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing in .env');
  await mongoose.connect(process.env.MONGO_URI);

  const cursor = Stocktake.find({
    $or: [{ storeId: { $exists: false } }, { storeId: null }],
  })
    .select('_id created_by')
    .lean()
    .cursor();

  let scanned = 0;
  let updated = 0;

  for await (const st of cursor) {
    scanned += 1;
    const user = await User.findById(st.created_by).select('storeId').lean();
    if (!user?.storeId) continue;
    const r = await Stocktake.updateOne({ _id: st._id }, { $set: { storeId: user.storeId } });
    if (r.modifiedCount > 0) updated += 1;
  }

  console.log(JSON.stringify({ scanned, updated }, null, 2));
}

run()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch (_) {}
  });

