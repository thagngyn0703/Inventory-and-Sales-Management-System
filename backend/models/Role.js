const { Schema, model } = require('mongoose');

const roleSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    description: { type: String, default: '', trim: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    permissions: [{ type: String, trim: true }],
    isSystem: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

module.exports = model('Role', roleSchema);

