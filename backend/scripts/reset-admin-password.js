// Run: node scripts/reset-admin-password.js
// Đặt lại mật khẩu admin@gmail.com và đảm bảo role admin

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const hash = await bcrypt.hash('123456', 10);
  const res = await User.updateOne(
    { email: 'admin@gmail.com' },
    { $set: { password: hash, role: 'admin' } }
  );
  console.log('updated', res.modifiedCount || res.nModified);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
