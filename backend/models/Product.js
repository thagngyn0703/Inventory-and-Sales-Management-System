const { Schema, model } = require('mongoose');

const productSchema = new Schema(
  {
    category_id: { type: Schema.Types.ObjectId, required: false, index: true },
    name: { type: String, required: true, trim: true, index: true },
    sku: { type: String, required: true, trim: true, unique: true, index: true },
    barcode: { type: String, required: false, trim: true, unique: true, sparse: true, index: true },
    cost_price: { type: Number, required: true, min: 0, default: 0 },
    sale_price: { type: Number, required: true, min: 0, default: 0 },
    stock_qty: { type: Number, required: true, min: 0, default: 0 },
    reorder_level: { type: Number, required: true, min: 0, default: 0 },
    status: { type: String, required: true, enum: ['active', 'inactive'], default: 'active', index: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = model('Product', productSchema);

