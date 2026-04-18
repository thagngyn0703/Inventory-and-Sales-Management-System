/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const ProductUnit = require('../models/ProductUnit');

async function run() {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('Missing MONGO_URI (or MONGODB_URI)');
    }
    await mongoose.connect(uri);
    console.log('[migrate-product-units] Connected');

    const cursor = Product.find({})
        .select('_id storeId base_unit sale_price barcode selling_units')
        .lean()
        .cursor();

    let upserted = 0;
    for await (const product of cursor) {
        const units = Array.isArray(product.selling_units) && product.selling_units.length > 0
            ? product.selling_units
            : [{ name: product.base_unit || 'Cái', ratio: 1, sale_price: product.sale_price || 0 }];
        let hasBase = false;
        for (const u of units) {
            const ratio = Number(u.ratio) > 0 ? Number(u.ratio) : 1;
            const isBase = ratio === 1 || String(u.name || '').trim() === String(product.base_unit || '').trim();
            if (isBase) hasBase = true;
            const barcode = isBase ? (String(product.barcode || '').trim() || undefined) : undefined;
            await ProductUnit.findOneAndUpdate(
                { product_id: product._id, unit_name: String(u.name || '').trim() || 'Cái' },
                {
                    $set: {
                        storeId: product.storeId || null,
                        exchange_value: ratio,
                        price: Math.round(Number(u.sale_price) || 0),
                        barcode,
                        is_base: isBase,
                        updated_at: new Date(),
                    },
                    $setOnInsert: { created_at: new Date() },
                },
                { upsert: true }
            );
            upserted += 1;
        }
        if (!hasBase) {
            await ProductUnit.findOneAndUpdate(
                { product_id: product._id, unit_name: String(product.base_unit || 'Cái') },
                {
                    $set: {
                        storeId: product.storeId || null,
                        exchange_value: 1,
                        price: Math.round(Number(product.sale_price) || 0),
                        barcode: String(product.barcode || '').trim() || undefined,
                        is_base: true,
                        updated_at: new Date(),
                    },
                    $setOnInsert: { created_at: new Date() },
                },
                { upsert: true }
            );
            upserted += 1;
        }
    }

    console.log(`[migrate-product-units] Completed. Upserted rows: ${upserted}`);
    await mongoose.disconnect();
}

run().catch(async (err) => {
    console.error('[migrate-product-units] Failed:', err);
    try {
        await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
});
