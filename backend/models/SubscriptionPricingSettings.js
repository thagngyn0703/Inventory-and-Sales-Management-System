const { Schema, model } = require('mongoose');

/**
 * Một bản ghi cấu hình giá gói thuê SaaS (singleton_key = 'default').
 * Admin chỉnh sửa qua PUT /api/subscriptions/admin/plan-prices.
 */
const subscriptionPricingSettingsSchema = new Schema(
  {
    singleton_key: {
      type: String,
      default: 'default',
      unique: true,
      index: true,
      trim: true,
    },
    monthly_price_vnd: {
      type: Number,
      required: true,
      default: 100000,
      min: 0,
    },
    yearly_price_vnd: {
      type: Number,
      required: true,
      default: 1100000,
      min: 0,
    },
    updated_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = model('SubscriptionPricingSettings', subscriptionPricingSettingsSchema);
