/**
 * Chuẩn hóa: customer -> staff; warehouse_staff / sales_staff -> staff (nếu còn).
 * Role admin giữ nguyên — không đổi thành manager.
 * Chạy: node scripts/migrate-two-roles-only.js
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
  const col = mongoose.connection.db.collection('users');

  const r2 = await col.updateMany({ role: 'customer' }, { $set: { role: 'staff' } });
  console.log('customer -> staff:', r2.modifiedCount);

  const r3 = await col.updateMany(
    { role: { $in: ['warehouse_staff', 'sales_staff'] } },
    { $set: { role: 'staff' } }
  );
  console.log('warehouse/sales_staff -> staff:', r3.modifiedCount);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
