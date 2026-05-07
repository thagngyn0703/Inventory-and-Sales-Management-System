const request = require('supertest');
const express = require('express');
const returnsRoutes = require('../../routes/returns');
const SalesInvoice = require('../../models/SalesInvoice');
const { computeReturnTaxBreakdown } = require('../../routes/returns');
const { createManagerWithStore, getAuthHeader } = require('../fixtures/users');
const { createTestProduct } = require('../fixtures/products');

const app = express();
app.use(express.json());
app.use('/api/returns', returnsRoutes);

describe('Returns VAT helper', () => {
  it('should snapshot return subtotal/tax from invoice tax ratio', () => {
    const invoice = {
      total_amount: 110,
      subtotal_amount: 100,
      tax_amount: 10,
      tax_rate_snapshot: 10,
    };
    const result = computeReturnTaxBreakdown(110, invoice);
    expect(result.total_amount).toBe(110);
    expect(result.subtotal_amount).toBe(100);
    expect(result.tax_amount).toBe(10);
    expect(result.tax_rate_snapshot).toBe(10);
  });

  it('should fallback to gross as subtotal when invoice has no tax snapshot', () => {
    const invoice = {
      total_amount: 0,
      subtotal_amount: undefined,
      tax_rate_snapshot: 0,
    };
    const result = computeReturnTaxBreakdown(99000, invoice);
    expect(result.total_amount).toBe(99000);
    expect(result.subtotal_amount).toBe(99000);
    expect(result.tax_amount).toBe(0);
    expect(result.tax_rate_snapshot).toBe(0);
  });

  it('should lock to remaining subtotal/tax on final partial return', () => {
    const invoice = {
      total_amount: 110,
      subtotal_amount: 100,
      tax_amount: 10,
      tax_rate_snapshot: 10,
    };
    const result = computeReturnTaxBreakdown(55, invoice, {
      gross: 55,
      subtotal: 50,
      tax: 5,
    });
    expect(result.total_amount).toBe(55);
    expect(result.subtotal_amount).toBe(50);
    expect(result.tax_amount).toBe(5);
  });

  it('should always use original invoice tax snapshot even after policy changes', () => {
    const invoice = {
      total_amount: 1080000,
      subtotal_amount: 1000000,
      tax_amount: 80000, // snapshot from discounted VAT period
      tax_rate_snapshot: 8,
    };
    const result = computeReturnTaxBreakdown(540000, invoice);
    expect(result.total_amount).toBe(540000);
    expect(result.subtotal_amount).toBe(500000);
    expect(result.tax_amount).toBe(40000);
    expect(result.tax_rate_snapshot).toBe(8);
  });
});

describe('Returns API integration', () => {
  let managerWithStore;
  let product;
  let invoice;

  beforeEach(async () => {
    managerWithStore = await createManagerWithStore();
    product = await createTestProduct(managerWithStore.store._id, {
      sale_price: 100000,
      stock_qty: 20,
    });
    invoice = await SalesInvoice.create({
      store_id: managerWithStore.store._id,
      recipient_name: 'Khach test',
      created_by: managerWithStore.manager._id,
      status: 'confirmed',
      invoice_at: new Date(),
      payment_method: 'cash',
      payment_status: 'paid',
      items: [
        {
          line_id: 'LINE-1',
          product_id: product._id,
          quantity: 10,
          unit_price: 100000,
          discount: 0,
          line_total: 1000000,
        },
      ],
      total_amount: 1000000,
      subtotal_amount: 909091,
      tax_amount: 90909,
      tax_rate_snapshot: 10,
    });
  });

  it('should keep invoice confirmed after first partial return and cancel on final return', async () => {
    const auth = getAuthHeader(managerWithStore.manager);

    const res1 = await request(app)
      .post('/api/returns')
      .set(auth)
      .send({
        invoice_id: String(invoice._id),
        reason_code: 'customer_changed_mind',
        reason: 'Tra mot phan',
        items: [{ product_id: String(product._id), quantity: 3 }],
      });

    expect(res1.status).toBe(201);
    expect(res1.body.salesReturn.total_amount).toBe(300000);

    let updatedInvoice = await SalesInvoice.findById(invoice._id).lean();
    expect(updatedInvoice.status).toBe('confirmed');
    expect(updatedInvoice.returned_total_amount).toBe(300000);

    const res2 = await request(app)
      .post('/api/returns')
      .set(auth)
      .send({
        invoice_id: String(invoice._id),
        reason_code: 'defective',
        reason: 'Tra phan con lai',
        items: [{ product_id: String(product._id), quantity: 7 }],
      });

    expect(res2.status).toBe(201);
    expect(res2.body.salesReturn.total_amount).toBe(700000);

    updatedInvoice = await SalesInvoice.findById(invoice._id).lean();
    expect(updatedInvoice.status).toBe('cancelled');
    expect(updatedInvoice.returned_total_amount).toBe(1000000);
    expect(updatedInvoice.returned_subtotal_amount).toBe(909091);
    expect(updatedInvoice.returned_tax_amount).toBe(90909);
  });

  it('should reject return quantity exceeding remaining quantity', async () => {
    const auth = getAuthHeader(managerWithStore.manager);
    await request(app)
      .post('/api/returns')
      .set(auth)
      .send({
        invoice_id: String(invoice._id),
        reason_code: 'other',
        items: [{ product_id: String(product._id), quantity: 9 }],
      });

    const res = await request(app)
      .post('/api/returns')
      .set(auth)
      .send({
        invoice_id: String(invoice._id),
        reason_code: 'other',
        items: [{ product_id: String(product._id), quantity: 2 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('vượt quá số lượng còn có thể trả');
  });

  it('should expose return reasons catalog endpoint', async () => {
    const auth = getAuthHeader(managerWithStore.manager);
    const res = await request(app)
      .get('/api/returns/reasons')
      .set(auth);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.reasons)).toBe(true);
    expect(res.body.reasons.some((r) => r.code === 'defective')).toBe(true);
  });

  it('should reject invalid reason_code', async () => {
    const auth = getAuthHeader(managerWithStore.manager);
    const res = await request(app)
      .post('/api/returns')
      .set(auth)
      .send({
        invoice_id: String(invoice._id),
        reason_code: 'invalid_code',
        items: [{ product_id: String(product._id), quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('reason_code không hợp lệ');
  });
});
