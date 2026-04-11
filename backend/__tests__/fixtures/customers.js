const mongoose = require('mongoose');
const Customer = require('../../models/Customer');

async function createTestCustomer(storeId = null, overrides = {}) {
  const defaultData = {
    full_name: 'Test Customer',
    phone: `09${Date.now().toString().slice(-8)}`,
    email: `customer${Date.now()}@example.com`,
    address: '123 Test Address',
    status: 'active',
    debt_account: 0,
    credit_limit: 1000000,
    is_regular: false,
    store_id: storeId,
  };
  return Customer.create({ ...defaultData, ...overrides });
}

async function createCustomers(storeId, count = 5) {
  const customers = [];
  for (let i = 0; i < count; i++) {
    const customer = await createTestCustomer(storeId, {
      full_name: `Customer ${i + 1}`,
    });
    customers.push(customer);
  }
  return customers;
}

async function createCustomerWithDebt(storeId = null, debtAmount = 50000, overrides = {}) {
  return createTestCustomer(storeId, {
    debt_account: debtAmount,
    ...overrides,
  });
}

async function createVIPCustomer(storeId = null, overrides = {}) {
  return createTestCustomer(storeId, {
    full_name: 'VIP Customer',
    credit_limit: 10000000,
    is_regular: true,
    ...overrides,
  });
}

module.exports = {
  createTestCustomer,
  createCustomers,
  createCustomerWithDebt,
  createVIPCustomer,
};
