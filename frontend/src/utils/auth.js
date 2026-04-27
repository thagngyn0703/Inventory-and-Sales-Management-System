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

/**
 * Chuẩn hóa role về 3 tier: admin / manager / staff.
 * Backward compat: warehouse_staff, sales_staff, warehouse, sales → staff
 */
export function normalizeRole(role) {
  const r = String(role || "").trim().toLowerCase();
  if (!r) return "";
  if (
    r === "warehouse_staff" || r === "warehouse staff" || r === "warehouse" ||
    r === "sales_staff" || r === "sales staff" || r === "sale staff" || r === "sales"
  ) return "staff";
  return r;
}

export function hasAnyRole(user, allowedRoles) {
  const role = normalizeRole(user?.role);
  const allowedNorm = (allowedRoles || []).map((x) => normalizeRole(x));
  if (allowedNorm.includes(role)) return true;
  // Hierarchy: manager inherits staff permissions.
  if (role === "manager" && allowedNorm.includes("staff")) return true;
  // Admin keeps full access to manager/staff screens.
  if (role === "admin" && (allowedNorm.includes("manager") || allowedNorm.includes("staff"))) return true;
  if (role === "staff") {
    return allowedNorm.some((a) => a === "warehouse" || a === "sales");
  }
  return false;
}

export function logout() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("manager_ai_chat_")) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}
