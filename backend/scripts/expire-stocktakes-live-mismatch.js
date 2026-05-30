/**
 * Đánh dấu hết hiệu lực các phiếu kiểm kê đã gửi mà tồn hiện tại lệch snapshot > ngưỡng.
 * Chạy: node scripts/expire-stocktakes-live-mismatch.js (từ thư mục backend)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Stocktake = require('../models/Stocktake');
const Product = require('../models/Product');

const THRESHOLD = 5;
const EXPIRED_REASON = 'Tồn hệ thống đã thay đổi';

async function run() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing in .env');
  await mongoose.connect(process.env.MONGO_URI);

  const cursor = Stocktake.find({ status: 'submitted' })
    .select('_id storeId items')
    .lean()
    .cursor();

  let scanned = 0;
  let expired = 0;

  for await (const st of cursor) {
    scanned += 1;
    const storeId = st.storeId ? String(st.storeId) : '';
    if (!storeId) continue;

    const productIds = (st.items || [])
      .map((it) => (it?.product_id ? String(it.product_id) : null))
      .filter(Boolean);
    if (productIds.length === 0) continue;

    const products = await Product.find({
      _id: { $in: productIds },
      storeId,
    })
      .select('_id stock_qty')
      .lean();
    const liveQtyMap = new Map(products.map((p) => [String(p._id), Number(p.stock_qty) || 0]));

    let hasSignificantMismatch = false;
    for (const it of st.items || []) {
      const pid = String(it.product_id);
      const snapshotQty = Number(it.system_qty) || 0;
      const liveQty = liveQtyMap.has(pid) ? Number(liveQtyMap.get(pid)) : snapshotQty;
      if (Math.abs(liveQty - snapshotQty) > THRESHOLD) {
        hasSignificantMismatch = true;
        break;
      }
    }

    if (!hasSignificantMismatch) continue;

    const r = await Stocktake.updateOne(
      { _id: st._id, status: 'submitted' },
      {
        $set: {
          status: 'expired',
          reject_reason: EXPIRED_REASON,
          updated_at: new Date(),
        },
      }
    );
    if (r.modifiedCount > 0) expired += 1;
  }

  console.log(JSON.stringify({ scanned, expired }, null, 2));
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
