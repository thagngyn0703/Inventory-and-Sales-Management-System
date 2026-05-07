const express = require('express');
const router = express.Router();

const Product = require('../models/Product');
const ProductUnit = require('../models/ProductUnit');
const { fetchProductByBarcode } = require('../services/openFoodFacts');
const { requireAuth } = require('../middleware/auth');

function trimCode(v) {
    return String(v || '').trim();
}

function isValidBarcode(code) {
    const c = trimCode(code);
    if (!c || c.length < 3 || c.length > 64) return false;
    return /^[0-9A-Za-z_.-]+$/.test(c);
}

router.get('/lookup', requireAuth, async (req, res) => {
    const rawCode = req.query.code || req.query.barcode;
    const code = trimCode(rawCode);
    if (!isValidBarcode(code)) {
        return res.status(400).json({ error: 'INVALID_BARCODE', message: 'Mã barcode không hợp lệ.' });
    }

    const storeId = req.user?.storeId || null;

    try {
        const productFilter = { barcode: code };
        if (storeId) productFilter.storeId = storeId;

        const unitFilter = { barcode: code };
        if (storeId) unitFilter.storeId = storeId;

        const [product, unit] = await Promise.all([
            Product.findOne(productFilter).lean(),
            ProductUnit.findOne(unitFilter).lean(),
        ]);

        if (product) {
            return res.json({
                source: 'internal',
                product: {
                    _id: String(product._id),
                    name: product.name,
                    sku: product.sku,
                    barcode: product.barcode,
                    base_unit: product.base_unit,
                    image_url: product.image_url || null,
                    category_id: product.category_id || null,
                },
                unit: unit
                    ? {
                          _id: String(unit._id),
                          unit_name: unit.unit_name,
                          barcode: unit.barcode,
                      }
                    : null,
            });
        }

        const offResult = await fetchProductByBarcode(code);
        const offProduct = offResult?.product || null;
        const offError = offResult?.error || null;
        if (!offProduct) {
            if (offError === 'RATE_LIMITED') {
                return res.json({
                    source: 'off_rate_limited',
                    product: null,
                    message: 'Open Food Facts đang giới hạn lượt truy cập. Vui lòng thử lại sau vài phút.',
                });
            }
            return res.json({ source: 'none', product: null });
        }

        return res.json({
            source: 'open_food_facts',
            product: offProduct,
        });
    } catch (err) {
        console.error('barcode lookup error:', err);
        return res.status(500).json({ error: 'LOOKUP_FAILED', message: 'Không thể tra cứu barcode.' });
    }
});

module.exports = router;

