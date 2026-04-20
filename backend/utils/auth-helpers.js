function getBearerToken(req) {
  const h = req?.headers?.authorization || '';
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : '';
}

function normalizeRoleToThreeTier(role) {
  const r = String(role || '').toLowerCase().trim();
  if (r === 'warehouse_staff' || r === 'warehouse staff' || r === 'warehouse') return 'staff';
  if (r === 'sales_staff' || r === 'sales staff' || r === 'sales') return 'staff';
  return r;
}

module.exports = {
  getBearerToken,
  normalizeRoleToThreeTier,
};
