const { Schema, model } = require('mongoose');

const productPriceHistorySchema = new Schema(
  {
    product_id: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: false,
      index: true,
    },
    changed_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: ['import_excel', 'manual_update', 'goods_receipt'],
      default: 'manual_update',
      index: true,
    },
    source_note: {
      type: String,
      trim: true,
    },
    old_cost_price: { type: Number, required: true },
    new_cost_price: { type: Number, required: true },
    old_sale_price: { type: Number, required: true },
    new_sale_price: { type: Number, required: true },
    changed_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: false }
);

productPriceHistorySchema.index({ storeId: 1, changed_at: -1 });
productPriceHistorySchema.index({ product_id: 1, changed_at: -1 });

module.exports = model('ProductPriceHistory', productPriceHistorySchema);
