import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { normalizeDepartment } from "./departments";

export default function ProtectedRoute({
  department,
  children,
}) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  const targetDept = normalizeDepartment(department);
  const userDept = normalizeDepartment(user?.department);

  // Not signed in, or signed in to a different department:
  // go to that department's login and remember where the user was heading.
  if (!isAuthenticated || !user || !targetDept || userDept !== targetDept) {
    return (
      <Navigate
        to={`/login/${targetDept || department}`}
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return children;
}
