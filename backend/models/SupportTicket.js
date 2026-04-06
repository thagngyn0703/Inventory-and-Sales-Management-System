const { Schema, model } = require('mongoose');

const replySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['admin', 'manager'], required: true },
    body: { type: String, required: true, trim: true, maxlength: 10000 },
  },
  { _id: true, timestamps: { createdAt: true, updatedAt: false } }
);

const supportTicketSchema = new Schema(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 10000 },
    status: {
      type: String,
      enum: ['open', 'answered', 'closed'],
      default: 'open',
      index: true,
    },
    replies: [replySchema],
  },
  { timestamps: true }
);

module.exports = model('SupportTicket', supportTicketSchema);
