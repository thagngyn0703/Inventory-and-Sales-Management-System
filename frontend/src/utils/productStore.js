const STORAGE_KEY = "products";

function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `p_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export function getAllProducts() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const list = safeJsonParse(raw, []);
  return Array.isArray(list) ? list : [];
}

export function saveAllProducts(products) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}

export function createProduct(input) {
  const products = getAllProducts();
  const created_at = nowIso();
  const product = {
    _id: uuid(),
    category_id: input.category_id || "",
    name: input.name || "",
    sku: input.sku || "",
    barcode: input.barcode || "",
    cost_price: Number(input.cost_price || 0),
    sale_price: Number(input.sale_price || 0),
    stock_qty: Number(input.stock_qty || 0),
    reorder_level: Number(input.reorder_level || 0),
    status: input.status || "active",
    created_at,
    updated_at: created_at,
  };

  products.unshift(product);
  saveAllProducts(products);
  return product;
}

export function searchProducts({ q }) {
  const query = (q || "").trim().toLowerCase();
  const products = getAllProducts();
  if (!query) return products;

  return products.filter((p) => {
    const hay = [
      p.name,
      p.sku,
      p.barcode,
      p.status,
      p.category_id,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(query);
  });
}

