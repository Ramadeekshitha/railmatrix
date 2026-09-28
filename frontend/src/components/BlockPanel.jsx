import { X, Clock, MapPin, Users, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { dur, hhmm, dmy } from "../lib/ui";
import { BandBadge, DeptChip, StatusBadge, Badge } from "./Bits";
import { useMeta } from "../App";

/** Side drawer explaining one block: time given, works approved, who else is working. */
export default function BlockPanel({ block, others = [], canApprove, onClose, onChanged }) {
  const meta = useMeta();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  if (!block) return null;
  const sec = meta.network.find((s) => s.section === block.section);
  const parallel = others.filter((o) => o.id !== block.id && o.start < block.end && o.end > block.start);
  const sameSection = parallel.filter((o) => o.section === block.section);
  const pending = block.tasks.filter((t) => t.status === "PENDING").length;

  const approve = async () => {
    setBusy(true);
    try {
      const r = await api.approveBlock(block.id);
      setMsg(`Approved ${r.approved.length} work(s).`);
      onChanged?.();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl border-l border-slate-200 z-[1000] flex flex-col">
      <div className="px-5 py-4 border-b border-slate-200 flex items-start gap-3">
        <div className="flex-1">
          <div className="text-xs text-slate-500">Block</div>
          <div className="font-semibold text-lg">{block.id}</div>
          <div className="mt-1 flex gap-1.5 flex-wrap">
            <StatusBadge status={block.status} />
            <Badge cls="bg-slate-100 border-slate-200">{block.block_type}</Badge>
            {block.departments.length > 1 && <Badge cls="bg-indigo-50 text-indigo-700 border-indigo-200">Joint block</Badge>}
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-100"><X size={18} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-slate-900 text-white p-3">
            <div className="text-[11px] opacity-70 flex items-center gap-1"><Clock size={12} /> Time given</div>
            <div className="text-2xl font-semibold">{dur(block.duration_min)}</div>
            <div className="text-xs opacity-80">{dmy(block.start)} · {hhmm(block.start)} – {hhmm(block.end)}</div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-[11px] text-slate-500 flex items-center gap-1"><MapPin size={12} /> Where</div>
            <div className="font-medium">{block.section} · {block.line}</div>
            <div className="text-xs text-slate-500">{sec?.name}</div>
            <div className="text-xs text-slate-400">{sec?.corridor_name}</div>
          </div>
        </div>

        <section>
          <div className="text-xs font-medium text-slate-500 mb-2">WORKS IN THIS BLOCK ({block.tasks.length})</div>
          <div className="space-y-2">
            {block.tasks.map((t) => (
              <div key={t.id} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <DeptChip dept={t.department} />
                  <span className="text-xs text-slate-400">{t.id}</span>
                  <span className="ml-auto"><StatusBadge status={t.status} /></span>
                </div>
                <div className="font-medium text-sm mt-1">{t.work_description}</div>
                <div className="text-xs text-slate-500">{t.work_type} · {t.asset_type} {t.asset_id ? `(${t.asset_id})` : ""} · km {t.km_start?.toFixed(2)}</div>
                <div className="flex items-center gap-2 mt-2 text-xs">
                  <span className="font-medium">{hhmm(t.planned_start)}–{hhmm(t.planned_end)}</span>
                  <span className="text-slate-400">({dur(t.duration_min)})</span>
                  <span className="ml-auto"><BandBadge band={t.priority_band} score={t.priority_score} /></span>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {t.reasons.map((r) => <span key={r} className="text-[11px] bg-slate-100 rounded px-1.5 py-0.5">{r}</span>)}
                </div>
                {t.coa_remark && <div className="text-[11px] text-slate-500 mt-1.5">COA: {t.coa_remark}</div>}
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1"><Users size={12} /> OTHER BLOCKS AT THE SAME TIME (ALL DEPARTMENTS)</div>
          {parallel.length === 0 ? (
            <div className="text-sm text-slate-400">No other block during this time.</div>
          ) : (
            <div className="space-y-1.5">
              {sameSection.length > 0 && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  {sameSection.length} other block(s) on the same section – coordinate site access.
                </div>
              )}
              {parallel.map((o) => (
                <div key={o.id} className="flex items-center gap-2 text-xs border-b border-slate-100 py-1.5">
                  <span className="font-medium w-28">{o.section} {o.line === "Both Lines" ? "Both" : o.line}</span>
                  <span className="text-slate-500 w-24">{hhmm(o.start)}–{hhmm(o.end)}</span>
                  <span className="flex gap-2">{o.departments.map((d) => <DeptChip key={d} dept={d} />)}</span>
                  <span className="ml-auto text-slate-400">{o.tasks.map((t) => t.work_description).join(", ").slice(0, 28)}…</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {canApprove && pending > 0 && (
        <div className="border-t border-slate-200 p-4 flex items-center gap-3">
          <button className="btn btn-green" disabled={busy} onClick={approve}>
            <CheckCircle2 size={16} /> Approve block ({pending} work{pending > 1 ? "s" : ""})
          </button>
          <span className="text-xs text-slate-500">{msg}</span>
        </div>
      )}
      {msg && !(canApprove && pending > 0) && <div className="border-t p-3 text-xs text-emerald-700">{msg}</div>}
    </div>
  );
}
