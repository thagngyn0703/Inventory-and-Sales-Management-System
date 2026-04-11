const GoodsReceipt = require('../../models/GoodsReceipt');

async function createTestGoodsReceipt(overrides = {}) {
  const defaultData = {
    status: 'draft',
    received_at: new Date(),
    items: [],
    total_amount: 0,
  };
  return GoodsReceipt.create({ ...defaultData, ...overrides });
}

async function createDraftReceiptWithItems({ storeId, supplierId, receivedBy, items = [] }) {
  const total = items.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_cost), 0);
  return GoodsReceipt.create({
    supplier_id: supplierId,
    storeId,
    received_by: receivedBy,
    status: 'draft',
    items,
    total_amount: total,
    received_at: new Date(),
  });
}

module.exports = {
  createTestGoodsReceipt,
  createDraftReceiptWithItems,
};
