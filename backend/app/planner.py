"""
Block planner.

For every pending request, highest AI rank first, find the best slot that:

  1. lies inside the request's own window (earliest start .. latest finish)
     and inside the planning horizon (week / month),
  2. does not touch any train path in the working time table
     (plus a safety buffer; forecasted goods trains included when confident),
  3. does not clash with another block on the same section & line, unless both
     jobs are joint-block compatible (different departments that allow each
     other; parallel if both allow it, otherwise back-to-back),
  4. has enough crews / machines free in the division pool,
  5. starts after the job it depends on (e.g. isolation before OHE work).

Among valid slots it picks the one with the lowest cost:

  cost = waiting hours x (1 + rank / 20)      -> urgent, critical jobs go first
         - bonus if it shares an existing block  -> fewer separate closures
         - bonus if it sits in a COA corridor block window

That is a greedy, priority-ordered optimiser: easy to explain, fast (whole
month in about a second) and every decision can be traced.
"""
from bisect import bisect_left
from collections import Counter, defaultdict
from datetime import timedelta

from . import config
from .store import from_min, to_min

DAY = 1440
BLOCK_TYPE_STRENGTH = {"Caution Order": 0, "Power Block": 1, "Line Block": 2, "Full Block": 3}


def lines_of(req):
    return ["Up", "Down"] if req["line"] == "Both Lines" else [req["line"]]


def compatible(a, b):
    return (a["department"] != b["department"] and a["joint_eligible"] and b["joint_eligible"]
            and b["department"] in a["compatible_depts"] and a["department"] in b["compatible_depts"])


class Planner:
    def __init__(self, ref, now, horizon_end):
        self.ref = ref
        self.now = to_min(now)
        self.horizon_end = to_min(horizon_end)
        buf = config.TRAIN_BUFFER_MIN

        self.trains = defaultdict(list)                 # (sec,line) -> [(s,e)]
        for t in ref.trains_blocking():
            self.trains[(t["route_section"], t["line"])].append(
                (to_min(t["scheduled_start"]) - buf, to_min(t["scheduled_end"]) + buf))
        self.train_starts = {}
        for k, v in self.trains.items():
            v.sort()
            self.train_starts[k] = [s for s, _ in v]

        self.corridor_win = defaultdict(list)           # COA designated block windows
        for b in ref.corridor_blocks:
            if b["availability_status"] == "Available":
                self.corridor_win[(b["route_section"], b["line"])].append(
                    (to_min(b["block_start"]), to_min(b["block_end"])))

        self.tasks = defaultdict(list)                  # (sec,line,day) -> [task]
        self.res_use = defaultdict(list)                # (dept,type,day) -> [(s,e,n)]
        self.done = {}                                  # request id -> planned end (min)
        self.block_seq = Counter()

    # ----------------------------------------------------------- bookkeeping
    def add(self, req, s, e, block_id):
        task = {**req, "s": s, "e": e, "block_id": block_id}
        for ln in lines_of(req):
            for d in range(s // DAY, e // DAY + 1):
                self.tasks[(req["section"], ln, d)].append(task)
        for d in range(s // DAY, e // DAY + 1):
            self.res_use[(req["department"], req["resource_type"], d)].append((s, e, req["resource_count"]))
        self.done[req["id"]] = e

    def add_fixed(self, req):
        if req.get("planned_start") and req.get("block_id"):
            self.add(req, to_min(req["planned_start"]), to_min(req["planned_end"]), req["block_id"])
            prefix, n = req["block_id"].rsplit("-", 1)
            self.block_seq[prefix] = max(self.block_seq[prefix], int(n))

    def _tasks_near(self, sec, line, s, e):
        seen, out = set(), []
        for d in range(s // DAY - 1, e // DAY + 2):
            for t in self.tasks.get((sec, line, d), ()):
                if id(t) not in seen:
                    seen.add(id(t))
                    out.append(t)
        return out

    # ----------------------------------------------------------- checks
    def _train_clash(self, sec, line, s, e):
        starts = self.train_starts.get((sec, line), [])
        iv = self.trains.get((sec, line), [])
        i = bisect_left(starts, e)
        j = i - 1
        while j >= 0 and iv[j][0] > s - 600:
            if iv[j][1] > s:
                return True
            j -= 1
        return False

    def _resources_ok(self, req, s, e):
        pool = self.ref.resource_pool.get((req["department"], req["resource_type"]), 0)
        if pool < req["resource_count"]:
            return False
        uses = set()
        for d in range(s // DAY, e // DAY + 1):
            uses.update(u for u in self.res_use.get((req["department"], req["resource_type"], d), ())
                        if u[0] < e and u[1] > s)
        # worst case: all overlapping jobs at once
        return sum(u[2] for u in uses) + req["resource_count"] <= pool

    def check(self, req, s):
        """Returns (ok, reason, set_of_blocks_it_would_join)."""
        e = s + req["duration_min"]
        joins = set()
        for ln in lines_of(req):
            if self._train_clash(req["section"], ln, s, e):
                return False, "train", joins
            for t in self._tasks_near(req["section"], ln, s, e):
                overlap = t["s"] < e and t["e"] > s
                touch = t["e"] == s or t["s"] == e
                if overlap:
                    if not (compatible(req, t) and req["parallel_allowed"] and t["parallel_allowed"]):
                        return False, "busy", joins
                    joins.add(t["block_id"])
                elif touch and compatible(req, t):
                    joins.add(t["block_id"])
        if not self._resources_ok(req, s, e):
            return False, "resources", joins
        return True, "", joins

    def _in_corridor_window(self, req, s, e):
        return all(any(ws <= s and e <= we for ws, we in self.corridor_win.get((req["section"], ln), ()))
                   for ln in lines_of(req))

    # ----------------------------------------------------------- one request
    def plan_one(self, req):
        d = req["duration_min"]
        earliest, latest = to_min(req["earliest_start"]), to_min(req["latest_finish"])
        ws, we = max(earliest, self.now), min(latest, self.horizon_end)

        if latest < self.now + d:
            return None, "Deadline already passed – needs emergency block from COA"
        if req.get("depends_on"):
            if req["depends_on"] not in self.done:
                return None, f"Waiting for {req['depends_on']} to be scheduled first"
            ws = max(ws, self.done[req["depends_on"]])
        if earliest >= self.horizon_end or ws + d > we and latest > self.horizon_end:
            return None, "After the 30-day horizon – planned in a later cycle"
        if ws + d > we:
            return None, "Window too short after dependency"

        # candidate start times: window start, end of each train path,
        # start/end of existing blocks (to share them), COA corridor windows
        cand = {ws}
        for ln in lines_of(req):
            key = (req["section"], ln)
            iv, starts = self.trains.get(key, []), self.train_starts.get(key, [])
            for k in range(max(bisect_left(starts, ws) - 3, 0), bisect_left(starts, we)):
                cand.add(iv[k][1])
            for t in self._tasks_near(req["section"], ln, ws, we):
                cand.update((t["s"], t["e"], t["s"] - d))
            for a, _ in self.corridor_win.get(key, ()):
                cand.add(a)
        cand = sorted(c for c in cand if ws <= c <= we - d)[: config.MAX_CANDIDATES]

        best, why = None, Counter()
        weight = 1 + req["rank_score"] * config.URGENCY_WEIGHT_PER_SCORE
        for s in cand:
            ok, reason, joins = self.check(req, s)
            if not ok:
                why[reason] += 1
                continue
            cost = (s - ws) / 60 * weight
            if joins:
                cost -= config.JOINT_BLOCK_BONUS_H
            if self._in_corridor_window(req, s, s + d):
                cost -= config.CORRIDOR_BLOCK_BONUS_H
            if best is None or cost < best[0]:
                best = (cost, s, joins)

        if best is None:
            main = why.most_common(1)[0][0] if why else "train"
            return None, {
                "train": "No train-free gap long enough before the deadline",
                "busy": "Section already blocked by incompatible work",
                "resources": "Crew / machine not free in the window",
            }[main]

        _, s, joins = best
        if joins:
            block_id = sorted(joins)[0]
            note = "Shares block with another department"
        else:
            day = from_min(s)[5:10].replace("-", "")
            prefix = f"BLK-{day}-{req['section'][-2:]}"
            self.block_seq[prefix] += 1
            block_id = f"{prefix}-{self.block_seq[prefix]:02d}"
            note = ""
        self.add(req, s, s + d, block_id)
        return (s, s + d, block_id), note or "Slot found in train time table gap"


# =============================================================== planning run
def run(con, ref, model, horizon="week"):
    from . import store

    now = config.PLAN_START
    # always plan the full rolling month (long-term view); the weekly plan is its first 7 days
    plan_end = now + timedelta(days=config.HORIZON_DAYS["month"])
    end = now + timedelta(days=config.HORIZON_DAYS[horizon])
    reqs = store.all_requests(con)
    by_id = {r["id"]: r for r in reqs}

    planner = Planner(ref, now, plan_end)
    for r in reqs:
        if r["status"] == "APPROVED":
            planner.add_fixed(r)

    pending = [r for r in reqs if r["status"] == "PENDING"]
    for r in pending:
        r.update(planned_start=None, planned_end=None, block_id=None, plan_note=None)
    pending.sort(key=lambda r: -r["rank_score"])
    pending_ids = {r["id"] for r in pending}

    def do(r, stack=()):
        if r["planned_start"] or r["plan_note"]:
            return
        dep = r.get("depends_on")
        if dep and dep in pending_ids and dep not in stack:   # plan the predecessor first
            do(by_id[dep], stack + (r["id"],))
        result, note = planner.plan_one(r)
        if result:
            s, e, b = result
            r.update(planned_start=from_min(s), planned_end=from_min(e), block_id=b, plan_note=note)
        else:
            r["plan_note"] = note

    for r in pending:
        do(r)
    for r in pending:
        store.save(con, r)
    con.commit()
    return summary(store.all_requests(con), now, end, horizon)


def plan_single(con, ref, req):
    """Plan one new request around everything already planned (used when a department submits)."""
    from . import store
    now = config.PLAN_START
    planner = Planner(ref, now, now + timedelta(days=config.HORIZON_DAYS["month"]))
    for r in store.all_requests(con):
        if r["status"] in ("APPROVED", "PENDING") and r["id"] != req["id"]:
            planner.add_fixed(r)
    result, note = planner.plan_one(req)
    if result:
        s, e, b = result
        req.update(planned_start=from_min(s), planned_end=from_min(e), block_id=b, plan_note=note)
    else:
        req.update(planned_start=None, planned_end=None, block_id=None, plan_note=note)
    return req


# =============================================================== KPIs
def summary(reqs, now, end, horizon):
    now_s, end_s = now.strftime("%Y-%m-%d %H:%M"), end.strftime("%Y-%m-%d %H:%M")
    in_h = [r for r in reqs if r["status"] in ("APPROVED", "PENDING") and r["planned_start"]
            and now_s <= r["planned_start"] < end_s]
    due = [r for r in reqs if r["status"] == "PENDING" and r["earliest_start"] < end_s]
    unplanned = [r for r in due if not r["planned_start"]]

    blocks = defaultdict(list)
    for r in in_h:
        blocks[r["block_id"]].append(r)
    closure_h = work_h = 0.0
    joint = 0
    for tasks in blocks.values():
        for ln in ("Up", "Down"):          # track closed = union of work intervals per line
            iv = sorted((to_min(t["planned_start"]), to_min(t["planned_end"]))
                        for t in tasks if ln in lines_of(t))
            work_h += sum(e - s for s, e in iv) / 60
            cur_s = cur_e = None
            for s, e in iv:
                if cur_e is None or s > cur_e:
                    if cur_e is not None:
                        closure_h += (cur_e - cur_s) / 60
                    cur_s, cur_e = s, e
                else:
                    cur_e = max(cur_e, e)
            if cur_e is not None:
                closure_h += (cur_e - cur_s) / 60
        if len({t["department"] for t in tasks}) > 1:
            joint += 1

    bands = {}
    for b in ("Critical", "High", "Medium", "Low"):
        tot = [r for r in due if r["priority_band"] == b] + \
              [r for r in in_h if r["priority_band"] == b and r["status"] == "APPROVED"]
        ok = [r for r in tot if r["planned_start"]]
        bands[b] = {"total": len(tot), "planned": len(ok)}

    waits = [(to_min(r["planned_start"]) - max(to_min(r["earliest_start"]), to_min(now_s))) / 60
             for r in in_h if r["priority_band"] in ("Critical", "High")]

    return {
        "horizon": horizon, "from": now_s, "to": end_s,
        "jobs_planned": len(in_h),
        "jobs_unplanned": len(unplanned),
        "unplanned_reasons": Counter(r["plan_note"] for r in unplanned).most_common(),
        "blocks": len(blocks),
        "joint_blocks": joint,
        "track_closure_hours": round(closure_h, 1),
        "work_hours": round(work_h, 1),
        "hours_saved_by_sharing": round(work_h - closure_h, 1),
        "avg_wait_critical_high_h": round(sum(waits) / len(waits), 1) if waits else 0,
        "by_band": bands,
    }
