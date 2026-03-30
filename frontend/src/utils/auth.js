export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("user")) || null;
  } catch {
    return null;
  }
}

export function isLoggedIn() {
  return Boolean(localStorage.getItem("token"));
}

export function normalizeRole(role) {
  const r = String(role || "").trim().toLowerCase();
  if (!r) return "";
  if (r === "warehouse staff" || r === "warehouse_staff") return "staff";
  if (r === "sales staff" || r === "sale staff" || r === "sales_staff") return "staff";
  return r;
}

export function hasAnyRole(user, allowedRoles) {
  const role = normalizeRole(user?.role);
  const allowedNorm = (allowedRoles || []).map((x) => normalizeRole(x));
  if (allowedNorm.includes(role)) return true;
  if (role === "staff") {
    return allowedNorm.some((a) => a === "warehouse" || a === "sales");
  }
  return false;
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}
