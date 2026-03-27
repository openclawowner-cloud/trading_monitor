const API_ORIGIN = (() => {
  const raw =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_ORIGIN != null
      ? String(import.meta.env.VITE_API_ORIGIN).replace(/\/$/, '')
      : '';
  if (raw) return raw;
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return 'http://localhost:3000';
  return '';
})();
const BASE = API_ORIGIN ? `${API_ORIGIN}/api` : '/api';

export async function getOverview(): Promise<import('../types/api').OverviewResponse> {
  const res = await fetch(`${BASE}/overview`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Overview API ${res.status}`);
  return (await res.json()) as import('../types/api').OverviewResponse;
}
