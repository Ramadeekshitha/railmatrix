import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Search, X, Plus, Minus, LocateFixed, Maximize, Minimize, MapPin, Copy, Check, Loader2, Layers } from "lucide-react";

/**
 * Location picker on free OpenStreetMap + OpenRailwayMap tiles (same map stack as the Track twin, no API key).
 *  - OpenStreetMap / Muted / Dark / Satellite (with labels) views + OpenRailwayMap railway overlay
 *  - zoom, pan, fullscreen, "my location"
 *  - place search (OpenStreetMap Nominatim) and "lat, lon" coordinate entry
 *  - click anywhere, or drag the pin, to set the location → onPick(lat, lon)
 */
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const VIEWS = {
  map: {
    label: "Map",
    menu: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr: OSM_ATTR,
    thumb: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  },
  muted: {
    label: "Map",
    menu: "OSM · Muted",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr: OSM_ATTR,
    className: "rm-tiles-muted",
  },
  dark: {
    label: "Map",
    menu: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attr: `${OSM_ATTR} &copy; <a href="https://carto.com/attributions">CARTO</a>`,
  },
  satellite: {
    label: "Satellite",
    menu: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    thumb: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  },
};
const LABELS = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
];
const NOMINATIM = "https://nominatim.openstreetmap.org";
const ORM_STYLES = { standard: "Infrastructure", maxspeed: "Max speed", signals: "Signalling", electrification: "Electrification", none: "Off" };
const ORM_ATTR = 'Railways: <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a> (CC-BY-SA)';

const pinIcon = L.divIcon({
  className: "",
  iconSize: [30, 42],
  iconAnchor: [15, 41],
  html: `<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))">
    <path d="M15 1C7.3 1 1 7.2 1 14.9 1 25.4 15 41 15 41s14-15.6 14-26.1C29 7.2 22.7 1 15 1z" fill="#EA4335" stroke="#B31412" stroke-width="1.2"/>
    <circle cx="15" cy="15" r="5.2" fill="#B31412"/></svg>`,
});

const valid = (lat, lon) => Number.isFinite(+lat) && Number.isFinite(+lon) && !(+lat === 0 && +lon === 0);
const fmt = (lat, lon) => `${(+lat).toFixed(6)}, ${(+lon).toFixed(6)}`;

function parseCoords(q) {
  const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = +m[1], lon = +m[2];
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null;
}

function tileOf(lat, lon, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return [x, y];
}

function Bridge({ onReady, onClick, onMove }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
    const scale = L.control.scale({ position: "bottomright", imperial: false }).addTo(map);
    return () => scale.remove();
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng), moveend: () => onMove(map) });
  return null;
}

export default function LocationPicker({ lat, lon, onPick, height = 430 }) {
  const mapRef = useRef(null);
  const inited = useRef(false);
  const [view, setView] = useState("map");
  const [labels, setLabels] = useState(true);
  const [orm, setOrm] = useState("standard");
  const [layersOpen, setLayersOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [center, setCenter] = useState({ lat: 20.6, lon: 78.9, z: 5 });

  const [q, setQ] = useState("");
  const [results, setResults] = useState(null); // null = closed
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");

  const [place, setPlace] = useState(null); // { name, address, loading }
  const [me, setMe] = useState(null);
  const [copied, setCopied] = useState(false);
  const geoReq = useRef(null);

  const has = valid(lat, lon);

  /* keep the view on the selected point (first load, or when it changes from the form) */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !has) return;
    if (!inited.current) { map.setView([lat, lon], 14); inited.current = true; return; }
    if (!map.getBounds().contains([lat, lon])) map.flyTo([lat, lon], Math.max(map.getZoom(), 13), { duration: 0.6 });
  }, [lat, lon, has]);

  /* address of the selected point (reverse geocoding) */
  useEffect(() => {
    if (!has) return;
    geoReq.current?.abort();
    const ctrl = new AbortController();
    geoReq.current = ctrl;
    setPlace((p) => ({ ...(p || {}), loading: true }));
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${NOMINATIM}/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${lat}&lon=${lon}`, { signal: ctrl.signal, headers: { "Accept-Language": "en" } });
        const j = await r.json();
        const name = j.name || j.address?.road || j.address?.village || j.address?.town || j.address?.city || "Dropped pin";
        setPlace({ name, address: j.display_name || "", loading: false });
      } catch (e) {
        if (e.name !== "AbortError") setPlace({ name: "Dropped pin", address: "", loading: false });
      }
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [lat, lon, has]);

  /* fullscreen */
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 60);
    const onKey = (e) => { if (e.key === "Escape" && full) { e.stopPropagation(); setFull(false); } };
    document.addEventListener("keydown", onKey, true);
    return () => { clearTimeout(t); document.removeEventListener("keydown", onKey, true); };
  }, [full]);

  const pick = (la, lo) => onPick(+(+la).toFixed(6), +(+lo).toFixed(6));

  const runSearch = async () => {
    const text = q.trim();
    if (!text) return;
    const c = parseCoords(text);
    if (c) {
      mapRef.current?.flyTo(c, 16, { duration: 0.8 });
      pick(c[0], c[1]);
      setResults(null);
      return;
    }
    setSearching(true); setSearchErr("");
    try {
      const b = mapRef.current?.getBounds();
      const vb = b ? `&viewbox=${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}` : "";
      const r = await fetch(`${NOMINATIM}/search?format=jsonv2&limit=6&addressdetails=0${vb}&q=${encodeURIComponent(text)}`, { headers: { "Accept-Language": "en" } });
      const j = await r.json();
      setResults(j.map((x) => ({ name: x.name || x.display_name.split(",")[0], address: x.display_name, lat: +x.lat, lon: +x.lon, bbox: x.boundingbox })));
    } catch {
      setSearchErr("Search is unavailable right now. You can still click the map or enter coordinates.");
      setResults([]);
    }
    setSearching(false);
  };

  const choose = (r) => {
    const map = mapRef.current;
    if (r.bbox && map) map.flyToBounds([[+r.bbox[0], +r.bbox[2]], [+r.bbox[1], +r.bbox[3]]], { maxZoom: 16, duration: 0.8 });
    else map?.flyTo([r.lat, r.lon], 16, { duration: 0.8 });
    pick(r.lat, r.lon);
    setQ(r.name);
    setResults(null);
  };

  const locateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => { setMe([p.coords.latitude, p.coords.longitude]); mapRef.current?.flyTo([p.coords.latitude, p.coords.longitude], 16, { duration: 0.8 }); },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(fmt(lat, lon)); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* ignore */ }
  };

  const other = view === "satellite" ? "map" : "satellite";
  const tz = Math.min(Math.max(center.z - 1, 2), 17);
  const [tx, ty] = tileOf(center.lat, center.lon, tz);
  const v = VIEWS[view];

  return (
    <div
      className={`gmap ${full ? "fixed inset-0 z-[1100]" : "relative rounded-lg border border-slate-200"} overflow-hidden bg-[#e5e3df] isolate`}
      style={full ? undefined : { height }}
    >
      <MapContainer center={[20.6, 78.9]} zoom={5} zoomControl={false} style={{ height: "100%", width: "100%" }} scrollWheelZoom maxZoom={19}>
        <TileLayer key={view} url={v.url} attribution={v.attr} className={v.className} maxZoom={19} maxNativeZoom={view === "satellite" ? 18 : 19} />
        {view === "satellite" && labels && LABELS.map((u) => <TileLayer key={u} url={u} maxZoom={19} maxNativeZoom={18} zIndex={5} />)}
        {orm !== "none" && (
          <TileLayer key={"orm-" + orm} url={`https://{s}.tiles.openrailwaymap.org/${orm}/{z}/{x}/{y}.png`} subdomains="abc" attribution={ORM_ATTR} maxZoom={19} zIndex={6} opacity={0.9} />
        )}
        <Bridge
          onReady={(m) => {
            mapRef.current = m;
            if (has && !inited.current) { m.setView([lat, lon], 14); inited.current = true; }
          }}
          onClick={pick}
          onMove={(m) => { const c = m.getCenter(); setCenter({ lat: c.lat, lon: c.lng, z: m.getZoom() }); }}
        />
        {me && <CircleMarker center={me} radius={7} interactive={false} pathOptions={{ color: "#fff", weight: 2.5, fillColor: "#1a73e8", fillOpacity: 1 }} />}
        {has && (
          <Marker
            position={[lat, lon]}
            icon={pinIcon}
            draggable
            autoPan
            eventHandlers={{ dragend: (e) => { const p = e.target.getLatLng(); pick(p.lat, p.lng); } }}
            title="Drag to adjust the location"
          />
        )}
      </MapContainer>

      {/* search box */}
      <div role="search" className="absolute top-2.5 left-2.5 z-[1000] w-[min(340px,calc(100%-4.5rem))]">
        <div className="flex items-center bg-white rounded-lg shadow-md border border-slate-200/70 h-10 pl-3 pr-1">
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); if (!e.target.value) setResults(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); runSearch(); } }}
            placeholder="Search place or enter lat, lon"
            className="flex-1 min-w-0 text-sm outline-none bg-transparent placeholder:text-slate-400"
          />
          {q && (
            <button type="button" onClick={() => { setQ(""); setResults(null); }} className="p-1.5 text-slate-500 hover:text-slate-800" aria-label="Clear search"><X size={16} /></button>
          )}
          <button type="button" onClick={runSearch} className="p-1.5 text-[#1a73e8] hover:bg-slate-100 rounded-md" aria-label="Search">
            {searching ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
          </button>
        </div>
        {results && (
          <div className="mt-1 bg-white rounded-lg shadow-lg border border-slate-200/70 overflow-hidden max-h-64 overflow-y-auto">
            {searchErr && <div className="px-3 py-2 text-xs text-slate-500">{searchErr}</div>}
            {!searchErr && results.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">No places found. Try another name, or enter coordinates like 15.1710, 77.3620.</div>}
            {results.map((r, i) => (
              <button type="button" key={i} onClick={() => choose(r)} className="w-full text-left flex gap-2.5 px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0">
                <MapPin size={16} className="text-slate-400 mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm text-slate-800 truncate">{r.name}</span>
                  <span className="block text-[11px] text-slate-500 truncate">{r.address}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* fullscreen (top-right) */}
      <button
        type="button"
        onClick={() => setFull((f) => !f)}
        className="absolute top-2.5 right-2.5 z-[1000] w-10 h-10 bg-white rounded-md shadow-md border border-slate-200/70 flex items-center justify-center text-slate-600 hover:text-slate-900"
        title={full ? "Exit full screen" : "Full screen"}
      >
        {full ? <Minimize size={18} /> : <Maximize size={18} />}
      </button>

      {/* layers: base map + OpenRailwayMap overlay */}
      <button
        type="button"
        onClick={() => setLayersOpen((o) => !o)}
        className={`absolute top-[3.75rem] right-2.5 z-[1000] w-10 h-10 rounded-md shadow-md border border-slate-200/70 flex items-center justify-center ${layersOpen ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:text-slate-900"}`}
        title="Map layers"
      >
        <Layers size={18} />
      </button>
      {layersOpen && (
        <div className="absolute top-[3.75rem] right-14 z-[1001] w-64 bg-white rounded-lg shadow-lg border border-slate-200/70 p-3 text-xs space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Base map</div>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(VIEWS).map(([k, x]) => (
                <button type="button" key={k} onClick={() => setView(k)} className={`px-2 py-1 rounded border text-left ${view === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:bg-slate-50 text-slate-700"}`}>{x.menu}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">OpenRailwayMap</div>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(ORM_STYLES).map(([k, label]) => (
                <button type="button" key={k} onClick={() => setOrm(k)} className={`px-2 py-1 rounded border text-left ${orm === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:bg-slate-50 text-slate-700"}`}>{label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* my location + zoom (bottom-right) */}
      <div className="absolute right-2.5 bottom-12 z-[1000] flex flex-col items-center gap-2">
        <button type="button" onClick={locateMe} title="Show your location" className="w-10 h-10 bg-white rounded-md shadow-md border border-slate-200/70 flex items-center justify-center text-slate-600 hover:text-[#1a73e8]">
          <LocateFixed size={18} />
        </button>
        <div className="bg-white rounded-md shadow-md border border-slate-200/70 flex flex-col overflow-hidden">
          <button type="button" onClick={() => mapRef.current?.zoomIn()} title="Zoom in" className="w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-slate-900"><Plus size={18} /></button>
          <div className="h-px bg-slate-200 mx-2" />
          <button type="button" onClick={() => mapRef.current?.zoomOut()} title="Zoom out" className="w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-slate-900"><Minus size={18} /></button>
        </div>
      </div>

      {/* map / satellite switch (bottom-left) */}
      <div className="absolute left-2.5 bottom-6 z-[1000] flex items-end gap-2">
        <button
          type="button"
          onClick={() => setView(other)}
          title={`Switch to ${VIEWS[other].label}`}
          className="relative w-[72px] h-[72px] rounded-lg overflow-hidden shadow-md border-2 border-white bg-slate-300 group"
        >
          <img src={VIEWS[other].thumb(tz, tx, ty)} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} onLoad={(e) => { e.currentTarget.style.visibility = "visible"; }} />
          <span className={`absolute inset-0 ${other === "map" ? "bg-slate-200/40" : "bg-slate-800/30"}`} />
          <span className={`absolute bottom-1 left-0 right-0 text-center text-[11px] font-medium ${other === "satellite" ? "text-white drop-shadow" : "text-slate-800"}`}>
            {VIEWS[other].label}
          </span>
        </button>
        {view === "satellite" && (
          <label className="mb-1 flex items-center gap-1.5 bg-white rounded-md shadow-md border border-slate-200/70 px-2 py-1 text-xs text-slate-700 cursor-pointer select-none">
            <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} className="accent-[#1a73e8]" /> Labels
          </label>
        )}
      </div>

      {/* selected-location card */}
      {has ? (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-[1000] w-[min(360px,calc(100%-11rem))] min-w-[180px] bg-white rounded-lg shadow-lg border border-slate-200/70 px-3 py-2">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 w-3 h-3 rounded-full bg-[#EA4335] ring-2 ring-red-100" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-900 truncate">
                {place?.loading ? <span className="text-slate-400">Finding address…</span> : place?.name || "Dropped pin"}
              </div>
              {place?.address && !place.loading && <div className="text-[11px] text-slate-500 truncate" title={place.address}>{place.address}</div>}
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="font-mono text-[11px] text-slate-700">{fmt(lat, lon)}</span>
                <button type="button" onClick={copy} className="text-slate-400 hover:text-slate-700" title="Copy coordinates">
                  {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-[1000] bg-white rounded-lg shadow-md border border-slate-200/70 px-3 py-2 text-xs text-slate-600">
          Click the map to drop a pin
        </div>
      )}
    </div>
  );
}
