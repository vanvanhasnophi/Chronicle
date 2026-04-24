import { c as createComponent } from './astro-component_CMQZp1Ki.mjs';
import 'piccolore';
import { P as renderTemplate, y as maybeRenderHead } from './sequence_BkVCRbMA.mjs';
import { r as renderComponent } from './server_Dsl36lsc.mjs';
import { g as getLocale, a as getApiUrl, $ as $$Layout, r as renderScript, b as getTranslation } from './api_DPeGpqnI.mjs';

const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Index;
  const locale = getLocale(Astro2.locals);
  const t = (key) => getTranslation(locale, key);
  let settings = {};
  try {
    const res = await fetch(getApiUrl("/api/settings", true));
    if (res.ok) {
      settings = await res.json();
    }
  } catch (e) {
    console.error("[index] Failed to fetch settings:", e);
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
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": t("nav.home"), "settings": settings, "data-astro-cid-j7pv25f6": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="home-container" data-astro-cid-j7pv25f6> <div class="hero" data-astro-cid-j7pv25f6> <h1 class="ink-minimal" data-astro-cid-j7pv25f6> <span class="ink-char" data-astro-cid-j7pv25f6>杀</span> <span class="ink-char" data-astro-cid-j7pv25f6>破</span> <span class="ink-char" data-astro-cid-j7pv25f6>狼</span> </h1> <p class="subtitle" data-astro-cid-j7pv25f6>2026 H1 theme</p> <p data-astro-cid-j7pv25f6>"Execute, Renovate and Magnetize" &nbsp; "杀心魔，破罗网，狼众生"</p> <a href="/blog/8a877784-76cd-4b0a-a669-4c30cc3a32ec" class="cta-btn" data-astro-cid-j7pv25f6>${t("home.viewThemePost")}</a> </div> <div class="fire-wall" aria-hidden="true" data-astro-cid-j7pv25f6> <div class="glow glow1" data-astro-cid-j7pv25f6></div> <div class="glow glow2" data-astro-cid-j7pv25f6></div> <div class="glow glow3" data-astro-cid-j7pv25f6></div> </div> </div> ` })}  ${renderScript($$result, "/opt/Chronicle/astro-frontend/src/pages/index.astro?astro&type=script&index=0&lang.ts")}`;
}, "/opt/Chronicle/astro-frontend/src/pages/index.astro", void 0);

const $$file = "/opt/Chronicle/astro-frontend/src/pages/index.astro";
const $$url = "";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
