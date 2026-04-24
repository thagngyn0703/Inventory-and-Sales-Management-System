const mongoose = require('mongoose');
const request = require('supertest');
const express = require('express');
const invoiceRoutes = require('../../routes/invoices');
const Product = require('../../models/Product');
const { createManagerWithStore, getAuthHeader } = require('../fixtures/users');
const { createTestProduct } = require('../fixtures/products');
const { createTestCustomer } = require('../fixtures/customers');

const app = express();
app.use(express.json());
app.use('/api/invoices', invoiceRoutes);

describe('Invoices Routes', () => {
  let manager;
  let store;
  let managerToken;

  beforeEach(async () => {
    const { manager: m, store: s } = await createManagerWithStore();
    manager = m;
    store = s;
    managerToken = getAuthHeader(manager).Authorization;
  });

  describe('GET /api/invoices', () => {
    it('should return empty list when no invoices', async () => {
      const res = await request(app)
        .get('/api/invoices')
        .set('Authorization', managerToken);

      expect(res.status).toBe(200);
      expect(res.body.invoices).toBeDefined();
    });

    it('should return 401 for unauthenticated request', async () => {
      const res = await request(app).get('/api/invoices');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/invoices', () => {
    it('should create invoice with cash payment', async () => {
      const product1 = await createTestProduct(store._id, { stock_qty: 100 });
      const product2 = await createTestProduct(store._id, { stock_qty: 50 });

      const invoiceData = {
        payment_method: 'cash',
        payment_status: 'paid',
        items: [
          {
            product_id: String(product1._id),
            quantity: 2,
            unit_price: product1.sale_price,
          },
          {
            product_id: String(product2._id),
            quantity: 1,
            unit_price: product2.sale_price,
          },
        ],
      };

      const res = await request(app)
        .post('/api/invoices')
        .set('Authorization', managerToken)
        .send(invoiceData);

      expect(res.status).toBe(201);
      expect(res.body.invoice).toBeDefined();
      expect(res.body.invoice.payment_method).toBe('cash');
      expect(res.body.invoice.items.length).toBe(2);
    });

    it('should decrease product stock on invoice creation', async () => {
      const product = await createTestProduct(store._id, { stock_qty: 100 });

      const invoiceData = {
        payment_method: 'cash',
        payment_status: 'paid',
        items: [
          {
            product_id: String(product._id),
            quantity: 5,
            unit_price: product.sale_price,
          },
        ],
      };

      await request(app)
        .post('/api/invoices')
        .set('Authorization', managerToken)
        .send(invoiceData);

      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.stock_qty).toBe(95);
    });

    it('should return 400 for insufficient stock', async () => {
      const product = await createTestProduct(store._id, { stock_qty: 5 });

      const invoiceData = {
        payment_method: 'cash',
        payment_status: 'paid',
        items: [
          {
            product_id: String(product._id),
            quantity: 10,
            unit_price: product.sale_price,
          },
        ],
      };

      const res = await request(app)
        .post('/api/invoices')
        .set('Authorization', managerToken)
        .send(invoiceData);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('tồn kho');
    });

    it('should create invoice with debt payment', async () => {
      const product = await createTestProduct(store._id, { stock_qty: 100 });
      const customer = await createTestCustomer(store._id);

      const invoiceData = {
        customer_id: String(customer._id),
        payment_method: 'debt',
        payment_status: 'unpaid',
        items: [
          {
            product_id: String(product._id),
            quantity: 2,
            unit_price: product.sale_price,
          },
        ],
      };

      const res = await request(app)
        .post('/api/invoices')
        .set('Authorization', managerToken)
        .send(invoiceData);

      expect(res.status).toBe(201);
      expect(res.body.invoice.payment_method).toBe('debt');
      expect(res.body.invoice.payment_status).toBe('unpaid');
    });

    it('should reject customer from another store', async () => {
      const product = await createTestProduct(store._id, { stock_qty: 100 });
      const { store: otherStore } = await createManagerWithStore();
      const foreignCustomer = await createTestCustomer(otherStore._id);

      const res = await request(app)
        .post('/api/invoices')
        .set('Authorization', managerToken)
        .send({
          customer_id: String(foreignCustomer._id),
          payment_method: 'cash',
          items: [
            {
              product_id: String(product._id),
              quantity: 1,
              unit_price: product.sale_price,
            },
          ],
        });

      expect(res.status).toBe(404);
      expect(String(res.body.message || '')).toContain('Không tìm thấy khách hàng');
    });
  });

  describe('GET /api/invoices/:id', () => {
    it('should return invoice by id', async () => {
      const product = await createTestProduct(store._id, { stock_qty: 100 });

      const createRes = await request(app)
        .post('/api/invoices')
        .set('Authorization', managerToken)
        .send({
          payment_method: 'cash',
          payment_status: 'paid',
          items: [
            {
              product_id: String(product._id),
              quantity: 1,
              unit_price: product.sale_price,
            },
          ],
        });

      const invoiceId = createRes.body.invoice._id;

      const res = await request(app)
        .get(`/api/invoices/${invoiceId}`)
        .set('Authorization', managerToken);

      expect(res.status).toBe(200);
      expect(res.body.invoice).toBeDefined();
    });

    it('should return 404 for non-existent invoice', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .get(`/api/invoices/${fakeId}`)
        .set('Authorization', managerToken);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/invoices/:id/cancel', () => {
    it('should cancel invoice and restore stock', async () => {
      const product = await createTestProduct(store._id, { stock_qty: 100 });

      const createRes = await request(app)
        .post('/api/invoices')
        .set('Authorization', managerToken)
        .send({
          payment_method: 'cash',
          payment_status: 'paid',
          items: [
            {
              product_id: String(product._id),
              quantity: 5,
              unit_price: product.sale_price,
            },
          ],
        });

      const invoiceId = createRes.body.invoice._id;

      const res = await request(app)
        .post(`/api/invoices/${invoiceId}/cancel`)
        .set('Authorization', managerToken);

      expect(res.status).toBe(200);

      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.stock_qty).toBe(100);
    });
  });
});
