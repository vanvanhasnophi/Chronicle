import { getApiUrl, DATA_SOURCE } from '../config/api';
import { isLocalMode } from '../core/site';

export async function loadSiteSettings(): Promise<Record<string, any>> {
  // ── Local data source ──────────────────────────────────
  if (isLocalMode) {
    try {
      const { getPublicSettings } = await import('../data/localDataSource');
      return getPublicSettings() as Record<string, any>;
    } catch {
      return {};
    }
  }

  // ── Remote API ─────────────────────────────────────────
  const queryStamp = Date.now();
  const endpoints = [
    `/api/settings?t=${queryStamp}`,
    `/api/public/settings?t=${queryStamp}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(getApiUrl(endpoint, true), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && Object.keys(data).length > 0) {
          return data;
        }
      }
    } catch {
      // Try the next endpoint.
    }
  }

  return {};
}
