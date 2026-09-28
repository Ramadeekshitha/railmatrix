const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
// Thin wrapper over the FastAPI backend (proxied at /api by Vite).
async function call(path, options = {}) {
  const res = await fetch(`${API_URL}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.detail === "string" ? err.detail : `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  meta: () => call("/meta"),
  summary: (dept, date) => call(`/summary?dept=${dept}&date=${date}`),
  blocks: (date, days = 1, dept = "") => call(`/blocks?date=${date}&days=${days}&dept=${dept}`),
  trains: (date) => call(`/trains?date=${date}`),
  requests: (dept = "", status = "") => call(`/requests?dept=${dept}&status=${status}`),
  assets: (dept) => call(`/assets?dept=${dept}`),
  snap: (lat, lon) => call(`/snap?lat=${lat}&lon=${lon}`),
  createRequest: (body) => call("/requests", { method: "POST", body }),
  decide: (id, decision, remark) => call(`/requests/${id}/decision`, { method: "POST", body: { decision, remark } }),
  approveBlock: (id) => call(`/blocks/${id}/approve`, { method: "POST" }),
  runPlan: (horizon) => call("/plan", { method: "POST", body: { horizon } }),
  planSummary: (horizon) => call(`/plan/summary?horizon=${horizon}`),
  timetableUploads: () => call("/timetable/uploads"),
  uploadTimetable: async (file) => {
    const res = await fetch(`${API_URL}/api/timetable/uploads?filename=${encodeURIComponent(file.name)}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(typeof err.detail === "string" ? err.detail : `Upload failed (${res.status})`);
    }
    return res.json();
  },
  deleteTimetable: (id) => call(`/timetable/uploads/${id}`, { method: "DELETE" }),
  timetableFileUrl: (id) => `${API_URL}/api/timetable/uploads/${id}`,
};
