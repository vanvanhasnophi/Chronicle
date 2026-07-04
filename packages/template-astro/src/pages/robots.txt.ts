import type { APIRoute } from 'astro';
import { getPublicSettings } from '../data/localDataSource';

export const GET: APIRoute = () => {
  const settings = getPublicSettings() as Record<string, any>;
  const siteUrl = (settings?.frontendUrl || '').replace(/\/$/, '');
  const sitemapUrl = siteUrl ? `${siteUrl}/sitemap-index.xml` : '';

  const lines = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /admin/',
    sitemapUrl ? `Sitemap: ${sitemapUrl}` : '',
  ].filter(Boolean);

  return new Response(lines.join('\n').trim() + '\n', {
    headers: { 'Content-Type': 'text/plain' },
  });
};
