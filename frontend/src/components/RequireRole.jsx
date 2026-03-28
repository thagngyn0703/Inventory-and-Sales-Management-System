import React from "react";
import AccessDenied from "./AccessDenied";
import { getCurrentUser, hasAnyRole } from "../utils/auth";

export default function RequireRole({ allowedRoles, children, message }) {
  const user = getCurrentUser();

  if (!hasAnyRole(user, allowedRoles || [])) {
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

