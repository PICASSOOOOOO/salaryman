const BASE = import.meta.env.BASE_URL;

export function apiFetch(path: string, opts?: RequestInit): Promise<Response> {
  const fullPath = path.startsWith('/api/')
    ? `${BASE}${path.slice(1)}`
    : path.startsWith('api/')
    ? `${BASE}${path}`
    : path;
  return fetch(fullPath, opts);
}
