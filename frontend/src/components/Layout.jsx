import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, Link, useNavigate, useParams } from "react-router-dom";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { SYSTEMS, DEPT_COLOR, niceDay } from "../lib/ui";
import { useMeta } from "../App";
import { useAuth } from "../auth/AuthContext";

export default function Layout() {
  const { sys } = useParams();
  const s = SYSTEMS[sys];
  const meta = useMeta();
  const modules = [
    ["dashboard", "Dashboard"],
    ["schedule", sys === "coa" ? "AI Block Planner" : "Maintenance Schedule"],
    ["register", "Block Request Register"],
  ];
  const accent = s.dept ? DEPT_COLOR[s.dept] : "#0f172a";

  return (
    <div className="min-h-screen">
      <header className="px-4 pt-3">
        <div className="max-w-[1500px] mx-auto px-4 flex items-center gap-6 h-14 bg-white border border-slate-200 rounded-xl shadow-sm">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <img src="/logo.png" alt="RailMatrix logo" className="w-7 h-7 rounded object-cover" /> RailMatrix
          </Link>
          <div className="flex items-center gap-2 pl-4 border-l border-slate-200">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: accent }} />
            <span className="font-medium">{s.title}</span>
            <span className="text-xs text-slate-500">{s.sub}</span>
          </div>
          <nav className="flex gap-1 ml-4">
            {modules.map(([to, label]) => (
              <NavLink
                key={to}
                to={`/${sys}/${to}`}
                className={({ isActive }) =>
                  `px-3 py-4 text-sm border-b-2 ${isActive ? "border-slate-900 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto text-xs text-slate-500">Plan date: {niceDay(meta.now.slice(0, 10))}</div>
          <Link to="/" className="text-xs text-slate-500 hover:underline">Switch system</Link>
          <ProfileMenu accent={accent} fallbackDept={s.title} />
        </div>
      </header>
      <main className="max-w-[1500px] mx-auto p-4">
        <Outlet />
      </main>
    </div>
  );
}

function ProfileMenu({ accent, fallbackDept }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = user?.name || user?.employeeId || "User";
  const role = user?.role || "—";
  const department = user?.departmentName || fallbackDept;

  // Go to Home first, then clear the session once the dashboard has unmounted
  // (clearing it first would make the route guard redirect to the login page instead).
  const loggingOut = useRef(false);
  const logoutRef = useRef(logout);
  logoutRef.current = logout;
  useEffect(() => () => { if (loggingOut.current) logoutRef.current(); }, []);

  const handleLogout = () => {
    setOpen(false);
    loggingOut.current = true;
    navigate("/", { replace: true });
  };

  return (
    <div className="relative pl-4 border-l border-slate-200" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="User profile"
        className="flex items-center gap-1 rounded-full p-0.5 hover:bg-slate-100 transition"
      >
        <span className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ background: accent }}>
          <UserRound size={16} />
        </span>
        <ChevronDown size={14} className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-[1100] overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
            <span className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: accent }}>
              <UserRound size={18} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">{name}</div>
              <div className="text-xs text-slate-500 truncate">{role}</div>
            </div>
          </div>
          <dl className="px-4 py-3 text-xs space-y-1.5 border-b border-slate-100">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Role</dt><dd className="text-slate-800 text-right">{role}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Department</dt><dd className="text-slate-800 text-right">{department}</dd></div>
          </dl>
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition"
          >
            <LogOut size={15} /> Logout
          </button>
        </div>
      )}
    </div>
  );
}
