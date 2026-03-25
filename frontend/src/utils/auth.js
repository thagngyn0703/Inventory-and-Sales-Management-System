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
  // allow a few common variants
  if (r === "warehouse staff" || r === "warehouse_staff") return "warehouse";
  if (r === "sales staff" || r === "sale staff" || r === "sales_staff") return "sales";
  return r;
}

export function hasAnyRole(user, allowedRoles) {
  const role = normalizeRole(user?.role);
  return allowedRoles.map(normalizeRole).includes(role);
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

