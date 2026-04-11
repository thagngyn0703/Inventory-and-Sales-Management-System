const request = require('supertest');
const express = require('express');
const supplierRoutes = require('../../routes/suppliers');
const Supplier = require('../../models/Supplier');
const { createManagerUser, createStaffUser, createManagerWithStore, getAuthHeader } = require('../fixtures/users');

const app = express();
app.use(express.json());
app.use('/api/suppliers', supplierRoutes);

describe('Supplier Routes', () => {
  let managerWithStore;
  let staffWithStore;

  beforeEach(async () => {
    await Supplier.deleteMany({});
    const managerResult = await createManagerWithStore();
    managerWithStore = managerResult;
    const store = managerResult.store;
    staffWithStore = await createStaffUser({ storeId: store._id });
  });

  // ==================== UC-24: View Supplier List ====================
  describe('GET /api/suppliers', () => {
    it('TC24-01: should list all active suppliers', async () => {
      await Supplier.create([
        { name: 'Supplier A', storeId: managerWithStore.store._id },
        { name: 'Supplier B', storeId: managerWithStore.store._id },
      ]);

      const res = await request(app)
        .get('/api/suppliers')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.suppliers).toHaveLength(2);
      expect(res.body.total).toBe(2);
    });

    it('TC24-02: should filter by status=active', async () => {
      await Supplier.create([
        { name: 'Active', status: 'active', storeId: managerWithStore.store._id },
        { name: 'Inactive', status: 'inactive', storeId: managerWithStore.store._id },
      ]);

      const res = await request(app)
        .get('/api/suppliers?status=active')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.suppliers).toHaveLength(1);
      expect(res.body.suppliers[0].name).toBe('Active');
    });

    it('TC24-03: should filter by status=inactive', async () => {
      await Supplier.create([
        { name: 'Active', status: 'active', storeId: managerWithStore.store._id },
        { name: 'Inactive', status: 'inactive', storeId: managerWithStore.store._id },
      ]);

      const res = await request(app)
        .get('/api/suppliers?status=inactive')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.suppliers).toHaveLength(1);
      expect(res.body.suppliers[0].name).toBe('Inactive');
    });

    it('TC24-04: should support pagination', async () => {
      for (let i = 1; i <= 5; i++) {
        await Supplier.create({ name: `Supplier ${i}`, storeId: managerWithStore.store._id });
      }

      const res = await request(app)
        .get('/api/suppliers?page=1&limit=2')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.suppliers).toHaveLength(2);
      expect(res.body.total).toBe(5);
      expect(res.body.totalPages).toBe(3);
    });

    it('TC24-05: should search by name', async () => {
      await Supplier.create([
        { name: 'Electronics Corp', storeId: managerWithStore.store._id },
        { name: 'Food Inc', storeId: managerWithStore.store._id },
      ]);

      const res = await request(app)
        .get('/api/suppliers?q=Electronics')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.suppliers).toHaveLength(1);
      expect(res.body.suppliers[0].name).toBe('Electronics Corp');
    });

    it('TC24-06: should return empty array when no suppliers', async () => {
      const res = await request(app)
        .get('/api/suppliers')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.suppliers).toHaveLength(0);
    });

    it('TC24-07: should return 401 without token', async () => {
      const res = await request(app).get('/api/suppliers');
      expect(res.status).toBe(401);
    });
  });

  // ==================== UC-23: Create Supplier ====================
  describe('POST /api/suppliers', () => {
    it('TC23-01: should create supplier with valid data', async () => {
      const res = await request(app)
        .post('/api/suppliers')
        .set(getAuthHeader(managerWithStore.manager))
        .send({
          name: 'New Supplier',
          phone: '0123456789',
          email: 'contact@supplier.com',
          address: '123 Main St',
        });

      expect(res.status).toBe(201);
      expect(res.body.supplier.name).toBe('New Supplier');
      expect(res.body.supplier.status).toBe('active');
    });

    it('TC23-02: should create supplier with minimal data (name only)', async () => {
      const res = await request(app)
        .post('/api/suppliers')
        .set(getAuthHeader(managerWithStore.manager))
        .send({ name: 'Minimal Supplier' });

      expect(res.status).toBe(201);
      expect(res.body.supplier.name).toBe('Minimal Supplier');
    });

    it('TC23-03: should return 400 if name is missing', async () => {
      const res = await request(app)
        .post('/api/suppliers')
        .set(getAuthHeader(managerWithStore.manager))
        .send({ phone: '0123456789' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('name is required');
    });

    it('TC23-04: should return 400 if name is empty', async () => {
      const res = await request(app)
        .post('/api/suppliers')
        .set(getAuthHeader(managerWithStore.manager))
        .send({ name: '' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('name is required');
    });

    it('TC23-05: should return 409 for duplicate supplier name', async () => {
      await Supplier.create({ name: 'Existing Supplier', storeId: managerWithStore.store._id });

      const res = await request(app)
        .post('/api/suppliers')
        .set(getAuthHeader(managerWithStore.manager))
        .send({ name: 'Existing Supplier' });

      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Supplier already exists');
    });

    it('TC23-06: should return 401 without token', async () => {
      const res = await request(app)
        .post('/api/suppliers')
        .send({ name: 'Test Supplier' });

      expect(res.status).toBe(401);
    });

    it('TC23-07: should return 403 for staff role', async () => {
      const res = await request(app)
        .post('/api/suppliers')
        .set(getAuthHeader(staffWithStore))
        .send({ name: 'Test Supplier' });

      expect(res.status).toBe(403);
    });
  });

  // ==================== UC-25: Search Supplier ====================
  describe('GET /api/suppliers (search)', () => {
    it('TC25-01: should search by phone', async () => {
      await Supplier.create({
        name: 'Phone Supplier',
        phone: '0987654321',
        storeId: managerWithStore.store._id,
      });

      const res = await request(app)
        .get('/api/suppliers?q=0987654321')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.suppliers).toHaveLength(1);
    });

    it('TC25-02: should search by email', async () => {
      await Supplier.create({
        name: 'Email Supplier',
        email: 'test@supplier.com',
        storeId: managerWithStore.store._id,
      });

      const res = await request(app)
        .get('/api/suppliers?q=test@supplier.com')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.suppliers).toHaveLength(1);
    });

    it('TC25-03: should return empty for no match', async () => {
      await Supplier.create({ name: 'Supplier A', storeId: managerWithStore.store._id });

      const res = await request(app)
        .get('/api/suppliers?q=nonexistent')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.suppliers).toHaveLength(0);
    });
  });

  // ==================== UC-24: Get Supplier by ID ====================
  describe('GET /api/suppliers/:id', () => {
    it('TC24-08: should get supplier by id', async () => {
      const supplier = await Supplier.create({
        name: 'Detail Supplier',
        storeId: managerWithStore.store._id,
      });

      const res = await request(app)
        .get(`/api/suppliers/${supplier._id}`)
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(200);
      expect(res.body.supplier.name).toBe('Detail Supplier');
    });

    it('TC24-09: should return 404 for non-existent id', async () => {
      const fakeId = '000000000000000000000000';

      const res = await request(app)
        .get(`/api/suppliers/${fakeId}`)
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Supplier not found');
    });

    it('TC24-10: should return 400 for invalid id format', async () => {
      const res = await request(app)
        .get('/api/suppliers/invalid-id')
        .set(getAuthHeader(managerWithStore.manager));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Invalid supplier id');
    });
  });

  // ==================== UC-26: Update Supplier ====================
  describe('PUT /api/suppliers/:id', () => {
    it('TC26-01: should update supplier info', async () => {
      const supplier = await Supplier.create({
        name: 'Old Name',
        storeId: managerWithStore.store._id,
      });

      const res = await request(app)
        .put(`/api/suppliers/${supplier._id}`)
        .set(getAuthHeader(managerWithStore.manager))
        .send({ name: 'Updated Name', phone: '9999999999' });

      expect(res.status).toBe(200);
      expect(res.body.supplier.name).toBe('Updated Name');
      expect(res.body.supplier.phone).toBe('9999999999');
    });

    it('TC26-02: should return 404 for non-existent supplier', async () => {
      const fakeId = '000000000000000000000000';

      const res = await request(app)
        .put(`/api/suppliers/${fakeId}`)
        .set(getAuthHeader(managerWithStore.manager))
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Supplier not found');
    });

    it('TC26-03: should return 400 for invalid id format', async () => {
      const res = await request(app)
        .put('/api/suppliers/invalid-id')
        .set(getAuthHeader(managerWithStore.manager))
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Invalid supplier id');
    });

    it('TC26-04: should return 409 for duplicate name on update', async () => {
      await Supplier.create({ name: 'Supplier A', storeId: managerWithStore.store._id });
      const supplierB = await Supplier.create({
        name: 'Supplier B',
        storeId: managerWithStore.store._id,
      });

      const res = await request(app)
        .put(`/api/suppliers/${supplierB._id}`)
        .set(getAuthHeader(managerWithStore.manager))
        .send({ name: 'Supplier A' });

      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Supplier already exists');
    });

    it('TC26-05: should return 403 for staff role', async () => {
      const supplier = await Supplier.create({
        name: 'Test Supplier',
        storeId: managerWithStore.store._id,
      });

      const res = await request(app)
        .put(`/api/suppliers/${supplier._id}`)
        .set(getAuthHeader(staffWithStore))
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(403);
    });
  });

  // ==================== UC-27: Activate/Deactivate Supplier ====================
  describe('PATCH /api/suppliers/:id/status', () => {
    it('TC27-01: should deactivate active supplier', async () => {
      const supplier = await Supplier.create({
        name: 'Active Supplier',
        status: 'active',
        storeId: managerWithStore.store._id,
      });

      const res = await request(app)
        .patch(`/api/suppliers/${supplier._id}/status`)
        .set(getAuthHeader(managerWithStore.manager))
        .send({ status: 'inactive' });

      expect(res.status).toBe(200);
      expect(res.body.supplier.status).toBe('inactive');
    });

    it('TC27-02: should activate inactive supplier', async () => {
      const supplier = await Supplier.create({
        name: 'Inactive Supplier',
        status: 'inactive',
        storeId: managerWithStore.store._id,
      });

      const res = await request(app)
        .patch(`/api/suppliers/${supplier._id}/status`)
        .set(getAuthHeader(managerWithStore.manager))
        .send({ status: 'active' });

      expect(res.status).toBe(200);
      expect(res.body.supplier.status).toBe('active');
    });

    it('TC27-03: should return 404 for non-existent supplier', async () => {
      const fakeId = '000000000000000000000000';

      const res = await request(app)
        .patch(`/api/suppliers/${fakeId}/status`)
        .set(getAuthHeader(managerWithStore.manager))
        .send({ status: 'inactive' });

      expect(res.status).toBe(404);
    });

    it('TC27-04: should return 400 for invalid id format', async () => {
      const res = await request(app)
        .patch('/api/suppliers/invalid-id/status')
        .set(getAuthHeader(managerWithStore.manager))
        .send({ status: 'inactive' });

      expect(res.status).toBe(400);
    });

    it('TC27-05: should return 403 for staff role', async () => {
      const supplier = await Supplier.create({
        name: 'Test Supplier',
        storeId: managerWithStore.store._id,
      });

      const res = await request(app)
        .patch(`/api/suppliers/${supplier._id}/status`)
        .set(getAuthHeader(staffWithStore))
        .send({ status: 'inactive' });

      expect(res.status).toBe(403);
    });
  });

  // ==================== UC-28: View Supplier Inbound History ====================
  describe('GET /api/suppliers/:id/inbound-history', () => {
    it('TC28-01: should return 404 - endpoint not implemented in suppliers route', async () => {
      const supplier = await Supplier.create({
        name: 'Test Supplier',
        storeId: managerWithStore.store._id,
      });

      const res = await request(app)
        .get(`/api/suppliers/${supplier._id}/inbound-history`)
        .set(getAuthHeader(managerWithStore.manager));

      // This endpoint doesn't exist in the current route
      expect(res.status).toBe(404);
    });
  });
});
