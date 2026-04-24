import { defineMiddleware } from 'astro:middleware';

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

  // 可选：在响应头中设置Content-Language 和 Vary 以免缓存导致语言切换失效
  response.headers.set('Content-Language', detectedLocale);
  response.headers.set('Vary', 'Cookie');

  return response;
});
