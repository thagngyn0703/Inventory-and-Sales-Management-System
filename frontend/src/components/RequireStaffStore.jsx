import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getCurrentUser, normalizeRole } from "../utils/auth";

export default function RequireStaffStore({ children }) {
  const location = useLocation();
  const user = getCurrentUser();
  const role = normalizeRole(user?.role);
  const hasStoreId = Boolean(user?.storeId);
  const isStaffRole = role === "warehouse" || role === "sales";

  if (isStaffRole && !hasStoreId && location.pathname !== "/no-store-assigned") {
    return <Navigate to="/no-store-assigned" replace />;
  }

  return children;
}
