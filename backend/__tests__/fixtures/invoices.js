const mongoose = require('mongoose');
const SalesInvoice = require('../../models/SalesInvoice');
const { createTestProduct } = require('./products');

async function createTestInvoice(storeId, createdBy, overrides = {}) {
  const defaultData = {
    store_id: storeId,
    customer_id: null,
    recipient_name: 'Khách lẻ',
    created_by: createdBy,
    status: 'confirmed',
    invoice_at: new Date(),
    payment_method: 'cash',
    payment_status: 'unpaid',
    items: [],
    total_amount: 0,
    paid_amount: 0,
    previous_debt_paid: 0,
  };
  return SalesInvoice.create({ ...defaultData, ...overrides });
}

async function createInvoiceWithItems(storeId, createdBy, products, overrides = {}) {
  const items = products.map((product, index) => {
    const quantity = 2;
    const unit_price = product.sale_price;
    const cost_price = product.cost_price;
    const discount = 0;
    const line_total = (unit_price - discount) * quantity;
    const line_profit = (unit_price - cost_price - discount) * quantity;
    return {
      line_id: `LINE-${index + 1}`,
      product_id: product._id,
      quantity,
      unit_price,
      cost_price,
      discount,
      line_total,
      line_profit,
    };
  });

  const total_amount = items.reduce((sum, item) => sum + item.line_total, 0);

  return createTestInvoice(storeId, createdBy, {
    items,
    total_amount,
    ...overrides,
  });
}

async function createPaidInvoice(storeId, createdBy, overrides = {}) {
  return createTestInvoice(storeId, createdBy, {
    payment_status: 'paid',
    paid_amount: overrides.total_amount || 100000,
    paid_at: new Date(),
    ...overrides,
  });
}

async function createPartialPaidInvoice(storeId, createdBy, totalAmount = 100000, paidAmount = 50000, overrides = {}) {
  return createTestInvoice(storeId, createdBy, {
    payment_status: 'partial',
    total_amount: totalAmount,
    paid_amount: paidAmount,
    ...overrides,
  });
}

async function createDebtInvoice(storeId, createdBy, customerId, overrides = {}) {
  return createTestInvoice(storeId, createdBy, {
    customer_id: customerId,
    payment_method: 'debt',
    payment_status: 'unpaid',
    ...overrides,
  });
}

module.exports = {
  createTestInvoice,
  createInvoiceWithItems,
  createPaidInvoice,
  createPartialPaidInvoice,
  createDebtInvoice,
};
