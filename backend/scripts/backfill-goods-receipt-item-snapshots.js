/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const GoodsReceipt = require('../models/GoodsReceipt');
const Product = require('../models/Product');

function asTrimmed(value) {
    const s = String(value || '').trim();
    return s || undefined;
}

async function run() {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
    if (!uri) {
        throw new Error('Missing DB connection string (MONGO_URI/MONGODB_URI/DATABASE_URL)');
    }

    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    const receipts = await GoodsReceipt.find({
        items: { $elemMatch: { $or: [{ product_name_snapshot: { $exists: false } }, { product_sku_snapshot: { $exists: false } }] } },
    })
        .select('_id items')
        .lean();

    let updatedReceipts = 0;
    let updatedItems = 0;

    for (const receipt of receipts) {
        const productIds = [
            ...new Set(
                (receipt.items || [])
                    .map((it) => String(it.product_id || ''))
                    .filter((id) => mongoose.isValidObjectId(id))
            ),
        ];
        const products = await Product.find({ _id: { $in: productIds } }).select('_id name sku').lean();
        const productMap = new Map(products.map((p) => [String(p._id), p]));

        let changed = false;
        const nextItems = (receipt.items || []).map((it) => {
            const next = { ...it };
            const p = productMap.get(String(it.product_id || ''));
            let itemChanged = false;

            const nameSnapshot = asTrimmed(next.product_name_snapshot) || asTrimmed(p?.name);
            const skuSnapshot = asTrimmed(next.product_sku_snapshot) || asTrimmed(p?.sku);

            if (nameSnapshot && next.product_name_snapshot !== nameSnapshot) {
                next.product_name_snapshot = nameSnapshot;
                changed = true;
                itemChanged = true;
            }
            if (skuSnapshot && next.product_sku_snapshot !== skuSnapshot) {
                next.product_sku_snapshot = skuSnapshot;
                changed = true;
                itemChanged = true;
            }

            if (itemChanged) updatedItems += 1;
            return next;
        });

        if (!changed) continue;

        await GoodsReceipt.updateOne({ _id: receipt._id }, { $set: { items: nextItems } });
        updatedReceipts += 1;
    }

    console.log(`Backfill completed. Receipts updated: ${updatedReceipts}, item rows updated: ${updatedItems}`);
    await mongoose.disconnect();
}

run().catch(async (err) => {
    console.error('Backfill failed:', err);
    try {
        await mongoose.disconnect();
    } catch (_) {
        // ignore
    }
    process.exit(1);
});
