import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { api } from "../lib/api";
import { SYSTEMS, addDays, BAND } from "../lib/ui";
import { useMeta } from "../App";
import { Kpi } from "../components/Bits";
import DaysTimeline from "../components/DaysTimeline";
import BlockPanel from "../components/BlockPanel";
import RequestForm from "../components/RequestForm";

export default function Schedule() {
  const { sys } = useParams();
  const meta = useMeta();
  const start = meta.now.slice(0, 10);
  const [horizon, setHorizon] = useState("week");
  const [colorBy, setColorBy] = useState("band");
  const [reqs, setReqs] = useState([]);
  const [block, setBlock] = useState(null);
  const [dayBlocks, setDayBlocks] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const days = horizon === "week" ? 7 : 30;
  const end = addDays(start, days);

  const load = useCallback(() => api.requests(sys).then(setReqs), [sys]);
  useEffect(() => { load(); }, [load]);

  const items = useMemo(
    () => reqs.filter((r) => r.planned_start && r.status !== "REJECTED" && r.planned_start >= start && r.planned_start < end),
    [reqs, start, end]
  );
  const due = reqs.filter((r) => r.status === "PENDING" && r.earliest_start < end);
  const unplanned = due.filter((r) => !r.planned_start);

  const openItem = async (it) => {
    const day = it.planned_start.slice(0, 10);
    const bl = await api.blocks(day, 1, sys);
    setDayBlocks(bl);
    setBlock(bl.find((b) => b.id === it.block_id) || null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <div className="font-semibold text-lg">Maintenance schedule</div>
          <div className="text-xs text-slate-500">{SYSTEMS[sys].title} works placed in blocks by the AI planner</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border border-slate-300 overflow-hidden text-sm">
            {["week", "month"].map((h) => (
              <button key={h} onClick={() => setHorizon(h)} className={`px-3 py-1.5 ${horizon === h ? "bg-slate-900 text-white" : "bg-white"}`}>
                {h === "week" ? "Weekly" : "Monthly"}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> New block request</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label={`Works planned (${horizon === "week" ? "7" : "30"} days)`} value={items.length} />
        <Kpi label="Approved by COA" value={items.filter((i) => i.status === "APPROVED").length} tone="text-emerald-700" />
        <Kpi label="Awaiting COA" value={items.filter((i) => i.status === "PENDING").length} tone="text-amber-700" />
        <Kpi label="No slot found" value={unplanned.length} hint={unplanned[0]?.plan_note} tone={unplanned.length ? "text-red-700" : ""} />
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="font-semibold">{horizon === "week" ? "Weekly" : "Monthly"} block plan</div>
          <div className="ml-auto flex items-center gap-3 text-[11px] text-slate-600">
            <span>Colour by</span>
            <select className="input w-auto py-0.5 text-xs" value={colorBy} onChange={(e) => setColorBy(e.target.value)}>
              <option value="band">AI priority</option><option value="dept">Department</option>
            </select>
            {colorBy === "band" && Object.entries(BAND).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: v.color }} />{k}</span>
            ))}
            <span className="flex items-center gap-1"><span className="w-4 h-3 rounded-sm bg-slate-400/40 border border-dashed border-slate-700" />Awaiting COA (light)</span>
          </div>
        </div>
        <DaysTimeline start={start} days={days} items={items} onSelect={openItem} colorBy={colorBy} />
      </div>

      {unplanned.length > 0 && (
        <div className="card p-4">
          <div className="font-semibold mb-2">Works the planner could not place</div>
          <table className="w-full">
            <thead><tr><th className="th">Request</th><th className="th">Work</th><th className="th">Location</th><th className="th">Priority</th><th className="th">Reason</th></tr></thead>
            <tbody>
              {unplanned.map((r) => (
                <tr key={r.id}>
                  <td className="td text-xs">{r.id}</td><td className="td">{r.work_description}</td>
                  <td className="td text-xs">{r.section} {r.line} km {r.km_start.toFixed(1)}</td>
                  <td className="td text-xs">{r.priority_band}</td><td className="td text-xs text-red-700">{r.plan_note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BlockPanel block={block} others={dayBlocks} onClose={() => setBlock(null)} />
      {showForm && <RequestForm sys={sys} onClose={() => setShowForm(false)} onCreated={load} />}
    </div>
  );
}
