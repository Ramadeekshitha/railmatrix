// Shared colours, labels and time helpers.

export const SYSTEMS = {
  eng: { key: "eng", dept: "Engineering", title: "Engineering", sub: "Track & Works · TMS" },
  snt: { key: "snt", dept: "S&T", title: "Signal & Telecom", sub: "S&T · SMMS" },
  trd: { key: "trd", dept: "TD", title: "Traction (TRD)", sub: "OHE & Power · TDMS" },
  coa: { key: "coa", dept: null, title: "Control Office", sub: "COA · Block approval" },
};

export const DEPT_COLOR = { Engineering: "#2563eb", "S&T": "#7c3aed", TD: "#ea580c" };
export const DEPT_SHORT = { Engineering: "ENGG", "S&T": "S&T", TD: "TRD" };

export const BAND = {
  Critical: { color: "#dc2626", cls: "bg-red-100 text-red-800 border-red-200" },
  High: { color: "#f59e0b", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  Medium: { color: "#0ea5e9", cls: "bg-sky-100 text-sky-800 border-sky-200" },
  Low: { color: "#94a3b8", cls: "bg-slate-100 text-slate-700 border-slate-200" },
};

export const STATUS = {
  APPROVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  PROPOSED: "bg-amber-100 text-amber-800 border-amber-200",
  "PART APPROVED": "bg-teal-100 text-teal-800 border-teal-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
};

// "2026-09-28 04:15" -> minutes from start of `day` ("2026-09-28")
export function minOfDay(ts, day) {
  const d = new Date(ts.replace(" ", "T"));
  const base = new Date(day + "T00:00");
  return Math.round((d - base) / 60000);
}
export const hhmm = (ts) => (ts ? ts.slice(11, 16) : "—");
export const dmy = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts.slice(0, 10) + "T00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};
export const dur = (min) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;
export const clockLabel = (m) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;
export function addDays(day, n) {
  const d = new Date(day + "T00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}
export const niceDay = (day) =>
  new Date(day + "T00:00").toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
