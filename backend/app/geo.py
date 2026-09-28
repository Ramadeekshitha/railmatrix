"""
Georeferencing: turns (route section, km) into latitude/longitude and back.

The source systems (TMS/SMMS/TDMS) only give corridor, section and km.  Each
route section is laid on a real stretch of line in Guntakal division
(station coordinates are approximate).  In production, replace STATIONS
with the division's KM-post GIS layer; nothing else needs to change.
"""
import math

CORRIDORS = {
    "COR-01": "Kacheguda – Gadwal",
    "COR-02": "Guntakal – Yerraguntla",
    "COR-03": "Guntakal – Raichur",
    "COR-04": "Gooty – Dharmavaram",
}

# section -> corridor, ordered stations (name, lat, lon)
SECTIONS = {
    "SEC-01": ("COR-01", [("Kacheguda", 17.3899, 78.4995), ("Umdanagar", 17.2270, 78.4200),
                          ("Shadnagar", 17.0710, 78.2050), ("Jadcherla", 16.7650, 78.1390)]),
    "SEC-02": ("COR-01", [("Jadcherla", 16.7650, 78.1390), ("Mahbubnagar", 16.7488, 78.0035),
                          ("Wanaparthy Rd", 16.3620, 77.9350), ("Gadwal", 16.2346, 77.7958)]),
    "SEC-03": ("COR-02", [("Guntakal", 15.1710, 77.3620), ("Gooty", 15.1130, 77.6360),
                          ("Tadipatri", 14.9080, 78.0110)]),
    "SEC-04": ("COR-02", [("Tadipatri", 14.9080, 78.0110), ("Muddanuru", 14.6660, 78.4010),
                          ("Yerraguntla", 14.6380, 78.5380)]),
    "SEC-05": ("COR-03", [("Guntakal", 15.1710, 77.3620), ("Adoni", 15.6270, 77.2750),
                          ("Kosigi", 15.8540, 77.2410)]),
    "SEC-06": ("COR-03", [("Kosigi", 15.8540, 77.2410), ("Mantralayam Rd", 15.9900, 77.3200),
                          ("Raichur", 16.2076, 77.3463)]),
    "SEC-07": ("COR-04", [("Gooty", 15.1130, 77.6360), ("Anantapur", 14.6819, 77.6006)]),
    "SEC-08": ("COR-04", [("Anantapur", 14.6819, 77.6006), ("Dharmavaram", 14.4140, 77.7200)]),
}

# km range of each section, filled from the data at start-up (see store.py)
KM_RANGE: dict[str, tuple[float, float]] = {}

LINE_OFFSET_DEG = 0.006  # Up and Down lines drawn slightly apart


def _hav(a, b):
    r = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def _points(section):
    return [(s[1], s[2]) for s in SECTIONS[section][1]]


def _offset(p, q, line):
    """Shift a point perpendicular to segment p->q for Up (+) / Down (-) line."""
    if line not in ("Up", "Down"):
        return 0.0, 0.0
    dy, dx = q[0] - p[0], q[1] - p[1]
    n = math.hypot(dx, dy) or 1
    sign = 1 if line == "Up" else -1
    return sign * LINE_OFFSET_DEG * dx / n, -sign * LINE_OFFSET_DEG * dy / n


def point_at(section, t, line=None):
    """Point at fraction t (0..1) along the section."""
    pts = _points(section)
    t = min(max(t, 0.0), 1.0)
    segs = [_hav(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    target = t * sum(segs)
    for i, L in enumerate(segs):
        if target <= L or i == len(segs) - 1:
            f = 0 if L == 0 else min(target / L, 1)
            p, q = pts[i], pts[i + 1]
            oy, ox = _offset(p, q, line)
            return round(p[0] + f * (q[0] - p[0]) + oy, 6), round(p[1] + f * (q[1] - p[1]) + ox, 6)
        target -= L


def km_to_t(section, km):
    lo, hi = KM_RANGE.get(section, (0, 1))
    return 0.0 if hi == lo else (km - lo) / (hi - lo)


def km_to_latlon(section, km, line=None):
    return point_at(section, km_to_t(section, km), line)


def path(section, line=None, t0=0.0, t1=1.0, steps=24):
    return [point_at(section, t0 + (t1 - t0) * i / steps, line) for i in range(steps + 1)]


def nearest(lat, lon):
    """Snap a map click to the closest (section, km)."""
    best = None
    for sec in SECTIONS:
        for i in range(201):
            t = i / 200
            p = point_at(sec, t)
            d = _hav(p, (lat, lon))
            if best is None or d < best[0]:
                lo, hi = KM_RANGE.get(sec, (0, 1))
                best = (d, sec, round(lo + t * (hi - lo), 3), p)
    d, sec, km, p = best
    return {"section": sec, "corridor_id": SECTIONS[sec][0], "km": km,
            "lat": p[0], "lon": p[1], "distance_km": round(d, 2)}


def network():
    """Everything the map needs to draw the network."""
    out = []
    for sec, (cor, stations) in SECTIONS.items():
        lo, hi = KM_RANGE.get(sec, (0, 1))
        out.append({
            "section": sec, "corridor_id": cor, "corridor_name": CORRIDORS[cor],
            "km_from": lo, "km_to": hi,
            "name": f"{stations[0][0]} – {stations[-1][0]}",
            "stations": [{"name": n, "lat": la, "lon": lo_} for n, la, lo_ in stations],
            "up": path(sec, "Up"), "down": path(sec, "Down"),
        })
    return out
