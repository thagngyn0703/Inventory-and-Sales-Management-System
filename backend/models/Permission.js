const { Schema, model } = require('mongoose');

const permissionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    module: { type: String, required: true, trim: true, index: true },
    action: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

module.exports = model('Permission', permissionSchema);

