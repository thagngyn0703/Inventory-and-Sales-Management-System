require('dotenv').config();
const mongoose = require('mongoose');
const StockAdjustment = require('../models/StockAdjustment');
const Stocktake = require('../models/Stocktake');
const User = require('../models/User');

async function run() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing in .env');
  await mongoose.connect(process.env.MONGO_URI);

  const cursor = StockAdjustment.find({
    $or: [{ storeId: { $exists: false } }, { storeId: null }],
  })
    .select('_id stocktake_id created_by')
    .lean()
    .cursor();

  let scanned = 0;
  let updated = 0;

  for await (const adj of cursor) {
    scanned += 1;
    let resolvedStoreId = null;

    if (adj.stocktake_id) {
      const st = await Stocktake.findById(adj.stocktake_id).select('storeId').lean();
      if (st?.storeId) resolvedStoreId = st.storeId;
    }
    if (!resolvedStoreId && adj.created_by) {
      const u = await User.findById(adj.created_by).select('storeId').lean();
      if (u?.storeId) resolvedStoreId = u.storeId;
    }
    if (!resolvedStoreId) continue;

    const r = await StockAdjustment.updateOne(
      { _id: adj._id },
      { $set: { storeId: resolvedStoreId } }
    );
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

