# RailMatrix – AI-assisted Automatic Block Planning

One coordinated block plan for **Engineering (TMS)**, **Signal & Telecom (SMMS)** and **Traction / TRD (TDMS)**, built around the **train time table and goods forecast from the Control Office (COA)**, and approved by COA.

---

## 1. The process

```
 Department (ENGG / S&T / TRD)        AI engine                              Control Office (COA)
 ─────────────────────────────        ─────────                              ────────────────────
 1. Raise block request   ───────▶   2. Score priority (ML, 0-100)
    (or import from                    + urgency from deadline
     TMS / SMMS / TDMS)              3. Find slot in train time-table gaps
                                        – avoid every train path (±10 min)
                                        – include confident goods forecast
                                        – share block with other depts
                                        – crews / machines not double-booked
                                        – dependencies in order
                                                          ───────────────▶  4. Approve / Reject (with remark)
 5. Approved block shows on   ◀──────────────────────────────────────────────  Approved blocks are frozen;
    every dashboard                                                            re-planning moves only pending ones
```

Request status: **PENDING** (AI slot proposed, waiting for COA) → **APPROVED** or **REJECTED**.

## 2. Systems and modules

| System | Dashboard | Module 2 | Block Request Register |
|---|---|---|---|
| Engineering / S&T / TRD | 24-h block timeline with train paths, block detail (time given, approved works, other blocks at the same time), pending works ranked by AI, **track twin** map | **Maintenance Schedule**: weekly / monthly timeline + **New block request** form (work type, asset / location with lat-long, engineering priority, duration, block type, line, *required within N days*, description) | Pending / Approved / Rejected with COA remarks |
| Control Office (COA) | Same, all departments, can approve a block from the detail panel | **AI Block Planner**: run the planner, weekly / monthly KPIs, coverage by priority, model explanation, approve blocks day by day | All requests, Approve / Reject with reason |

**Track twin:** real corridors on a map. Works are dots coloured by AI priority. Trains move along the track according to the time table. When you play the clock, sections under block light up in the department colour (dashed = not yet approved).

## 3. Architecture

```
railblock/
├── backend/                 FastAPI + SQLite (Python)
│   ├── data/                source-system extracts (CSV)
│   │     maintenance_requests.csv  ← TMS / SMMS / TDMS
│   │     assets.csv                ← asset registers
│   │     train_movements.csv       ← COA: time table + goods forecast
│   │     block_windows.csv         ← COA: designated corridor blocks
│   │     resources.csv             ← crews, tower wagons, machines
│   └── app/
│       ├── config.py        every rule & weight in one place
│       ├── store.py         data layer: reads CSVs, keeps requests in SQLite
│       ├── geo.py           section + km  ⇄  latitude / longitude
│       ├── priority.py      ML priority model (+ plain-language reasons)
│       ├── planner.py       block optimiser + KPIs
│       └── main.py          REST API
└── frontend/                React + Vite + Tailwind + Leaflet
    └── src/
        ├── pages/           Home, Dashboard, Schedule, Planner (COA), Register
        ├── components/      Timeline24, DaysTimeline, TwinMap, BlockPanel, RequestForm, Bits
        └── lib/             api.js (all backend calls), ui.js (colours, time helpers)
```

To connect the live systems, replace the CSV reads in `store.py` with API calls to TMS / SMMS / TDMS / COA. Nothing else changes.

## 4. The AI

**Priority model** (`priority.py`). A Gradient Boosting Regressor is trained on past requests (asset criticality, condition, failure risk, overdue days, safety risk, work type, consequence of deferral, delay penalty). On the sample data it scores 0.997 R² in 5-fold cross-validation. It gives every request a 0–100 **priority score**, which sets its band: Critical ≥ 70, High ≥ 55, Medium ≥ 40, Low below that. The engineer's own priority is a floor the model can't go below, and emergency work is at least 75.

**Rank** = 75 % priority + 25 % urgency, where urgency is how little slack the deadline leaves. Every request also carries its reasons in plain language, e.g. *"Critical criticality asset · Failure risk 74 % · Overdue 145 days"*.

**Planner** (`planner.py`). A priority-ordered greedy optimiser that places the highest rank first. For each request it tries every sensible start time: the end of each train path, the start and end of existing blocks, and the COA corridor windows. It keeps only the valid ones and picks the lowest cost:

```
cost = waiting hours × (1 + rank/20)  −  8 h  if it shares an existing block
                                      −  3 h  if it sits inside a COA corridor block window
```

A slot is valid only if:
- it avoids every train path;
- it doesn't clash with other work on the same section and line, unless the two departments are joint-block compatible (then they run in parallel or back-to-back);
- crews and machines are available;
- dependencies are respected.

The planner always plans a rolling **30 days** (the monthly plan). The weekly plan is the first 7 days of it. A full 30-day re-plan takes under a second.

**KPIs shown to COA:** works planned, blocks, joint blocks, track-closure hours vs. work hours, closure hours saved by sharing, average wait for critical and high jobs, coverage per priority band, and why unplaced jobs could not be placed.

## 5. Run it

Requires Python 3.10+ and Node 18+.

```bash
# backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000     # first start imports data and makes the first plan

# frontend (second terminal)
cd frontend
npm install
npm run dev                                    # http://localhost:5173
```

**Single server (demo):** run `npm run build` in `frontend/` once. After that, `uvicorn` alone serves the UI at http://localhost:8000.

**Reset the demo data:** start with `RESET=1 uvicorn app.main:app`, or call `POST /api/reset`. API docs are at http://localhost:8000/docs.

## 6. Demo assumptions (say these to the judges)

- Data is the synthetic dataset (seed 42). The plan date is fixed at **28-Sep-2026** (`config.PLAN_START`), the first day of the data. For the demo, COA has already approved the first 3 days.
- Sections are laid on real Guntakal-division stretches with approximate station coordinates. KM → lat/long is linear along the line. Swap in the division's KM-post GIS layer in `geo.py`.
- Crews and machines are treated as one division-level pool per department and type.
- All block types (including caution order) reserve the line in this version.
- There is no login. You pick a system on the home page. Add SSO / role checks in front of the API for production.
