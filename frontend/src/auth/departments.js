// Single source of truth for department <-> system (URL) mapping.
//
// Login URLs use department names (/login/engineering, /login/signalling, ...),
// while the workspaces use the system keys defined in lib/ui.js SYSTEMS
// (/eng, /snt, /trd, /coa), which are also the keys the backend expects.

// Any department slug / alias used in the app -> canonical department
const DEPARTMENT_ALIASES = {
  engineering: "engineering",
  civil: "engineering",
  track: "engineering",
  eng: "engineering",
  signalling: "signalling",
  snt: "signalling",
  trd: "trd",
  controller: "controller",
  coa: "controller",
};

// Canonical department -> system key (first URL segment of the workspace)
export const DEPARTMENT_TO_SYSTEM = {
  engineering: "eng",
  signalling: "snt",
  trd: "trd",
  controller: "coa",
};

// System key -> canonical department (used by the route guard)
export const SYSTEM_TO_DEPARTMENT = {
  eng: "engineering",
  snt: "signalling",
  trd: "trd",
  coa: "controller",
};

export function normalizeDepartment(dept) {
  return DEPARTMENT_ALIASES[String(dept || "").toLowerCase()] || null;
}

export function dashboardPathFor(dept) {
  const sys = DEPARTMENT_TO_SYSTEM[normalizeDepartment(dept)];
  return sys ? `/${sys}/dashboard` : "/";
}
