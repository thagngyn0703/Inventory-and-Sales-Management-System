const mongoose = require('mongoose');
const request = require('supertest');
const express = require('express');
const customerRoutes = require('../../routes/customers');
const Customer = require('../../models/Customer');
const { createManagerWithStore, getAuthHeader } = require('../fixtures/users');
const { createTestCustomer } = require('../fixtures/customers');

const app = express();
app.use(express.json());
app.use('/api/customers', customerRoutes);

describe('Customers Routes', () => {
  let manager;
  let store;
  let managerToken;

  beforeEach(async () => {
    const { manager: m, store: s } = await createManagerWithStore();
    manager = m;
    store = s;
    managerToken = getAuthHeader(manager).Authorization;
  });

  describe('GET /api/customers', () => {
    it('should return empty list when no customers', async () => {
      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', managerToken);

      expect(res.status).toBe(200);
      expect(res.body.customers).toBeDefined();
      expect(res.body.customers.length).toBe(0);
    });

    it('should return list of customers', async () => {
      await createTestCustomer(store._id);
      await createTestCustomer(store._id);

      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', managerToken);

      expect(res.status).toBe(200);
      expect(res.body.customers.length).toBe(2);
    });

    it('should return 401 for unauthenticated request', async () => {
      const res = await request(app).get('/api/customers');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/customers', () => {
    it('should create new customer successfully', async () => {
      const customerData = {
        full_name: 'New Customer',
        phone: `09${Date.now().toString().slice(-8)}`,
        email: `customer${Date.now()}@example.com`,
        address: '123 Test Address',
        credit_limit: 1000000,
      };

      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', managerToken)
        .send(customerData);

      expect(res.status).toBe(201);
      expect(res.body.customer).toBeDefined();
      expect(res.body.customer.full_name).toBe('New Customer');
    });

    it('should return 400 for missing required fields', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', managerToken)
        .send({
          phone: '0123456789',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Tên khách hàng');
    });

    it('should create customer with zero initial debt', async () => {
      const customerData = {
        full_name: 'New Customer No Debt',
        phone: `09${Date.now().toString().slice(-8)}`,
        credit_limit: 1000000,
      };

      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', managerToken)
        .send(customerData);

      expect(res.status).toBe(201);
      expect(res.body.customer.debt_account).toBe(0);
    });
  });

  describe('PATCH /api/customers/:id', () => {
    it('should update customer successfully', async () => {
      const customer = await createTestCustomer(store._id);

      const res = await request(app)
        .patch(`/api/customers/${customer._id}`)
        .set('Authorization', managerToken)
        .send({
          full_name: 'Updated Name',
          address: 'New Address',
        });

      expect(res.status).toBe(200);
      expect(res.body.customer.full_name).toBe('Updated Name');
      expect(res.body.customer.address).toBe('New Address');
    });

    it('should update customer debt via debt_account field', async () => {
      const customer = await createTestCustomer(store._id, { debt_account: 10000 });

      const res = await request(app)
        .patch(`/api/customers/${customer._id}`)
        .set('Authorization', managerToken)
        .send({
          debt_account: 15000,
        });

      expect(res.status).toBe(200);
      expect(res.body.customer.debt_account).toBe(15000);
    });

    it('should clamp debt to 0 when setting negative value', async () => {
      const customer = await createTestCustomer(store._id, { debt_account: 5000 });

      const res = await request(app)
        .patch(`/api/customers/${customer._id}`)
        .set('Authorization', managerToken)
        .send({
          debt_account: -1000,
        });

      expect(res.status).toBe(200);
      expect(res.body.customer.debt_account).toBe(0);
    });

    it('should return 404 for non-existent customer', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .patch(`/api/customers/${fakeId}`)
        .set('Authorization', managerToken)
        .send({ full_name: 'Test' });

      expect(res.status).toBe(404);
    });
  });
});
