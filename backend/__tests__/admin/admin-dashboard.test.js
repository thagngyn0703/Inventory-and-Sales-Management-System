const request = require('supertest');
const express = require('express');
const adminDashboardRoutes = require('../../routes/adminDashboard');
const SalesInvoice = require('../../models/SalesInvoice');
const SalesReturn = require('../../models/SalesReturn');
const { createAdminUser, createManagerWithStore, getAuthHeader } = require('../fixtures/users');
const { createTestProduct } = require('../fixtures/products');

const app = express();
app.use(express.json());
app.use('/api/admin/dashboard', adminDashboardRoutes);

describe('Admin Dashboard Routes', () => {
  it('should preview returns backfill impact for admin', async () => {
    const admin = await createAdminUser();
    const managerWithStore = await createManagerWithStore();
    const product = await createTestProduct(managerWithStore.store._id, {
      sale_price: 100000,
      stock_qty: 20,
    });

    const invoice = await SalesInvoice.create({
      store_id: managerWithStore.store._id,
      recipient_name: 'Khach test',
      created_by: managerWithStore.manager._id,
      status: 'confirmed',
      invoice_at: new Date(),
      payment_method: 'cash',
      payment_status: 'paid',
      items: [
        {
          line_id: 'LINE-ADMIN-PREVIEW',
          product_id: product._id,
          quantity: 1,
          unit_price: 100000,
          discount: 0,
          line_total: 100000,
        },
      ],
      total_amount: 100000,
      subtotal_amount: 90909,
      tax_amount: 9091,
      tax_rate_snapshot: 10,
    });

    await SalesReturn.create({
      store_id: managerWithStore.store._id,
      invoice_id: invoice._id,
      created_by: managerWithStore.manager._id,
      status: 'approved',
      return_at: new Date(),
      items: [
        {
          product_id: product._id,
          quantity: 1,
          unit_price: 100000,
          disposition: 'restock',
        },
      ],
      total_amount: 0, // legacy broken
      subtotal_amount: 0,
      tax_amount: 0,
      tax_rate_snapshot: 0,
    });

    const res = await request(app)
      .get('/api/admin/dashboard/returns-backfill-preview?limit=10')
      .set(getAuthHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.impacted_returns).toBeGreaterThanOrEqual(1);
    expect(res.body.summary.issues.missing_total_amount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.sample_returns)).toBe(true);
    expect(res.body.sample_returns.length).toBeGreaterThanOrEqual(1);
  });
});

