import { useCallback, useEffect, useState } from "react";
import { Sparkles, CheckCircle2, Brain } from "lucide-react";
import { api } from "../lib/api";
import { addDays, BAND, dur, hhmm } from "../lib/ui";
import { useMeta } from "../App";
import { Kpi, BandBadge, DeptChip, StatusBadge } from "../components/Bits";
import BlockPanel from "../components/BlockPanel";
import TimetableUpload from "../components/TimetableUpload";

// Number of "Blocks for approval" rows shown at a time
const BLOCKS_PAGE_SIZE = 10;

export default function Planner() {
  const meta = useMeta();
  const start = meta.now.slice(0, 10);
  const [horizon, setHorizon] = useState("week");
  const [sum, setSum] = useState(null);
  const [running, setRunning] = useState(false);
  const [day, setDay] = useState(start);
  const [blocks, setBlocks] = useState([]);
  // Number of rows shown in "Blocks for approval" (display only; approve-all still covers every block of the day)
  const [blockLimit, setBlockLimit] = useState(BLOCKS_PAGE_SIZE);
  const [sel, setSel] = useState(null);
  const [flash, setFlash] = useState("");

  const loadBlocks = useCallback(() => api.blocks(day, 1).then((b) => {
    const own = b.filter((x) => x.start.slice(0, 10) === day);
    setBlocks(own);
    setSel((s) => (s ? own.find((x) => x.id === s.id) || null : null));
  }), [day]);
  useEffect(() => { api.planSummary(horizon).then(setSum); }, [horizon]);
  useEffect(() => { loadBlocks(); }, [loadBlocks]);
  useEffect(() => { setBlockLimit(BLOCKS_PAGE_SIZE); }, [day]);

  const run = async () => {
    setRunning(true);
    const t = performance.now();
    const s = await api.runPlan(horizon);
    setSum(s);
    setFlash(`Plan regenerated in ${((performance.now() - t) / 1000).toFixed(1)} s`);
    setRunning(false);
    loadBlocks();
  };
  const approveDay = async () => {
    for (const b of blocks.filter((x) => x.status !== "APPROVED")) await api.approveBlock(b.id);
    setFlash(`All blocks of ${day} approved`);
    loadBlocks();
    api.planSummary(horizon).then(setSum);
  };

  const days = Array.from({ length: horizon === "week" ? 7 : 30 }, (_, i) => addDays(start, i));
  const toApprove = blocks.filter((b) => b.status !== "APPROVED").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <div className="font-semibold text-lg">AI block planner</div>
          <div className="text-xs text-slate-500">Combines TMS / SMMS / TDMS requests with the train time table and goods forecast into one rolling 30-day block plan. Weekly / Monthly changes the view.</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {flash && <span className="text-xs text-emerald-700">{flash}</span>}
          <div className="flex rounded-md border border-slate-300 overflow-hidden text-sm">
            {["week", "month"].map((h) => (
              <button key={h} onClick={() => setHorizon(h)} className={`px-3 py-1.5 ${horizon === h ? "bg-slate-900 text-white" : "bg-white"}`}>{h === "week" ? "Weekly" : "Monthly"}</button>
            ))}
          </div>
          <TimetableUpload />
          <button className="btn btn-primary" disabled={running} onClick={run}><Sparkles size={15} /> {running ? "Planning…" : "Run AI planner"}</button>
        </div>
      </div>

      {sum && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Kpi label="Works planned" value={sum.jobs_planned} hint={`${sum.from.slice(5, 10)} → ${sum.to.slice(5, 10)}`} />
            <Kpi label="Blocks" value={sum.blocks} />
            <Kpi label="Joint blocks" value={sum.joint_blocks} hint="shared by 2+ departments" tone="text-indigo-700" />
            <Kpi label="Track closure" value={`${Math.round(sum.track_closure_hours)} h`} hint={`for ${Math.round(sum.work_hours)} h of work`} />
            <Kpi label="Closure saved" value={`${sum.hours_saved_by_sharing} h`} hint="by running works together" tone="text-emerald-700" />
            <Kpi label="Avg wait, critical/high" value={`${sum.avg_wait_critical_high_h} h`} hint="from earliest start to block" />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="card p-4">
              <div className="font-semibold mb-3">Coverage by AI priority</div>
              {Object.entries(sum.by_band).map(([b, v]) => {
                const p = v.total ? Math.round((v.planned / v.total) * 100) : 100;
                return (
                  <div key={b} className="mb-2.5">
                    <div className="flex text-xs mb-1"><span>{b}</span><span className="ml-auto text-slate-500">{v.planned}/{v.total} · {p}%</span></div>
                    <div className="h-2 bg-slate-100 rounded"><div className="h-2 rounded" style={{ width: `${p}%`, background: BAND[b].color }} /></div>
                  </div>
                );
              })}
              <div className="text-xs font-medium text-slate-500 mt-4 mb-1">Not placed</div>
              {sum.unplanned_reasons.length === 0 ? <div className="text-xs text-slate-400">Everything due in this horizon has a slot.</div> :
                sum.unplanned_reasons.map(([r, n]) => <div key={r} className="text-xs flex"><span className="text-slate-600">{r}</span><span className="ml-auto font-medium">{n}</span></div>)}
            </div>

            <div className="card p-4">
              <div className="font-semibold mb-1 flex items-center gap-1.5"><Brain size={16} /> Priority model</div>
              <div className="text-xs text-slate-500 mb-3">{meta.model.algorithm} · trained on {meta.model.trained_on} past requests · cross-validated R² {meta.model.cv_r2}</div>
              {meta.model.feature_importance.filter((f) => f.weight > 0.005).map((f) => (
                <div key={f.feature} className="flex items-center gap-2 text-xs mb-1.5">
                  <span className="w-36 truncate">{f.feature}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded"><div className="h-2 bg-slate-800 rounded" style={{ width: `${f.weight * 100}%` }} /></div>
                  <span className="w-8 text-right text-slate-500">{Math.round(f.weight * 100)}%</span>
                </div>
              ))}
              <div className="text-[11px] text-slate-400 mt-2">Rank = 75% priority score + 25% deadline urgency. The engineer's own priority is a floor.</div>
            </div>

            <div className="card p-4 text-xs text-slate-600 space-y-1.5">
              <div className="font-semibold text-sm text-slate-800 mb-2">Planner rules</div>
              <p>1. Highest-ranked work is placed first, as early as possible.</p>
              <p>2. A block never overlaps a train path in the time table (±{meta.rules.train_buffer_min} min buffer). Forecasted goods trains count when confidence ≥ {Math.round(meta.rules.goods_forecast_min_confidence * 100)}%.</p>
              <p>3. Two departments share a block when both allow it – in parallel, or back-to-back.</p>
              <p>4. Crews and machines (tower wagons, track machines, testing kits) cannot be double-booked.</p>
              <p>5. Dependent work (e.g. isolation → OHE repair) is sequenced.</p>
              <p>6. Approved blocks are frozen; re-planning only moves pending ones.</p>
            </div>
          </div>
        </>
      )}

      <div className="card p-4">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="font-semibold">Blocks for approval</div>
          <div className="flex gap-1 flex-wrap">
            {days.map((d) => (
              <button key={d} onClick={() => setDay(d)} className={`px-2 py-1 rounded text-xs border ${d === day ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200 hover:bg-slate-50"}`}>
                {new Date(d + "T00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
              </button>
            ))}
          </div>
          {toApprove > 0 && <button className="btn btn-green ml-auto" onClick={approveDay}><CheckCircle2 size={15} /> Approve {toApprove} pending block{toApprove > 1 ? "s" : ""} of this day</button>}
        </div>
        <table className="w-full">
          <thead>
            <tr>{["Block", "Section / line", "Time", "Given", "Departments", "Works", "Top priority", "Status"].map((h) => <th key={h} className="th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {blocks.slice(0, blockLimit).map((b) => (
              <tr key={b.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSel(b)}>
                <td className="td font-medium">{b.id}</td>
                <td className="td">{b.section} · {b.line}</td>
                <td className="td">{hhmm(b.start)}–{hhmm(b.end)}</td>
                <td className="td">{dur(b.duration_min)}</td>
                <td className="td"><div className="flex gap-2">{b.departments.map((d) => <DeptChip key={d} dept={d} />)}</div></td>
                <td className="td text-xs text-slate-600">{b.tasks.map((t) => t.work_description).join(", ")}</td>
                <td className="td"><BandBadge band={b.top_band} /></td>
                <td className="td"><StatusBadge status={b.status} /></td>
              </tr>
            ))}
            {blocks.length === 0 && <tr><td className="td text-slate-400" colSpan={8}>No blocks planned on this day.</td></tr>}
          </tbody>
        </table>
        {blocks.length > blockLimit && <button className="btn mt-3" onClick={() => setBlockLimit(blockLimit + BLOCKS_PAGE_SIZE)}>Show more ({blocks.length - blockLimit} left)</button>}
      </div>

      <BlockPanel block={sel} others={blocks} canApprove onClose={() => setSel(null)} onChanged={() => { loadBlocks(); api.planSummary(horizon).then(setSum); }} />
    </div>
  );
}
