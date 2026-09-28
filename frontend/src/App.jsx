import { createContext, useContext, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { api } from "./lib/api";
import { SYSTEMS } from "./lib/ui";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Schedule from "./pages/Schedule";
import Planner from "./pages/Planner";
import Register from "./pages/Register";

// Authentication Imports
import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import { DEPARTMENT_TO_SYSTEM, SYSTEM_TO_DEPARTMENT, normalizeDepartment } from "./auth/departments";
import DepartmentLogin from "./pages/DepartmentLogin";

const MetaContext = createContext(null);
export const useMeta = () => useContext(MetaContext);

export default function App() {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.meta().then(setMeta).catch((e) => setError(e.message));
  }, []);

  if (error)
    return (
      <div className="p-10 text-center text-sm">
        Cannot reach the backend ({error}). Start it with <code>uvicorn app.main:app --reload</code> in <code>backend/</code>.
      </div>
    );
  if (!meta) return <div className="p-10 text-center text-sm text-slate-500">Loading…</div>;

  return (
    <AuthProvider>
      <MetaContext.Provider value={meta}>
        <Routes>
          {/* Home Page */}
          <Route path="/" element={<Home />} />

          {/* Department Login Page */}
          <Route path="/login/:department" element={<DepartmentLogin />} />

          {/* Protected department workspaces: /eng, /snt, /trd, /coa */}
          <Route path="/:sys" element={<System />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="schedule" element={<ScheduleOrPlanner />} />
            <Route path="register" element={<Register />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MetaContext.Provider>
    </AuthProvider>
  );
}

function System() {
  const { sys } = useParams();
  const location = useLocation();

  // Alias URLs (e.g. /track/dashboard, /signalling/schedule) -> canonical system key
  if (!SYSTEMS[sys]) {
    const canonical = DEPARTMENT_TO_SYSTEM[normalizeDepartment(sys)];
    if (canonical) {
      const rest = location.pathname.split("/").slice(2).join("/") || "dashboard";
      return <Navigate to={`/${canonical}/${rest}`} replace />;
    }
    // Unknown system key -> back to Home
    return <Navigate to="/" replace />;
  }

  // Every department workspace requires a login for that department
  return (
    <ProtectedRoute department={SYSTEM_TO_DEPARTMENT[sys]}>
      <Layout />
    </ProtectedRoute>
  );
}

function ScheduleOrPlanner() {
  const { sys } = useParams();
  return sys === "coa" ? <Planner /> : <Schedule />;
}