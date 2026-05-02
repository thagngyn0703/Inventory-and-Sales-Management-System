const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

function parseResponse(res, defaultMessage) {
  return res
    .json()
    .catch(() => ({}))
    .then((data) => {
      if (!res.ok) {
        const err = new Error(data.message || defaultMessage);
        err.code = data.code || data.error_code || null;
        throw err;
      }
      return data;
    });
}

/** Danh sách quầy (tự seed Quầy 1 + Quầy 2 khi cửa hàng chưa có) */
export async function getPosRegisters() {
  const token = getToken();
  const res = await fetch(`${API_BASE}/pos-registers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseResponse(res, 'Không thể tải danh sách quầy');
  return Array.isArray(data.registers) ? data.registers : [];
}
