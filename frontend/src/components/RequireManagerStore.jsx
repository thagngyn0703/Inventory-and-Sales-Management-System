import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getCurrentUser, normalizeRole } from "../utils/auth";

export default function RequireManagerStore({ children }) {
  const location = useLocation();
  const user = getCurrentUser();
  const role = normalizeRole(user?.role);
  const hasStoreId = Boolean(user?.storeId);

  if (role === "manager" && !hasStoreId && location.pathname !== "/manager/store/register") {
    return <Navigate to="/manager/store/register" replace />;
  }

  return children;
}
