/**
 * API client for the inventory transfer assistant backend.
 * All calls use relative paths so the gateway can proxy to the backend.
 */

const BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('未授权');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

function uploadRequest<T>(path: string, formData: FormData): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${BASE}${path}`, { method: 'POST', headers, body: formData })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      return res.json();
    });
}

function downloadRequest(path: string, filename: string) {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${BASE}${path}`, { headers })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });
}

// Auth
export const auth = {
  register: (data: { email?: string; phone?: string; password: string; name?: string }) =>
    request<{ access_token: string; user: Record<string, unknown> }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { account: string; password: string }) =>
    request<{ access_token: string; user: Record<string, unknown> }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request<Record<string, unknown>>('/auth/me'),
  users: () => request<Record<string, unknown>[]>('/auth/users'),
  updateUser: (id: number, data: { role?: string; name?: string }) =>
    request<Record<string, unknown>>(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id: number) => request<{ status: string }>(`/auth/users/${id}`, { method: 'DELETE' }),
};

// Data management
export const dataApi = {
  status: () => request<Record<string, unknown>[]>('/data/status'),
  list: (table: string) => request<Record<string, unknown>[]>(`/data/${table}`),
  create: (table: string, data: Record<string, unknown>) =>
    request<{ status: string }>(`/data/${table}`, { method: 'POST', body: JSON.stringify(data) }),
  update: (table: string, key: string, data: Record<string, unknown>) =>
    request<{ status: string }>(`/data/${table}/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (table: string, key: string) =>
    request<{ status: string }>(`/data/${table}/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return uploadRequest<{ status: string }>('/data/upload', fd);
  },
  downloadTemplate: () => downloadRequest('/data/template', 'template.xlsx'),
  exportData: () => downloadRequest('/data/export', 'inventory_data.xlsx'),
};

// Business rules
export const rulesApi = {
  list: () => request<Record<string, unknown>[]>('/rules'),
  create: (data: { rule_type: string; rule_json: string; enabled?: boolean }) =>
    request<{ status: string }>('/rules', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { rule_type: string; rule_json: string; enabled?: boolean }) =>
    request<{ status: string }>(`/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request<{ status: string }>(`/rules/${id}`, { method: 'DELETE' }),
  toggle: (id: number) => request<{ status: string }>(`/rules/${id}/toggle`, { method: 'POST' }),
  exportRules: () => downloadRequest('/rules/export', 'business_rules.json'),
};

// Scenarios
export const scenariosApi = {
  list: () => request<Record<string, unknown>[]>('/scenarios'),
  get: (id: number) => request<Record<string, unknown>>(`/scenarios/${id}`),
  create: (data: Record<string, unknown>) =>
    request<{ status: string }>('/scenarios', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Record<string, unknown>) =>
    request<{ status: string }>(`/scenarios/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request<{ status: string }>(`/scenarios/${id}`, { method: 'DELETE' }),
  copy: (id: number) => request<{ status: string }>(`/scenarios/${id}/copy`, { method: 'POST' }),
  setDefault: (id: number) => request<{ status: string }>(`/scenarios/${id}/set_default`, { method: 'POST' }),
};

// Solver
export const solverApi = {
  solve: (data: { algorithm: string; scenario_id?: number; params?: Record<string, unknown> }) =>
    request<{ history_id: number; result: Record<string, unknown> }>('/solver/solve', { method: 'POST', body: JSON.stringify(data) }),
  getModel: (historyId: number) => request<Record<string, unknown>>(`/solver/model/${historyId}`),
  downloadModel: (historyId: number, type: string) =>
    downloadRequest(`/solver/model/${historyId}/file/${type}`, `model_${historyId}.${type}`),
};

// History
export const historyApi = {
  list: () => request<Record<string, unknown>[]>('/history'),
  get: (id: number) => request<Record<string, unknown>>(`/history/${id}`),
  delete: (id: number) => request<{ status: string }>(`/history/${id}`, { method: 'DELETE' }),
  toggleStar: (id: number) => request<{ status: string }>(`/history/${id}/star`, { method: 'POST' }),
  downloadPdf: (id: number) => downloadRequest(`/history/${id}/pdf`, `report_${id}.pdf`),
};

// Compare
export const compareApi = {
  compare: (historyIds: number[]) =>
    request<{ records: Record<string, unknown>[]; summary: Record<string, unknown> }>('/compare', { method: 'POST', body: JSON.stringify({ history_ids: historyIds }) }),
  exportCompare: (historyIds: number[]) => {
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${BASE}/compare/export`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ history_ids: historyIds }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'compare.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      });
  },
};

// Health monitor
export const healthApi = {
  warehouses: () => request<Record<string, unknown>[]>('/health/warehouses'),
};
