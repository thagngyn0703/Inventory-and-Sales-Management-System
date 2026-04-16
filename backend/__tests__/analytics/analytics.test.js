const request = require('supertest');
const express = require('express');
const analyticsRoutes = require('../../routes/analytics');
const Product = require('../../models/Product');
const SalesInvoice = require('../../models/SalesInvoice');
const SalesReturn = require('../../models/SalesReturn');
const { createManagerUser, createManagerWithStore, getAuthHeader } = require('../fixtures/users');

const app = express();
app.use(express.json());
app.use('/api/analytics', analyticsRoutes);

describe('Analytics Routes', () => {
  let managerWithStore;

  beforeEach(async () => {
    const managerResult = await createManagerWithStore();
    managerWithStore = managerResult;
  });

  // ==================== UC-50: Inventory Snapshot ====================
  describe('GET /api/analytics/inventory-snapshot', () => {
    it('TC50-01: should return inventory snapshot', async () => {
      const res = await request(app)
        .get('/api/analytics/inventory-snapshot')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('total_sku');
      expect(res.body).toHaveProperty('total_value');
      expect(res.body).toHaveProperty('out_of_stock_count');
      expect(res.body).toHaveProperty('low_stock_count');
    });

    it('TC50-02: should return 401 without token', async () => {
      const res = await request(app).get('/api/analytics/inventory-snapshot');
      expect(res.status).toBe(401);
    });

    it('TC50-03: should return 403 for manager without store', async () => {
      const managerNoStore = await createManagerUser();

      const res = await request(app)
        .get('/api/analytics/inventory-snapshot')
        .set(getAuthHeader(managerNoStore));

      expect(res.status).toBe(403);
    });
  });

  // ==================== UC-52/UC-53: Summary Report ====================
  describe('GET /api/analytics/summary', () => {
    it('TC52-01: should return summary report', async () => {
      const res = await request(app)
        .get('/api/analytics/summary')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('period');
      expect(res.body).toHaveProperty('revenue');
      expect(res.body).toHaveProperty('order_count');
    });

    it('TC52-02: should accept date range parameters', async () => {
      const res = await request(app)
        .get('/api/analytics/summary?from=2025-01-01&to=2025-01-31')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.period).toBeDefined();
    });

    it('TC52-03: should return 401 without token', async () => {
      const res = await request(app).get('/api/analytics/summary');
      expect(res.status).toBe(401);
    });

    it('TC52-04: should return 403 for manager without store', async () => {
      const managerNoStore = await createManagerUser();

      const res = await request(app)
        .get('/api/analytics/summary')
        .set(getAuthHeader(managerNoStore));

      expect(res.status).toBe(403);
    });

    it('TC52-05: should calculate gross profit from net revenue (excluding VAT)', async () => {
      const product = await Product.create({
        name: 'SP test VAT',
        sku: `SKU-VAT-${Date.now()}`,
        category_id: null,
        supplier_id: null,
        storeId: managerWithStore.store._id,
        cost_price: 70,
        sale_price: 110,
        stock_qty: 10,
        reorder_level: 1,
        status: 'active',
      });

      await SalesInvoice.create({
        store_id: managerWithStore.store._id,
        recipient_name: 'Khach test',
        created_by: managerWithStore.manager._id,
        status: 'confirmed',
        invoice_at: new Date(),
        payment_method: 'cash',
        payment_status: 'paid',
        items: [
          {
            line_id: 'LINE-VAT-1',
            product_id: product._id,
            quantity: 1,
            unit_price: 110,
            cost_price: 70,
            discount: 0,
            line_total: 110, // Gross line total
            line_profit: 40, // Legacy value, analytics should not trust this
          },
        ],
        total_amount: 110,
        subtotal_amount: 100, // Net revenue
        tax_amount: 10,
        tax_rate_snapshot: 10,
      });

      const res = await request(app)
        .get('/api/analytics/summary')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.revenue).toBe(110);
      expect(res.body.revenue_net).toBe(100);
      expect(res.body.total_vat_collected).toBe(10);
      // Gross profit must be based on net (100) - cost (70) = 30, not 40
      expect(res.body.gross_profit).toBe(30);
    });

    it('TC52-06: should subtract approved returns from revenue, vat and gross profit', async () => {
      const product = await Product.create({
        name: 'SP return VAT',
        sku: `SKU-RET-${Date.now()}`,
        category_id: null,
        supplier_id: null,
        storeId: managerWithStore.store._id,
        cost_price: 70,
        sale_price: 110,
        stock_qty: 10,
        reorder_level: 1,
        status: 'active',
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
            line_id: 'LINE-RET-1',
            product_id: product._id,
            quantity: 1,
            unit_price: 110,
            cost_price: 70,
            discount: 0,
            line_total: 110,
            line_profit: 40,
          },
        ],
        total_amount: 110,
        subtotal_amount: 100,
        tax_amount: 10,
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
            unit_price: 110,
            disposition: 'restock',
          },
        ],
        total_amount: 110,
        subtotal_amount: 100,
        tax_amount: 10,
        tax_rate_snapshot: 10,
      });

      const res = await request(app)
        .get('/api/analytics/summary')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.revenue).toBe(0);
      expect(res.body.revenue_net).toBe(0);
      expect(res.body.total_vat_collected).toBe(0);
      expect(res.body.gross_profit).toBe(0);
    });
  });

  // ==================== Revenue Chart ====================
  describe('GET /api/analytics/revenue-chart', () => {
    it('should return revenue chart data for 7d', async () => {
      const res = await request(app)
        .get('/api/analytics/revenue-chart?period=7d')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('period', '7d');
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return revenue chart data for 30d', async () => {
      const res = await request(app)
        .get('/api/analytics/revenue-chart?period=30d')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.period).toBe('30d');
    });

    it('should return revenue chart data for 3m', async () => {
      const res = await request(app)
        .get('/api/analytics/revenue-chart?period=3m')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.period).toBe('3m');
    });

    it('should return revenue chart data for 6m', async () => {
      const res = await request(app)
        .get('/api/analytics/revenue-chart?period=6m')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.period).toBe('6m');
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/analytics/revenue-chart?period=7d');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/analytics/return-reasons', () => {
    it('should return grouped return reasons and return_rate_by_revenue', async () => {
      const product = await Product.create({
        name: 'SP return reasons',
        sku: `SKU-RSN-${Date.now()}`,
        category_id: null,
        supplier_id: null,
        storeId: managerWithStore.store._id,
        cost_price: 70,
        sale_price: 110,
        stock_qty: 10,
        reorder_level: 1,
        status: 'active',
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
            line_id: 'LINE-RSN-1',
            product_id: product._id,
            quantity: 1,
            unit_price: 110,
            cost_price: 70,
            discount: 0,
            line_total: 110,
            line_profit: 40,
          },
        ],
        total_amount: 110,
        subtotal_amount: 100,
        tax_amount: 10,
        tax_rate_snapshot: 10,
      });

      await SalesReturn.create({
        store_id: managerWithStore.store._id,
        invoice_id: invoice._id,
        created_by: managerWithStore.manager._id,
        status: 'approved',
        return_at: new Date(),
        reason_code: 'defective',
        reason: 'Loi NSX',
        items: [
          {
            product_id: product._id,
            quantity: 1,
            unit_price: 110,
            disposition: 'restock',
          },
        ],
        total_amount: 110,
        subtotal_amount: 100,
        tax_amount: 10,
        tax_rate_snapshot: 10,
      });

      const res = await request(app)
        .get('/api/analytics/return-reasons')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.total_return_amount).toBe(110);
      expect(res.body.return_rate_by_revenue).toBe(100);
      expect(res.body.data.some((r) => r.reason_code === 'defective')).toBe(true);
    });
  });

  // ==================== Top Products ====================
  describe('GET /api/analytics/top-products', () => {
    it('should return top products', async () => {
      const res = await request(app)
        .get('/api/analytics/top-products')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('period');
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should accept limit parameter', async () => {
      const res = await request(app)
        .get('/api/analytics/top-products?limit=5')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
    });

    it('should accept sort parameter', async () => {
      const res = await request(app)
        .get('/api/analytics/top-products?sort=profit')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.sort).toBe('profit');
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/analytics/top-products');
      expect(res.status).toBe(401);
    });
  });

  // ==================== Incoming Frequency ====================
  describe('GET /api/analytics/incoming-frequency', () => {
    it('should return incoming frequency report', async () => {
      const res = await request(app)
        .get('/api/analytics/incoming-frequency')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('year');
      expect(res.body).toHaveProperty('month');
      expect(res.body).toHaveProperty('data');
    });

    it('should accept year and month parameters', async () => {
      const res = await request(app)
        .get('/api/analytics/incoming-frequency?year=2025&month=3')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.year).toBe(2025);
      expect(res.body.month).toBe(3);
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/analytics/incoming-frequency');
      expect(res.status).toBe(401);
    });
  });

  // ==================== Price Change Impact ====================
  describe('GET /api/analytics/price-change-impact', () => {
    it('should return price change impact report', async () => {
      const res = await request(app)
        .get('/api/analytics/price-change-impact')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('period');
      expect(res.body).toHaveProperty('products');
      expect(res.body).toHaveProperty('events');
      expect(res.body).toHaveProperty('summary');
    });

    it('should accept date range parameters', async () => {
      const res = await request(app)
        .get('/api/analytics/price-change-impact?from=2025-01-01&to=2025-01-31')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/analytics/price-change-impact');
      expect(res.status).toBe(401);
    });
  });

  // ==================== Loyalty Analytics ====================
  describe('GET /api/analytics/loyalty', () => {
    it('should return loyalty dashboard payload', async () => {
      const res = await request(app)
        .get('/api/analytics/loyalty')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('period');
      expect(res.body).toHaveProperty('liability_points');
      expect(res.body).toHaveProperty('monthly');
      expect(Array.isArray(res.body.monthly)).toBe(true);
    });

    it('should export loyalty CSV', async () => {
      const res = await request(app)
        .get('/api/analytics/loyalty/export')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(String(res.text || '')).toContain('Metric,Value');
      expect(String(res.text || '')).toContain('Month,Earn Points,Redeem Points,Expire Points');
    });
  });
});
