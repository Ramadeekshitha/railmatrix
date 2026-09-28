import { BAND, STATUS, DEPT_COLOR, DEPT_SHORT } from "../lib/ui";

export const Badge = ({ children, cls = "" }) => (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-medium whitespace-nowrap ${cls}`}>{children}</span>
);
export const BandBadge = ({ band, score }) => (
  <Badge cls={BAND[band]?.cls}>{band}{score != null ? ` · ${Math.round(score)}` : ""}</Badge>
);
export const StatusBadge = ({ status }) => <Badge cls={STATUS[status]}>{status}</Badge>;
export const DeptChip = ({ dept }) => (
  <span className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap">
    <span className="w-2 h-2 rounded-full" style={{ background: DEPT_COLOR[dept] }} />
    {DEPT_SHORT[dept] || dept}
  </span>
);
export const Kpi = ({ label, value, hint, tone = "" }) => (
  <div className="card px-4 py-3">
    <div className="text-xs text-slate-500">{label}</div>
    <div className={`text-2xl font-semibold mt-0.5 ${tone}`}>{value}</div>
    {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
  </div>
);
