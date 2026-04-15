const mongoose = require('mongoose');
const Product = require('../models/Product');
const StockBatch = require('../models/StockBatch');
const StockHistory = require('../models/StockHistory');

function roundTo4(value) {
    return Math.round((Number(value) || 0) * 10000) / 10000;
}

/**
 * Adjust stock using FIFO principles.
 * @param {string} productId
 * @param {string} storeId
 * @param {number} amount - The amount to change (positive for add, negative for deduct)
 * @param {object} options - { receiptId, unitCost, note, receivedAt, session?, newCostPrice?, movementType?, referenceType?, referenceId?, actorId? }
 *   When `session` is passed, all reads/writes participate in the same MongoDB transaction
 *   (required when called from multi-document transactions — avoids write conflicts).
 *   `newCostPrice` (optional, ADD only): set Product.cost_price in the same update as $inc stock.
 */
async function adjustStockFIFO(productId, storeId, amount, options = {}) {
    if (!productId || !storeId || amount === 0) return;

    const { session, newCostPrice, allowNegative = false, ...batchMeta } = options;
    const pid = String(productId);
    const sid = String(storeId);
    const absAmount = Math.abs(amount);

    const createOpts = session ? { session } : {};
    const findQuery = (q) => (session ? q.session(session) : q);

    const productBefore = await findQuery(Product.findOne({ _id: pid, storeId: sid })).lean();
    if (!productBefore) {
        const err = new Error('PRODUCT_NOT_FOUND_IN_STORE');
        err.code = 'PRODUCT_NOT_FOUND_IN_STORE';
        throw err;
    }
    const beforeQty = Number(productBefore.stock_qty) || 0;

    if (amount < 0) {
        // DEDUCT (FIFO)
        let remainingToDeduct = absAmount;
        let batches = await findQuery(
            StockBatch.find({ productId: pid, storeId: sid, remaining_qty: { $gt: 0 } }).sort({
                received_at: 1,
            })
        );

        if (batches.length === 0) {
            const product = productBefore;
            if (product && product.stock_qty > 0) {
                const [legacyBatch] = await StockBatch.create(
                    [
                        {
                            productId: pid,
                            storeId: sid,
                            initial_qty: product.stock_qty,
                            remaining_qty: product.stock_qty,
                            unit_cost: roundTo4(product.cost_price || 0),
                            received_at: product.created_at || new Date(),
                            note: 'Hàng tồn kho ban đầu (Legacy)',
                        },
                    ],
                    createOpts
                );
                batches = [legacyBatch];
            }
        }

        for (const batch of batches) {
            if (remainingToDeduct <= 0) break;
            const deduct = Math.min(batch.remaining_qty, remainingToDeduct);
            batch.remaining_qty -= deduct;
            remainingToDeduct -= deduct;
            await batch.save(session ? { session } : {});
        }

        if (remainingToDeduct > 0 && !allowNegative) {
            const err = new Error('INSUFFICIENT_STOCK');
            err.code = 'INSUFFICIENT_STOCK';
            throw err;
        }
    } else {
        // ADD
        await StockBatch.create(
            [
                {
                    productId: pid,
                    storeId: sid,
                    initial_qty: absAmount,
                    remaining_qty: absAmount,
                    unit_cost: roundTo4(batchMeta.unitCost || 0),
                    received_at: batchMeta.receivedAt || new Date(),
                    receipt_id: batchMeta.receiptId || undefined,
                    note: batchMeta.note || undefined,
                },
            ],
            createOpts
        );
    }

    const productUpdate = {
        $inc: { stock_qty: amount },
        $set: { updated_at: new Date() },
    };
    if (amount > 0 && newCostPrice != null && Number.isFinite(Number(newCostPrice))) {
        productUpdate.$set.cost_price = roundTo4(newCostPrice);
    }

    const updateQ = Product.findOneAndUpdate({ _id: pid, storeId: sid }, productUpdate, { new: true });
    if (session) updateQ.session(session);
    const productAfter = await updateQ;
    if (!productAfter) {
        const err = new Error('PRODUCT_NOT_FOUND_IN_STORE');
        err.code = 'PRODUCT_NOT_FOUND_IN_STORE';
        throw err;
    }

    const afterQty = Number(productAfter.stock_qty) || 0;
    const historyPayload = {
        storeId: sid,
        product_id: pid,
        type: batchMeta.movementType || (amount > 0 ? 'IN_GENERIC' : 'OUT_GENERIC'),
        reference_type: batchMeta.referenceType || undefined,
        reference_id: batchMeta.referenceId || batchMeta.receiptId || undefined,
        before_qty: beforeQty,
        change_qty: Number(amount) || 0,
        after_qty: afterQty,
        unit_cost: batchMeta.unitCost != null ? roundTo4(batchMeta.unitCost) : null,
        note: batchMeta.note || undefined,
        actor_id: batchMeta.actorId || undefined,
        created_at: new Date(),
    };
    if (session) {
        await StockHistory.create([historyPayload], { session });
    } else {
        await StockHistory.create(historyPayload);
    }
}

module.exports = {
    adjustStockFIFO,
};
