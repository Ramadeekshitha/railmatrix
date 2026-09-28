import { useMemo } from "react";
import { DEPT_COLOR, minOfDay, clockLabel } from "../lib/ui";

/**
 * 24-hour block timeline: one row per section & line.
 * Grey ticks = train paths from the working time table.
 * Coloured bars = blocks (colour = department; hatched = proposed, awaiting COA).
 */
const HOURS = Array.from({ length: 25 }, (_, i) => i);
const pct = (m) => `${(Math.min(Math.max(m, 0), 1440) / 1440) * 100}%`;

export default function Timeline24({ day, network, blocks, trains, myDept, selectedId, onSelect, clock, onClock }) {
  const rows = useMemo(
    () => network.flatMap((s) => ["Up", "Down"].map((line) => ({ key: `${s.section}|${line}`, s, line }))),
    [network]
  );

  const trainsByRow = useMemo(() => {
    const m = {};
    for (const t of trains) (m[`${t.section}|${t.line}`] ||= []).push(t);
    return m;
  }, [trains]);

  // Department dashboards (myDept set): only that department's blocks, and inside a joint
  // block only that department's works. Section Controller (no myDept): every block, all works.
  const visibleBlocks = useMemo(
    () =>
      myDept
        ? blocks
            .filter((b) => b.departments.includes(myDept))
            .map((b) => ({ ...b, tasks: b.tasks.filter((t) => t.department === myDept) }))
        : blocks,
    [blocks, myDept]
  );

  const blocksByRow = useMemo(() => {
    const m = {};
    for (const b of visibleBlocks) {
      const lines = b.line === "Both Lines" ? ["Up", "Down"] : [b.line];
      for (const ln of lines) (m[`${b.section}|${ln}`] ||= []).push(b);
    }
    return m;
  }, [visibleBlocks]);

  const setClockFromEvent = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    onClock?.(Math.round(((e.clientX - r.left) / r.width) * 1440));
  };

  return (
    <div className="text-xs select-none">
      {/* axis */}
      <div className="flex">
        <div className="w-56 shrink-0" />
        <div className="relative flex-1 h-6 cursor-pointer" onClick={setClockFromEvent} title="Click to move the simulation clock">
          {HOURS.map((h) => (
            <div key={h} className="absolute top-0 -translate-x-1/2 text-[10px] text-slate-400" style={{ left: pct(h * 60) }}>
              {h % 2 === 0 ? String(h).padStart(2, "0") : ""}
            </div>
          ))}
          {clock != null && (
            <div className="absolute -top-0.5 -translate-x-1/2 bg-red-600 text-white rounded px-1 text-[10px]" style={{ left: pct(clock) }}>
              {clockLabel(clock)}
            </div>
          )}
        </div>
      </div>

      <div className="relative">
        {rows.map(({ key, s, line }, i) => (
          <div key={key} className={`flex items-center ${line === "Down" ? "border-b border-slate-200" : ""}`}>
            <div className="w-56 shrink-0 pr-2 h-[26px] flex items-center gap-1.5 truncate">
              {line === "Up" ? (
                <span className="font-medium text-slate-700 truncate" title={`${s.corridor_name}`}>{s.section} <span className="font-normal text-slate-400">{s.name}</span></span>
              ) : (
                <span className="text-slate-400 pl-1">&nbsp;</span>
              )}
              <span className="ml-auto text-[10px] text-slate-400 shrink-0">{line}</span>
            </div>
            <div className={`relative flex-1 h-[26px] ${i % 4 < 2 ? "bg-slate-50" : "bg-white"}`}>
              {HOURS.map((h) => (
                <div key={h} className="absolute top-0 bottom-0 border-l border-slate-200/70" style={{ left: pct(h * 60) }} />
              ))}
              {(trainsByRow[key] || []).map((t) => {
                const a = minOfDay(t.start, day), b = minOfDay(t.end, day);
                return (
                  <div
                    key={t.id}
                    title={`${t.id} ${t.type} ${t.start.slice(11)}–${t.end.slice(11)}${t.goods_status === "Forecasted" ? ` (forecast ${Math.round(t.confidence * 100)}%)` : ""}`}
                    className={`absolute top-[11px] h-[4px] rounded-sm ${t.type === "Goods" ? (t.counts_for_planning ? "bg-amber-800/60" : "bg-amber-800/20") : "bg-slate-400"}`}
                    style={{ left: pct(a), width: `calc(${pct(b)} - ${pct(a)})` }}
                  />
                );
              })}
              {(blocksByRow[key] || []).map((b) => (
                <BlockBar key={b.id} b={b} day={day} dim={myDept && !b.departments.includes(myDept)} selected={b.id === selectedId} onClick={() => onSelect?.(blocks.find((x) => x.id === b.id) || b)} />
              ))}
            </div>
          </div>
        ))}
        {clock != null && (
          <div className="absolute top-0 bottom-0 w-px bg-red-600 pointer-events-none" style={{ left: `calc(14rem + (100% - 14rem) * ${clock / 1440})` }} />
        )}
      </div>
    </div>
  );
}

function BlockBar({ b, day, dim, selected, onClick }) {
  const a = minOfDay(b.start, day), e = minOfDay(b.end, day);
  const span = Math.max(e - a, 1);
  // stack tasks that run in parallel into lanes
  const lanes = [];
  const placed = b.tasks.map((t) => {
    const s = minOfDay(t.planned_start, day), f = minOfDay(t.planned_end, day);
    let lane = lanes.findIndex((end) => end <= s);
    if (lane === -1) { lane = lanes.length; lanes.push(f); } else lanes[lane] = f;
    return { t, s, f, lane };
  });
  const n = Math.max(lanes.length, 1);
  const proposed = b.status !== "APPROVED";

  return (
    <button
      onClick={onClick}
      title={`${b.id} · ${b.start.slice(11)}–${b.end.slice(11)} · ${b.departments.join(" + ")} · ${b.status}`}
      className={`absolute top-[3px] h-[20px] rounded-[3px] overflow-hidden bg-white ${selected ? "ring-2 ring-slate-900 z-10" : ""} ${proposed ? "border border-dashed border-slate-500" : "border border-slate-700"}`}
      style={{ left: pct(a), width: `calc(${pct(e)} - ${pct(a)})`, opacity: dim ? 0.35 : 1 }}
    >
      {placed.map(({ t, s, f, lane }) => (
        <span
          key={t.id}
          className={`absolute ${proposed ? "hatch" : ""}`}
          style={{
            left: `${((s - a) / span) * 100}%`, width: `${((f - s) / span) * 100}%`,
            top: `${(lane / n) * 100}%`, height: `${100 / n}%`,
            backgroundColor: DEPT_COLOR[t.department],
          }}
        />
      ))}
    </button>
  );
}
