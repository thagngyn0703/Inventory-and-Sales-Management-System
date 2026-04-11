const mongoose = require('mongoose');
const Store = require('../../models/Store');

async function createTestStore(overrides = {}) {
  const defaultData = {
    name: 'Test Store',
    address: '123 Test Address',
    phone: '0123456789',
    managerId: new mongoose.Types.ObjectId(),
    status: 'active',
  };
  return Store.create({ ...defaultData, ...overrides });
}

async function createActiveStore(overrides = {}) {
  return createTestStore({ status: 'active', ...overrides });
}

async function createInactiveStore(overrides = {}) {
  return createTestStore({ status: 'inactive', ...overrides });
}

module.exports = {
  createTestStore,
  createActiveStore,
  createInactiveStore,
};
