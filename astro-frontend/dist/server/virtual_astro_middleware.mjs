import { a6 as defineMiddleware, af as sequence } from './chunks/sequence_BkVCRbMA.mjs';
import '@astrojs/internal-helpers/path';
import 'piccolore';
import 'clsx';

const onRequest$1 = defineMiddleware(async (context, next) => {
  const cookies = context.request.headers.get("cookie") || "";
  const cookieMatch = cookies.match(/locale=([^;]+)/);
  let detectedLocale = "zh-CN";
  if (cookieMatch) {
    const localeValue = cookieMatch[1];
    if (localeValue === "follow") {
      const acceptLang = context.request.headers.get("accept-language") || "";
      if (acceptLang.includes("zh")) {
        detectedLocale = "zh-CN";
      } else if (acceptLang.includes("en")) {
        detectedLocale = "en";
      }
    } else if (localeValue === "en" || localeValue === "zh-CN") {
      detectedLocale = localeValue;
    }
  } else {
    const acceptLang = context.request.headers.get("accept-language") || "";
    if (acceptLang.includes("zh")) {
      detectedLocale = "zh-CN";
    } else if (acceptLang.includes("en")) {
      detectedLocale = "en";
    }
  }
  context.locals.locale = detectedLocale;
  const response = await next();
  response.headers.set("Content-Language", detectedLocale);
  response.headers.set("Vary", "Cookie");
  return response;
});

const onRequest = sequence(
	
	onRequest$1
	
);

export { onRequest };
