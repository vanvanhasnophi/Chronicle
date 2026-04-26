import { defineMiddleware } from 'astro:middleware';

function mergeVaryHeader(current: string | null, value: string): string {
  const parts = new Set(
    String(current || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  );
  parts.add(value);
  return Array.from(parts).join(', ');
}

export const onRequest = defineMiddleware(async (context, next) => {
  // 检测用户的语言偏好
  // 优先级: cookie > Accept-Language header > defaultLocale

  const cookies = context.request.headers.get('cookie') || '';
  const cookieMatch = cookies.match(/locale=([^;]+)/);

  let detectedLocale: 'en' | 'zh-CN' = 'zh-CN';

  if (cookieMatch) {
    const localeValue = cookieMatch[1];
    // 如果是"follow"，则根据Accept-Language检测
    if (localeValue === 'follow') {
      const acceptLang = context.request.headers.get('accept-language') || '';
      if (acceptLang.includes('zh')) {
        detectedLocale = 'zh-CN';
      } else if (acceptLang.includes('en')) {
        detectedLocale = 'en';
      }
    } else if (localeValue === 'en' || localeValue === 'zh-CN') {
      detectedLocale = localeValue as 'en' | 'zh-CN';
    }
  } else {
    // 没有cookie，使用Accept-Language
    const acceptLang = context.request.headers.get('accept-language') || '';
    if (acceptLang.includes('zh')) {
      detectedLocale = 'zh-CN';
    } else if (acceptLang.includes('en')) {
      detectedLocale = 'en';
    }
  }

  // 设置当前locale到context，让所有页面都可以访问
  context.locals.locale = detectedLocale;

  // 继续处理请求
  const response = await next();
  const pathname = context.url.pathname;
  const isApiPath = pathname.startsWith('/api/');
  const isCssAsset = pathname.endsWith('.css') || (pathname.startsWith('/_astro/') && pathname.includes('.css'));
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(pathname);
  const isHtmlPage = !isApiPath && !isCssAsset && !hasExtension;

  // 可选：在响应头中设置Content-Language 和 Vary 以免缓存导致语言切换失效
  response.headers.set('Content-Language', detectedLocale);
  response.headers.set('Vary', mergeVaryHeader(response.headers.get('Vary'), 'Cookie'));

  // Force page revalidation to avoid stale SSR HTML in old browsers.
  if (isHtmlPage) {
    response.headers.set('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }

  // Keep global/home style assets quickly revalidating without long-lived browser cache.
  if (isCssAsset) {
    response.headers.set('Cache-Control', 'no-cache, max-age=0, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }

  return response;
});
