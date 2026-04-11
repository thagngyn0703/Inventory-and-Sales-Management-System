const mongoose = require('mongoose');
const request = require('supertest');
const express = require('express');
const productRoutes = require('../../routes/products');
const Product = require('../../models/Product');
const { createManagerWithStore, createAdminUser, getAuthHeader } = require('../fixtures/users');
const { createTestProduct, createProducts } = require('../fixtures/products');

const app = express();
app.use(express.json());
app.use('/api/products', productRoutes);

describe('Products Routes', () => {
  let manager;
  let store;
  let admin;
  let managerToken;
  let adminToken;

  beforeEach(async () => {
    const { manager: m, store: s } = await createManagerWithStore();
    manager = m;
    store = s;
    admin = await createAdminUser();
    managerToken = getAuthHeader(manager).Authorization;
    adminToken = getAuthHeader(admin).Authorization;
  });

  describe('GET /api/products', () => {
    it('should return empty list when no products', async () => {
      const res = await request(app)
        .get('/api/products')
        .set('Authorization', managerToken);

      expect(res.status).toBe(200);
      expect(res.body.products).toBeDefined();
      expect(res.body.products.length).toBe(0);
    });

    it('should return list of products for manager', async () => {
      await createProducts(store._id, 3);

      const res = await request(app)
        .get('/api/products')
        .set('Authorization', managerToken);

      expect(res.status).toBe(200);
      expect(res.body.products).toBeDefined();
      expect(res.body.products.length).toBe(3);
    });

    it('PT-08: should search products by name', async () => {
      await createTestProduct(store._id, { name: 'Test Apple Product' });
      await createTestProduct(store._id, { name: 'Orange Fruit' });

      const res = await request(app)
        .get('/api/products?q=Apple')
        .set('Authorization', managerToken);

      expect(res.status).toBe(200);
      expect(res.body.products).toBeDefined();
      expect(res.body.products.length).toBe(1);
      expect(res.body.products[0].name).toContain('Apple');
    });

    it('PT-09: should search products by SKU', async () => {
      await createTestProduct(store._id, { sku: 'TESTABC123' });
      await createTestProduct(store._id, { sku: 'XYZ999' });

      const res = await request(app)
        .get('/api/products?q=TESTABC123')
        .set('Authorization', managerToken);

      expect(res.status).toBe(200);
      expect(res.body.products).toBeDefined();
      expect(res.body.products.length).toBe(1);
      expect(res.body.products[0].sku).toBe('TESTABC123');
    });

    it('PT-11: should return correct pagination', async () => {
      await createProducts(store._id, 12);

      const res = await request(app)
        .get('/api/products?page=1&limit=5')
        .set('Authorization', managerToken);

      expect(res.status).toBe(200);
      expect(res.body.products).toBeDefined();
      expect(res.body.products.length).toBe(5);
      expect(res.body.total).toBe(12);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(5);
      expect(res.body.totalPages).toBe(3);
    });

    it('should return 401 for unauthenticated request', async () => {
      const res = await request(app).get('/api/products');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/products', () => {
    it('should create new product successfully', async () => {
      const productData = {
        name: 'New Product',
        sku: `SKU${Date.now()}`,
        barcode: `${Date.now()}`,
        cost_price: 10000,
        sale_price: 15000,
        stock_qty: 100,
        reorder_level: 10,
      };

      const res = await request(app)
        .post('/api/products')
        .set('Authorization', managerToken)
        .send(productData);

      expect(res.status).toBe(201);
      expect(res.body.product).toBeDefined();
      expect(res.body.product.name).toBe('New Product');
    });

    it('should return 400 for missing required fields', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', managerToken)
        .send({
          name: 'Product Without SKU',
        });

      expect(res.status).toBe(400);
    });

    it('should return 409 for duplicate SKU in same store', async () => {
      const sku = `DUPLICATESKU${Date.now()}`;
      await createTestProduct(store._id, { sku });

      const res = await request(app)
        .post('/api/products')
        .set('Authorization', managerToken)
        .send({
          name: 'Duplicate SKU Product',
          sku,
          cost_price: 10000,
          sale_price: 15000,
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('SKU');
    });

    it('PT-04: should return 400 for SKU with special characters', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', managerToken)
        .send({
          name: 'Test Product',
          sku: 'SKU-001',
          cost_price: 10000,
          sale_price: 15000,
          stock_qty: 50,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('SKU');
      expect(res.body.message).toContain('chữ và số');
    });

    it('PT-05: should return 400 for invalid barcode (letters)', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', managerToken)
        .send({
          name: 'Test Product',
          sku: 'SKU002',
          barcode: 'ABC123',
          cost_price: 10000,
          sale_price: 15000,
          stock_qty: 50,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Barcode');
      expect(res.body.message).toContain('số');
    });

    it('PT-06: should return 401 for unauthenticated create', async () => {
      const res = await request(app)
        .post('/api/products')
        .send({
          name: 'Test Product',
          sku: 'SKU003',
          cost_price: 10000,
          sale_price: 15000,
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/products/:id', () => {
    it('should return product by id', async () => {
      const product = await createTestProduct(store._id);

      const res = await request(app)
        .get(`/api/products/${product._id}`)
        .set('Authorization', managerToken);

      expect(res.status).toBe(200);
      expect(res.body.product).toBeDefined();
      expect(res.body.product._id).toBe(String(product._id));
    });

    it('should return 404 for non-existent product', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .get(`/api/products/${fakeId}`)
        .set('Authorization', managerToken);

      expect(res.status).toBe(404);
    });

    it('PT-13: should return 400 for invalid ID format', async () => {
      const res = await request(app)
        .get('/api/products/invalid-id')
        .set('Authorization', managerToken);

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/products/:id', () => {
    it('should update product successfully', async () => {
      const product = await createTestProduct(store._id);

      const res = await request(app)
        .put(`/api/products/${product._id}`)
        .set('Authorization', managerToken)
        .send({
          name: 'Updated Product Name',
          sale_price: 20000,
        });

      expect(res.status).toBe(200);
      expect(res.body.product.name).toBe('Updated Product Name');
    });

    it('should return 404 for updating non-existent product', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .put(`/api/products/${fakeId}`)
        .set('Authorization', managerToken)
        .send({ name: 'Test' });

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/products/:id/status', () => {
    it('should deactivate product successfully', async () => {
      const product = await createTestProduct(store._id);

      const res = await request(app)
        .patch(`/api/products/${product._id}/status`)
        .set('Authorization', managerToken)
        .send({ status: 'inactive' });

      expect(res.status).toBe(200);
      expect(res.body.product.status).toBe('inactive');
    });
  });
});
