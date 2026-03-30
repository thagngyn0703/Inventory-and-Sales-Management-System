const mongoose = require('mongoose');
const Product = require('../models/Product');
const StockBatch = require('../models/StockBatch');

/**
 * Adjust stock using FIFO principles.
 * @param {string} productId 
 * @param {string} storeId 
 * @param {number} amount - The amount to change (positive for add, negative for deduct)
 * @param {object} options - { receiptId, unitCost, note, receivedAt }
 */
async function adjustStockFIFO(productId, storeId, amount, options = {}) {
    if (!productId || !storeId || amount === 0) return;

    const pid = String(productId);
    const sid = String(storeId);
    const absAmount = Math.abs(amount);

    if (amount < 0) {
        // DEDUCT (FIFO)
        let remainingToDeduct = absAmount;
        let batches = await StockBatch.find({ productId: pid, storeId: sid, remaining_qty: { $gt: 0 } })
            .sort({ received_at: 1 });

        if (batches.length === 0) {
            const product = await Product.findById(pid).lean();
            if (product && product.stock_qty > 0) {
                const legacyBatch = await StockBatch.create({
                    productId: pid,
                    storeId: sid,
                    initial_qty: product.stock_qty,
                    remaining_qty: product.stock_qty,
                    unit_cost: product.cost_price || 0,
                    received_at: product.created_at || new Date(),
                    note: 'Hàng tồn kho ban đầu (Legacy)',
                });
                batches = [legacyBatch];
            }
        }

        for (const batch of batches) {
            if (remainingToDeduct <= 0) break;
            const deduct = Math.min(batch.remaining_qty, remainingToDeduct);
            batch.remaining_qty -= deduct;
            remainingToDeduct -= deduct;
            await batch.save();
        }

        // Note: If remainingToDeduct > 0, it means we deducted more than we had in batches.
        // This can happen in some systems (negative stock), though ideally handled.
    } else {
        // ADD
        await StockBatch.create({
            productId: pid,
            storeId: sid,
            initial_qty: absAmount,
            remaining_qty: absAmount,
            unit_cost: options.unitCost || 0,
            received_at: options.receivedAt || new Date(),
            receipt_id: options.receiptId || undefined,
            note: options.note || undefined,
        });
    }

    // Always update the total stock_qty in Product model
    await Product.findByIdAndUpdate(pid, { 
        $inc: { stock_qty: amount },
        $set: { updated_at: new Date() }
    });
}

module.exports = {
    adjustStockFIFO,
};
