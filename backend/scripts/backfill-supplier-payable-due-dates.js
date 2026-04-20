/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const SupplierPayable = require('../models/SupplierPayable');
const GoodsReceipt = require('../models/GoodsReceipt');
const Supplier = require('../models/Supplier');

async function run() {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
    if (!uri) throw new Error('Missing DB connection string (MONGO_URI/MONGODB_URI/DATABASE_URL)');

    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    const payables = await SupplierPayable.find({
        source_type: 'goods_receipt',
        status: { $in: ['open', 'partial'] },
        $or: [{ due_date: { $exists: false } }, { due_date: null }],
    })
        .select('_id supplier_id source_id storeId created_at')
        .lean();

    let updated = 0;
    for (const p of payables) {
        const supplier = await Supplier.findById(p.supplier_id).select('default_payment_term_days').lean();
        const termDays = Number(supplier?.default_payment_term_days) || 0;
        const effectiveTermDays = termDays > 0 ? termDays : 30;

        const receipt = await GoodsReceipt.findById(p.source_id).select('received_at created_at').lean();
        const baseDate = receipt?.received_at || receipt?.created_at || p.created_at || new Date();
        const dueDate = new Date(baseDate);
        dueDate.setDate(dueDate.getDate() + effectiveTermDays);

        await SupplierPayable.updateOne({ _id: p._id }, { $set: { due_date: dueDate, updated_at: new Date() } });
        updated += 1;
    }

    console.log(`Backfill completed. Updated payables: ${updated}/${payables.length}`);
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
