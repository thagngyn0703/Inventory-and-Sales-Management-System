require('dotenv').config();
const mongoose = require('mongoose');
const CustomerDebtPayment = require('../models/CustomerDebtPayment');

function parseArgs(argv) {
    return {
        dryRun: argv.includes('--dry-run'),
    };
}

function pickKeeper(docs) {
    const confirmed = docs.filter((d) => d.status === 'confirmed');
    const pending = docs.filter((d) => d.status === 'pending');
    const pool = confirmed.length > 0 ? confirmed : (pending.length > 0 ? pending : docs);
    return pool[0];
}

async function cleanupDuplicatePaymentRefs({ dryRun }) {
    const groups = await CustomerDebtPayment.aggregate([
        {
            $match: {
                payment_ref: { $type: 'string', $ne: '' },
                status: { $in: ['pending', 'processing', 'confirmed'] },
            },
        },
        {
            $group: {
                _id: { store_id: '$store_id', payment_ref: '$payment_ref' },
                count: { $sum: 1 },
                ids: { $push: '$_id' },
            },
        },
        { $match: { count: { $gt: 1 } } },
    ]);

    let changed = 0;
    for (const g of groups) {
        const docs = await CustomerDebtPayment.find({ _id: { $in: g.ids } })
            .sort({ status: 1, received_at: -1, _id: 1 })
            .lean();
        const keeper = pickKeeper(docs);
        const toCancel = docs.filter((d) => String(d._id) !== String(keeper._id));
        if (toCancel.length === 0) continue;

        changed += toCancel.length;
        if (!dryRun) {
            await CustomerDebtPayment.updateMany(
                { _id: { $in: toCancel.map((d) => d._id) } },
                {
                    $set: {
                        status: 'cancelled',
                        note: 'Auto-cleanup duplicate payment_ref before unique index migration',
                        payment_ref: '',
                        provider_txn_id: '',
                    },
                }
            );
        }
    }
    return { groups: groups.length, changed };
}

async function cleanupDuplicateProviderTxnIds({ dryRun }) {
    const groups = await CustomerDebtPayment.aggregate([
        {
            $match: {
                provider_txn_id: { $type: 'string', $ne: '' },
                status: 'confirmed',
            },
        },
        {
            $group: {
                _id: '$provider_txn_id',
                count: { $sum: 1 },
                ids: { $push: '$_id' },
            },
        },
        { $match: { count: { $gt: 1 } } },
    ]);

    let changed = 0;
    for (const g of groups) {
        const docs = await CustomerDebtPayment.find({ _id: { $in: g.ids } })
            .sort({ received_at: -1, _id: 1 })
            .lean();
        const keeper = docs[0];
        const toCancel = docs.slice(1);
        if (toCancel.length === 0) continue;

        changed += toCancel.length;
        if (!dryRun) {
            await CustomerDebtPayment.updateMany(
                { _id: { $in: toCancel.map((d) => d._id) } },
                {
                    $set: {
                        status: 'cancelled',
                        note: 'Auto-cleanup duplicate provider_txn_id before unique index migration',
                        provider_txn_id: '',
                        payment_ref: '',
                    },
                }
            );
        }
    }
    return { groups: groups.length, changed };
}

async function ensureIndexes({ dryRun }) {
    const col = CustomerDebtPayment.collection;
    const indexes = await col.indexes();

    const dropCandidates = indexes.filter((i) => {
        const key = i.key || {};
        const isProviderTxn = key.provider_txn_id === 1 && Object.keys(key).length === 1;
        const isStorePaymentRef = key.store_id === 1 && key.payment_ref === 1 && Object.keys(key).length === 2;
        return isProviderTxn || isStorePaymentRef;
    });

    if (!dryRun) {
        for (const idx of dropCandidates) {
            await col.dropIndex(idx.name);
        }
        await col.createIndex(
            { store_id: 1, payment_ref: 1 },
            {
                unique: true,
                name: 'store_id_1_payment_ref_1_active_unique',
                partialFilterExpression: {
                    payment_ref: { $type: 'string', $gt: '' },
                    status: { $in: ['pending', 'processing', 'confirmed'] },
                },
            }
        );
        await col.createIndex(
            { provider_txn_id: 1 },
            {
                unique: true,
                name: 'provider_txn_id_1_non_empty_unique',
                partialFilterExpression: {
                    provider_txn_id: { $type: 'string', $gt: '' },
                },
            }
        );
    }

    const nextIndexes = dryRun ? indexes : await col.indexes();
    return {
        dropped: dropCandidates.map((i) => i.name),
        indexes: nextIndexes.map((i) => ({ name: i.name, key: i.key, unique: !!i.unique })),
    };
}

async function run() {
    const { dryRun } = parseArgs(process.argv.slice(2));
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing in .env');
    await mongoose.connect(process.env.MONGO_URI);

    // Chuẩn hóa status cũ
    if (!dryRun) {
        await CustomerDebtPayment.updateMany(
            { $or: [{ status: { $exists: false } }, { status: null }, { status: '' }] },
            { $set: { status: 'confirmed' } }
        );
    }

    const paymentRefResult = await cleanupDuplicatePaymentRefs({ dryRun });
    const providerResult = await cleanupDuplicateProviderTxnIds({ dryRun });
    const indexResult = await ensureIndexes({ dryRun });

    console.log(
        JSON.stringify(
            {
                dryRun,
                cleanedDuplicatePaymentRefs: paymentRefResult,
                cleanedDuplicateProviderTxnIds: providerResult,
                indexResult,
                nextStep: dryRun
                    ? 'Run again without --dry-run to apply changes.'
                    : 'Migration applied successfully.',
            },
            null,
            2
        )
    );
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
