require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Store = require('../models/Store');
const Stocktake = require('../models/Stocktake');
const StockAdjustment = require('../models/StockAdjustment');

async function run() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing in .env');
  await mongoose.connect(process.env.MONGO_URI);

  const managerAEmail = 'tait76636@gmail.com';
  const managerBEmail = 'namthhe170362@fpt.edu.vn';
  const staffAEmail = 'namkz107@gmail.com';
  const staffBEmail = 'tranhainam24102003@gmail.com';

  const managerA = await User.findOne({ email: managerAEmail }).select('_id email role storeId').lean();
  const managerB = await User.findOne({ email: managerBEmail }).select('_id email role storeId').lean();
  if (!managerA) throw new Error(`Manager A not found: ${managerAEmail}`);
  if (!managerB) throw new Error(`Manager B not found: ${managerBEmail}`);

  const storeA = await Store.findOne({ managerId: managerA._id }).select('_id name managerId').lean();
  const storeB = await Store.findOne({ managerId: managerB._id }).select('_id name managerId').lean();
  if (!storeA) throw new Error(`Store not found for manager: ${managerAEmail}`);
  if (!storeB) throw new Error(`Store not found for manager: ${managerBEmail}`);

  await User.updateOne({ _id: managerA._id }, { $set: { storeId: storeA._id } });
  await User.updateOne({ _id: managerB._id }, { $set: { storeId: storeB._id } });

  const staffA = await User.findOneAndUpdate(
    { email: staffAEmail },
    { $set: { role: 'staff', storeId: storeA._id } },
    { new: true }
  ).select('_id email role storeId').lean();
  const staffB = await User.findOneAndUpdate(
    { email: staffBEmail },
    { $set: { role: 'staff', storeId: storeB._id } },
    { new: true }
  ).select('_id email role storeId').lean();
  if (!staffA) throw new Error(`Staff A not found: ${staffAEmail}`);
  if (!staffB) throw new Error(`Staff B not found: ${staffBEmail}`);

  const creatorToStore = new Map([
    [String(managerA._id), storeA._id],
    [String(managerB._id), storeB._id],
    [String(staffA._id), storeA._id],
    [String(staffB._id), storeB._id],
  ]);

  const stocktakes = await Stocktake.find({
    created_by: { $in: [managerA._id, managerB._id, staffA._id, staffB._id] },
  }).select('_id created_by storeId').lean();

  let stocktakesUpdated = 0;
  for (const st of stocktakes) {
    const targetStoreId = creatorToStore.get(String(st.created_by));
    if (!targetStoreId) continue;
    if (String(st.storeId || '') === String(targetStoreId)) continue;
    const r = await Stocktake.updateOne({ _id: st._id }, { $set: { storeId: targetStoreId } });
    if (r.modifiedCount > 0) stocktakesUpdated += 1;
  }

  const adjustments = await StockAdjustment.find({
    stocktake_id: { $exists: true, $ne: null },
  }).select('_id stocktake_id storeId').lean();

  let adjustmentsUpdated = 0;
  for (const adj of adjustments) {
    const st = stocktakes.find((x) => String(x._id) === String(adj.stocktake_id));
    if (!st) continue;
    const targetStoreId = creatorToStore.get(String(st.created_by));
    if (!targetStoreId) continue;
    if (String(adj.storeId || '') === String(targetStoreId)) continue;
    const r = await StockAdjustment.updateOne({ _id: adj._id }, { $set: { storeId: targetStoreId } });
    if (r.modifiedCount > 0) adjustmentsUpdated += 1;
  }

  console.log(
    JSON.stringify(
      {
        mapping: {
          [managerAEmail]: String(storeA._id),
          [staffAEmail]: String(storeA._id),
          [managerBEmail]: String(storeB._id),
          [staffBEmail]: String(storeB._id),
        },
        stocktakesChecked: stocktakes.length,
        stocktakesUpdated,
        adjustmentsChecked: adjustments.length,
        adjustmentsUpdated,
      },
      null,
      2
    )
  );
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

