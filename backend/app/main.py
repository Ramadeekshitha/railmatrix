"""
REST API for RailBlock.

    Departments (Engineering / S&T / TRD) : raise block requests, see their plan
    COA (Control Office)                   : run the AI planner, approve / reject
"""
import os
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config, geo, planner, store
from .priority import PriorityModel

app = FastAPI(title="RailBlock – AI Block Planning API")

@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "RailMatrix API",
        "message": "FastAPI backend is running"
    }
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ref = store.Reference()
con = store.connect()
model = PriorityModel()


# ================================================================ start-up
def seed():
    """Import TMS/SMMS/TDMS requests, score them, make a first plan.
    To make the demo realistic, COA has already approved the first 3 days."""
    store.init_db(con)
    reqs = [store.from_source_row(r) for r in ref.raw_requests]
    model.score(reqs)
    for r in reqs:
        store.save(con, {k: v for k, v in r.items() if not k.startswith("_")})
    con.commit()
    planner.run(con, ref, model, "month")
    cutoff = (config.PLAN_START + timedelta(days=3)).strftime(store.FMT)
    con.execute("UPDATE requests SET status='APPROVED', decided_at=?, coa_remark='Approved in weekly plan' "
                "WHERE status='PENDING' AND planned_start IS NOT NULL AND planned_start < ?",
                (config.PLAN_START.strftime(store.FMT), cutoff))
    con.commit()


@app.on_event("startup")
def startup():
    model.fit([store.from_source_row(r) for r in ref.raw_requests])
    fresh = os.environ.get("RESET") == "1"
    try:
        empty = con.execute("SELECT COUNT(*) FROM requests").fetchone()[0] == 0
    except Exception:
        empty = True
    if fresh or empty:
        seed()


def dept_name(key):
    if key in (None, "", "coa", "all"):
        return None
    if key not in config.DEPARTMENTS:
        raise HTTPException(404, f"Unknown department {key}")
    return config.DEPARTMENTS[key]["name"]


def now_s():
    return config.PLAN_START.strftime(store.FMT)


# ================================================================ reference
@app.get("/api/meta")
def meta():
    return {
        "now": now_s(),
        "departments": config.DEPARTMENTS,
        "corridors": geo.CORRIDORS,
        "network": geo.network(),
        "work_types": config.WORK_TYPES,
        "block_types": config.BLOCK_TYPES,
        "lines": config.LINES,
        "priorities": list(config.LEVEL.keys()),
        "model": model.info,
        "rules": {
            "train_buffer_min": config.TRAIN_BUFFER_MIN,
            "goods_forecast_min_confidence": config.GOODS_FORECAST_MIN_CONFIDENCE,
        },
    }


@app.get("/api/assets")
def assets(dept: str | None = None):
    name = dept_name(dept)
    return [
        {"id": a["asset_id"], "type": a["asset_type"], "department": a["department"],
         "corridor_id": a["corridor_id"], "section": a["route_section"], "km": float(a["km_location"]),
         "lat": a["lat"], "lon": a["lon"], "criticality": a["asset_criticality"],
         "condition": a["asset_condition"], "failure_risk": float(a["failure_risk"]),
         "overdue_days": int(a["overdue_days"])}
        for a in ref.assets.values() if not name or a["department"] == name
    ]


@app.get("/api/snap")
def snap(lat: float, lon: float):
    return geo.nearest(lat, lon)


@app.get("/api/trains")
def trains(date: str):
    """Working time table for one day (train paths per section & line)."""
    blocking = {id(t) for t in ref.trains_blocking()}
    return [
        {"id": t["train_id"], "type": t["train_type"], "section": t["route_section"], "line": t["line"],
         "direction": t["direction"], "start": t["scheduled_start"], "end": t["scheduled_end"],
         "goods_status": t["goods_train_forecast_status"], "confidence": float(t["forecast_confidence"]),
         "counts_for_planning": id(t) in blocking}
        for t in ref.trains if t["movement_date"] == date
    ]


# ================================================================ requests
@app.get("/api/requests")
def list_requests(dept: str | None = None, status: str | None = None, limit: int = 2000):
    where, params = ["1=1"], []
    if (name := dept_name(dept)):
        where.append("department=?"); params.append(name)
    if status:
        where.append("status=?"); params.append(status.upper())
    rows = store.all_requests(con, " AND ".join(where) + " ORDER BY rank_score DESC", params)
    return rows[:limit]


class NewRequest(BaseModel):
    department: str                      # eng | snt | trd
    work_type: str
    work_description: str = Field(min_length=3)
    asset_id: str | None = None
    section: str
    line: str
    km: float
    lat: float
    lon: float
    engineering_priority: str
    duration_min: int = Field(ge=15, le=600)
    block_type: str
    within_days: int = Field(ge=1, le=60)
    joint_ok: bool = True


CONSEQUENCE_BY_PRIORITY = {"Critical": "Line closure", "High": "Failure risk",
                           "Medium": "Speed restriction", "Low": "Minor operational impact"}
RISK_BY_PRIORITY = {"Critical": 0.8, "High": 0.55, "Medium": 0.35, "Low": 0.15}


@app.post("/api/requests")
def create_request(body: NewRequest):
    dname = dept_name(body.department)
    if body.section not in geo.SECTIONS:
        raise HTTPException(400, "Unknown section")
    n = con.execute("SELECT COUNT(*) FROM requests").fetchone()[0] + 1
    asset = ref.assets.get(body.asset_id) if body.asset_id else None
    start = config.PLAN_START
    others = [d["name"] for d in config.DEPARTMENTS.values() if d["name"] != dname]
    req = {
        "id": f"REQ-{n:07d}", "source_system": config.DEPARTMENTS[body.department]["source"],
        "department": dname, "work_type": body.work_type, "work_description": body.work_description,
        "asset_id": body.asset_id, "asset_type": asset["asset_type"] if asset else "—",
        "corridor_id": geo.SECTIONS[body.section][0], "section": body.section, "line": body.line,
        "track": "Main Line", "km_start": body.km, "km_end": body.km, "lat": body.lat, "lon": body.lon,
        "block_type": body.block_type, "duration_min": body.duration_min,
        "earliest_start": start.strftime(store.FMT),
        "latest_finish": (start + timedelta(days=body.within_days)).strftime(store.FMT),
        "criticality": asset["asset_criticality"] if asset else body.engineering_priority,
        "condition": asset["asset_condition"] if asset else "Fair",
        "failure_risk": float(asset["failure_risk"]) if asset else RISK_BY_PRIORITY[body.engineering_priority],
        "overdue_days": int(asset["overdue_days"]) if asset else 0,
        "safety_risk": body.engineering_priority,
        "consequence": CONSEQUENCE_BY_PRIORITY[body.engineering_priority],
        "delay_penalty": 10000.0, "joint_eligible": body.joint_ok, "parallel_allowed": body.joint_ok,
        "compatible_depts": others if body.joint_ok else [],
        "resource_type": "Maintenance Van", "resource_count": 1, "depends_on": None,
        "engineering_priority": body.engineering_priority, "status": "PENDING",
        "created_at": datetime.now().strftime(store.FMT),
    }
    model.score([req])
    planner.plan_single(con, ref, req)
    store.save(con, req)
    con.commit()
    return store.all_requests(con, "id=?", (req["id"],))[0]


class Decision(BaseModel):
    decision: str          # APPROVED | REJECTED
    remark: str = ""


def _decide(req_id, decision, remark):
    r = store.all_requests(con, "id=?", (req_id,))
    if not r:
        raise HTTPException(404, "Request not found")
    r = r[0]
    if r["status"] != "PENDING":
        raise HTTPException(400, f"{req_id} is already {r['status']}")
    if decision == "APPROVED" and not r["planned_start"]:
        raise HTTPException(400, "No slot proposed yet – run the planner first")
    upd = {"status": decision, "coa_remark": remark or ("Approved" if decision == "APPROVED" else "Rejected"),
           "decided_at": datetime.now().strftime(store.FMT)}
    if decision == "REJECTED":
        upd["block_id"] = None
    con.execute(f"UPDATE requests SET {', '.join(k + '=?' for k in upd)} WHERE id=?", [*upd.values(), req_id])


@app.post("/api/requests/{req_id}/decision")
def decide(req_id: str, body: Decision):
    d = body.decision.upper()
    if d not in ("APPROVED", "REJECTED"):
        raise HTTPException(400, "decision must be APPROVED or REJECTED")
    _decide(req_id, d, body.remark)
    con.commit()
    return store.all_requests(con, "id=?", (req_id,))[0]


@app.post("/api/blocks/{block_id}/approve")
def approve_block(block_id: str):
    ids = [r["id"] for r in store.all_requests(con, "block_id=? AND status='PENDING'", (block_id,))]
    for i in ids:
        _decide(i, "APPROVED", "Approved with block " + block_id)
    con.commit()
    return {"approved": ids}


# ================================================================ planning
class PlanBody(BaseModel):
    horizon: str = "week"


@app.post("/api/plan")
def run_plan(body: PlanBody):
    if body.horizon not in config.HORIZON_DAYS:
        raise HTTPException(400, "horizon must be week or month")
    return planner.run(con, ref, model, body.horizon)


@app.get("/api/plan/summary")
def plan_summary(horizon: str = "week"):
    now = config.PLAN_START
    return planner.summary(store.all_requests(con), now, now + timedelta(days=config.HORIZON_DAYS[horizon]), horizon)


@app.post("/api/reset")
def reset():
    seed()
    return {"ok": True}


# ================================================================ blocks
def _blocks(reqs):
    groups = defaultdict(list)
    for r in reqs:
        if r["block_id"] and r["planned_start"] and r["status"] in ("APPROVED", "PENDING"):
            groups[r["block_id"]].append(r)
    out = []
    for bid, tasks in groups.items():
        tasks.sort(key=lambda t: t["planned_start"])
        start = min(t["planned_start"] for t in tasks)
        end = max(t["planned_end"] for t in tasks)
        statuses = {t["status"] for t in tasks}
        lines = sorted({ln for t in tasks for ln in planner.lines_of(t)})
        out.append({
            "id": bid, "section": tasks[0]["section"], "corridor_id": tasks[0]["corridor_id"],
            "line": "Both Lines" if len(lines) == 2 else lines[0],
            "start": start, "end": end,
            "duration_min": int((datetime.strptime(end, store.FMT) - datetime.strptime(start, store.FMT)).total_seconds() // 60),
            "block_type": max((t["block_type"] for t in tasks), key=lambda b: planner.BLOCK_TYPE_STRENGTH.get(b, 0)),
            "status": "APPROVED" if statuses == {"APPROVED"} else "PROPOSED" if statuses == {"PENDING"} else "PART APPROVED",
            "departments": sorted({t["department"] for t in tasks}),
            "top_band": min((t["priority_band"] for t in tasks), key=["Critical", "High", "Medium", "Low"].index),
            "tasks": [{k: t[k] for k in ("id", "department", "work_type", "work_description", "asset_id",
                                         "asset_type", "line", "km_start", "lat", "lon", "planned_start",
                                         "planned_end", "duration_min", "status", "priority_band",
                                         "rank_score", "reasons", "block_type", "coa_remark")} for t in tasks],
        })
    return sorted(out, key=lambda b: b["start"])


@app.get("/api/blocks")
def blocks(date: str | None = None, days: int = 1, dept: str | None = None):
    """Blocks overlapping [date, date+days). A department sees all blocks (to know who else
    is working) – `mine` marks the ones that include its own work."""
    d0 = datetime.strptime(date, "%Y-%m-%d") if date else config.PLAN_START
    a, b = d0.strftime(store.FMT), (d0 + timedelta(days=days)).strftime(store.FMT)
    reqs = store.all_requests(con, "planned_start < ? AND planned_end > ?", (b, a))
    out = _blocks(reqs)
    name = dept_name(dept)
    for blk in out:
        blk["mine"] = bool(name and name in blk["departments"])
    return out


@app.get("/api/summary")
def summary(dept: str | None = None, date: str | None = None):
    name = dept_name(dept)
    where, params = ("department=?", (name,)) if name else ("1=1", ())
    rows = store.all_requests(con, where, params)
    day = date or config.PLAN_START.strftime("%Y-%m-%d")
    pend = [r for r in rows if r["status"] == "PENDING"]
    return {
        "pending": len(pend),
        "pending_critical": sum(r["priority_band"] == "Critical" for r in pend),
        "pending_unplanned": sum(not r["planned_start"] for r in pend
                                 if r["earliest_start"] < (config.PLAN_START + timedelta(days=30)).strftime(store.FMT)),
        "approved": sum(r["status"] == "APPROVED" for r in rows),
        "rejected": sum(r["status"] == "REJECTED" for r in rows),
        "works_today": sum(1 for r in rows if r["planned_start"] and r["planned_start"][:10] == day
                           and r["status"] != "REJECTED"),
    }


# ================================================================ timetable uploads (COA)
# PDFs and photos / scans of the time table, stored for the Control Office.
# The planner keeps using the time table in data/train_movements.csv.
import json
import re
import uuid

TT_DIR = config.UPLOAD_DIR
TT_INDEX = TT_DIR / "index.json"
TT_TYPES = {
    ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".gif": "image/gif", ".bmp": "image/bmp", ".tif": "image/tiff", ".tiff": "image/tiff",
    ".heic": "image/heic", ".heif": "image/heif",
}
TT_MAX_BYTES = 25 * 1024 * 1024


def _tt_load():
    return json.loads(TT_INDEX.read_text()) if TT_INDEX.exists() else []


def _tt_save(items):
    TT_DIR.mkdir(parents=True, exist_ok=True)
    TT_INDEX.write_text(json.dumps(items, indent=1))


@app.get("/api/timetable/uploads")
def timetable_uploads():
    return _tt_load()


@app.post("/api/timetable/uploads")
async def timetable_upload(request: Request, filename: str):
    name = os.path.basename(filename).strip() or "timetable"
    ext = os.path.splitext(name)[1].lower()
    if ext not in TT_TYPES:
        raise HTTPException(400, "Only PDF or image files (JPG, PNG, WEBP, HEIC, TIFF…) can be uploaded")
    data = await request.body()
    if not data:
        raise HTTPException(400, "The file is empty")
    if len(data) > TT_MAX_BYTES:
        raise HTTPException(413, "File is larger than 25 MB")
    fid = uuid.uuid4().hex[:12]
    TT_DIR.mkdir(parents=True, exist_ok=True)
    (TT_DIR / f"{fid}{ext}").write_bytes(data)
    item = {"id": fid, "name": re.sub(r"[\r\n]", " ", name), "ext": ext, "type": TT_TYPES[ext], "size": len(data),
            "uploaded_at": datetime.now().strftime("%Y-%m-%d %H:%M")}
    _tt_save([item] + _tt_load())
    return item


@app.get("/api/timetable/uploads/{fid}")
def timetable_file(fid: str):
    item = next((x for x in _tt_load() if x["id"] == fid), None)
    if not item:
        raise HTTPException(404, "Upload not found")
    from urllib.parse import quote
    return FileResponse(TT_DIR / f"{fid}{item['ext']}", media_type=item["type"],
                        headers={"Content-Disposition": f"inline; filename*=utf-8''{quote(item['name'])}"})


@app.delete("/api/timetable/uploads/{fid}")
def timetable_delete(fid: str):
    items = _tt_load()
    item = next((x for x in items if x["id"] == fid), None)
    if not item:
        raise HTTPException(404, "Upload not found")
    (TT_DIR / f"{fid}{item['ext']}").unlink(missing_ok=True)
    _tt_save([x for x in items if x["id"] != fid])
    return {"ok": True}


# ================================================================ serve the built UI (optional)
DIST = config.BASE_DIR.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        return FileResponse(DIST / "index.html")
