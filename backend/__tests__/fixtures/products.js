const mongoose = require('mongoose');
const Product = require('../../models/Product');

async function createTestProduct(storeId = null, overrides = {}) {
  const defaultData = {
    name: 'Test Product',
    sku: `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    barcode: `BC-${Date.now()}`,
    cost_price: 10000,
    sale_price: 15000,
    stock_qty: 100,
    reorder_level: 10,
    base_unit: 'Cái',
    status: 'active',
    storeId,
  };
  return Product.create({ ...defaultData, ...overrides });
}

async function createProducts(storeId, count = 5) {
  const products = [];
  for (let i = 0; i < count; i++) {
    const product = await createTestProduct(storeId, {
      name: `Product ${i + 1}`,
      sku: `SKU-${Date.now()}-${i}`,
    });
    products.push(product);
  }
  return products;
}

async function createProductWithLowStock(storeId = null, overrides = {}) {
  return createTestProduct(storeId, {
    stock_qty: 2,
    reorder_level: 10,
    ...overrides,
  });
}

async function createOutOfStockProduct(storeId = null, overrides = {}) {
  return createTestProduct(storeId, {
    stock_qty: 0,
    ...overrides,
  });
}

module.exports = {
  createTestProduct,
  createProducts,
  createProductWithLowStock,
  createOutOfStockProduct,
};
