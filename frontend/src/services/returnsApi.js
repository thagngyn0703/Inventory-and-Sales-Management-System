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

export async function createReturn(body) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/returns`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await parseResponse(res, 'Không thể thực hiện trả hàng');
  return data.salesReturn;
}
