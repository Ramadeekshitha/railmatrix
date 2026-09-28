import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { api } from "../lib/api";
import { SYSTEMS, DEPT_COLOR, DEPT_SHORT, BAND, addDays, niceDay, clockLabel, hhmm, dmy } from "../lib/ui";
import { useMeta } from "../App";
import { Kpi, BandBadge, DeptChip } from "../components/Bits";
import Timeline24 from "../components/Timeline24";
import TwinMap from "../components/TwinMap";
import BlockPanel from "../components/BlockPanel";

export default function Dashboard() {
  const { sys } = useParams();
  const meta = useMeta();
  const myDept = SYSTEMS[sys].dept;
  const deptParam = sys === "coa" ? "" : sys;

  const [day, setDay] = useState(meta.now.slice(0, 10));
  const [clock, setClock] = useState(60);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(20);
  const [data, setData] = useState({ blocks: [], trains: [], works: [], summary: null });
  const [selected, setSelected] = useState(null);
  const [focus, setFocus] = useState(null);
  const [band, setBand] = useState("All");

  const load = useCallback(async () => {
    const [blocks, trains, works, summary] = await Promise.all([
      api.blocks(day, 1, deptParam), api.trains(day), api.requests(deptParam), api.summary(deptParam, day),
    ]);
    setData({ blocks, trains, works: works.filter((w) => w.status !== "REJECTED"), summary });
    setSelected((sel) => (sel ? blocks.find((b) => b.id === sel.id) || null : null));
  }, [day, deptParam]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setClock((c) => (c + speed / 10) % 1440), 100);
    return () => clearInterval(id);
  }, [playing, speed]);

  // pending works that fall in the rolling 30-day plan, highest AI rank first
  const horizonEnd = addDays(meta.now.slice(0, 10), 30);
  const pending = useMemo(
    () => data.works.filter((w) => w.status === "PENDING" && w.earliest_start < horizonEnd && (band === "All" || w.priority_band === band)),
    [data.works, band, horizonEnd]
  );
  const s = data.summary;
  const myBlocksToday = myDept ? data.blocks.filter((b) => b.departments.includes(myDept)) : data.blocks;

  const pickWork = (w) => {
    setFocus({ lat: w.lat, lon: w.lon, id: w.id });
    if (w.planned_start?.slice(0, 10) === day) {
      const b = data.blocks.find((x) => x.id === w.block_id);
      if (b) setSelected(b);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label={myDept ? "My blocks today" : "Blocks today"} value={myBlocksToday.length} hint={`${myBlocksToday.filter((b) => b.status === "APPROVED").length} approved by COA`} />
        <Kpi label="Pending works" value={s?.pending ?? "–"} hint="awaiting COA decision" tone="text-amber-700" />
        <Kpi label="Critical pending" value={s?.pending_critical ?? "–"} hint="AI priority band" tone="text-red-700" />
        <Kpi label="Approved" value={s?.approved ?? "–"} tone="text-emerald-700" />
        <Kpi label="Not yet schedulable" value={s?.pending_unplanned ?? "–"} hint="no slot in next 30 days" />
      </div>

      {/* ------------------------------------------------ 24h timeline */}
      <div className="card p-4">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="font-semibold">24-hour block timeline</div>
          <div className="flex items-center gap-1">
            <button className="btn px-1.5" onClick={() => setDay(addDays(day, -1))}><ChevronLeft size={16} /></button>
            <input type="date" className="input w-40 py-1" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
            <button className="btn px-1.5" onClick={() => setDay(addDays(day, 1))}><ChevronRight size={16} /></button>
          </div>
          <span className="text-sm text-slate-500">{niceDay(day)}</span>
          <div className="ml-auto flex items-center gap-3 text-[11px] text-slate-600">
            {Object.entries(DEPT_COLOR).filter(([d]) => !myDept || d === myDept).map(([d, c]) => (
              <span key={d} className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: c }} />{DEPT_SHORT[d]}</span>
            ))}
            <span className="flex items-center gap-1"><span className="w-4 h-3 rounded-sm border border-dashed border-slate-500 hatch bg-slate-400" />Awaiting COA</span>
            <span className="flex items-center gap-1"><span className="w-4 h-1 bg-slate-400" />Passenger train</span>
            <span className="flex items-center gap-1"><span className="w-4 h-1 bg-amber-800/60" />Goods train</span>
          </div>
        </div>
        <Timeline24
          day={day} network={meta.network} blocks={data.blocks} trains={data.trains}
          myDept={myDept} selectedId={selected?.id} onSelect={setSelected}
          clock={clock} onClock={setClock}
        />
        <div className="text-[11px] text-slate-400 mt-2">Click a block to see time given and works approved. Click the hour axis to move the clock.{myDept && " Only your department's blocks are shown."}</div>
      </div>

      {/* ------------------------------------------------ twin + pending */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-4 lg:col-span-2">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <div className="font-semibold">Track twin</div>
            <span className="text-xs text-slate-500">works by AI priority · trains per time table · sections under block</span>
            <div className="ml-auto flex items-center gap-2">
              <button className="btn px-2" onClick={() => setPlaying(!playing)}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
              <span className="font-mono text-sm w-12">{clockLabel(clock)}</span>
              <input type="range" min={0} max={1439} value={Math.floor(clock)} onChange={(e) => setClock(+e.target.value)} className="w-40" />
              <select className="input w-auto py-1" value={speed} onChange={(e) => setSpeed(+e.target.value)}>
                <option value={5}>5 min/s</option><option value={20}>20 min/s</option><option value={60}>60 min/s</option>
              </select>
            </div>
          </div>
          <TwinMap network={meta.network} day={day} clock={clock} blocks={data.blocks} trains={data.trains} works={data.works} focus={focus} onSelectBlock={setSelected} />
        </div>

        <div className="card p-4 flex flex-col" style={{ maxHeight: 560 }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="font-semibold">Pending works</div>
            <span className="text-xs text-slate-500">{pending.length}</span>
            <select className="input w-auto py-1 ml-auto" value={band} onChange={(e) => setBand(e.target.value)}>
              <option>All</option>{Object.keys(BAND).map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div className="text-[11px] text-slate-400 mb-2">Due in the next 30 days, ranked by AI (priority + urgency). Click to locate on the twin.</div>
          <div className="overflow-y-auto -mx-4 flex-1">
            {pending.slice(0, 80).map((w) => (
              <button key={w.id} onClick={() => pickWork(w)} className={`w-full text-left px-4 py-2 border-b border-slate-100 hover:bg-slate-50 ${focus?.id === w.id ? "bg-slate-100" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: BAND[w.priority_band].color }} />
                  <span className="text-sm font-medium truncate">{w.work_description}</span>
                  <span className="ml-auto"><BandBadge band={w.priority_band} score={w.priority_score} /></span>
                </div>
                <div className="text-[11px] text-slate-500 pl-4 flex gap-2">
                  {!myDept && <DeptChip dept={w.department} />}
                  <span>{w.section} {w.line} · km {w.km_start.toFixed(1)}</span>
                  <span className="ml-auto">{w.planned_start ? `proposed ${dmy(w.planned_start)} ${hhmm(w.planned_start)}` : <span className="text-red-600">{w.plan_note}</span>}</span>
                </div>
              </button>
            ))}
          </div>
          <Link to={`/${sys}/register`} className="text-xs text-slate-600 hover:underline pt-2">Open Block Request Register →</Link>
        </div>
      </div>

      <BlockPanel block={selected} others={data.blocks} canApprove={sys === "coa"} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}
