import React from "react";
import { Navigate } from "react-router-dom";
import { isLoggedIn } from "../utils/auth";

export default function RequireAuth({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return children;
}

