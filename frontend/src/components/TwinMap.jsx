import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Tooltip, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import {
  ChevronDown, ChevronUp, Crosshair, ExternalLink, Layers, Loader2, LocateFixed, MapPin, Maximize2, Minimize2,
  Minus, Plus, Route, Search, TrainFront, X,
} from "lucide-react";
import { BAND, DEPT_COLOR, minOfDay, hhmm, dmy, clockLabel } from "../lib/ui";

/**
 * Track twin: an interactive railway digital twin on OpenStreetMap + OpenRailwayMap.
 *  - base map        = OpenStreetMap (standard / muted), dark, light or satellite
 *  - railway overlay = OpenRailwayMap tiles (infrastructure, max speed, signalling, electrification)
 *  - real stations   = OSM railway stations/halts loaded live for the visible area (Overpass API)
 *  - track inspector = click any real track to read its OSM attributes (gauge, electrification, speed…)
 *  - planning twin   = the planning corridors, works / defects (colour = AI priority, size = criticality),
 *                      sections under block at the simulation clock and trains running per the time table
 */
const RADIUS = { Critical: 8, High: 6.5, Medium: 5, Low: 4 };

const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const BASEMAPS = {
  muted: { label: "OSM · Muted", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attr: OSM_ATTR, className: "rm-tiles-muted" },
  osm: { label: "OpenStreetMap", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attr: OSM_ATTR },
  dark: { label: "Dark", url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attr: `${OSM_ATTR} &copy; <a href="https://carto.com/attributions">CARTO</a>` },
  light: { label: "Light", url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", attr: `${OSM_ATTR} &copy; <a href="https://carto.com/attributions">CARTO</a>` },
  satellite: { label: "Satellite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Imagery &copy; Esri, Maxar, Earthstar Geographics" },
};
const ORM_STYLES = { standard: "Infrastructure", maxspeed: "Max speed", signals: "Signalling", electrification: "Electrification", none: "Off" };
const ORM_ATTR = 'Railways: <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a> (CC-BY-SA)';

const OVERLAYS = [
  ["corridors", "Planning corridors"],
  ["stations", "Planning stations"],
  ["osmStations", "OSM stations (live)"],
  ["works", "Works / defects"],
  ["blocks", "Sections under block"],
  ["trains", "Running trains"],
];

const OVERPASS = "https://overpass-api.de/api/interpreter";
const OSM_STATION_MIN_ZOOM = 9;
const GAUGE = { 1676: "Broad gauge", 1435: "Standard gauge", 1000: "Metre gauge", 762: "Narrow gauge", 610: "Narrow gauge" };

async function overpass(query, signal) {
  const r = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(query),
    signal,
  });
  if (!r.ok) throw new Error(r.status === 429 ? "OSM service busy – try again shortly" : `OSM service error ${r.status}`);
  return r.json();
}

function along(path, t) {
  const x = Math.min(Math.max(t, 0), 1) * (path.length - 1);
  const i = Math.min(Math.floor(x), path.length - 2);
  const f = x - i;
  return [path[i][0] + f * (path[i + 1][0] - path[i][0]), path[i][1] + f * (path[i + 1][1] - path[i][1])];
}

function distKm(a, b) {
  const r = 6371, toR = Math.PI / 180;
  const dLa = (b[0] - a[0]) * toR, dLo = (b[1] - a[1]) * toR;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLo / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

const ormLink = (lat, lon, z = 15) => `https://www.openrailwaymap.org/?style=standard&lat=${lat}&lon=${lon}&zoom=${z}`;
const fmtLL = (lat, lon) => `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? "E" : "W"}`;

/* ------------------------------------------------------------------ map-side helpers */

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lon], 12, { duration: 0.8 });
  }, [target, map]);
  return null;
}

function MapBridge({ onReady, onView, onMapClick, readoutRef }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
    onView(map);
    const scale = L.control.scale({ position: "bottomright", imperial: false }).addTo(map);
    return () => scale.remove();
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps
  useMapEvents({
    moveend: () => onView(map),
    click: (e) => onMapClick(e.latlng),
    mousemove: (e) => {
      if (readoutRef.current) readoutRef.current.textContent = `${fmtLL(e.latlng.lat, e.latlng.lng)} · z${map.getZoom()}`;
    },
    mouseout: () => {
      if (readoutRef.current) readoutRef.current.textContent = `z${map.getZoom()}`;
    },
  });
  return null;
}

const pulseIcon = L.divIcon({ className: "", html: '<div class="rm-pulse"></div>', iconSize: [28, 28], iconAnchor: [14, 14] });

/* ------------------------------------------------------------------ main component */

export default function TwinMap({ network, day, clock, blocks, trains, works, focus, onSelectBlock, height = 480 }) {
  const bySection = useMemo(() => Object.fromEntries(network.map((s) => [s.section, s])), [network]);
  const bounds = useMemo(() => network.flatMap((s) => [...s.up, ...s.down]), [network]);

  const mapRef = useRef(null);
  const readoutRef = useRef(null);
  const wrapRef = useRef(null);

  const [base, setBase] = useState("muted");
  const [orm, setOrm] = useState("standard");
  const [ormOpacity, setOrmOpacity] = useState(0.9);
  const [overlays, setOverlays] = useState({ corridors: true, stations: true, osmStations: true, works: true, blocks: true, trains: true });
  const [layersOpen, setLayersOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);
  const [full, setFull] = useState(false);
  const [inspect, setInspect] = useState(false);
  const [view, setView] = useState(null); // { zoom, bounds }
  const [sel, setSel] = useState(null); // { kind: station | osm | section | track, ... }
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const [osmStations, setOsmStations] = useState([]);
  const [osmStatus, setOsmStatus] = useState({ state: "idle" });
  const fetchedAreas = useRef([]);
  const trackReq = useRef(null);

  const zoom = view?.zoom ?? 8;

  /* ---------- simulation state at the clock (unchanged logic) */
  const activeBlocks = blocks.filter((b) => minOfDay(b.start, day) <= clock && clock < minOfDay(b.end, day));
  const activeTasks = new Set(
    activeBlocks.flatMap((b) => b.tasks.filter((t) => minOfDay(t.planned_start, day) <= clock && clock < minOfDay(t.planned_end, day)).map((t) => t.id))
  );
  const runningTrains = trains
    .filter((t) => minOfDay(t.start, day) <= clock && clock < minOfDay(t.end, day))
    .map((t) => {
      const s = bySection[t.section];
      if (!s) return null;
      const a = minOfDay(t.start, day), b = minOfDay(t.end, day);
      const f = (clock - a) / Math.max(b - a, 1);
      const path = t.line === "Up" ? s.up : s.down;
      return { ...t, pos: along(path, t.direction === "Increasing KM" ? f : 1 - f) };
    })
    .filter(Boolean);

  /* ---------- planning stations (deduplicated, with the sections they serve) */
  const stations = useMemo(() => {
    const m = new Map();
    network.forEach((s) =>
      s.stations.forEach((st) => {
        const cur = m.get(st.name) || { ...st, sections: [] };
        cur.sections.push(s.section);
        m.set(st.name, cur);
      })
    );
    return [...m.values()];
  }, [network]);

  /* ---------- map events */
  const onView = useCallback((map) => {
    setView({ zoom: map.getZoom(), bounds: map.getBounds() });
    if (readoutRef.current) readoutRef.current.textContent = `z${map.getZoom()}`;
  }, []);

  const fitNetwork = () => mapRef.current?.fitBounds(bounds, { padding: [30, 30] });
  const zoomBy = (d) => mapRef.current?.setZoom(mapRef.current.getZoom() + d);
  const flyTo = (lat, lon, z = 13) => mapRef.current?.flyTo([lat, lon], Math.max(z, mapRef.current.getZoom()), { duration: 0.8 });

  /* ---------- fullscreen */
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 60);
    const onKey = (e) => { if (e.key === "Escape") { setFull(false); setInspect(false); } };
    document.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); document.removeEventListener("keydown", onKey); };
  }, [full]);

  /* ---------- live OSM stations for the visible area */
  useEffect(() => {
    if (!overlays.osmStations || !view) return;
    if (view.zoom < OSM_STATION_MIN_ZOOM) { setOsmStatus({ state: "zoom" }); return; }
    if (fetchedAreas.current.some((a) => a.contains(view.bounds))) { setOsmStatus((s) => (s.state === "error" ? s : { state: "ok" })); return; }
    const area = view.bounds.pad(0.25);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setOsmStatus({ state: "loading" });
      try {
        const q = `[out:json][timeout:25];node["railway"~"^(station|halt)$"](${area.getSouth()},${area.getWest()},${area.getNorth()},${area.getEast()});out 600;`;
        const j = await overpass(q, ctrl.signal);
        fetchedAreas.current.push(area);
        setOsmStations((prev) => {
          const m = new Map(prev.map((x) => [x.id, x]));
          j.elements.forEach((el) => m.set(el.id, { id: el.id, lat: el.lat, lon: el.lon, tags: el.tags || {} }));
          return [...m.values()];
        });
        setOsmStatus({ state: "ok" });
      } catch (e) {
        if (e.name !== "AbortError") setOsmStatus({ state: "error", msg: e.message });
      }
    }, 600);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [view, overlays.osmStations]);

  /* ---------- real track inspector */
  const inspectAt = useCallback(async (lat, lon) => {
    trackReq.current?.abort();
    const ctrl = new AbortController();
    trackReq.current = ctrl;
    const z = mapRef.current?.getZoom() ?? 12;
    const r = Math.round(Math.min(Math.max(12 * 2 ** (16 - z), 15), 600));
    setSel({ kind: "track", lat, lon, loading: true, ways: [] });
    try {
      const q = `[out:json][timeout:25];way(around:${r},${lat},${lon})["railway"~"^(rail|light_rail|narrow_gauge|subway|tram|monorail|construction|proposed|disused|abandoned|preserved)$"];out tags geom 12;`;
      const j = await overpass(q, ctrl.signal);
      setSel({ kind: "track", lat, lon, radius: r, ways: j.elements.filter((e) => e.geometry) });
    } catch (e) {
      if (e.name !== "AbortError") setSel({ kind: "track", lat, lon, error: e.message, ways: [] });
    }
  }, []);

  const onMapClick = useCallback((ll) => { if (inspect) inspectAt(ll.lat, ll.lng); }, [inspect, inspectAt]);

  /* ---------- selection helpers */
  const selectStation = (st, fly = true) => {
    setSel({ kind: "station", name: st.name });
    if (fly) flyTo(st.lat, st.lon, 12);
  };
  const selectOsm = (o, fly = true) => {
    setSel({ kind: "osm", id: o.id });
    if (fly) flyTo(o.lat, o.lon, 14);
  };
  const selectSection = (sec, fit = true) => {
    setSel({ kind: "section", section: sec });
    const s = bySection[sec];
    if (fit && s) mapRef.current?.fitBounds([...s.up, ...s.down], { paddingTopLeft: [60, 60], paddingBottomRight: [320, 40], maxZoom: 12 });
  };

  /* ---------- search */
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    stations.forEach((st) => st.name.toLowerCase().includes(q) && out.push({ type: "station", label: st.name, sub: st.sections.join(", "), item: st }));
    network.forEach((s) => (s.section.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.corridor_name.toLowerCase().includes(q)) &&
      out.push({ type: "section", label: `${s.section} · ${s.name}`, sub: s.corridor_name, item: s }));
    osmStations.forEach((o) => {
      const n = o.tags.name || "";
      const code = o.tags["railway:ref"] || o.tags.ref || "";
      if (n.toLowerCase().includes(q) || code.toLowerCase() === q) out.push({ type: "osm", label: n || "Unnamed station", sub: `OSM ${o.tags.railway}${code ? " · " + code : ""}`, item: o });
    });
    return out.slice(0, 10);
  }, [query, stations, network, osmStations]);

  const pickResult = (r) => {
    if (r.type === "station") selectStation(r.item);
    else if (r.type === "section") selectSection(r.item.section);
    else selectOsm(r.item);
    setQuery("");
    setSearchOpen(false);
  };

  /* ---------- derived highlight for selection */
  const selSections = sel?.kind === "section" ? [sel.section] : sel?.kind === "station" ? stations.find((s) => s.name === sel.name)?.sections || [] : [];
  const selStation = sel?.kind === "station" ? stations.find((s) => s.name === sel.name) : null;
  const selOsm = sel?.kind === "osm" ? osmStations.find((o) => o.id === sel.id) : null;

  const showStationLabels = zoom >= 10;
  const showOsmLabels = zoom >= 13;
  const basemap = BASEMAPS[base];

  return (
    <div
      ref={wrapRef}
      className={`rm-map isolate ${inspect ? "rm-inspect" : ""} ${full ? "fixed inset-3 z-[990] shadow-2xl" : "relative"} rounded-lg overflow-hidden border border-slate-800 bg-slate-900`}
      style={full ? { boxShadow: "0 0 0 100vmax rgba(15,23,42,.55)" } : { height }}
    >
      <MapContainer
        bounds={bounds.length ? bounds : undefined}
        center={bounds.length ? undefined : [15.8, 77.8]}
        zoom={bounds.length ? undefined : 7}
        preferCanvas
        zoomControl={false}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
        maxZoom={19}
      >
        <TileLayer key={base} attribution={basemap.attr} url={basemap.url} className={basemap.className} maxZoom={19} maxNativeZoom={19} />
        {orm !== "none" && (
          <TileLayer
            key={"orm-" + orm}
            attribution={ORM_ATTR}
            url={`https://{s}.tiles.openrailwaymap.org/${orm}/{z}/{x}/{y}.png`}
            subdomains="abc"
            opacity={ormOpacity}
            maxZoom={19}
            zIndex={5}
          />
        )}
        <MapBridge onReady={(m) => (mapRef.current = m)} onView={onView} onMapClick={onMapClick} readoutRef={readoutRef} />
        <FlyTo target={focus} />

        {/* planning corridors (schematic Up / Down lines) */}
        {overlays.corridors && network.map((s) => {
          const hot = selSections.includes(s.section);
          return (
            <Fragment key={s.section}>
              {hot && <Polyline positions={[s.up, s.down]} interactive={false} pathOptions={{ color: "#22d3ee", weight: 14, opacity: 0.35 }} />}
              <Polyline positions={s.up} eventHandlers={{ click: () => !inspect && selectSection(s.section, false) }} pathOptions={{ color: hot ? "#0e7490" : "#334155", weight: hot ? 3.5 : 2.5, opacity: 0.85 }}>
                <Tooltip sticky>{s.section} Up · {s.name}</Tooltip>
              </Polyline>
              <Polyline positions={s.down} eventHandlers={{ click: () => !inspect && selectSection(s.section, false) }} pathOptions={{ color: hot ? "#0891b2" : "#64748b", weight: hot ? 3.5 : 2.5, opacity: 0.85 }}>
                <Tooltip sticky>{s.section} Down · {s.name}</Tooltip>
              </Polyline>
            </Fragment>
          );
        })}

        {/* sections under block right now */}
        {overlays.blocks && activeBlocks.map((b) => {
          const s = bySection[b.section];
          if (!s) return null;
          const lines = b.line === "Both Lines" ? ["up", "down"] : [b.line.toLowerCase()];
          return lines.map((ln) => (
            <Polyline
              key={b.id + ln}
              positions={s[ln]}
              eventHandlers={{ click: () => onSelectBlock?.(b) }}
              pathOptions={{ color: DEPT_COLOR[b.departments[0]], weight: 9, opacity: 0.55, dashArray: b.status === "APPROVED" ? null : "10 8" }}
            >
              <Tooltip sticky>
                <b>{b.id}</b> blocked {hhmm(b.start)}–{hhmm(b.end)} · {b.departments.join(" + ")}
              </Tooltip>
            </Polyline>
          ));
        })}

        {/* real railway track picked with the inspector */}
        {sel?.kind === "track" && sel.ways.map((w) => (
          <Fragment key={w.id}>
            <Polyline positions={w.geometry.map((g) => [g.lat, g.lon])} interactive={false} pathOptions={{ color: "#22d3ee", weight: 12, opacity: 0.3 }} />
            <Polyline positions={w.geometry.map((g) => [g.lat, g.lon])} interactive={false} pathOptions={{ color: "#0891b2", weight: 3.5, opacity: 1 }} />
          </Fragment>
        ))}
        {sel?.kind === "track" && (
          <CircleMarker center={[sel.lat, sel.lon]} radius={5} interactive={false} pathOptions={{ color: "#0e7490", weight: 2, fillColor: "#fff", fillOpacity: 1 }} />
        )}

        {/* real OSM stations (live) */}
        {overlays.osmStations && zoom >= OSM_STATION_MIN_ZOOM && osmStations.map((o) => {
          const active = selOsm?.id === o.id;
          return (
            <CircleMarker
              key={o.id}
              center={[o.lat, o.lon]}
              radius={active ? 7 : o.tags.railway === "station" ? 4.5 : 3.5}
              eventHandlers={{ click: () => !inspect && selectOsm(o, false) }}
              pathOptions={{ color: active ? "#0e7490" : "#0f766e", weight: active ? 3 : 1.5, fillColor: o.tags.railway === "station" ? "#14b8a6" : "#99f6e4", fillOpacity: 1 }}
            >
              <Tooltip key={String(showOsmLabels)} permanent={showOsmLabels} direction="right" offset={[6, 0]} className={showOsmLabels ? "rm-label rm-label-osm" : ""}>
                {o.tags.name || "Station"}{(o.tags["railway:ref"] || o.tags.ref) && showOsmLabels ? ` (${o.tags["railway:ref"] || o.tags.ref})` : ""}
              </Tooltip>
            </CircleMarker>
          );
        })}

        {/* planning stations */}
        {overlays.stations && stations.map((st) => {
          const active = selStation?.name === st.name;
          return (
            <CircleMarker
              key={st.name}
              center={[st.lat, st.lon]}
              radius={active ? 7 : st.sections.length > 1 ? 5 : 3.5}
              eventHandlers={{ click: () => !inspect && selectStation(st, false) }}
              pathOptions={{ color: active ? "#0e7490" : "#0f172a", weight: active ? 3 : 1.5, fillColor: "#fff", fillOpacity: 1 }}
            >
              <Tooltip key={String(showStationLabels)} permanent={showStationLabels} direction="right" offset={[6, 0]} className={showStationLabels ? "rm-label" : ""}>
                {st.name}
              </Tooltip>
            </CircleMarker>
          );
        })}

        {/* works / defects */}
        {overlays.works && works.map((w) => {
          const live = activeTasks.has(w.id);
          return (
            <CircleMarker
              key={w.id}
              center={[w.lat, w.lon]}
              radius={RADIUS[w.priority_band] + (live ? 4 : 0)}
              pathOptions={{ color: live ? "#0f172a" : "#fff", weight: live ? 3 : 1, fillColor: BAND[w.priority_band].color, fillOpacity: 0.9 }}
            >
              <Popup>
                <div className="text-xs space-y-0.5 min-w-52">
                  <div className="font-semibold text-sm">{w.work_description}</div>
                  <div>{w.id} · {w.department} · {w.work_type}</div>
                  <div>{w.asset_type} {w.asset_id} · {w.section} {w.line} · km {w.km_start?.toFixed(2)}</div>
                  <div>Priority: <b>{w.priority_band}</b> ({Math.round(w.priority_score)}) – {w.reasons.join(", ")}</div>
                  <div>Status: <b>{w.status}</b>{w.planned_start ? ` · block ${dmy(w.planned_start)} ${hhmm(w.planned_start)}–${hhmm(w.planned_end)}` : ` · ${w.plan_note || "not yet planned"}`}</div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* trains running at the simulation clock */}
        {overlays.trains && runningTrains.map((t) => (
          <Fragment key={t.id}>
            <CircleMarker center={t.pos} radius={10} interactive={false} pathOptions={{ stroke: false, fillColor: t.type === "Goods" ? "#b45309" : "#0f172a", fillOpacity: 0.18 }} />
            <CircleMarker center={t.pos} radius={5} pathOptions={{ color: "#fff", weight: 1.5, fillColor: t.type === "Goods" ? "#78350f" : "#0f172a", fillOpacity: 1 }}>
              <Tooltip>{t.id} · {t.type} · {t.section} {t.line} · {hhmm(t.start)}–{hhmm(t.end)}</Tooltip>
            </CircleMarker>
          </Fragment>
        ))}

        {focus && <Marker position={[focus.lat, focus.lon]} icon={pulseIcon} interactive={false} />}
      </MapContainer>

      {/* ============================================================ HUD: top bar */}
      <div className="absolute top-2 left-2 right-2 z-[1000] flex items-center gap-2 rounded-lg bg-slate-900/90 backdrop-blur text-slate-100 border border-white/10 px-2.5 py-1.5 text-[11px] shadow-lg">
        <span className="flex items-center gap-1.5 font-semibold tracking-wider text-[10px] text-emerald-300 shrink-0">
          <span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-70" /><span className="relative w-2 h-2 rounded-full bg-emerald-400" /></span>
          LIVE TWIN
        </span>
        <span className="font-mono text-slate-200 shrink-0">{clockLabel(clock)}</span>
        <span className="hidden md:inline text-slate-400 shrink-0">
          {runningTrains.length} trains running · {activeBlocks.length} blocks active
        </span>

        <div className="relative flex-1 min-w-32 max-w-72 ml-auto">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            onKeyDown={(e) => { if (e.key === "Enter" && results[0]) pickResult(results[0]); }}
            placeholder="Find station, section, corridor…"
            className="w-full bg-white/10 border border-white/10 rounded-md pl-7 pr-2 py-1 text-[11px] text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
          />
          {searchOpen && query && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-slate-900 border border-white/10 rounded-md shadow-xl overflow-hidden max-h-72 overflow-y-auto">
              {results.length === 0 && <div className="px-3 py-2 text-slate-400">No match{zoom < OSM_STATION_MIN_ZOOM ? " – zoom in to search OSM stations" : ""}</div>}
              {results.map((r, i) => (
                <button key={i} onMouseDown={(e) => e.preventDefault()} onClick={() => pickResult(r)} className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2">
                  {r.type === "section" ? <Route size={12} className="text-cyan-300 shrink-0" /> : <MapPin size={12} className={`${r.type === "osm" ? "text-teal-300" : "text-white"} shrink-0`} />}
                  <span className="truncate">{r.label}</span>
                  <span className="ml-auto text-[10px] text-slate-400 truncate">{r.sub}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <span ref={readoutRef} className="hidden lg:inline font-mono text-[10px] text-slate-400 w-44 text-right shrink-0" />

        <button
          onClick={() => setInspect((v) => !v)}
          title="Inspect real track: click anywhere on a railway line"
          className={`flex items-center gap-1 px-2 py-1 rounded-md border shrink-0 ${inspect ? "bg-cyan-500 text-slate-900 border-cyan-400 font-semibold" : "border-white/15 hover:bg-white/10"}`}
        >
          <Crosshair size={13} /> Inspect track
        </button>
        <button
          onClick={() => setLayersOpen((v) => !v)}
          className={`flex items-center gap-1 px-2 py-1 rounded-md border shrink-0 ${layersOpen ? "bg-white text-slate-900 border-white" : "border-white/15 hover:bg-white/10"}`}
        >
          <Layers size={13} /> Layers
        </button>
      </div>

      {/* ============================================================ layers panel */}
      {layersOpen && (
        <div className="absolute top-14 right-2 z-[1001] w-64 rounded-lg bg-slate-900/95 backdrop-blur text-slate-100 border border-white/10 shadow-xl text-[11px] p-3 space-y-3">
          <div className="flex items-center">
            <span className="font-semibold text-xs">Map layers</span>
            <button className="ml-auto text-slate-400 hover:text-white" onClick={() => setLayersOpen(false)}><X size={14} /></button>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Base map</div>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(BASEMAPS).map(([k, v]) => (
                <button key={k} onClick={() => setBase(k)} className={`px-2 py-1 rounded border text-left ${base === k ? "border-cyan-400 bg-cyan-400/15 text-white" : "border-white/10 hover:bg-white/10 text-slate-300"}`}>{v.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">OpenRailwayMap overlay</div>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(ORM_STYLES).map(([k, v]) => (
                <button key={k} onClick={() => setOrm(k)} className={`px-2 py-1 rounded border text-left ${orm === k ? "border-cyan-400 bg-cyan-400/15 text-white" : "border-white/10 hover:bg-white/10 text-slate-300"}`}>{v}</button>
              ))}
            </div>
            {orm !== "none" && (
              <label className="flex items-center gap-2 mt-2 text-slate-400">
                Opacity
                <input type="range" min={0.2} max={1} step={0.05} value={ormOpacity} onChange={(e) => setOrmOpacity(+e.target.value)} className="flex-1 accent-cyan-400" />
                <span className="w-8 text-right font-mono">{Math.round(ormOpacity * 100)}%</span>
              </label>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Twin overlays</div>
            <div className="space-y-1">
              {OVERLAYS.map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={overlays[k]} onChange={(e) => setOverlays((o) => ({ ...o, [k]: e.target.checked }))} className="accent-cyan-400" />
                  <span>{label}</span>
                  {k === "osmStations" && overlays.osmStations && <OsmStatus status={osmStatus} count={osmStations.length} />}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ map controls */}
      <div className="absolute top-14 left-2 z-[1000] flex flex-col rounded-lg bg-slate-900/90 backdrop-blur border border-white/10 text-slate-100 shadow-lg overflow-hidden">
        <CtlBtn title="Zoom in" onClick={() => zoomBy(1)}><Plus size={15} /></CtlBtn>
        <CtlBtn title="Zoom out" onClick={() => zoomBy(-1)}><Minus size={15} /></CtlBtn>
        <CtlBtn title="Fit whole network" onClick={fitNetwork}><LocateFixed size={15} /></CtlBtn>
        <CtlBtn title={full ? "Exit full screen (Esc)" : "Full screen"} onClick={() => setFull((v) => !v)} last>
          {full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </CtlBtn>
      </div>

      {inspect && sel?.kind !== "track" && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[1000] rounded-md bg-cyan-500 text-slate-900 text-[11px] font-medium px-3 py-1 shadow-lg">
          Click on any railway line to read its real track attributes · Esc to exit
        </div>
      )}

      {/* ============================================================ details panel */}
      {sel && !layersOpen && (
        <div className="absolute top-14 right-2 bottom-10 z-[1000] w-72 max-w-[calc(100%-4rem)] flex flex-col rounded-lg bg-slate-900/95 backdrop-blur text-slate-100 border border-white/10 shadow-xl text-[11px] overflow-hidden">
          <button className="absolute top-2 right-2 text-slate-400 hover:text-white z-10" onClick={() => setSel(null)} title="Close"><X size={14} /></button>
          <div className="overflow-y-auto p-3 space-y-3">
            {sel.kind === "station" && selStation && (
              <StationPanel
                st={selStation} network={network} bySection={bySection} works={works} blocks={blocks} trains={trains} day={day} clock={clock}
                activeBlocks={activeBlocks} runningTrains={runningTrains} osmStations={osmStations}
                onSection={selectSection} onBlock={onSelectBlock} onOsm={selectOsm} onInspect={() => { setInspect(true); inspectAt(selStation.lat, selStation.lon); }}
              />
            )}
            {sel.kind === "osm" && selOsm && (
              <OsmPanel o={selOsm} stations={stations} onStation={selectStation} onInspect={() => { setInspect(true); inspectAt(selOsm.lat, selOsm.lon); }} />
            )}
            {sel.kind === "section" && bySection[sel.section] && (
              <SectionPanel
                s={bySection[sel.section]} works={works} blocks={blocks} trains={trains} day={day} clock={clock}
                activeBlocks={activeBlocks} runningTrains={runningTrains} stations={stations}
                onStation={selectStation} onBlock={onSelectBlock}
              />
            )}
            {sel.kind === "track" && <TrackPanel t={sel} />}
          </div>
        </div>
      )}

      {/* ============================================================ legend */}
      <div className="absolute bottom-2 left-2 z-[1000] bg-white/95 rounded-md border border-slate-200 text-[11px] shadow-sm max-w-[calc(100%-1rem)]">
        <button onClick={() => setLegendOpen((v) => !v)} className="flex items-center gap-1 w-full px-2.5 py-1 font-medium text-slate-700">
          Legend {legendOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
        {legendOpen && (
          <div className="px-2.5 pb-2 space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              {Object.entries(BAND).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: v.color }} />{k}</span>
              ))}
            </div>
            <div className="flex items-center gap-3 text-slate-600 flex-wrap">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-900" />Train</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-900" />Goods</span>
              <span className="flex items-center gap-1"><span className="w-4 h-1.5 bg-blue-600/60 rounded" />Section under block</span>
            </div>
            <div className="flex items-center gap-3 text-slate-600 flex-wrap">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-slate-900 bg-white" />Planning station</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border border-teal-700 bg-teal-500" />OSM station</span>
              <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-slate-600" />Planning corridor</span>
            </div>
            {orm === "standard" && (
              <div className="flex items-center gap-3 text-slate-600 flex-wrap">
                <span className="text-slate-500">Real track:</span>
                <span className="flex items-center gap-1"><span className="w-4 h-1 rounded bg-[#ff8c00]" />Main line</span>
                <span className="flex items-center gap-1"><span className="w-4 h-1 rounded bg-[#e60000]" />High speed</span>
                <a href="https://www.openrailwaymap.org/" target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">full key</a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ small pieces */

function CtlBtn({ children, last, ...p }) {
  return <button {...p} className={`w-8 h-8 flex items-center justify-center hover:bg-white/10 ${last ? "" : "border-b border-white/10"}`}>{children}</button>;
}

function OsmStatus({ status, count }) {
  if (status.state === "loading") return <Loader2 size={11} className="ml-auto animate-spin text-cyan-300" />;
  if (status.state === "zoom") return <span className="ml-auto text-slate-500">zoom in</span>;
  if (status.state === "error") return <span className="ml-auto text-amber-300" title={status.msg}>unavailable</span>;
  return <span className="ml-auto text-slate-500">{count}</span>;
}

const H = ({ icon: Icon, title, sub }) => (
  <div className="pr-5">
    <div className="flex items-center gap-1.5 text-sm font-semibold text-white"><Icon size={14} className="text-cyan-300 shrink-0" /><span className="truncate">{title}</span></div>
    {sub && <div className="text-slate-400 mt-0.5">{sub}</div>}
  </div>
);
const Stat = ({ label, value, tone = "text-white" }) => (
  <div className="rounded-md bg-white/5 border border-white/10 px-2 py-1.5">
    <div className={`text-base font-semibold leading-none ${tone}`}>{value}</div>
    <div className="text-[10px] text-slate-400 mt-1">{label}</div>
  </div>
);
const Sub = ({ children }) => <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">{children}</div>;
const Row = ({ k, v }) => (v == null || v === "" ? null : (
  <div className="flex gap-2 py-0.5 border-b border-white/5"><span className="text-slate-400 w-24 shrink-0">{k}</span><span className="text-slate-100 break-words min-w-0">{v}</span></div>
));
const Ext = ({ href, children }) => (
  <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-300 hover:underline">{children}<ExternalLink size={10} /></a>
);

function BandBars({ list }) {
  const n = list.length || 1;
  return (
    <div>
      <div className="flex h-1.5 rounded overflow-hidden bg-white/10">
        {Object.entries(BAND).map(([k, v]) => {
          const c = list.filter((w) => w.priority_band === k).length;
          return c ? <div key={k} style={{ width: `${(100 * c) / n}%`, background: v.color }} title={`${k}: ${c}`} /> : null;
        })}
      </div>
      <div className="flex gap-2 mt-1 text-[10px] text-slate-400 flex-wrap">
        {Object.entries(BAND).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: v.color }} />{list.filter((w) => w.priority_band === k).length} {k}</span>
        ))}
      </div>
    </div>
  );
}

function TrainList({ trains, day, clock }) {
  const list = trains
    .filter((t) => minOfDay(t.end, day) > clock)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 6);
  if (!list.length) return <div className="text-slate-500">No more trains today.</div>;
  return (
    <div className="space-y-0.5">
      {list.map((t) => {
        const running = minOfDay(t.start, day) <= clock;
        return (
          <div key={t.id} className="flex items-center gap-1.5">
            <TrainFront size={11} className={t.type === "Goods" ? "text-amber-400" : "text-slate-300"} />
            <span className="font-mono">{t.id}</span>
            <span className="text-slate-400 truncate">{t.section} {t.line}</span>
            <span className="ml-auto font-mono text-slate-300">{hhmm(t.start)}–{hhmm(t.end)}</span>
            {running && <span className="text-[9px] px-1 rounded bg-emerald-500/20 text-emerald-300">RUN</span>}
          </div>
        );
      })}
    </div>
  );
}

function BlockList({ blocks, onBlock }) {
  if (!blocks.length) return <div className="text-slate-500">No blocks on this day.</div>;
  return (
    <div className="space-y-1">
      {blocks.map((b) => (
        <button key={b.id} onClick={() => onBlock?.(b)} className="w-full text-left flex items-center gap-1.5 rounded px-1.5 py-1 bg-white/5 hover:bg-white/10">
          <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: DEPT_COLOR[b.departments[0]] }} />
          <span className="font-mono whitespace-nowrap">{b.id}</span>
          <span className="ml-auto font-mono text-slate-300 whitespace-nowrap" title={`${b.section} · ${b.line}`}>{hhmm(b.start)}–{hhmm(b.end)}</span>
          <span className={`text-[9px] px-1 rounded ${b.status === "APPROVED" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>{b.status === "APPROVED" ? "OK" : "PEND"}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ detail panels */

function StationPanel({ st, bySection, works, blocks, trains, day, clock, activeBlocks, runningTrains, osmStations, onSection, onBlock, onOsm, onInspect }) {
  const secs = st.sections;
  const w = works.filter((x) => secs.includes(x.section));
  const matched = osmStations
    .map((o) => ({ o, d: distKm([st.lat, st.lon], [o.lat, o.lon]) }))
    .filter((x) => x.d < 6)
    .sort((a, b) => a.d - b.d)[0];
  return (
    <>
      <H icon={MapPin} title={st.name} sub={`${secs.length > 1 ? "Junction · " : ""}Planning station · ${fmtLL(st.lat, st.lon)}`} />
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Works" value={w.length} />
        <Stat label="Blocks now" value={activeBlocks.filter((b) => secs.includes(b.section)).length} tone="text-sky-300" />
        <Stat label="Trains now" value={runningTrains.filter((t) => secs.includes(t.section)).length} tone="text-emerald-300" />
      </div>
      <div><Sub>Works by AI priority</Sub><BandBars list={w} /></div>
      <div>
        <Sub>Sections served</Sub>
        <div className="space-y-1">
          {secs.map((s) => (
            <button key={s} onClick={() => onSection(s)} className="w-full text-left flex items-center gap-1.5 rounded px-1.5 py-1 bg-white/5 hover:bg-white/10">
              <Route size={11} className="text-cyan-300" /><span className="font-mono">{s}</span><span className="text-slate-400 truncate">{bySection[s]?.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div><Sub>Next trains through</Sub><TrainList trains={trains.filter((t) => secs.includes(t.section))} day={day} clock={clock} /></div>
      <div><Sub>Blocks today</Sub><BlockList blocks={blocks.filter((b) => secs.includes(b.section))} onBlock={onBlock} /></div>
      <div className="space-y-1.5 pt-1 border-t border-white/10">
        {matched && (
          <button onClick={() => onOsm(matched.o)} className="w-full text-left rounded px-1.5 py-1 bg-teal-500/10 border border-teal-400/20 hover:bg-teal-500/20">
            <span className="text-teal-300">OSM match:</span> {matched.o.tags.name || "Station"}
            {(matched.o.tags["railway:ref"] || matched.o.tags.ref) && ` (${matched.o.tags["railway:ref"] || matched.o.tags.ref})`}
            <span className="text-slate-400"> · {matched.d.toFixed(1)} km</span>
          </button>
        )}
        <div className="flex items-center gap-3">
          <button onClick={onInspect} className="inline-flex items-center gap-1 text-cyan-300 hover:underline"><Crosshair size={11} />Inspect track here</button>
          <Ext href={ormLink(st.lat, st.lon, 14)}>OpenRailwayMap</Ext>
        </div>
      </div>
    </>
  );
}

function OsmPanel({ o, stations, onStation, onInspect }) {
  const t = o.tags;
  const near = stations
    .map((s) => ({ s, d: distKm([o.lat, o.lon], [s.lat, s.lon]) }))
    .filter((x) => x.d < 6)
    .sort((a, b) => a.d - b.d)[0];
  return (
    <>
      <H icon={MapPin} title={t.name || "Unnamed station"} sub={`OpenStreetMap ${t.railway === "halt" ? "halt" : "station"} · ${fmtLL(o.lat, o.lon)}`} />
      <div>
        <Row k="Station code" v={t["railway:ref"] || t.ref} />
        <Row k="Local name" v={t["name:te"] || t["name:hi"] || t["name:kn"]} />
        <Row k="Type" v={t.railway} />
        <Row k="Operator" v={t.operator} />
        <Row k="Network" v={t.network} />
        <Row k="Zone / division" v={t["railway:zone"] || t["railway:division"]} />
        <Row k="UIC ref" v={t.uic_ref} />
        <Row k="Elevation" v={t.ele && `${t.ele} m`} />
        <Row k="Platforms" v={t.platforms} />
        <Row k="OSM id" v={`node ${o.id}`} />
      </div>
      {near && (
        <button onClick={() => onStation(near.s)} className="w-full text-left rounded px-1.5 py-1 bg-white/5 border border-white/10 hover:bg-white/10">
          <span className="text-cyan-300">Planning station:</span> {near.s.name} <span className="text-slate-400">· {near.d.toFixed(1)} km · {near.s.sections.join(", ")}</span>
        </button>
      )}
      <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-white/10">
        <button onClick={onInspect} className="inline-flex items-center gap-1 text-cyan-300 hover:underline"><Crosshair size={11} />Inspect track here</button>
        <Ext href={`https://www.openstreetmap.org/node/${o.id}`}>OSM</Ext>
        <Ext href={ormLink(o.lat, o.lon, 16)}>OpenRailwayMap</Ext>
      </div>
    </>
  );
}

function SectionPanel({ s, works, blocks, trains, day, clock, activeBlocks, runningTrains, stations, onStation, onBlock }) {
  const w = works.filter((x) => x.section === s.section);
  const len = Math.abs((s.km_to ?? 0) - (s.km_from ?? 0));
  return (
    <>
      <H icon={Route} title={`${s.section} · ${s.name}`} sub={`${s.corridor_id} ${s.corridor_name}`} />
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Length (km)" value={len ? len.toFixed(1) : "–"} />
        <Stat label="Blocks now" value={activeBlocks.filter((b) => b.section === s.section).length} tone="text-sky-300" />
        <Stat label="Trains now" value={runningTrains.filter((t) => t.section === s.section).length} tone="text-emerald-300" />
      </div>
      <div className="text-slate-400">km {s.km_from?.toFixed?.(2) ?? "–"} → {s.km_to?.toFixed?.(2) ?? "–"} · Up &amp; Down lines</div>
      <div><Sub>{w.length} works by AI priority · {w.filter((x) => x.status === "PENDING").length} pending</Sub><BandBars list={w} /></div>
      <div>
        <Sub>Stations along section</Sub>
        <div className="flex items-center flex-wrap gap-1">
          {s.stations.map((st, i) => (
            <Fragment key={st.name + i}>
              {i > 0 && <span className="text-slate-500">—</span>}
              <button onClick={() => onStation(stations.find((x) => x.name === st.name) || st)} className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/15">{st.name}</button>
            </Fragment>
          ))}
        </div>
      </div>
      <div><Sub>Blocks today</Sub><BlockList blocks={blocks.filter((b) => b.section === s.section)} onBlock={onBlock} /></div>
      <div><Sub>Next trains</Sub><TrainList trains={trains.filter((t) => t.section === s.section)} day={day} clock={clock} /></div>
      <div className="pt-1 border-t border-white/10 text-slate-500">
        Corridor drawn schematically between stations; the real alignment is shown by the OpenRailwayMap overlay.
      </div>
    </>
  );
}

function TrackPanel({ t }) {
  const [open, setOpen] = useState(0);
  return (
    <>
      <H icon={Crosshair} title="Track inspector" sub={`${fmtLL(t.lat, t.lon)}${t.radius ? ` · within ${t.radius} m` : ""}`} />
      {t.loading && <div className="flex items-center gap-2 text-slate-300"><Loader2 size={13} className="animate-spin" />Reading OpenStreetMap railway data…</div>}
      {t.error && <div className="text-amber-300">{t.error}</div>}
      {!t.loading && !t.error && t.ways.length === 0 && <div className="text-slate-400">No railway track here. Zoom in and click directly on a line.</div>}
      {t.ways.map((w, i) => {
        const g = w.tags || {};
        const gauge = g.gauge && `${g.gauge} mm${GAUGE[g.gauge] ? ` · ${GAUGE[g.gauge]}` : ""}`;
        const elec = g.electrified && g.electrified !== "no"
          ? [g.electrified, g.voltage && `${(+g.voltage / 1000).toLocaleString()} kV`, g.frequency && `${g.frequency} Hz`].filter(Boolean).join(" · ")
          : g.electrified;
        return (
          <div key={w.id} className="rounded-md border border-white/10 bg-white/5">
            <button onClick={() => setOpen(open === i ? -1 : i)} className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left">
              <span className="w-3 h-1 rounded bg-cyan-400 shrink-0" />
              <span className="font-medium truncate">{g.name || g.description || `${g.railway} track`}</span>
              <span className="ml-auto text-[10px] text-slate-400">{g.usage || g.railway}</span>
            </button>
            {open === i && (
              <div className="px-2 pb-2">
                <Row k="Railway" v={g.railway} />
                <Row k="Usage" v={g.usage} />
                <Row k="Service" v={g.service} />
                <Row k="Gauge" v={gauge} />
                <Row k="Tracks" v={g.tracks} />
                <Row k="Track ref" v={g["railway:track_ref"]} />
                <Row k="Electrified" v={elec} />
                <Row k="Max speed" v={g.maxspeed && `${g.maxspeed}${/\d$/.test(g.maxspeed) ? " km/h" : ""}`} />
                <Row k="Operator" v={g.operator} />
                <Row k="Line ref" v={g.ref} />
                <Row k="Structure" v={g.bridge === "yes" ? "Bridge" : g.tunnel === "yes" ? "Tunnel" : g.embankment === "yes" ? "Embankment" : g.cutting === "yes" ? "Cutting" : null} />
                <Row k="Signalling" v={g["railway:signal_system"] || g["railway:etcs"] && `ETCS ${g["railway:etcs"]}`} />
                <div className="pt-1.5 flex gap-3">
                  <Ext href={`https://www.openstreetmap.org/way/${w.id}`}>OSM way {w.id}</Ext>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <div className="pt-1 border-t border-white/10 text-slate-500">Source: OpenStreetMap contributors via Overpass API.</div>
    </>
  );
}
