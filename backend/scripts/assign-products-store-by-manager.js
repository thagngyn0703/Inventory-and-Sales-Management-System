require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');

async function run() {
  const managerEmail = (process.argv[2] || 'tait76636@gmail.com').toLowerCase().trim();
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing in .env');
  }

  await mongoose.connect(process.env.MONGO_URI);
  const manager = await User.findOne({ email: managerEmail, role: 'manager' }).lean();
  if (!manager) {
    throw new Error(`Manager not found: ${managerEmail}`);
  }
  if (!manager.storeId) {
    throw new Error(`Manager has no storeId: ${managerEmail}`);
  }

  const result = await Product.updateMany(
    { $or: [{ storeId: { $exists: false } }, { storeId: null }] },
    { $set: { storeId: manager.storeId } }
  );

  console.log(
    JSON.stringify(
      {
        managerEmail,
        assignedStoreId: String(manager.storeId),
        matched: result.matchedCount,
        modified: result.modifiedCount,
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

