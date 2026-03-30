/**
 * Gộp warehouse_staff và sales_staff thành staff trong collection users.
 * Chạy một lần sau khi deploy: node scripts/migrate-staff-role.js
 * Yêu cầu MONGODB_URI / connection giống server.
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('Thiếu MONGODB_URI hoặc MONGO_URI trong .env');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const r = await mongoose.connection.db.collection('users').updateMany(
    { role: { $in: ['warehouse_staff', 'sales_staff'] } },
    { $set: { role: 'staff' } }
  );
  console.log('Đã cập nhật:', r.modifiedCount, 'user(s)');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
