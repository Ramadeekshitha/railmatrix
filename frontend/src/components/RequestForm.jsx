import { useEffect, useMemo, useRef, useState } from "react";
import { X, Send, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";
import { useMeta } from "../App";
import { BandBadge } from "./Bits";
import LocationPicker from "./LocationPicker";
import { dmy, hhmm, dur } from "../lib/ui";

const WORKS = {
  eng: ["Rail joint replacement", "Track geometry correction", "Ballast maintenance", "Sleeper replacement", "Turnout inspection", "Bridge inspection"],
  snt: ["Signal equipment replacement", "Point machine overhaul", "Track circuit inspection", "Axle counter maintenance", "Interlocking testing"],
  trd: ["OHE fitting replacement", "OHE inspection", "Catenary / contact wire renewal", "Sectioning post maintenance", "Insulator replacement"],
};

function kmToLatLon(sec, km) {
  const t = (km - sec.km_from) / Math.max(sec.km_to - sec.km_from, 1e-6);
  const x = Math.min(Math.max(t, 0), 1) * (sec.up.length - 1);
  const i = Math.min(Math.floor(x), sec.up.length - 2), f = x - i;
  const mid = (p) => [(sec.up[p][0] + sec.down[p][0]) / 2, (sec.up[p][1] + sec.down[p][1]) / 2];
  const a = mid(i), b = mid(i + 1);
  return [+(a[0] + f * (b[0] - a[0])).toFixed(6), +(a[1] + f * (b[1] - a[1])).toFixed(6)];
}

export default function RequestForm({ sys, onClose, onCreated }) {
  const meta = useMeta();
  const [assets, setAssets] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const first = meta.network[0];
  const [f, setF] = useState({
    work_type: "Corrective", work_description: "", asset_id: "", section: first.section, line: "Up",
    km: +((first.km_from + first.km_to) / 2).toFixed(3), lat: 0, lon: 0, engineering_priority: "High",
    duration_min: 120, block_type: sys === "trd" ? "Power Block" : "Line Block", within_days: 7, joint_ok: true,
  });
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const sec = useMemo(() => meta.network.find((s) => s.section === f.section), [meta, f.section]);

  useEffect(() => { api.assets(sys).then(setAssets); }, [sys]);
  // keep lat/lon in step with section + km (except right after a point was picked on the map,
  // where the exact picked coordinates are kept)
  const mapPick = useRef(null);
  useEffect(() => {
    const p = mapPick.current;
    if (p && p.section === sec.section && +p.km === +f.km) return;
    mapPick.current = null;
    const [lat, lon] = kmToLatLon(sec, +f.km);
    setF((o) => ({ ...o, lat, lon }));
  }, [sec, f.km]);

  const pickAsset = (id) => {
    const a = assets.find((x) => x.id === id);
    if (!a) return set("asset_id", "");
    setF((o) => ({ ...o, asset_id: a.id, section: a.section, km: a.km, engineering_priority: a.criticality }));
  };
  const pickOnMap = async (lat, lon) => {
    setF((o) => ({ ...o, lat, lon }));
    const s = await api.snap(lat, lon);
    mapPick.current = { section: s.section, km: s.km };
    setF((o) => ({ ...o, section: s.section, km: s.km, lat, lon, asset_id: "" }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await api.createRequest({ ...f, department: sys, km: +f.km, duration_min: +f.duration_min, within_days: +f.within_days });
      setResult(r);
      onCreated?.(r);
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900/40 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center">
          <div>
            <div className="font-semibold">New block request</div>
            <div className="text-xs text-slate-500">Goes to the Control Office (COA) for approval. The AI scores it and proposes a slot immediately.</div>
          </div>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-slate-100"><X size={18} /></button>
        </div>

        {result ? (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-emerald-700 font-medium"><CheckCircle2 size={20} /> {result.id} sent to COA</div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="border rounded-lg p-3">
                <div className="text-xs text-slate-500">AI priority</div>
                <div className="mt-1"><BandBadge band={result.priority_band} score={result.priority_score} /></div>
                <div className="text-[11px] text-slate-500 mt-2">{result.reasons.join(" · ")}</div>
              </div>
              <div className="border rounded-lg p-3 sm:col-span-2">
                <div className="text-xs text-slate-500">Proposed block</div>
                {result.planned_start ? (
                  <>
                    <div className="text-lg font-semibold">{dmy(result.planned_start)} · {hhmm(result.planned_start)}–{hhmm(result.planned_end)} <span className="text-sm font-normal text-slate-500">({dur(result.duration_min)})</span></div>
                    <div className="text-xs text-slate-500">{result.section} {result.line} · block {result.block_id} · {result.plan_note}</div>
                  </>
                ) : <div className="text-sm text-red-600 mt-1">{result.plan_note}</div>}
              </div>
            </div>
            <div className="flex gap-2"><button className="btn btn-primary" onClick={onClose}>Done</button><button className="btn" onClick={() => setResult(null)}>Raise another</button></div>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 grid md:grid-cols-2 gap-5">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Work type</label>
                  <select className="input" value={f.work_type} onChange={(e) => set("work_type", e.target.value)}>
                    {meta.work_types.map((w) => <option key={w}>{w}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Engineering priority</label>
                  <select className="input" value={f.engineering_priority} onChange={(e) => set("engineering_priority", e.target.value)}>
                    {meta.priorities.slice().reverse().map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Asset (optional – fills location from the asset register)</label>
                <select className="input" value={f.asset_id} onChange={(e) => pickAsset(e.target.value)}>
                  <option value="">— no specific asset —</option>
                  {assets.map((a) => <option key={a.id} value={a.id}>{a.id} · {a.type} · {a.section} km {a.km.toFixed(1)} · {a.condition}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Corridor / section</label>
                  <select className="input" value={f.section} onChange={(e) => { const s = meta.network.find((x) => x.section === e.target.value); setF((o) => ({ ...o, section: s.section, km: +((s.km_from + s.km_to) / 2).toFixed(3), asset_id: "" })); }}>
                    {meta.network.map((s) => <option key={s.section} value={s.section}>{s.section} · {s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Line</label>
                  <select className="input" value={f.line} onChange={(e) => set("line", e.target.value)}>
                    {meta.lines.map((l) => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">KM ({sec.km_from.toFixed(0)}–{sec.km_to.toFixed(0)})</label>
                  <input className="input" type="number" step="0.001" min={sec.km_from} max={sec.km_to} value={f.km} onChange={(e) => set("km", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Latitude</label><input className="input bg-slate-50" value={f.lat} readOnly /></div>
                <div><label className="label">Longitude</label><input className="input bg-slate-50" value={f.lon} readOnly /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Estimated duration (min)</label>
                  <input className="input" type="number" min={15} max={600} step={5} value={f.duration_min} onChange={(e) => set("duration_min", e.target.value)} />
                </div>
                <div>
                  <label className="label">Block type</label>
                  <select className="input" value={f.block_type} onChange={(e) => set("block_type", e.target.value)}>
                    {meta.block_types.map((b) => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Block required within (days)</label>
                  <input className="input" type="number" min={1} max={60} value={f.within_days} onChange={(e) => set("within_days", e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Maintenance description</label>
                <input className="input" list="works" required minLength={3} placeholder="e.g. Rail fracture repair at km 296.4" value={f.work_description} onChange={(e) => set("work_description", e.target.value)} />
                <datalist id="works">{WORKS[sys].map((w) => <option key={w} value={w} />)}</datalist>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.joint_ok} onChange={(e) => set("joint_ok", e.target.checked)} />
                Can share the block with other departments (joint block)
              </label>
              {error && <div className="text-sm text-red-600">{error}</div>}
              <button className="btn btn-primary" disabled={busy}><Send size={15} /> {busy ? "Sending…" : "Send to COA"}</button>
            </div>

            <div>
              <label className="label">Location – click the map, search, or drag the pin to set the block location</label>
              <LocationPicker lat={f.lat} lon={f.lon} onPick={pickOnMap} height={430} />
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
