import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getCurrentUser, normalizeRole } from "../utils/auth";

export default function RequireManagerStore({ children }) {
  const location = useLocation();
  const user = getCurrentUser();
  const role = normalizeRole(user?.role);
  const hasStoreId = Boolean(user?.storeId);
  const approvalStatus = String(user?.storeApprovalStatus || "").toLowerCase();
  const canAccessWhileLocked = ["/manager/store/register", "/manager/settings"].some((path) =>
    location.pathname.startsWith(path)
  );

  if (
    role === "manager" &&
    !hasStoreId &&
    location.pathname !== "/manager/store/register"
  ) {
    return <Navigate to="/manager/store/register" replace />;
  }

  if (
    role === "manager" &&
    hasStoreId &&
    ["draft_profile", "pending_approval", "rejected", "suspended"].includes(approvalStatus) &&
    !canAccessWhileLocked
  ) {
    return <Navigate to="/manager/settings" replace />;
  }

  return children;
}
