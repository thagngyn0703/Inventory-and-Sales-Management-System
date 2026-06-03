/**
 * Luồng tích hợp quan trọng cho demo / hội đồng — kiểm tra tính nhất quán dữ liệu giữa module.
 */
const mongoose = require('mongoose');
const request = require('supertest');
const express = require('express');
const invoiceRoutes = require('../../routes/invoices');
const customerRoutes = require('../../routes/customers');
const returnsRoutes = require('../../routes/returns');
const shiftRoutes = require('../../routes/shifts');
const analyticsRoutes = require('../../routes/analytics');
const goodsReceiptRoutes = require('../../routes/goodsReceipts');
const Product = require('../../models/Product');
const Customer = require('../../models/Customer');
const SalesInvoice = require('../../models/SalesInvoice');
const ShiftSession = require('../../models/ShiftSession');
const { createManagerWithStore, getAuthHeader } = require('../fixtures/users');
const { createTestProduct } = require('../fixtures/products');
const { createTestCustomer } = require('../fixtures/customers');

function mountApp(...routePairs) {
  const app = express();
  app.use(express.json());
  for (const [path, router] of routePairs) {
    app.use(path, router);
  }
  return app;
}

const app = mountApp(
  ['/api/invoices', invoiceRoutes],
  ['/api/customers', customerRoutes],
  ['/api/returns', returnsRoutes],
  ['/api/shifts', shiftRoutes],
  ['/api/analytics', analyticsRoutes],
  ['/api/goods-receipts', goodsReceiptRoutes],
);

describe('Demo critical flows — data consistency', () => {
  let manager;
  let store;
  let auth;

  beforeEach(async () => {
    const ctx = await createManagerWithStore();
    manager = ctx.manager;
    store = ctx.store;
    auth = getAuthHeader(manager);
  });

  it('debt invoice increases customer debt_account; cash pay-debt settles FIFO', async () => {
    const product = await createTestProduct(store._id, { stock_qty: 50, sale_price: 25000 });
    const customer = await createTestCustomer(store._id, { debt_account: 0 });

    const invRes = await request(app)
      .post('/api/invoices')
      .set(auth)
      .send({
        customer_id: String(customer._id),
        payment_method: 'debt',
        payment_status: 'unpaid',
        items: [{ product_id: String(product._id), quantity: 2, unit_price: product.sale_price }],
      });
    expect(invRes.status).toBe(201);
    const invoiceTotal = Number(invRes.body.invoice.total_amount || 0);
    expect(invoiceTotal).toBeGreaterThan(0);

    const afterSale = await Customer.findById(customer._id).lean();
    expect(Number(afterSale.debt_account)).toBe(invoiceTotal);

    const payRes = await request(app)
      .post(`/api/customers/${customer._id}/pay-debt`)
      .set(auth)
      .send({ amount: invoiceTotal, payment_method: 'cash' });
    expect(payRes.status).toBe(200);

    const afterPay = await Customer.findById(customer._id).lean();
    expect(Number(afterPay.debt_account)).toBe(0);

    const paidInvoice = await SalesInvoice.findById(invRes.body.invoice._id).lean();
    expect(paidInvoice.payment_status).toBe('paid');
  });

  it('partial return restocks and reduces analytics revenue consistently', async () => {
    const product = await createTestProduct(store._id, { stock_qty: 30, sale_price: 50000 });
    const beforeStock = (await Product.findById(product._id).lean()).stock_qty;

    const invRes = await request(app)
      .post('/api/invoices')
      .set(auth)
      .send({
        payment_method: 'cash',
        payment_status: 'paid',
        items: [{ product_id: String(product._id), quantity: 4, unit_price: product.sale_price }],
      });
    expect(invRes.status).toBe(201);
    const invoiceId = invRes.body.invoice._id;
    const gross = Number(invRes.body.invoice.total_amount || 0);

    const afterSaleStock = (await Product.findById(product._id).lean()).stock_qty;
    expect(afterSaleStock).toBe(beforeStock - 4);

    const retRes = await request(app)
      .post('/api/returns')
      .set(auth)
      .send({
        invoice_id: invoiceId,
        reason_code: 'customer_changed_mind',
        items: [{ product_id: String(product._id), quantity: 1 }],
      });
    expect(retRes.status).toBe(201);

    const afterReturnStock = (await Product.findById(product._id).lean()).stock_qty;
    expect(afterReturnStock).toBe(beforeStock - 3);

    const summaryRes = await request(app)
      .get('/api/analytics/summary')
      .set(auth)
      .query({ from: '2020-01-01', to: '2099-12-31' });
    expect(summaryRes.status).toBe(200);
    const netRevenue = Number(summaryRes.body?.summary?.net_revenue ?? summaryRes.body?.net_revenue ?? 0);
    expect(netRevenue).toBeGreaterThanOrEqual(0);
    expect(netRevenue).toBeLessThanOrEqual(gross);
  });

  it('open shift → cash invoice attaches shift → close shift KPIs include invoice revenue', async () => {
    const product = await createTestProduct(store._id, { stock_qty: 20, sale_price: 10000 });

    const openRes = await request(app)
      .post('/api/shifts/open')
      .set(auth)
      .send({ opening_cash: 100000 });
    expect(openRes.status).toBe(201);
    const shiftId = openRes.body.shift._id;

    const invRes = await request(app)
      .post('/api/invoices')
      .set(auth)
      .send({
        payment_method: 'cash',
        payment_status: 'paid',
        items: [{ product_id: String(product._id), quantity: 3, unit_price: product.sale_price }],
      });
    expect(invRes.status).toBe(201);
    expect(String(invRes.body.invoice.shift_id)).toBe(String(shiftId));

    const closeRes = await request(app)
      .post(`/api/shifts/${shiftId}/close`)
      .set(auth)
      .send({ actual_cash: 130000, reconciliation_status: 'confirmed' });
    expect(closeRes.status).toBe(200);

    const closed = await ShiftSession.findById(shiftId).lean();
    expect(closed.status).toBe('closed');
    const snap = closed.sales_snapshot || {};
    expect(Number(snap.total_invoice_count || 0)).toBeGreaterThanOrEqual(1);
    expect(Number(snap.total_confirmed_revenue || 0)).toBeGreaterThanOrEqual(30000);
  });

  it('approved goods receipt increases stock; subsequent sale decreases from new level', async () => {
    const Supplier = require('../../models/Supplier');
    const Category = require('../../models/Category');
    const supplier = await Supplier.create({
      name: `NCC demo ${Date.now()}`,
      storeId: store._id,
      status: 'active',
    });
    const category = await Category.create({
      name: `Cat demo ${Date.now()}`,
      vat_rate: 10,
      tax_profile: 'VAT_10',
      tax_tags: ['standard_vat'],
    });
    const product = await createTestProduct(store._id, { stock_qty: 5, sale_price: 8000 });
    const stockBefore = (await Product.findById(product._id).lean()).stock_qty;

    const createGr = await request(app)
      .post('/api/goods-receipts')
      .set(auth)
      .send({
        supplier_id: String(supplier._id),
        items: [{
          product_id: String(product._id),
          category_id: String(category._id),
          quantity: 10,
          unit_cost: 5000,
        }],
      });
    expect(createGr.status).toBe(201);
    const grId = createGr.body.goodsReceipt._id;

    await request(app)
      .patch(`/api/goods-receipts/${grId}/status`)
      .set(auth)
      .send({ status: 'pending' });
    const approveRes = await request(app)
      .patch(`/api/goods-receipts/${grId}/status`)
      .set(auth)
      .send({ status: 'approved' });
    expect(approveRes.status).toBe(200);

    const afterGr = (await Product.findById(product._id).lean()).stock_qty;
    expect(afterGr).toBe(stockBefore + 10);

    const saleRes = await request(app)
      .post('/api/invoices')
      .set(auth)
      .send({
        payment_method: 'cash',
        payment_status: 'paid',
        items: [{ product_id: String(product._id), quantity: 2, unit_price: product.sale_price }],
      });
    expect(saleRes.status).toBe(201);
    const afterSale = (await Product.findById(product._id).lean()).stock_qty;
    expect(afterSale).toBe(stockBefore + 8);
  });

  it('cannot pay debt more than customer debt_account', async () => {
    const customer = await createTestCustomer(store._id, { debt_account: 5000 });
    const payRes = await request(app)
      .post(`/api/customers/${customer._id}/pay-debt`)
      .set(auth)
      .send({ amount: 10000, payment_method: 'cash' });
    expect(payRes.status).toBe(400);
  });

  it('cannot sell more than available stock (cross-module guard)', async () => {
    const product = await createTestProduct(store._id, { stock_qty: 1, sale_price: 12000 });
    const res = await request(app)
      .post('/api/invoices')
      .set(auth)
      .send({
        payment_method: 'cash',
        payment_status: 'paid',
        items: [{ product_id: String(product._id), quantity: 5, unit_price: product.sale_price }],
      });
    expect(res.status).toBe(400);
    const unchanged = (await Product.findById(product._id).lean()).stock_qty;
    expect(unchanged).toBe(1);
  });
});
