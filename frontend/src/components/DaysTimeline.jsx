import { DEPT_COLOR, addDays, minOfDay, BAND } from "../lib/ui";

/**
 * Week / month timeline: one row per day, 24 hours across.
 * Each bar is one work of this department (solid = approved, hatched = awaiting COA).
 */
const pct = (m) => `${(Math.min(Math.max(m, 0), 1440) / 1440) * 100}%`;

export default function DaysTimeline({ start, days, items, onSelect, colorBy = "dept" }) {
  const rows = Array.from({ length: days }, (_, i) => addDays(start, i));
  const byDay = {};
  for (const it of items) (byDay[it.planned_start.slice(0, 10)] ||= []).push(it);

  return (
    <div className="text-xs select-none">
      <div className="flex">
        <div className="w-24 shrink-0" />
        <div className="relative flex-1 h-5">
          {Array.from({ length: 13 }, (_, i) => i * 2).map((h) => (
            <div key={h} className="absolute -translate-x-1/2 text-[10px] text-slate-400" style={{ left: pct(h * 60) }}>{String(h).padStart(2, "0")}</div>
          ))}
        </div>
      </div>
      {rows.map((day, i) => {
        const d = new Date(day + "T00:00");
        const list = (byDay[day] || []).sort((a, b) => a.planned_start.localeCompare(b.planned_start));
        // lanes so overlapping works on different sections don't hide each other
        const lanes = [];
        const placed = list.map((it) => {
          const s = minOfDay(it.planned_start, day), e = minOfDay(it.planned_end, day);
          let lane = lanes.findIndex((end) => end <= s);
          if (lane === -1) { lane = lanes.length; lanes.push(e); } else lanes[lane] = e;
          return { it, s, e, lane };
        });
        const h = Math.max(26, lanes.length * 14 + 6);
        return (
          <div key={day} className="flex border-b border-slate-100">
            <div className={`w-24 shrink-0 flex items-center text-[11px] ${d.getDay() === 0 ? "text-red-600" : "text-slate-600"}`}>
              {d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" })}
            </div>
            <div className={`relative flex-1 ${i % 2 ? "bg-white" : "bg-slate-50"}`} style={{ height: h }}>
              {Array.from({ length: 25 }, (_, k) => k).map((k) => (
                <div key={k} className="absolute top-0 bottom-0 border-l border-slate-200/70" style={{ left: pct(k * 60) }} />
              ))}
              {placed.map(({ it, s, e, lane }) => (
                <button
                  key={it.id}
                  onClick={() => onSelect?.(it)}
                  title={`${it.id} · ${it.work_description} · ${it.section} ${it.line} · ${it.planned_start.slice(11)}–${it.planned_end.slice(11)} · ${it.status}`}
                  className={`absolute rounded-[3px] text-[10px] leading-[12px] px-1 truncate text-left ${it.status === "APPROVED" ? "text-white" : "text-slate-900 border border-dashed border-slate-700"}`}
                  style={{
                    left: pct(s), width: `calc(${pct(e)} - ${pct(s)})`, top: 3 + lane * 14, height: 12,
                    backgroundColor: (colorBy === "band" ? BAND[it.priority_band].color : DEPT_COLOR[it.department]) + (it.status === "APPROVED" ? "" : "59"),
                  }}
                >
                  {it.section} {it.work_description}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
