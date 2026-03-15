/**
 * One-time script to fix SalesInvoice items where product_id was stored as a full object
 * instead of an ObjectId. This can happen if the frontend sent an object instead of a string id.
 *
 * Usage: node scripts/fix-invoice-product-ids.js
 */

const mongoose = require('mongoose');
const SalesInvoice = require('../models/SalesInvoice');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/IMS';

async function normalizeProductIds() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');

  const invoices = await SalesInvoice.find({}).lean();
  let fixedCount = 0;

  for (const invoice of invoices) {
    if (!Array.isArray(invoice.items)) continue;

    let modified = false;
    const fixedItems = invoice.items.map((item) => {
      if (!item || !item.product_id) return item;
      const prod = item.product_id;
      if (typeof prod === 'object' && prod !== null && prod._id) {
        modified = true;
        return { ...item, product_id: prod._id };
      }
      return item;
    });

    if (modified) {
      await SalesInvoice.updateOne({ _id: invoice._id }, { $set: { items: fixedItems } });
      fixedCount += 1;
      console.log(`Fixed invoice ${invoice._id}`);
    }
  }

  console.log(`Done. Fixed ${fixedCount} invoice(s).`);
  await mongoose.disconnect();
}

normalizeProductIds().catch((err) => {
  console.error(err);
  process.exit(1);
});
