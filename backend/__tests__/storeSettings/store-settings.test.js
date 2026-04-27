const request = require('supertest');
const express = require('express');
const storeSettingsRoutes = require('../../routes/storeSettings');
const Store = require('../../models/Store');
const { createManagerWithStore, getAuthHeader } = require('../fixtures/users');

const app = express();
app.use(express.json());
app.use('/api/store-settings', storeSettingsRoutes);

describe('Store Settings Routes', () => {
  let managerWithStore;

  beforeEach(async () => {
    managerWithStore = await createManagerWithStore();
    await Store.findByIdAndUpdate(managerWithStore.store._id, {
      business_type: 'ho_kinh_doanh',
      tax_rate: 0,
      price_includes_tax: true,
    });
  });

  describe('PATCH /api/store-settings/tax', () => {
    it('should reject non-zero tax_rate for ho_kinh_doanh', async () => {
      const res = await request(app)
        .patch('/api/store-settings/tax')
        .set(getAuthHeader(managerWithStore.manager))
        .send({
          business_type: 'ho_kinh_doanh',
          tax_rate: 10,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Hộ kinh doanh không áp dụng VAT');
    });

    it('should reject price_includes_tax config for ho_kinh_doanh', async () => {
      const res = await request(app)
        .patch('/api/store-settings/tax')
        .set(getAuthHeader(managerWithStore.manager))
        .send({
          business_type: 'ho_kinh_doanh',
          price_includes_tax: false,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('không cần cấu hình "giá đã gồm VAT"');
    });
  });
});
