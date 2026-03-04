import React from "react";
import AccessDenied from "./AccessDenied";
import { getCurrentUser, hasAnyRole } from "../utils/auth";

export default function RequireRole({ allowedRoles, children, message }) {
  const user = getCurrentUser();

  // Dev-friendly: allow admin as "superuser"
  const effectiveAllowed = Array.from(new Set([...(allowedRoles || []), "admin"]));

  if (!hasAnyRole(user, effectiveAllowed)) {
    return (
      <AccessDenied
        title="Forbidden"
        message={
          message ||
          `Màn hình này chỉ dành cho: ${allowedRoles.join(", ")}. (role hiện tại: ${user?.role || "none"})`
        }
      />
    );
  }

  return children;
}

