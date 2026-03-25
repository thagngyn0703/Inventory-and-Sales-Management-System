const API_BASE = 'http://localhost:8000/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

function parseResponse(res, defaultMessage) {
  return res
    .json()
    .catch(() => ({}))
    .then((data) => {
      if (!res.ok) {
        throw new Error(data.message || defaultMessage);
      }
      return data;
    });
}

/**
 * Tần suất nhập hàng theo nhà cung cấp trong 1 tháng.
 * @param {Object} params - { year: number, month: number (1-12) }
 */
export async function getIncomingFrequencyBySupplier({ year, month } = {}) {
  const token = getToken();
  const url = new URL(`${API_BASE}/analytics/incoming-frequency`);
  if (year != null) url.searchParams.set('year', String(year));
  if (month != null) url.searchParams.set('month', String(month));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseResponse(res, 'Không thể tải phân tích tần suất nhập hàng');
  return data;
}
