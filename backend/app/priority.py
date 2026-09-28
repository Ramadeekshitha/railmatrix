"""
AI priority model.

A Gradient-Boosting model learns, from past requests in TMS/SMMS/TDMS, how
engineers weighed criticality, condition, failure risk, overdue days, safety
risk, work type and consequence of deferral.  It scores every new request
0-100.  Urgency (how little slack the deadline leaves) is added on top, and
each request gets plain-language reasons so users can see *why* it ranks
where it does.
"""
from datetime import datetime

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import cross_val_score

from . import config

FEATURES = [
    ("Asset criticality", lambda r: config.LEVEL.get(r["criticality"], 2)),
    ("Asset condition", lambda r: config.CONDITION.get(r["condition"], 2)),
    ("Failure risk", lambda r: float(r["failure_risk"])),
    ("Overdue days", lambda r: float(r["overdue_days"])),
    ("Safety risk", lambda r: config.LEVEL.get(r["safety_risk"], 2)),
    ("Emergency work", lambda r: 1.0 if r["work_type"] == "Emergency" else 0.0),
    ("Corrective work", lambda r: 1.0 if r["work_type"] == "Corrective" else 0.0),
    ("Consequence of deferral", lambda r: config.CONSEQUENCE.get(r["consequence"], 1)),
    ("Delay penalty (INR)", lambda r: float(r["delay_penalty"])),
]


ENGINEER_FLOOR = {"Critical": 72.0, "High": 56.0}


def _x(reqs):
    return np.array([[f(r) for _, f in FEATURES] for r in reqs], dtype=float)


class PriorityModel:
    def __init__(self):
        self.model = GradientBoostingRegressor(n_estimators=200, max_depth=3, random_state=0)
        self.info = {}

    def fit(self, reqs):
        X = _x(reqs)
        y = np.array([r["_label"] for r in reqs])
        r2 = cross_val_score(self.model, X, y, cv=5, scoring="r2").mean()
        self.model.fit(X, y)
        imp = sorted(zip([n for n, _ in FEATURES], self.model.feature_importances_), key=lambda t: -t[1])
        self.info = {
            "algorithm": "Gradient Boosting Regressor (scikit-learn)",
            "trained_on": len(reqs),
            "cv_r2": round(float(r2), 3),
            "feature_importance": [{"feature": n, "weight": round(float(w), 3)} for n, w in imp],
        }

    def score(self, reqs):
        """Adds priority_score, urgency_score, rank_score, priority_band, reasons to each request."""
        if not reqs:
            return reqs
        pred = self.model.predict(_x(reqs))
        for r, p in zip(reqs, pred):
            prio = float(np.clip(p * 100, 0, 100))
            if r["work_type"] == "Emergency":
                prio = max(prio, 75.0)
            # the engineer's own judgement sets a floor the model cannot go below
            prio = max(prio, ENGINEER_FLOOR.get(r.get("engineering_priority"), 0))
            slack_h = _slack_hours(r)
            urg = float(np.clip(100 * (1 - slack_h / 168), 0, 100))  # 0 slack -> 100, >=7 days -> 0
            rank = 0.75 * prio + 0.25 * urg
            r["priority_score"] = round(prio, 1)
            r["urgency_score"] = round(urg, 1)
            r["rank_score"] = round(rank, 1)
            r["priority_band"] = next(b for t, b in config.BANDS if prio >= t)
            r["reasons"] = reasons(r, slack_h)
        return reqs


def _slack_hours(r):
    es = datetime.strptime(r["earliest_start"], "%Y-%m-%d %H:%M")
    lf = datetime.strptime(r["latest_finish"], "%Y-%m-%d %H:%M")
    return max((lf - es).total_seconds() / 3600 - r["duration_min"] / 60, 0)


def reasons(r, slack_h):
    out = []
    if r["work_type"] == "Emergency":
        out.append("Emergency work")
    if r["criticality"] in ("Critical", "High"):
        out.append(f"{r['criticality']} criticality asset")
    if r["failure_risk"] >= 0.5:
        out.append(f"Failure risk {round(r['failure_risk'] * 100)}%")
    if r["overdue_days"] >= 60:
        out.append(f"Overdue {r['overdue_days']} days")
    if r["safety_risk"] in ("Critical", "High"):
        out.append(f"{r['safety_risk']} safety risk")
    if r["consequence"] in ("Line closure", "Failure risk"):
        out.append(f"If deferred: {r['consequence'].lower()}")
    if slack_h < 48:
        out.append(f"Must finish within {int(slack_h)} h")
    return out[:4] or ["Routine work"]
