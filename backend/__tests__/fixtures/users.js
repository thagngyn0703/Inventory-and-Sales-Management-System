const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Store = require('../../models/Store');

const JWT_SECRET = process.env.JWT_SECRET || 'ims_secret_key_123';

async function createTestUser(overrides = {}) {
  const password = await bcrypt.hash('password123', 10);
  const defaultData = {
    fullName: 'Test User',
    email: `test${Date.now()}@example.com`,
    password,
    role: 'manager',
    status: 'active',
    storeId: null,
  };
  return User.create({ ...defaultData, ...overrides });
}

async function createAdminUser(overrides = {}) {
  return createTestUser({ role: 'admin', fullName: 'Admin User', ...overrides });
}

async function createManagerUser(overrides = {}) {
  return createTestUser({ role: 'manager', fullName: 'Manager User', ...overrides });
}

async function createStaffUser(overrides = {}) {
  return createTestUser({ role: 'staff', fullName: 'Staff User', ...overrides });
}

function generateTestToken(user) {
  return jwt.sign(
    { id: user._id.toString() },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function getAuthHeader(user) {
  const token = generateTestToken(user);
  return { Authorization: `Bearer ${token}` };
}

async function createManagerWithStore(overrides = {}) {
  const manager = await createManagerUser(overrides);
  const store = await Store.create({
    name: 'Test Store',
    address: '123 Test Address',
    phone: '0123456789',
    managerId: manager._id,
    status: 'active',
  });
  manager.storeId = store._id;
  await manager.save();
  return { manager, store };
}

async function createStaffWithStore(store, overrides = {}) {
  return createStaffUser({ storeId: store._id, ...overrides });
}

module.exports = {
  createTestUser,
  createAdminUser,
  createManagerUser,
  createStaffUser,
  generateTestToken,
  getAuthHeader,
  createManagerWithStore,
  createStaffWithStore,
};
