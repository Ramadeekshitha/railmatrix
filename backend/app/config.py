"""
All tunable rules in one place.  Change a number here, re-run the planner, see the effect.
"""
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = BASE_DIR / "railblock.db"

# "Today" for the planner. The sample dataset starts on 28-Sep-2026.
PLAN_START = datetime(2026, 9, 28, 0, 0)

HORIZON_DAYS = {"week": 7, "month": 30}

# ---------------------------------------------------------------- departments
# key used in URLs -> name used in the data
DEPARTMENTS = {
    "eng": {"name": "Engineering", "label": "Engineering", "source": "TMS"},
    "snt": {"name": "S&T", "label": "Signal & Telecom", "source": "SMMS"},
    "trd": {"name": "TD", "label": "Traction (TRD)", "source": "TDMS"},
}

# ---------------------------------------------------------------- train safety
TRAIN_BUFFER_MIN = 10              # keep block this many minutes clear of every train
GOODS_FORECAST_MIN_CONFIDENCE = 0.5  # forecasted goods trains below this are ignored

# ---------------------------------------------------------------- planner weights
# cost of a slot = waiting_hours * urgency_weight - bonuses   (lower is better)
URGENCY_WEIGHT_PER_SCORE = 1 / 20  # a score-100 job "feels" each waiting hour 6x a score-0 job
JOINT_BLOCK_BONUS_H = 8            # share an existing block instead of opening a new one
CORRIDOR_BLOCK_BONUS_H = 3         # use COA's designated corridor block window
MAX_CANDIDATES = 300

# ---------------------------------------------------------------- priority bands
BANDS = [(70, "Critical"), (55, "High"), (40, "Medium"), (0, "Low")]

LEVEL = {"Low": 1, "Medium": 2, "High": 3, "Critical": 4}
CONDITION = {"Excellent": 0, "Good": 1, "Fair": 2, "Poor": 3, "Critical": 4}
CONSEQUENCE = {
    "Minor operational impact": 0,
    "Operational delay": 1,
    "Speed restriction": 2,
    "Failure risk": 3,
    "Line closure": 4,
}
WORK_TYPES = ["Emergency", "Corrective", "Preventive", "Inspection"]
BLOCK_TYPES = ["Full Block", "Line Block", "Power Block", "Caution Order"]
LINES = ["Up", "Down", "Both Lines"]
