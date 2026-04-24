import { c as createComponent } from './astro-component_CMQZp1Ki.mjs';
import 'piccolore';
import { P as renderTemplate, y as maybeRenderHead, aY as unescapeHTML } from './sequence_BkVCRbMA.mjs';
import { r as renderComponent } from './server_Dsl36lsc.mjs';
import { g as getLocale, a as getApiUrl, $ as $$Layout, b as getTranslation } from './api_DPeGpqnI.mjs';

const $$id = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$id;
  const { id } = Astro2.params;
  const locale = getLocale(Astro2.locals);
  const t = (key) => getTranslation(locale, key);
  let post = null;
  let settings = {};
  try {
    const params = new URLSearchParams();
    if (id) {
      params.append("id", id);
    } else {
      return Astro2.redirect("/404");
    }
    const res = await fetch(getApiUrl(`/api/public/post?${params.toString()}`, true));
    if (res.status === 200) {
      const data = await res.json();
      post = data;
    }
  } catch (e) {
    console.error("Failed to load post", e);
  }
  if (!post) {
    return Astro2.redirect("/404");
  }
  try {
    const res = await fetch(getApiUrl("/api/settings", true));
    if (res.ok) {
      settings = await res.json();
    }
  } catch (e) {
    console.error("[blog/id] Failed to fetch settings:", e);
  }
  if (!settings || Object.keys(settings).length === 0) {
    try {
      const res = await fetch(getApiUrl("/api/public/settings", true));
      if (res.ok) {
        settings = await res.json();
      }
    } catch (e) {
    }
  }
  const htmlContent = post.html || "";
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": post.title, "settings": settings }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="post-container"> <div class="post-header-area"> <div class="header-left"> <div class="back-nav"> <a href="/blogs" class="back-btn" data-astro-prefetch> <span class="icon">←</span> ${t("inblog.backToBlogs")} </a> </div> </div> <div class="header-right"></div> </div> <div class="post-content-wrapper"> <div class="post-main-area"> <h1 class="post-main-title">${post.title}</h1> <div class="post-meta"> <span class="meta-item time"> ${new Date(post.date).toLocaleString()} </span> ${post.tags && post.tags.map((tag) => renderTemplate`<span class="meta-item tag" style="color:var(--accent-color);">#${tag}</span>`)} </div> <div class="post-body markdown-body">${unescapeHTML(htmlContent)}</div> </div> </div> </div> ` })}`;
}, "/opt/Chronicle/astro-frontend/src/pages/blog/[id].astro", void 0);

const $$file = "/opt/Chronicle/astro-frontend/src/pages/blog/[id].astro";
const $$url = "/blog/[id]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$id,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
