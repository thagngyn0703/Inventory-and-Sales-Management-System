const mongoose = require('mongoose');
const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const authRoutes = require('../../routes/auth');
const User = require('../../models/User');
const Store = require('../../models/Store');
const { createAdminUser, createManagerUser, createStaffUser, createManagerWithStore, getAuthHeader } = require('../fixtures/users');

jest.mock('../../services/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  hasSmtpConfig: true,
}));

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Routes', () => {
  describe('POST /api/auth/register', () => {
    it.skip('should register new user successfully (requires SMTP mock fix)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'New User',
          email: 'newuser@example.com',
          password: 'Password123!',
          role: 'manager',
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toContain('thành công');
      expect(res.body.email).toBe('newuser@example.com');
    });

    it('should return 400 if email already exists', async () => {
      await createAdminUser({ email: 'existing@example.com' });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Another User',
          email: 'existing@example.com',
          password: 'Password123!',
          role: 'manager',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Email đã tồn tại');
    });

    it('should return 400 if missing required fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid role', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Test User',
          email: 'test@example.com',
          password: 'Password123!',
          role: 'invalid_role',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully with correct credentials', async () => {
      const password = await bcrypt.hash('Password123!', 10);
      await User.create({
        fullName: 'Test User',
        email: 'login@example.com',
        password,
        role: 'manager',
        status: 'active',
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
    });

    it('should return 400 for wrong password', async () => {
      const password = await bcrypt.hash('CorrectPassword!', 10);
      await User.create({
        fullName: 'Test User',
        email: 'wrongpass@example.com',
        password,
        role: 'manager',
        status: 'active',
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'wrongpass@example.com',
          password: 'WrongPassword!',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Email hoặc mật khẩu không đúng');
    });

    it('should return 400 for non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Email hoặc mật khẩu không đúng');
    });

    it('should return 403 for inactive account', async () => {
      const password = await bcrypt.hash('Password123!', 10);
      await User.create({
        fullName: 'Inactive User',
        email: 'inactive@example.com',
        password,
        role: 'manager',
        status: 'inactive',
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'inactive@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('vô hiệu');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user info for authenticated user', async () => {
      const user = await createManagerUser();

      const res = await request(app)
        .get('/api/auth/me')
        .set(getAuthHeader(user));

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(user.email);
    });

    it('should return 401 for unauthenticated request', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/create-staff', () => {
    it('should create staff user for manager with store', async () => {
      const { manager, store } = await createManagerWithStore();

      const res = await request(app)
        .post('/api/auth/create-staff')
        .set(getAuthHeader(manager))
        .send({
          fullName: 'New Staff',
          email: 'staff@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.role).toBe('staff');
      expect(res.body.user.storeId).toBe(String(store._id));
    });

    it('should return 403 for manager without store', async () => {
      const manager = await createManagerUser();

      const res = await request(app)
        .post('/api/auth/create-staff')
        .set(getAuthHeader(manager))
        .send({
          fullName: 'New Staff',
          email: 'staff2@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(403);
    });

    it('should return 403 for non-manager role', async () => {
      const staff = await createStaffUser();

      const res = await request(app)
        .post('/api/auth/create-staff')
        .set(getAuthHeader(staff))
        .send({
          fullName: 'Another Staff',
          email: 'staff3@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(403);
    });
  });
});
