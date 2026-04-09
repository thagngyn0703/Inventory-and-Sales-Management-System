/**
 * Một lần: gỡ trường warehouse_id khỏi các collection và xóa collection warehouses.
 * Chạy sau khi deploy code không còn model Warehouse:
 *   node scripts/cleanup-remove-warehouses.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function main() {
    if (!process.env.MONGO_URI) {
        console.error('Thiếu MONGO_URI trong .env');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;

    const unset = { $unset: { warehouse_id: '' } };
    const r1 = await db.collection('stocktakes').updateMany({}, unset);
    console.log('stocktakes:', r1.modifiedCount, 'documents updated (warehouse_id removed)');
    const r2 = await db.collection('stockadjustments').updateMany({}, unset);
    console.log('stockadjustments:', r2.modifiedCount, 'documents updated');
    const r3 = await db.collection('salesreturns').updateMany({}, unset);
    console.log('salesreturns:', r3.modifiedCount, 'documents updated');

    try {
        await db.collection('warehouses').drop();
        console.log('Đã xóa collection warehouses');
    } catch (e) {
        if (e.codeName === 'NamespaceNotFound') {
            console.log('Collection warehouses không tồn tại — bỏ qua');
        } else {
            throw e;
        }
    }

    await mongoose.disconnect();
    console.log('Xong.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
