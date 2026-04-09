const mongoose = require('mongoose');
const Product = require('../models/Product');
const StockBatch = require('../models/StockBatch');

/**
 * Adjust stock using FIFO principles.
 * @param {string} productId
 * @param {string} storeId
 * @param {number} amount - The amount to change (positive for add, negative for deduct)
 * @param {object} options - { receiptId, unitCost, note, receivedAt, session?, newCostPrice? }
 *   When `session` is passed, all reads/writes participate in the same MongoDB transaction
 *   (required when called from multi-document transactions — avoids write conflicts).
 *   `newCostPrice` (optional, ADD only): set Product.cost_price in the same update as $inc stock.
 */
async function adjustStockFIFO(productId, storeId, amount, options = {}) {
    if (!productId || !storeId || amount === 0) return;

    const { session, newCostPrice, ...batchMeta } = options;
    const pid = String(productId);
    const sid = String(storeId);
    const absAmount = Math.abs(amount);

    const createOpts = session ? { session } : {};
    const findQuery = (q) => (session ? q.session(session) : q);

    if (amount < 0) {
        // DEDUCT (FIFO)
        let remainingToDeduct = absAmount;
        let batches = await findQuery(
            StockBatch.find({ productId: pid, storeId: sid, remaining_qty: { $gt: 0 } }).sort({
                received_at: 1,
            })
        );

        if (batches.length === 0) {
            const product = await findQuery(Product.findById(pid)).lean();
            if (product && product.stock_qty > 0) {
                const [legacyBatch] = await StockBatch.create(
                    [
                        {
                            productId: pid,
                            storeId: sid,
                            initial_qty: product.stock_qty,
                            remaining_qty: product.stock_qty,
                            unit_cost: product.cost_price || 0,
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

        // Note: If remainingToDeduct > 0, it means we deducted more than we had in batches.
        // This can happen in some systems (negative stock), though ideally handled.
    } else {
        // ADD
        await StockBatch.create(
            [
                {
                    productId: pid,
                    storeId: sid,
                    initial_qty: absAmount,
                    remaining_qty: absAmount,
                    unit_cost: batchMeta.unitCost || 0,
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
        productUpdate.$set.cost_price = Number(newCostPrice);
    }

    const updateQ = Product.findByIdAndUpdate(pid, productUpdate);
    if (session) updateQ.session(session);
    await updateQ;
}

module.exports = {
    adjustStockFIFO,
};
