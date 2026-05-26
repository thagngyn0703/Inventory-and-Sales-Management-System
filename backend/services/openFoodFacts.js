/** Global fetch (Node 18+). Avoids node-fetch v3 ESM vs CommonJS issues. */
const OFF_API_BASE = process.env.OFF_API_BASE || 'https://world.openfoodfacts.org';

function safeTrim(value) {
    return String(value || '').trim();
}

function pickFirstBrand(raw) {
    const s = safeTrim(raw);
    if (!s) return '';
    const parts = s.split(',').map((x) => x.trim()).filter(Boolean);
    return parts[0] || '';
}

function parseCategories(product) {
    const tags = Array.isArray(product?.categories_tags) ? product.categories_tags : [];
    if (tags.length > 0) {
        return tags.map((t) => safeTrim(t.replace(/^en:/i, ''))).filter(Boolean);
    }
    const raw = safeTrim(product?.categories);
    if (!raw) return [];
    return raw
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
}

function mapOffProduct(barcode, offProduct) {
    if (!offProduct) return null;
    const name = safeTrim(offProduct.product_name || offProduct.generic_name);
    const brand = pickFirstBrand(offProduct.brands);
    const imageUrl = safeTrim(offProduct.image_front_url || offProduct.image_url || offProduct.image_small_url);
    const categories = parseCategories(offProduct);

    if (!name && !brand) {
        return null;
    }

    return {
        barcode: safeTrim(barcode || offProduct.code),
        name,
        brand,
        image_url: imageUrl || null,
        categories,
        nutriments: offProduct.nutriments || null,
    };
}

async function fetchProductByBarcode(barcode) {
    const code = safeTrim(barcode);
    if (!code) return { product: null, error: null };
    const url = `${OFF_API_BASE.replace(/\/+$/, '')}/api/v2/product/${encodeURIComponent(code)}.json`;
    let res;
    const controller = new AbortController();
    const timeoutMs = 8000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        res = await fetch(url, {
            method: 'GET',
            headers: { 'User-Agent': 'InventoryPOS/1.0 (https://github.com)' },
            signal: controller.signal,
        });
    } catch (err) {
        console.warn('OpenFoodFacts fetch error:', err?.message || err);
        return { product: null, error: 'NETWORK_ERROR' };
    } finally {
        clearTimeout(timeoutId);
    }

    if (!res.ok) {
        console.warn('OpenFoodFacts non-200:', res.status, res.statusText);
        if (res.status === 429) {
            return { product: null, error: 'RATE_LIMITED' };
        }
        return { product: null, error: 'HTTP_ERROR' };
    }

    let body;
    try {
        body = await res.json();
    } catch {
        return { product: null, error: 'INVALID_RESPONSE' };
    }
    if (!body || body.status !== 1 || !body.product) return { product: null, error: null };
    return { product: mapOffProduct(code, body.product), error: null };
}

module.exports = {
    fetchProductByBarcode,
};

