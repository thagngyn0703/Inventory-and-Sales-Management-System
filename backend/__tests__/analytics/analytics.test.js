const request = require('supertest');
const express = require('express');
const analyticsRoutes = require('../../routes/analytics');
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
});
