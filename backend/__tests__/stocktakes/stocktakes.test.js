const mongoose = require('mongoose');
const request = require('supertest');
const express = require('express');
const stocktakeRoutes = require('../../routes/stocktakes');
const Product = require('../../models/Product');
const { createManagerWithStore, getAuthHeader } = require('../fixtures/users');
const { createProducts } = require('../fixtures/products');

const app = express();
app.use(express.json());
app.use('/api/stocktakes', stocktakeRoutes);

describe('Stocktakes Routes', () => {
  let manager;
  let store;
  let managerToken;

  beforeEach(async () => {
    const { manager: m, store: s } = await createManagerWithStore();
    manager = m;
    store = s;
    managerToken = getAuthHeader(manager).Authorization;
  });

  describe('GET /api/stocktakes', () => {
    it('should return empty list when no stocktakes', async () => {
      const res = await request(app)
        .get('/api/stocktakes')
        .set('Authorization', managerToken);

      expect(res.status).toBe(200);
      expect(res.body.stocktakes).toBeDefined();
    });

    it('should return 401 for unauthenticated request', async () => {
      const res = await request(app).get('/api/stocktakes');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/stocktakes', () => {
    it('should create new stocktake in draft status', async () => {
      const products = await createProducts(store._id, 3);
      const productIds = products.map(p => p._id.toString());

      const res = await request(app)
        .post('/api/stocktakes')
        .set('Authorization', managerToken)
        .send({ product_ids: productIds });

      expect(res.status).toBe(201);
      expect(res.body.stocktake).toBeDefined();
      expect(res.body.stocktake.status).toBe('draft');
      expect(res.body.stocktake.items.length).toBe(3);
    });

    it('should return 400 if product_ids is empty', async () => {
      const res = await request(app)
        .post('/api/stocktakes')
        .set('Authorization', managerToken)
        .send({ product_ids: [] });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/stocktakes/:id', () => {
    it('should update stocktake items', async () => {
      const products = await createProducts(store._id, 2);
      const productIds = products.map(p => p._id.toString());

      const createRes = await request(app)
        .post('/api/stocktakes')
        .set('Authorization', managerToken)
        .send({ product_ids: productIds });

      const stocktakeId = createRes.body.stocktake._id;

      const res = await request(app)
        .patch(`/api/stocktakes/${stocktakeId}`)
        .set('Authorization', managerToken)
        .send({
          items: [
            {
              product_id: productIds[0],
              actual_qty: 15,
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.stocktake.items[0].actual_qty).toBe(15);
    });

    it('should submit stocktake when status is submitted', async () => {
      const products = await createProducts(store._id, 2);
      const productIds = products.map(p => p._id.toString());

      const createRes = await request(app)
        .post('/api/stocktakes')
        .set('Authorization', managerToken)
        .send({ product_ids: productIds });

      const stocktakeId = createRes.body.stocktake._id;

      const res = await request(app)
        .patch(`/api/stocktakes/${stocktakeId}`)
        .set('Authorization', managerToken)
        .send({
          items: productIds.map(pid => ({
            product_id: pid,
            actual_qty: 10,
          })),
          status: 'submitted',
        });

      expect(res.status).toBe(200);
      expect(res.body.stocktake.status).toBe('submitted');
    });
  });

  describe('POST /api/stocktakes/:id/approve', () => {
    it('should approve stocktake and update product stock', async () => {
      const products = await createProducts(store._id, 2);
      const productIds = products.map(p => p._id.toString());
      const originalStock = products[0].stock_qty;

      const createRes = await request(app)
        .post('/api/stocktakes')
        .set('Authorization', managerToken)
        .send({ product_ids: productIds });

      const stocktakeId = createRes.body.stocktake._id;

      await request(app)
        .patch(`/api/stocktakes/${stocktakeId}`)
        .set('Authorization', managerToken)
        .send({
          items: productIds.map((pid, i) => ({
            product_id: pid,
            actual_qty: products[i].stock_qty + 5,
          })),
          status: 'submitted',
        });

      const res = await request(app)
        .post(`/api/stocktakes/${stocktakeId}/approve`)
        .set('Authorization', managerToken);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('duyệt');

      const updatedProduct = await Product.findById(products[0]._id);
      expect(updatedProduct.stock_qty).toBe(originalStock + 5);
    });

    it('should return 400 if stocktake not submitted', async () => {
      const products = await createProducts(store._id, 2);
      const productIds = products.map(p => p._id.toString());

      const createRes = await request(app)
        .post('/api/stocktakes')
        .set('Authorization', managerToken)
        .send({ product_ids: productIds });

      const stocktakeId = createRes.body.stocktake._id;

      const res = await request(app)
        .post(`/api/stocktakes/${stocktakeId}/approve`)
        .set('Authorization', managerToken);

      expect(res.status).toBe(400);
    });

    it('should require manager_note when live stock mismatch exceeds threshold', async () => {
      const products = await createProducts(store._id, 1);
      const productIds = products.map(p => p._id.toString());

      const createRes = await request(app)
        .post('/api/stocktakes')
        .set('Authorization', managerToken)
        .send({ product_ids: productIds });
      const stocktakeId = createRes.body.stocktake._id;

      await request(app)
        .patch(`/api/stocktakes/${stocktakeId}`)
        .set('Authorization', managerToken)
        .send({
          items: [{ product_id: productIds[0], actual_qty: products[0].stock_qty }],
          status: 'submitted',
        });

      await Product.findByIdAndUpdate(products[0]._id, { $inc: { stock_qty: -6 } });

      const noNoteRes = await request(app)
        .post(`/api/stocktakes/${stocktakeId}/approve`)
        .set('Authorization', managerToken)
        .send({ reason: '' });
      expect(noNoteRes.status).toBe(400);
      expect(noNoteRes.body.code).toBe('MANAGER_NOTE_REQUIRED_ON_LIVE_MISMATCH');

      const withNoteRes = await request(app)
        .post(`/api/stocktakes/${stocktakeId}/approve`)
        .set('Authorization', managerToken)
        .send({ manager_note: 'Đã xác nhận có bán hàng phát sinh trong khi kiểm kê' });
      expect(withNoteRes.status).toBe(200);
    });
  });

  describe('POST /api/stocktakes/:id/reject', () => {
    it('should reject stocktake with reason', async () => {
      const products = await createProducts(store._id, 2);
      const productIds = products.map(p => p._id.toString());

      const createRes = await request(app)
        .post('/api/stocktakes')
        .set('Authorization', managerToken)
        .send({ product_ids: productIds });

      const stocktakeId = createRes.body.stocktake._id;

      await request(app)
        .patch(`/api/stocktakes/${stocktakeId}`)
        .set('Authorization', managerToken)
        .send({
          items: productIds.map(pid => ({
            product_id: pid,
            actual_qty: 10,
          })),
          status: 'submitted',
        });

      const res = await request(app)
        .post(`/api/stocktakes/${stocktakeId}/reject`)
        .set('Authorization', managerToken)
        .send({ reason: 'Số lượng không chính xác' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('từ chối');
    });
  });
});
