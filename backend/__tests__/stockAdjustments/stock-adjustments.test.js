const request = require('supertest');
const express = require('express');
const stockAdjustmentRoutes = require('../../routes/stockAdjustments');
const StockAdjustment = require('../../models/StockAdjustment');
const Stocktake = require('../../models/Stocktake');
const Product = require('../../models/Product');
const { createManagerUser, createManagerWithStore, getAuthHeader } = require('../fixtures/users');

const app = express();
app.use(express.json());
app.use('/api/stock-adjustments', stockAdjustmentRoutes);

describe('Stock Adjustment Routes', () => {
  let managerWithStore;

  beforeEach(async () => {
    await StockAdjustment.deleteMany({});
    await Stocktake.deleteMany({});
    await Product.deleteMany({});

    const managerResult = await createManagerWithStore();
    managerWithStore = managerResult;
  });

  // ==================== UC-49: View Adjustment History ====================
  describe('GET /api/stock-adjustments', () => {
    it('TC49-01: should list all adjustments', async () => {
      const stocktake = await Stocktake.create({
        storeId: managerWithStore.store._id,
        created_by: managerWithStore.manager._id,
        status: 'completed',
        items: [],
      });
      await StockAdjustment.create([
        { stocktake_id: stocktake._id, storeId: managerWithStore.store._id, created_by: managerWithStore.manager._id, status: 'approved', items: [] },
        { stocktake_id: stocktake._id, storeId: managerWithStore.store._id, created_by: managerWithStore.manager._id, status: 'pending', items: [] },
      ]);

      const res = await request(app)
        .get('/api/stock-adjustments')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.adjustments).toHaveLength(2);
    });

    it('TC49-02: should filter by status', async () => {
      const stocktake = await Stocktake.create({
        storeId: managerWithStore.store._id,
        created_by: managerWithStore.manager._id,
        status: 'completed',
        items: [],
      });
      await StockAdjustment.create([
        { stocktake_id: stocktake._id, storeId: managerWithStore.store._id, created_by: managerWithStore.manager._id, status: 'approved', items: [] },
        { stocktake_id: stocktake._id, storeId: managerWithStore.store._id, created_by: managerWithStore.manager._id, status: 'pending', items: [] },
      ]);

      const res = await request(app)
        .get('/api/stock-adjustments?status=approved')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.adjustments).toHaveLength(1);
      expect(res.body.adjustments[0].status).toBe('approved');
    });

    it('TC49-03: should support pagination', async () => {
      const stocktake = await Stocktake.create({
        storeId: managerWithStore.store._id,
        created_by: managerWithStore.manager._id,
        status: 'completed',
        items: [],
      });
      for (let i = 0; i < 5; i++) {
        await StockAdjustment.create({
          stocktake_id: stocktake._id,
          storeId: managerWithStore.store._id,
          created_by: managerWithStore.manager._id,
          status: 'pending',
          items: [],
        });
      }

      const res = await request(app)
        .get('/api/stock-adjustments?page=1&limit=2')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.adjustments).toHaveLength(2);
      expect(res.body.total).toBe(5);
      expect(res.body.totalPages).toBe(3);
    });

    it('TC49-04: should return empty array when no adjustments', async () => {
      const res = await request(app)
        .get('/api/stock-adjustments')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.adjustments).toHaveLength(0);
    });

    it('TC49-05: should return 401 without token', async () => {
      const res = await request(app).get('/api/stock-adjustments');
      expect(res.status).toBe(401);
    });

    it('TC49-06: should return 403 for manager without store', async () => {
      const managerNoStore = await createManagerUser();

      const res = await request(app)
        .get('/api/stock-adjustments')
        .set(getAuthHeader(managerNoStore));

      expect(res.status).toBe(403);
    });
  });

  // ==================== UC-47: Adjust Stock (via stocktake approval) ====================
  describe('GET /api/stock-adjustments/:id', () => {
    it('should get adjustment by id', async () => {
      const stocktake = await Stocktake.create({
        storeId: managerWithStore.store._id,
        created_by: managerWithStore.manager._id,
        status: 'completed',
        items: [],
      });
      const adjustment = await StockAdjustment.create({
        stocktake_id: stocktake._id,
        storeId: managerWithStore.store._id,
        created_by: managerWithStore.manager._id,
        status: 'approved',
        items: [],
      });

      const res = await request(app)
        .get(`/api/stock-adjustments/${adjustment._id}`)
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.adjustment).toBeDefined();
    });

    it('should return 404 for non-existent id', async () => {
      const fakeId = '000000000000000000000000';

      const res = await request(app)
        .get(`/api/stock-adjustments/${fakeId}`)
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Adjustment not found');
    });

    it('should return 400 for invalid id format', async () => {
      const res = await request(app)
        .get('/api/stock-adjustments/invalid-id')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Invalid adjustment id');
    });
  });

  // ==================== Revert Stock Adjustment ====================
  describe('POST /api/stock-adjustments/:id/revert', () => {
    it('should revert approved adjustment', async () => {
      const product = await Product.create({
        name: 'Test Product',
        sku: 'SKU-REVERT-001',
        storeId: managerWithStore.store._id,
        stock_qty: 100,
      });
      const stocktake = await Stocktake.create({
        storeId: managerWithStore.store._id,
        created_by: managerWithStore.manager._id,
        status: 'completed',
        items: [{ product_id: product._id, system_qty: 100, actual_qty: 95, variance: -5 }],
      });
      const adjustment = await StockAdjustment.create({
        stocktake_id: stocktake._id,
        storeId: managerWithStore.store._id,
        created_by: managerWithStore.manager._id,
        approved_by: managerWithStore.manager._id,
        status: 'approved',
        items: [{ product_id: product._id, adjusted_qty: -5 }],
      });

      const res = await request(app)
        .post(`/api/stock-adjustments/${adjustment._id}/revert`)
        .set(getAuthHeader(managerWithStore.manager))
        .send({ reason: 'Test revert' });

      expect(res.status).toBe(200);
      expect(res.body.adjustment.is_reverted).toBe(true);
    });

    it('should return 404 for non-existent adjustment', async () => {
      const fakeId = '000000000000000000000000';

      const res = await request(app)
        .post(`/api/stock-adjustments/${fakeId}/revert`)
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(404);
    });

    it('should return 400 for already reverted adjustment', async () => {
      const stocktake = await Stocktake.create({
        storeId: managerWithStore.store._id,
        created_by: managerWithStore.manager._id,
        status: 'completed',
        items: [],
      });
      const adjustment = await StockAdjustment.create({
        stocktake_id: stocktake._id,
        storeId: managerWithStore.store._id,
        created_by: managerWithStore.manager._id,
        status: 'approved',
        is_reverted: true,
        items: [],
      });

      const res = await request(app)
        .post(`/api/stock-adjustments/${adjustment._id}/revert`)
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Phiếu này đã được hoàn tác trước đó.');
    });

    it('should return 400 for invalid id format', async () => {
      const res = await request(app)
        .post('/api/stock-adjustments/invalid-id/revert')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(400);
    });

    it('should return 401 without token', async () => {
      const res = await request(app)
        .post('/api/stock-adjustments/000000000000000000000000/revert');

      expect(res.status).toBe(401);
    });
  });

  // ==================== Health Check ====================
  describe('GET /api/stock-adjustments/health', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/api/stock-adjustments/health');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
