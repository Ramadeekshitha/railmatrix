"""
Data layer.

* Reference data (assets, train time table, COA corridor blocks, resources) is
  read from the source-system CSV extracts into memory.
* Block requests are the only thing that changes, so they live in SQLite.
"""
import csv
import json
import sqlite3
from datetime import datetime, timedelta

from . import config, geo

FMT = "%Y-%m-%d %H:%M"
EPOCH = datetime(2026, 1, 1)


def to_min(s: str | datetime) -> int:
    d = s if isinstance(s, datetime) else datetime.strptime(s, FMT)
    return int((d - EPOCH).total_seconds() // 60)


def from_min(m: int) -> str:
    return (EPOCH + timedelta(minutes=m)).strftime(FMT)


def read_csv(name):
    with open(config.DATA_DIR / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


# ======================================================== reference data
class Reference:
    def __init__(self):
        self.assets = {a["asset_id"]: a for a in read_csv("assets.csv")}
        self.trains = read_csv("train_movements.csv")
        self.corridor_blocks = read_csv("block_windows.csv")
        self.resources = read_csv("resources.csv")
        raw_requests = read_csv("maintenance_requests.csv")

        # km range per section (for the map)
        kms = {}
        for row in list(self.assets.values()) + raw_requests:
            km = float(row.get("km_location") or row.get("km_start"))
            kms.setdefault(row["route_section"], []).append(km)
            if row.get("km_end"):
                kms[row["route_section"]].append(float(row["km_end"]))
        for sec, v in kms.items():
            geo.KM_RANGE[sec] = (min(v), max(v))

        # lat/lon for every asset
        for a in self.assets.values():
            a["lat"], a["lon"] = geo.km_to_latlon(a["route_section"], float(a["km_location"]))

        # division-level resource pool: (department, resource_type) -> units
        self.resource_pool = {}
        for r in self.resources:
            if r["status"] == "Available":
                k = (r["department"], r["resource_type"])
                self.resource_pool[k] = self.resource_pool.get(k, 0) + int(r["quantity"])

        self.raw_requests = raw_requests

    def trains_blocking(self):
        """Train paths that a block must avoid (the time table + confident goods forecast)."""
        out = []
        for t in self.trains:
            if t["goods_train_forecast_status"] == "Forecasted" and \
                    float(t["forecast_confidence"]) < config.GOODS_FORECAST_MIN_CONFIDENCE:
                continue
            out.append(t)
        return out


# ======================================================== block requests (SQLite)
COLUMNS = """
id TEXT PRIMARY KEY, source_system TEXT, department TEXT, work_type TEXT, work_description TEXT,
asset_id TEXT, asset_type TEXT, corridor_id TEXT, section TEXT, line TEXT, track TEXT,
km_start REAL, km_end REAL, lat REAL, lon REAL,
block_type TEXT, duration_min INTEGER, earliest_start TEXT, latest_finish TEXT,
criticality TEXT, condition TEXT, failure_risk REAL, overdue_days INTEGER, safety_risk TEXT,
consequence TEXT, delay_penalty REAL, joint_eligible INTEGER, parallel_allowed INTEGER,
compatible_depts TEXT, resource_type TEXT, resource_count INTEGER, depends_on TEXT,
engineering_priority TEXT, priority_score REAL, urgency_score REAL, rank_score REAL,
priority_band TEXT, reasons TEXT,
status TEXT, planned_start TEXT, planned_end TEXT, block_id TEXT, plan_note TEXT,
coa_remark TEXT, created_at TEXT, decided_at TEXT
"""
FIELDS = [c.strip().split()[0] for c in COLUMNS.split(",") if c.strip()]


def connect():
    con = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    return con


def init_db(con):
    con.execute("DROP TABLE IF EXISTS requests")
    con.execute(f"CREATE TABLE requests ({COLUMNS})")
    con.commit()


def row_to_dict(r):
    d = dict(r)
    d["reasons"] = json.loads(d["reasons"] or "[]")
    d["compatible_depts"] = [x for x in (d["compatible_depts"] or "").split(";") if x]
    d["joint_eligible"] = bool(d["joint_eligible"])
    d["parallel_allowed"] = bool(d["parallel_allowed"])
    return d


def save(con, req: dict):
    rec = dict(req)
    rec["reasons"] = json.dumps(rec.get("reasons") or [])
    if isinstance(rec.get("compatible_depts"), list):
        rec["compatible_depts"] = ";".join(rec["compatible_depts"])
    rec["joint_eligible"] = int(bool(rec.get("joint_eligible")))
    rec["parallel_allowed"] = int(bool(rec.get("parallel_allowed")))
    cols = [f for f in FIELDS if f in rec]
    con.execute(
        f"INSERT OR REPLACE INTO requests ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
        [rec[c] for c in cols],
    )


def all_requests(con, where="1=1", params=()):
    return [row_to_dict(r) for r in con.execute(f"SELECT * FROM requests WHERE {where}", params)]


def from_source_row(r: dict) -> dict:
    """Map one TMS / SMMS / TDMS record to a block request."""
    lat, lon = geo.km_to_latlon(r["route_section"], float(r["km_start"]))
    return {
        "id": r["request_id"], "source_system": r["source_system"], "department": r["department"],
        "work_type": r["request_type"], "work_description": r["work_description"],
        "asset_id": r["asset_id"], "asset_type": r["asset_type"],
        "corridor_id": r["corridor_id"], "section": r["route_section"], "line": r["line"],
        "track": r["track"], "km_start": float(r["km_start"]), "km_end": float(r["km_end"]),
        "lat": lat, "lon": lon, "block_type": r["required_block_type"],
        "duration_min": int(float(r["total_block_time_min"])),
        "earliest_start": r["earliest_feasible_start"], "latest_finish": r["latest_permissible_completion"],
        "criticality": r["asset_criticality"], "condition": r["asset_condition"],
        "failure_risk": float(r["asset_failure_risk"]), "overdue_days": int(float(r["overdue_days"])),
        "safety_risk": r["safety_risk_level"], "consequence": r["consequence_of_deferral"],
        "delay_penalty": float(r["delay_penalty_inr"]),
        "joint_eligible": r["joint_block_eligible"] == "Yes",
        "parallel_allowed": r["parallel_execution_allowed"] == "Yes",
        "compatible_depts": [x for x in r["compatible_departments"].split(";") if x],
        "resource_type": r["required_resource_type"], "resource_count": int(r["required_resource_count"]),
        "depends_on": r["dependency_request_id"] or None,
        "engineering_priority": r["asset_criticality"],
        "status": "PENDING", "created_at": r["request_date"] + " 00:00",
        "_label": float(r["priority_feature_score"]),
    }
