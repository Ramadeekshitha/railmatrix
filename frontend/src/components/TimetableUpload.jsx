import { useEffect, useRef, useState } from "react";
import { Upload, X, FileText, Image as ImageIcon, Trash2, ExternalLink, Camera, Loader2, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";

// Time table input for COA: PDFs and photos / scans of the time table.
const ACCEPT = "application/pdf,.pdf,image/*,.heic,.heif,.tif,.tiff";
const OK_EXT = /\.(pdf|png|jpe?g|webp|gif|bmp|tiff?|heic|heif)$/i;

const size = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function TimetableUpload() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}><Upload size={15} /> Upload Timetable</button>
      {open && <TimetableDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function TimetableDialog({ onClose }) {
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState([]); // names being uploaded
  const [msg, setMsg] = useState(null); // { ok, text }
  const [drag, setDrag] = useState(false);

  const load = () => api.timetableUploads().then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const upload = async (files) => {
    const list = [...files];
    if (!list.length) return;
    const bad = list.filter((f) => !OK_EXT.test(f.name) && !/^image\//.test(f.type) && f.type !== "application/pdf");
    const good = list.filter((f) => !bad.includes(f));
    setMsg(bad.length ? { ok: false, text: `Skipped ${bad.map((f) => f.name).join(", ")} – only PDF or image files are accepted.` } : null);
    setBusy(good.map((f) => f.name));
    let done = 0, err = "";
    for (const f of good) {
      // camera photos can arrive without an extension – give them one
      const file = OK_EXT.test(f.name) ? f : new File([f], `${f.name || "timetable-photo"}.${(f.type.split("/")[1] || "jpg").replace("jpeg", "jpg")}`, { type: f.type });
      try { await api.uploadTimetable(file); done++; } catch (e) { err = e.message; }
      setBusy((b) => b.filter((n) => n !== f.name));
    }
    const skipped = bad.length ? ` Skipped ${bad.map((f) => f.name).join(", ")} – only PDF or image files are accepted.` : "";
    if (err) setMsg({ ok: false, text: err + skipped });
    else if (done) setMsg({ ok: !bad.length, text: `${done} timetable file${done > 1 ? "s" : ""} uploaded.${skipped}` });
    load();
  };

  const remove = async (id) => { await api.deleteTimetable(id).catch(() => {}); load(); };

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900/40 flex items-start justify-center overflow-y-auto p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center">
          <div>
            <div className="font-semibold">Upload timetable</div>
            <div className="text-xs text-slate-500">Add the working time table as a PDF, or as photos / scans of the printed pages.</div>
          </div>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
            className={`rounded-lg border-2 border-dashed px-4 py-7 text-center transition ${drag ? "border-slate-900 bg-slate-50" : "border-slate-300"}`}
          >
            <Upload size={26} className="mx-auto text-slate-400" />
            <div className="mt-2 text-sm font-medium">Drag &amp; drop timetable files here</div>
            <div className="text-xs text-slate-500">PDF, JPG, PNG, WEBP, HEIC or TIFF · up to 25 MB each</div>
            <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
              <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}><FileText size={15} /> Choose files</button>
              <button type="button" className="btn" onClick={() => camRef.current?.click()}><Camera size={15} /> Take photo</button>
            </div>
            <input ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </div>

          {busy.length > 0 && (
            <div className="text-sm text-slate-600 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Uploading {busy.join(", ")}…</div>
          )}
          {msg && (
            <div className={`text-sm flex items-start gap-2 ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
              {msg.ok && <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}{msg.text}
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-slate-500 mb-1.5">Uploaded timetables ({items.length})</div>
            {items.length === 0 ? (
              <div className="text-sm text-slate-400 border border-slate-200 rounded-lg px-3 py-4 text-center">No timetable uploaded yet.</div>
            ) : (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {items.map((it) => {
                  const img = it.type.startsWith("image/") && !/hei[cf]|tiff/.test(it.type);
                  return (
                    <div key={it.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="w-10 h-10 rounded border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0">
                        {img ? <img src={api.timetableFileUrl(it.id)} alt="" className="w-full h-full object-cover" />
                          : it.ext === ".pdf" ? <FileText size={18} className="text-red-600" /> : <ImageIcon size={18} className="text-slate-500" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate" title={it.name}>{it.name}</div>
                        <div className="text-[11px] text-slate-500">{it.ext.slice(1).toUpperCase()} · {size(it.size)} · {it.uploaded_at}</div>
                      </div>
                      <a href={api.timetableFileUrl(it.id)} target="_blank" rel="noreferrer" className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Open"><ExternalLink size={15} /></a>
                      <button onClick={() => remove(it.id)} className="p-1.5 rounded hover:bg-red-50 text-slate-500 hover:text-red-600" title="Remove"><Trash2 size={15} /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex justify-end">
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
