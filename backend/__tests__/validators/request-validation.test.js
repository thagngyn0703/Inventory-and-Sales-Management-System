const mongoose = require('mongoose');
const request = require('supertest');
const express = require('express');
const authRoutes = require('../../routes/auth');
const productRoutes = require('../../routes/products');
const customerRoutes = require('../../routes/customers');
const { createManagerWithStore, createAdminUser, getAuthHeader } = require('../fixtures/users');
const { createTestProduct } = require('../fixtures/products');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);

describe('Request Validation Tests', () => {
  let manager;
  let store;
  let managerToken;

  beforeEach(async () => {
    const { manager: m, store: s } = await createManagerWithStore();
    manager = m;
    store = s;
    managerToken = getAuthHeader(manager).Authorization;
  });

  describe('Auth Register Validation', () => {
    it('should return 400 if fullName is empty', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          role: 'manager',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Thiếu');
    });

    it('should return 400 if email already exists', async () => {
      await createAdminUser({ email: 'existing@example.com' });
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Test User',
          email: 'existing@example.com',
          password: 'Password123!',
          role: 'manager',
        });

      expect(res.status).toBe(400);
    });

    it('should return 400 if password is less than 6 characters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Test User',
          email: 'test@example.com',
          password: '123',
          role: 'manager',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('6');
    });

    it('should return 400 if role is not manager', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Test User',
          email: 'test@example.com',
          password: 'Password123!',
          role: 'staff',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Product Create Validation', () => {
    it('should return 400 if name contains special characters', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', managerToken)
        .send({
          name: 'Product@#$%',
          sku: 'SKU123',
          cost_price: 10000,
          sale_price: 15000,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('ký tự đặc biệt');
    });

    it('should return 400 if SKU contains special characters', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', managerToken)
        .send({
          name: 'Test Product',
          sku: 'SKU-123',
          cost_price: 10000,
          sale_price: 15000,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('chữ và số');
    });

    it('should return 400 if barcode contains letters', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', managerToken)
        .send({
          name: 'Test Product',
          sku: 'SKU123',
          barcode: '123ABC',
          cost_price: 10000,
          sale_price: 15000,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Barcode');
    });

    it('should return 400 if cost_price is negative', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', managerToken)
        .send({
          name: 'Test Product',
          sku: 'SKU123',
          cost_price: -100,
          sale_price: 15000,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Giá vốn');
    });

    it('should return 400 if stock_qty is negative', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', managerToken)
        .send({
          name: 'Test Product',
          sku: 'SKU123',
          cost_price: 10000,
          sale_price: 15000,
          stock_qty: -5,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Tồn kho');
    });
  });

  describe('Customer Create Validation', () => {
    it('should return 400 if full_name is empty', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', managerToken)
        .send({
          phone: '0987654321',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Tên khách hàng');
    });

    it('should return 400 if phone has wrong length', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', managerToken)
        .send({
          full_name: 'Test Customer',
          phone: '12345',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('10 hoặc 11');
    });
  });

  describe('ID Validation', () => {
    it('should return 400 for invalid product ID format', async () => {
      const res = await request(app)
        .get('/api/products/invalid-id')
        .set('Authorization', managerToken);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid');
    });

    it('should return 404 for non-existent customer', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .patch(`/api/customers/${fakeId}`)
        .set('Authorization', managerToken)
        .send({ full_name: 'Test' });

      expect(res.status).toBe(404);
    });

    it('should return 404 for non-existent invoice', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/invoices/${fakeId}`)
        .set('Authorization', managerToken);

      expect(res.status).toBe(404);
    });
  });

  describe('Stock Validation', () => {
    it.skip('should return 400 when ordering more than available stock', async () => {
      // This test is covered in invoices.test.js
      const product = await createTestProduct(store._id, { stock_qty: 2, sale_price: 15000 });

      const res = await request(app)
        .post('/api/invoices')
        .set('Authorization', managerToken)
        .send({
          payment_method: 'cash',
          payment_status: 'paid',
          items: [
            {
              product_id: String(product._id),
              quantity: 10,
              unit_price: product.sale_price,
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('tồn kho');
    });
  });
});
