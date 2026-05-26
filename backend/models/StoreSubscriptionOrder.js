const { Schema, model } = require('mongoose');

const storeSubscriptionOrderSchema = new Schema(
  {
    store_id: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    manager_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    plan_code: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    plan_name: {
      type: String,
      required: true,
      trim: true,
    },
    duration_months: {
      type: Number,
      required: true,
      min: 1,
    },
    amount_vnd: {
      type: Number,
      required: true,
      min: 0,
    },
    payment_ref: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'expired', 'cancelled'],
      default: 'pending',
      index: true,
    },
    payment_provider: {
      type: String,
      default: 'sepay',
      trim: true,
    },
    provider_txn_id: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    payment_content: {
      type: String,
      default: '',
      trim: true,
    },
    paid_at: {
      type: Date,
      default: null,
    },
    expires_at: {
      type: Date,
      required: true,
      index: true,
    },
    raw_payload: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = model('StoreSubscriptionOrder', storeSubscriptionOrderSchema);
