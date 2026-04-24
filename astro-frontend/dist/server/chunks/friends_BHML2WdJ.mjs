import { c as createComponent } from './astro-component_CMQZp1Ki.mjs';
import 'piccolore';
import { P as renderTemplate, y as maybeRenderHead } from './sequence_BkVCRbMA.mjs';
import { r as renderComponent } from './server_Dsl36lsc.mjs';
import { g as getLocale, a as getApiUrl, $ as $$Layout, b as getTranslation } from './api_DPeGpqnI.mjs';

const $$Friends = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Friends;
  const locale = getLocale(Astro2.locals);
  const t = (key) => getTranslation(locale, key);
  let settings = {};
  try {
    const res = await fetch(getApiUrl("/api/settings", true));
    if (res.ok) settings = await res.json();
  } catch (e) {
  }
  if (!settings || Object.keys(settings).length === 0) {
    try {
      const res = await fetch(getApiUrl("/api/public/settings", true));
      if (res.ok) settings = await res.json();
    } catch (e) {
    }
  }
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": t("friends.title"), "settings": settings, "data-astro-cid-spp2p3no": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-container" data-astro-cid-spp2p3no> <h1 data-astro-cid-spp2p3no>${t("friends.title")}</h1> <div class="friends-list" data-astro-cid-spp2p3no> <div class="friend-item" data-astro-cid-spp2p3no> <h3 data-astro-cid-spp2p3no>Waiwai</h3> <h4 data-astro-cid-spp2p3no>非常乐意并享受被人挂网上的感觉</h4> <img src="https://file.eightyfor.top/server/data/upload/pic/1770999133303_vne7_177099908700-992.webp" alt="Waiwai" data-astro-cid-spp2p3no> <p data-astro-cid-spp2p3no>（据说这位是家属）</p> </div> </div> </div> ` })}`;
}, "/opt/Chronicle/astro-frontend/src/pages/friends.astro", void 0);

const $$file = "/opt/Chronicle/astro-frontend/src/pages/friends.astro";
const $$url = "/friends";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Friends,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
