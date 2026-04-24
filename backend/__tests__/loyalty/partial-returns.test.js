const request = require('supertest');
const express = require('express');
const returnsRoutes = require('../../routes/returns');
const SalesInvoice = require('../../models/SalesInvoice');
const Customer = require('../../models/Customer');
const CustomerLoyaltyTransaction = require('../../models/CustomerLoyaltyTransaction');
const { createManagerWithStore, getAuthHeader } = require('../fixtures/users');
const { createTestProduct } = require('../fixtures/products');

const app = express();
app.use(express.json());
app.use('/api/returns', returnsRoutes);

describe('Loyalty partial returns', () => {
  it('should reverse earned points proportionally on partial return', async () => {
    const managerWithStore = await createManagerWithStore();
    const auth = getAuthHeader(managerWithStore.manager);
    const customer = await Customer.create({
      full_name: 'Khach loyalty',
      phone: '0901111222',
      store_id: managerWithStore.store._id,
      loyalty_points: 5,
    });
    const productA = await createTestProduct(managerWithStore.store._id, {
      sale_price: 10000,
      stock_qty: 20,
    });
    const productB = await createTestProduct(managerWithStore.store._id, {
      sale_price: 10000,
      stock_qty: 20,
      sku: 'SKU-B-LOYALTY',
    });

    const invoice = await SalesInvoice.create({
      store_id: managerWithStore.store._id,
      customer_id: customer._id,
      recipient_name: customer.full_name,
      created_by: managerWithStore.manager._id,
      status: 'confirmed',
      payment_method: 'cash',
      payment_status: 'paid',
      items: [
        { line_id: 'L1', product_id: productA._id, quantity: 5, unit_price: 10000, discount: 0, line_total: 50000 },
        { line_id: 'L2', product_id: productB._id, quantity: 5, unit_price: 10000, discount: 0, line_total: 50000 },
      ],
      total_amount: 100000,
      loyalty_eligible_amount: 100000,
      loyalty_earned_points: 5,
      loyalty_earned_settled: true,
      loyalty_settings_snapshot: {
        enabled: true,
        earn: { spend_amount_vnd: 20000, points: 1, min_invoice_amount_vnd: 20000 },
        redeem: { point_value_vnd: 500, min_points: 10, max_percent_per_invoice: 50, allow_with_promotion: false },
      },
    });

    const res = await request(app)
      .post('/api/returns')
      .set(auth)
      .send({
        invoice_id: String(invoice._id),
        reason_code: 'customer_changed_mind',
        items: [{ product_id: String(productA._id), quantity: 1 }],
      });

    expect(res.status).toBe(201);
    const updatedInvoice = await SalesInvoice.findById(invoice._id).lean();
    expect(updatedInvoice.loyalty_reversed_points).toBe(1);
    const reversalTxn = await CustomerLoyaltyTransaction.findOne({
      reference_model: 'SalesReturn',
      type: 'REVERSAL',
      customer_id: customer._id,
    }).lean();
    expect(reversalTxn).toBeTruthy();
    expect(reversalTxn.points).toBe(-1);
  });

  it('should refund used points proportionally when returning 50% of order', async () => {
    const managerWithStore = await createManagerWithStore();
    const auth = getAuthHeader(managerWithStore.manager);
    const customer = await Customer.create({
      full_name: 'Khach redeem',
      phone: '0902222333',
      store_id: managerWithStore.store._id,
      loyalty_points: 0,
    });
    const product = await createTestProduct(managerWithStore.store._id, {
      sale_price: 10000,
      stock_qty: 20,
    });

    const invoice = await SalesInvoice.create({
      store_id: managerWithStore.store._id,
      customer_id: customer._id,
      recipient_name: customer.full_name,
      created_by: managerWithStore.manager._id,
      status: 'confirmed',
      payment_method: 'cash',
      payment_status: 'paid',
      items: [{ line_id: 'L1', product_id: product._id, quantity: 10, unit_price: 10000, discount: 0, line_total: 100000 }],
      total_amount: 100000,
      loyalty_redeem_points: 10,
      loyalty_redeem_value: 5000,
      loyalty_settings_snapshot: {
        enabled: true,
        earn: { spend_amount_vnd: 20000, points: 1, min_invoice_amount_vnd: 20000 },
        redeem: { point_value_vnd: 500, min_points: 10, max_percent_per_invoice: 50, allow_with_promotion: false },
      },
    });

    const res = await request(app)
      .post('/api/returns')
      .set(auth)
      .send({
        invoice_id: String(invoice._id),
        reason_code: 'defective',
        items: [{ product_id: String(product._id), quantity: 5 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.invoice_returned_totals.returned_total_amount).toBe(50000);
    const updatedInvoice = await SalesInvoice.findById(invoice._id).lean();
    expect(updatedInvoice.loyalty_refunded_redeem_points).toBe(5);
    const refundTxn = await CustomerLoyaltyTransaction.findOne({
      reference_model: 'SalesReturn',
      type: 'REFUND',
      customer_id: customer._id,
    }).lean();
    expect(refundTxn).toBeTruthy();
    expect(refundTxn.points).toBe(5);
  });
});
