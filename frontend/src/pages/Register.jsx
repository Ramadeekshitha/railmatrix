import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, X, Search } from "lucide-react";
import { api } from "../lib/api";
import { dmy, hhmm } from "../lib/ui";
import { BandBadge, DeptChip, StatusBadge } from "../components/Bits";

const TABS = ["PENDING", "APPROVED", "REJECTED"];
const TAB_LABEL = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected" };

// Number of register rows shown at a time (display only; data, counts and search still use all rows)
const PAGE_SIZE = 10;

export default function Register() {
  const { sys } = useParams();
  const isCoa = sys === "coa";
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState("PENDING");
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [sortBy, setSortBy] = useState("soonest");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [rejecting, setRejecting] = useState(null);
  const [remark, setRemark] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => api.requests(isCoa ? "" : sys).then(setRows), [sys, isCoa]);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t, rows.filter((r) => r.status === t).length])), [rows]);
  const shown = useMemo(() => {
    const s = q.toLowerCase();
    const list = rows.filter((r) => r.status === tab && (!dept || r.department === dept) &&
      (!s || `${r.id} ${r.work_description} ${r.section} ${r.asset_id} ${r.asset_type}`.toLowerCase().includes(s)));
    if (sortBy === "priority") return list.sort((a, b) => b.rank_score - a.rank_score);
    if (tab === "REJECTED") return list.sort((a, b) => (b.decided_at || "").localeCompare(a.decided_at || ""));
    // soonest block first, works without a slot at the end
    return list.sort((a, b) => (a.planned_start || "9999").localeCompare(b.planned_start || "9999") || b.rank_score - a.rank_score);
  }, [rows, tab, q, dept, sortBy]);

  const decide = async (id, decision, rmk = "") => {
    setError("");
    try {
      const upd = await api.decide(id, decision, rmk);
      setRows((rs) => rs.map((r) => (r.id === id ? upd : r)));
      setRejecting(null); setRemark("");
    } catch (e) { setError(`${id}: ${e.message}`); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <div className="font-semibold text-lg">Block request register</div>
          <div className="text-xs text-slate-500">{isCoa ? "All departments · approve or reject the AI-proposed block" : "Your requests and COA decisions"}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isCoa && (
            <select className="input w-auto" value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">All departments</option><option value="Engineering">Engineering</option><option value="S&T">S&T</option><option value="TD">TRD</option>
            </select>
          )}
          <select className="input w-auto" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="soonest">Sort: soonest block</option><option value="priority">Sort: AI priority</option>
          </select>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input className="input pl-8 w-64" placeholder="Search ID, work, section, asset" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => { setTab(t); setLimit(PAGE_SIZE); }} className={`px-4 py-2 text-sm border-b-2 -mb-px ${tab === t ? "border-slate-900 font-medium" : "border-transparent text-slate-500"}`}>
            {TAB_LABEL[t]} <span className="ml-1 text-xs text-slate-400">{counts[t]}</span>
          </button>
        ))}
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1000px]">
          <thead>
            <tr>
              <th className="th">Request</th>
              <th className="th">Work</th>
              <th className="th">Location</th>
              <th className="th">AI priority</th>
              <th className="th">Needed by</th>
              <th className="th">{tab === "APPROVED" ? "Block allocated" : "AI proposed block"}</th>
              <th className="th">{tab === "PENDING" ? (isCoa ? "Decision" : "Status") : "COA remark"}</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, limit).map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="td">
                  <div className="font-medium text-xs">{r.id}</div>
                  <div className="text-[11px] text-slate-500 flex gap-1.5 items-center"><DeptChip dept={r.department} /> {r.source_system}</div>
                </td>
                <td className="td">
                  <div>{r.work_description}</div>
                  <div className="text-[11px] text-slate-500">{r.work_type} · {r.asset_type} {r.asset_id || ""} · {r.block_type} · {r.duration_min} min</div>
                </td>
                <td className="td text-xs">
                  <div>{r.section} · {r.line} · km {r.km_start.toFixed(2)}</div>
                  <div className="text-[11px] text-slate-400">{r.lat.toFixed(4)}, {r.lon.toFixed(4)}</div>
                </td>
                <td className="td">
                  <BandBadge band={r.priority_band} score={r.priority_score} />
                  <div className="text-[11px] text-slate-500 mt-1 max-w-52">{r.reasons.join(" · ")}</div>
                </td>
                <td className="td text-xs whitespace-nowrap">{dmy(r.latest_finish)} {hhmm(r.latest_finish)}</td>
                <td className="td text-xs whitespace-nowrap">
                  {r.planned_start ? (
                    <><div className="font-medium">{dmy(r.planned_start)} · {hhmm(r.planned_start)}–{hhmm(r.planned_end)}</div><div className="text-[11px] text-slate-400">{r.block_id || "—"}</div></>
                  ) : <span className="text-red-600 whitespace-normal">{r.plan_note || "Not planned"}</span>}
                </td>
                <td className="td text-xs">
                  {tab !== "PENDING" ? (
                    <><StatusBadge status={r.status} /><div className="text-[11px] text-slate-500 mt-1">{r.coa_remark}</div></>
                  ) : !isCoa ? (
                    <StatusBadge status="PENDING" />
                  ) : rejecting === r.id ? (
                    <div className="flex gap-1">
                      <input autoFocus className="input py-1 text-xs w-40" placeholder="Reason for rejection" value={remark} onChange={(e) => setRemark(e.target.value)} />
                      <button className="btn btn-red px-2" disabled={!remark.trim()} onClick={() => decide(r.id, "REJECTED", remark)}>Reject</button>
                      <button className="btn px-2" onClick={() => setRejecting(null)}><X size={13} /></button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <button className="btn btn-green px-2" disabled={!r.planned_start} onClick={() => decide(r.id, "APPROVED", "Approved")}><Check size={13} /> Approve</button>
                      <button className="btn btn-red px-2" onClick={() => { setRejecting(r.id); setRemark(""); }}><X size={13} /> Reject</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={7} className="td text-center text-slate-400 py-8">No {TAB_LABEL[tab].toLowerCase()} requests.</td></tr>}
          </tbody>
        </table>
      </div>
      {shown.length > limit && <button className="btn" onClick={() => setLimit(limit + PAGE_SIZE)}>Show more ({shown.length - limit} left)</button>}
    </div>
  );
}
