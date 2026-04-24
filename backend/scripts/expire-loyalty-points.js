/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const CustomerLoyaltyTransaction = require('../models/CustomerLoyaltyTransaction');

async function run() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('Missing MONGO_URI / MONGODB_URI');
  }
  await mongoose.connect(mongoUri);

  const expiryMonths = Number(process.env.LOYALTY_EXPIRY_MONTHS || 12);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - expiryMonths);

  const candidates = await Customer.find({
    loyalty_points: { $ne: 0 },
    $or: [
      { last_loyalty_activity_at: { $lt: cutoff } },
      { last_loyalty_activity_at: null },
    ],
  }).select('_id store_id loyalty_points').lean();

  let expiredCount = 0;
  for (const customer of candidates) {
    const points = Number(customer.loyalty_points || 0);
    if (!points) continue;
    const idempotencyKey = `expire:${customer._id}:${cutoff.toISOString().slice(0, 10)}`;
    const existed = await CustomerLoyaltyTransaction.findOne({
      customer_id: customer._id,
      idempotency_key: idempotencyKey,
    }).lean();
    if (existed) continue;

    const nextBalance = 0;
    await Customer.updateOne(
      { _id: customer._id },
      {
        $set: {
          loyalty_points: nextBalance,
          last_loyalty_activity_at: new Date(),
          updated_at: new Date(),
        },
      }
    );
    await CustomerLoyaltyTransaction.create({
      store_id: customer.store_id,
      customer_id: customer._id,
      type: 'EXPIRE',
      points: -Math.abs(points),
      value_vnd: 0,
      reference_model: 'Customer',
      reference_id: customer._id,
      balance_after: nextBalance,
      note: `Hết hạn điểm sau ${expiryMonths} tháng không hoạt động`,
      idempotency_key: idempotencyKey,
      created_by: null,
    });
    expiredCount += 1;
  }

  console.log(`[expire-loyalty-points] done. Expired customers: ${expiredCount}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[expire-loyalty-points] failed:', err);
  process.exitCode = 1;
});
