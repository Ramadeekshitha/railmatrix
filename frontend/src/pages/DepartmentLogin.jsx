import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Radio,
  ShieldCheck,
  UserRound,
  Wrench,
  Zap,
} from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { dashboardPathFor, normalizeDepartment } from "../auth/departments";

const DEPARTMENTS = {
  engineering: {
    name: "Civil & Track Engineering",
    shortName: "Engineering",
    role: "Engineering Officer",
    code: "ENG",
    employeeId: "IR-ENG-001",
    password: "railtwin123",
    icon: Wrench,
    accent: "#0B3A63",
    accentLight: "#E8EEF4",
  },
  civil: {
    name: "Civil & Track Engineering",
    shortName: "Engineering",
    role: "Engineering Officer",
    code: "ENG",
    employeeId: "IR-ENG-001",
    password: "railtwin123",
    icon: Wrench,
    accent: "#0B3A63",
    accentLight: "#E8EEF4",
  },
  track: {
    name: "Civil & Track Engineering",
    shortName: "Engineering",
    role: "Engineering Officer",
    code: "ENG",
    employeeId: "IR-ENG-001",
    password: "railtwin123",
    icon: Wrench,
    accent: "#0B3A63",
    accentLight: "#E8EEF4",
  },

  signalling: {
    name: "Signalling & Telecom",
    shortName: "Signalling",
    role: "Signalling Officer",
    code: "S&T",
    employeeId: "IR-ST-001",
    password: "railtwin123",
    icon: Radio,
    accent: "#123B52",
    accentLight: "#E7F0F4",
  },
  snt: {
    name: "Signalling & Telecom",
    shortName: "Signalling",
    role: "Signalling Officer",
    code: "S&T",
    employeeId: "IR-ST-001",
    password: "railtwin123",
    icon: Radio,
    accent: "#123B52",
    accentLight: "#E7F0F4",
  },

  trd: {
    name: "Traction & OHE",
    shortName: "Traction & OHE",
    role: "TRD Officer",
    code: "TRD",
    employeeId: "IR-TRD-001",
    password: "railtwin123",
    icon: Zap,
    accent: "#5A3A08",
    accentLight: "#F7EEDB",
  },

  controller: {
    name: "Section Controller",
    shortName: "Controller",
    role: "Section Controller",
    code: "CTRL",
    employeeId: "IR-CTRL-001",
    password: "railtwin123",
    icon: ShieldCheck,
    accent: "#3D243F",
    accentLight: "#F2EAF1",
  },
};

export default function DepartmentLogin() {
  const { department } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const config = useMemo(
    () => DEPARTMENTS[department] || DEPARTMENTS.engineering,
    [department]
  );

  const Icon = config.icon;

  const [employeeId, setEmployeeId] = useState(config.employeeId);
  const [password, setPassword] = useState(config.password);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setEmployeeId(config.employeeId);
    setPassword(config.password);
    setError("");
  }, [config]);

  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");
    setIsLoggingIn(true);

    // Simulated network delay for prototype flow
    await new Promise((resolve) => setTimeout(resolve, 450));

    if (employeeId.trim().length > 0 && password.length > 0) {
      // Canonical department for the selected login page (unknown -> engineering, same as the UI config)
      const normalizedDept = normalizeDepartment(department) || "engineering";

      login({
        employeeId: employeeId.trim(),
        role: config.role,
        department: normalizedDept,
        departmentName: config.name,
      });

      // If the user was sent here from a protected page of this same department,
      // return them there; otherwise open the selected department's dashboard.
      const dashboard = dashboardPathFor(normalizedDept);
      const from = location.state?.from;
      const target =
        from && from.split("/")[1] === dashboard.split("/")[1] ? from : dashboard;

      navigate(target, { replace: true });
      return;
    }

    setIsLoggingIn(false);
    setError("Please check the Employee ID and password.");
  };

  return (
    <div className="min-h-screen bg-[#F3F5F7] flex">
      {/* LEFT BRAND PANEL */}
      <section
        className="hidden lg:flex lg:w-[44%] relative overflow-hidden"
        style={{
          background: `
            radial-gradient(circle at 20% 20%, rgba(36,91,133,0.42), transparent 34%),
            radial-gradient(circle at 85% 75%, rgba(10,35,56,0.65), transparent 38%),
            linear-gradient(145deg, #071522 0%, #0B2940 48%, #06111B 100%)
          `,
        }}
      >
        <div className="absolute inset-0 opacity-[0.08]">
          <div className="absolute left-[22%] top-[-10%] h-[125%] w-[2px] bg-white rotate-[10deg]" />
          <div className="absolute left-[29%] top-[-10%] h-[125%] w-[2px] bg-white rotate-[10deg]" />
          <div className="absolute left-[15%] top-[28%] w-[80%] h-px bg-white rotate-[10deg]" />
          <div className="absolute left-[10%] top-[42%] w-[85%] h-px bg-white rotate-[10deg]" />
          <div className="absolute left-[5%] top-[56%] w-[90%] h-px bg-white rotate-[10deg]" />
        </div>

        <div className="relative z-10 flex flex-col justify-between w-full p-10 xl:p-14">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center shadow-lg overflow-hidden">
                <img src="/logo.png" alt="RailMatrix logo" className="w-full h-full object-cover" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white">
                  RailMatrix
                </h1>
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                  Railway Infrastructure Platform
                </p>
              </div>
            </div>
          </div>

          <div className="max-w-lg">
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border"
              style={{
                borderColor: `${config.accent}88`,
                backgroundColor: `${config.accent}33`,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-300">
                Secure Department Access
              </span>
            </div>

            <h2 className="mt-6 text-4xl xl:text-5xl font-bold tracking-tight leading-[1.08] text-white">
              Railway operations,
              <br />
              connected through
              <span className="text-sky-400"> one platform.</span>
            </h2>

            <p className="mt-6 max-w-md text-sm leading-6 text-slate-400">
              Access your department workspace, infrastructure intelligence,
              maintenance operations and real-time railway data through RailMatrix.
            </p>
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>RAILMATRIX • OPERATIONS PLATFORM</span>
            <span>PROTOTYPE ACCESS</span>
          </div>
        </div>
      </section>

      {/* RIGHT LOGIN PANEL */}
      <main className="flex-1 flex items-center justify-center px-5 py-8 sm:px-8">
        <div className="w-full max-w-[470px]">
          <div className="flex items-center justify-between mb-9">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{
                  backgroundColor: config.accentLight,
                  color: config.accent,
                }}
              >
                <Icon size={22} strokeWidth={2} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-slate-400">
                  Department Access
                </p>
                <h2 className="text-base font-bold text-[#16212B] mt-0.5">
                  {config.name}
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate("/")}
              className="text-xs font-semibold text-slate-500 hover:text-[#0B3A63] transition"
            >
              ← Back
            </button>
          </div>

          <div className="mb-7">
            <h1 className="text-3xl font-bold tracking-tight text-[#16212B]">
              Welcome back
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Sign in to continue to your {config.shortName} workspace.
            </p>
          </div>

          <div className="bg-white border border-[#DCE2E7] rounded-2xl shadow-[0_12px_40px_rgba(15,35,50,0.08)] p-6 sm:p-8">
            <form onSubmit={handleLogin}>
              <div className="mb-5">
                <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 mb-2">
                  Employee ID
                </label>
                <div className="relative">
                  <UserRound
                    size={17}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className="w-full h-12 pl-11 pr-4 rounded-xl border border-[#D6DDE3] bg-[#FAFBFC] text-sm font-medium text-[#1D2A34] outline-none transition focus:bg-white focus:border-[#0B3A63] focus:ring-4 focus:ring-[#0B3A63]/10"
                    placeholder="Enter employee ID"
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                    Password
                  </label>
                  <span className="text-[10px] font-semibold text-slate-400">
                    Prototype
                  </span>
                </div>
                <div className="relative">
                  <LockKeyhole
                    size={17}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-12 pl-11 pr-12 rounded-xl border border-[#D6DDE3] bg-[#FAFBFC] text-sm font-medium text-[#1D2A34] outline-none transition focus:bg-white focus:border-[#0B3A63] focus:ring-4 focus:ring-[#0B3A63]/10"
                    placeholder="Enter password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="mb-5 px-3.5 py-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoggingIn}
                className="group w-full h-12 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                style={{
                  backgroundColor: config.accent,
                }}
              >
                {isLoggingIn ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    Sign In to {config.shortName}
                    <ArrowRight
                      size={17}
                      className="transition-transform group-hover:translate-x-1"
                    />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}