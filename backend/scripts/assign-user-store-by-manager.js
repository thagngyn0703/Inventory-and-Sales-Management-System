require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function run() {
  const managerEmail = (process.argv[2] || '').toLowerCase().trim();
  const staffEmail = (process.argv[3] || '').toLowerCase().trim();

  if (!managerEmail || !staffEmail) {
    throw new Error('Usage: node scripts/assign-user-store-by-manager.js <managerEmail> <staffEmail>');
  }
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing in .env');
  }

  await mongoose.connect(process.env.MONGO_URI);

  const manager = await User.findOne({ email: managerEmail, role: 'manager' }).lean();
  if (!manager) throw new Error(`Manager not found: ${managerEmail}`);
  if (!manager.storeId) throw new Error(`Manager has no storeId: ${managerEmail}`);

  const staff = await User.findOneAndUpdate(
    { email: staffEmail },
    { $set: { storeId: manager.storeId } },
    { new: true }
  ).lean();

  if (!staff) throw new Error(`User not found: ${staffEmail}`);

  console.log(
    JSON.stringify(
      {
        managerEmail,
        managerStoreId: String(manager.storeId),
        staffEmail: staff.email,
        staffRole: staff.role,
        staffStoreId: staff.storeId ? String(staff.storeId) : null,
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

