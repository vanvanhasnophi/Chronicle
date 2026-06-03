import { getApiUrl } from '../config/api';

export async function loadSiteSettings(): Promise<Record<string, any>> {
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
