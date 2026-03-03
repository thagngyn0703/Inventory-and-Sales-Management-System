const API_BASE = "http://localhost:8000/api";

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseJson(res) {
  const data = await res.json().catch(() => ({}));
  return data || {};
}

export async function fetchProducts({ q = "" } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  const url = `${API_BASE}/products${params.toString() ? `?${params.toString()}` : ""}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { ...getAuthHeaders() },
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.message || "Fetch products failed");
  return data.products || [];
}

export async function createProductApi(payload) {
  const res = await fetch(`${API_BASE}/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.message || "Create product failed");
  return data.product;
}

