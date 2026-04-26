import { a6 as defineMiddleware, af as sequence } from './chunks/sequence_BkVCRbMA.mjs';
import '@astrojs/internal-helpers/path';
import 'piccolore';
import 'clsx';

function mergeVaryHeader(current, value) {
  const parts = new Set(
    String(current || "").split(",").map((v) => v.trim()).filter(Boolean)
  );
  parts.add(value);
  return Array.from(parts).join(", ");
}
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
  const pathname = context.url.pathname;
  const isApiPath = pathname.startsWith("/api/");
  const isCssAsset = pathname.endsWith(".css") || pathname.startsWith("/_astro/") && pathname.includes(".css");
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(pathname);
  const isHtmlPage = !isApiPath && !isCssAsset && !hasExtension;
  response.headers.set("Content-Language", detectedLocale);
  response.headers.set("Vary", mergeVaryHeader(response.headers.get("Vary"), "Cookie"));
  if (isHtmlPage) {
    response.headers.set("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate, proxy-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  }
  if (isCssAsset) {
    response.headers.set("Cache-Control", "no-cache, max-age=0, must-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  }
  return response;
});

const onRequest = sequence(
	
	onRequest$1
	
);

export { onRequest };
