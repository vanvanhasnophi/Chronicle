import { c as createComponent } from './astro-component_CMQZp1Ki.mjs';
import 'piccolore';
import { P as renderTemplate, aZ as defineScriptVars, y as maybeRenderHead, a2 as addAttribute } from './sequence_BkVCRbMA.mjs';
import { r as renderComponent } from './server_Dsl36lsc.mjs';
import { g as getLocale, a as getApiUrl, $ as $$Layout, b as getTranslation } from './api_DPeGpqnI.mjs';

var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(raw || cooked.slice()) }));
var _a;
const $$Search = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Search;
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
  let posts = [];
  try {
    const res = await fetch(getApiUrl(`/api/posts?t=${Date.now()}`, true));
    if (res.ok) posts = await res.json();
  } catch (e) {
  }
  const tagCounts = /* @__PURE__ */ new Map();
  posts.forEach((p) => {
    p.tags?.forEach((tag) => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    });
  });
  const allTagData = Array.from(tagCounts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => {
    if (a.name === "featured" || a.name === "精选") return -1;
    if (b.name === "featured" || b.name === "精选") return 1;
    return a.name.localeCompare(b.name);
  });
  const url = new URL(Astro2.request.url);
  const initialTitle = url.searchParams.get("title") || "";
  const initialTags = url.searchParams.getAll("tags");
  return renderTemplate(_a || (_a = __template(["", "  <script data-astro-rerun>(function(){", `
  // Check if we are on the search page
  const page = document.getElementById('search-page');
  if (page) {
    // Parse posts
    const allPosts = JSON.parse(postsJSON);
    const parsedInitialTags = JSON.parse(initialTagsJSON);

    // State
    let searchQuery = initialTitle;
    let debouncedQuery = initialTitle;
    let selectedTags = [...parsedInitialTags];
    let isTagCloudOpen = false;

    // DOM elements
    const input = document.getElementById('search-input');
    const tagTrigger = document.getElementById('tag-trigger');
    const tagCloud = document.getElementById('tag-cloud');
    const resultsList = document.getElementById('results-list');
    const resultsContainer = document.getElementById('results-container');
    const contentWrapper = document.getElementById('content-wrapper');
    const selectedTagsEl = document.getElementById('selected-tags');
    const closeCloudBtn = document.getElementById('close-cloud');

    function sortTagsList(tags) {
      if (!tags || !Array.isArray(tags)) return [];
      return [...tags].sort((a, b) => {
        if (a === 'featured' || a === '精选') return -1;
        if (b === 'featured' || b === '精选') return 1;
        return a.localeCompare(b);
      });
    }

    function isSearchActive() {
      return debouncedQuery.trim().length > 0 || selectedTags.length > 0;
    }

    function updateCenteredMode() {
      if (page) {
        page.classList.toggle('centered-mode', !isSearchActive() && !isTagCloudOpen);
      }
    }

    function updateVisibility() {
      const shouldShow = isSearchActive() || isTagCloudOpen;
      
      if (shouldShow) {
        if (contentWrapper) {
          contentWrapper.style.display = 'block';
          void contentWrapper.offsetHeight; // force reflow
          contentWrapper.classList.add('visible');
        }
        if (isTagCloudOpen) {
          if (tagCloud) tagCloud.style.display = 'block';
          if (resultsList) resultsList.style.display = 'none';
        } else {
          if (tagCloud) tagCloud.style.display = 'none';
          if (resultsList) resultsList.style.display = 'flex';
        }
      } else {
        if (contentWrapper) {
          contentWrapper.classList.remove('visible');
          setTimeout(() => {
            if (!isSearchActive() && !isTagCloudOpen) {
              contentWrapper.style.display = 'none';
              if (tagCloud) tagCloud.style.display = 'none';
              if (resultsList) resultsList.style.display = 'none';
            }
          }, 400); // match transition
        }
      }
    }

    function renderTagChips() {
      if (!selectedTagsEl) return;
      selectedTagsEl.innerHTML = sortTagsList(selectedTags).map(tag => {
        const isF = tag === 'featured' || tag === '精选';
        return \`
          <div class="selected-tag-chip \${isF ? 'featured' : ''}">
            <span class="chip-text">\${isF ? featuredLabel : tag}</span>
            <button class="chip-remove \${isF ? 'featured' : ''}" data-tag="\${tag}"><span class="icon-sm"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></span></button>
          </div>
        \`;
      }).join('');

      selectedTagsEl.querySelectorAll('.chip-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const tag = btn.getAttribute('data-tag');
          selectedTags = selectedTags.filter(t => t !== tag);
          const cloudItem = document.querySelector(\`.tag-cloud-item[data-tag="\${tag}"]\`);
          if (cloudItem) cloudItem.classList.remove('selected');
          syncTagTriggerState();
          renderTagChips();
          filterPosts();
          updateCenteredMode();
          updateVisibility();
        });
      });
    }

    function syncTagTriggerState() {
      if (tagTrigger) {
        tagTrigger.classList.toggle('active', selectedTags.length > 0 || isTagCloudOpen);
      }
    }

    function filterPosts() {
      if (!resultsContainer) return;
      const query = debouncedQuery.toLowerCase();

      // Avoid rendering full list when search is inactive (empty query + no tags)
      if (!query.trim() && selectedTags.length === 0) {
        resultsContainer.innerHTML = '';
        const loadingState = document.getElementById('loading-state');
        if (loadingState) loadingState.style.display = 'none';
        const emptyState = document.getElementById('empty-state');
        if (emptyState) emptyState.style.display = 'none';
        return;
      }

      const filtered = allPosts.filter(post => {
        const matchesTitle = post.title.toLowerCase().includes(query);
        const matchesTags = selectedTags.length === 0 || selectedTags.every(t => (post.tags || []).includes(t));
        return matchesTitle && matchesTags;
      });

      const loadingState = document.getElementById('loading-state');
      if (loadingState) loadingState.style.display = 'none';

      if (filtered.length === 0) {
        resultsContainer.innerHTML = '';
        const emptyState = document.getElementById('empty-state');
        if (emptyState) emptyState.style.display = 'block';
      } else {
        const emptyState = document.getElementById('empty-state');
        if (emptyState) emptyState.style.display = 'none';
        resultsContainer.innerHTML = filtered.map(post => {
          const isF = (tag) => tag === 'featured' || tag === '精选';
          return \`
            <article class="result-card" data-post-id="\${post.id}">
              <div class="post-header">
                <h3 class="post-title">\${post.title}</h3>
                <span class="post-date">\${new Date(post.date).toLocaleDateString(locale)}</span>
              </div>
              \${post.tags && post.tags.length > 0 ? \`
                <div class="post-tags">
                  \${sortTagsList(post.tags).map(tag => \`
                    <span class="tag-display \${isF(tag) ? 'featured' : ''}">
                      #\${isF(tag) ? featuredLabel : tag}
                    </span>
                  \`).join('')}
                </div>
              \` : ''}
              <div class="post-summary">\${post.summary || ''}</div>
            </article>
          \`;
        }).join('');

        resultsContainer.querySelectorAll('.result-card').forEach(card => {
          card.addEventListener('click', () => {
            window.location.href = \`/blog/\${card.getAttribute('data-post-id')}\`;
          });
        });
      }
    }

    function toggleTagCloud() {
      isTagCloudOpen = !isTagCloudOpen;

      syncTagTriggerState();
      updateCenteredMode();
      updateVisibility();
    }

    // Debounce helper
    function debounceFn(func, delay) {
      let timeout;
      return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
      };
    }

    const debouncedUpdate = debounceFn((newVal) => {
      debouncedQuery = newVal;
      filterPosts();
      updateCenteredMode();
      updateVisibility();

      if (newVal.trim()) {
        document.title = \`Search: \${newVal} - Chronicle\`;
      } else {
        document.title = 'Search - Chronicle';
      }
    }, 300);

    if (input) {
      input.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        debouncedUpdate(searchQuery);
      });
    }

    if (tagTrigger) tagTrigger.addEventListener('click', toggleTagCloud);
    if (closeCloudBtn) closeCloudBtn.addEventListener('click', toggleTagCloud);

    document.querySelectorAll('.tag-cloud-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.getAttribute('data-tag');
        if (selectedTags.includes(tag)) {
          selectedTags = selectedTags.filter(t => t !== tag);
          btn.classList.remove('selected');
        } else {
          selectedTags.push(tag);
          btn.classList.add('selected');
        }
        syncTagTriggerState();
        renderTagChips();
        filterPosts();
        updateCenteredMode();
        updateVisibility();
      });
    });

    // Initialize
    if (parsedInitialTags.length > 0) {
      renderTagChips();
      parsedInitialTags.forEach(tag => {
        document.querySelector(\`.tag-cloud-item[data-tag="\${tag}"]\`)?.classList.add('selected');
      });
    }

    syncTagTriggerState();

    // Always run initial filter to correctly display the initial state
    filterPosts();
    updateCenteredMode();
    updateVisibility();
    
    if (initialTitle || parsedInitialTags.length > 0) {
      window.history.replaceState({}, '', '/search');
    }
  }
})();<\/script>`], ["", "  <script data-astro-rerun>(function(){", `
  // Check if we are on the search page
  const page = document.getElementById('search-page');
  if (page) {
    // Parse posts
    const allPosts = JSON.parse(postsJSON);
    const parsedInitialTags = JSON.parse(initialTagsJSON);

    // State
    let searchQuery = initialTitle;
    let debouncedQuery = initialTitle;
    let selectedTags = [...parsedInitialTags];
    let isTagCloudOpen = false;

    // DOM elements
    const input = document.getElementById('search-input');
    const tagTrigger = document.getElementById('tag-trigger');
    const tagCloud = document.getElementById('tag-cloud');
    const resultsList = document.getElementById('results-list');
    const resultsContainer = document.getElementById('results-container');
    const contentWrapper = document.getElementById('content-wrapper');
    const selectedTagsEl = document.getElementById('selected-tags');
    const closeCloudBtn = document.getElementById('close-cloud');

    function sortTagsList(tags) {
      if (!tags || !Array.isArray(tags)) return [];
      return [...tags].sort((a, b) => {
        if (a === 'featured' || a === '精选') return -1;
        if (b === 'featured' || b === '精选') return 1;
        return a.localeCompare(b);
      });
    }

    function isSearchActive() {
      return debouncedQuery.trim().length > 0 || selectedTags.length > 0;
    }

    function updateCenteredMode() {
      if (page) {
        page.classList.toggle('centered-mode', !isSearchActive() && !isTagCloudOpen);
      }
    }

    function updateVisibility() {
      const shouldShow = isSearchActive() || isTagCloudOpen;
      
      if (shouldShow) {
        if (contentWrapper) {
          contentWrapper.style.display = 'block';
          void contentWrapper.offsetHeight; // force reflow
          contentWrapper.classList.add('visible');
        }
        if (isTagCloudOpen) {
          if (tagCloud) tagCloud.style.display = 'block';
          if (resultsList) resultsList.style.display = 'none';
        } else {
          if (tagCloud) tagCloud.style.display = 'none';
          if (resultsList) resultsList.style.display = 'flex';
        }
      } else {
        if (contentWrapper) {
          contentWrapper.classList.remove('visible');
          setTimeout(() => {
            if (!isSearchActive() && !isTagCloudOpen) {
              contentWrapper.style.display = 'none';
              if (tagCloud) tagCloud.style.display = 'none';
              if (resultsList) resultsList.style.display = 'none';
            }
          }, 400); // match transition
        }
      }
    }

    function renderTagChips() {
      if (!selectedTagsEl) return;
      selectedTagsEl.innerHTML = sortTagsList(selectedTags).map(tag => {
        const isF = tag === 'featured' || tag === '精选';
        return \\\`
          <div class="selected-tag-chip \\\${isF ? 'featured' : ''}">
            <span class="chip-text">\\\${isF ? featuredLabel : tag}</span>
            <button class="chip-remove \\\${isF ? 'featured' : ''}" data-tag="\\\${tag}"><span class="icon-sm"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></span></button>
          </div>
        \\\`;
      }).join('');

      selectedTagsEl.querySelectorAll('.chip-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const tag = btn.getAttribute('data-tag');
          selectedTags = selectedTags.filter(t => t !== tag);
          const cloudItem = document.querySelector(\\\`.tag-cloud-item[data-tag="\\\${tag}"]\\\`);
          if (cloudItem) cloudItem.classList.remove('selected');
          syncTagTriggerState();
          renderTagChips();
          filterPosts();
          updateCenteredMode();
          updateVisibility();
        });
      });
    }

    function syncTagTriggerState() {
      if (tagTrigger) {
        tagTrigger.classList.toggle('active', selectedTags.length > 0 || isTagCloudOpen);
      }
    }

    function filterPosts() {
      if (!resultsContainer) return;
      const query = debouncedQuery.toLowerCase();

      // Avoid rendering full list when search is inactive (empty query + no tags)
      if (!query.trim() && selectedTags.length === 0) {
        resultsContainer.innerHTML = '';
        const loadingState = document.getElementById('loading-state');
        if (loadingState) loadingState.style.display = 'none';
        const emptyState = document.getElementById('empty-state');
        if (emptyState) emptyState.style.display = 'none';
        return;
      }

      const filtered = allPosts.filter(post => {
        const matchesTitle = post.title.toLowerCase().includes(query);
        const matchesTags = selectedTags.length === 0 || selectedTags.every(t => (post.tags || []).includes(t));
        return matchesTitle && matchesTags;
      });

      const loadingState = document.getElementById('loading-state');
      if (loadingState) loadingState.style.display = 'none';

      if (filtered.length === 0) {
        resultsContainer.innerHTML = '';
        const emptyState = document.getElementById('empty-state');
        if (emptyState) emptyState.style.display = 'block';
      } else {
        const emptyState = document.getElementById('empty-state');
        if (emptyState) emptyState.style.display = 'none';
        resultsContainer.innerHTML = filtered.map(post => {
          const isF = (tag) => tag === 'featured' || tag === '精选';
          return \\\`
            <article class="result-card" data-post-id="\\\${post.id}">
              <div class="post-header">
                <h3 class="post-title">\\\${post.title}</h3>
                <span class="post-date">\\\${new Date(post.date).toLocaleDateString(locale)}</span>
              </div>
              \\\${post.tags && post.tags.length > 0 ? \\\`
                <div class="post-tags">
                  \\\${sortTagsList(post.tags).map(tag => \\\`
                    <span class="tag-display \\\${isF(tag) ? 'featured' : ''}">
                      #\\\${isF(tag) ? featuredLabel : tag}
                    </span>
                  \\\`).join('')}
                </div>
              \\\` : ''}
              <div class="post-summary">\\\${post.summary || ''}</div>
            </article>
          \\\`;
        }).join('');

        resultsContainer.querySelectorAll('.result-card').forEach(card => {
          card.addEventListener('click', () => {
            window.location.href = \\\`/blog/\\\${card.getAttribute('data-post-id')}\\\`;
          });
        });
      }
    }

    function toggleTagCloud() {
      isTagCloudOpen = !isTagCloudOpen;

      syncTagTriggerState();
      updateCenteredMode();
      updateVisibility();
    }

    // Debounce helper
    function debounceFn(func, delay) {
      let timeout;
      return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
      };
    }

    const debouncedUpdate = debounceFn((newVal) => {
      debouncedQuery = newVal;
      filterPosts();
      updateCenteredMode();
      updateVisibility();

      if (newVal.trim()) {
        document.title = \\\`Search: \\\${newVal} - Chronicle\\\`;
      } else {
        document.title = 'Search - Chronicle';
      }
    }, 300);

    if (input) {
      input.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        debouncedUpdate(searchQuery);
      });
    }

    if (tagTrigger) tagTrigger.addEventListener('click', toggleTagCloud);
    if (closeCloudBtn) closeCloudBtn.addEventListener('click', toggleTagCloud);

    document.querySelectorAll('.tag-cloud-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.getAttribute('data-tag');
        if (selectedTags.includes(tag)) {
          selectedTags = selectedTags.filter(t => t !== tag);
          btn.classList.remove('selected');
        } else {
          selectedTags.push(tag);
          btn.classList.add('selected');
        }
        syncTagTriggerState();
        renderTagChips();
        filterPosts();
        updateCenteredMode();
        updateVisibility();
      });
    });

    // Initialize
    if (parsedInitialTags.length > 0) {
      renderTagChips();
      parsedInitialTags.forEach(tag => {
        document.querySelector(\\\`.tag-cloud-item[data-tag="\\\${tag}"]\\\`)?.classList.add('selected');
      });
    }

    syncTagTriggerState();

    // Always run initial filter to correctly display the initial state
    filterPosts();
    updateCenteredMode();
    updateVisibility();
    
    if (initialTitle || parsedInitialTags.length > 0) {
      window.history.replaceState({}, '', '/search');
    }
  }
})();<\/script>`])), renderComponent($$result, "Layout", $$Layout, { "title": t("nav.search"), "settings": settings }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-container centered-mode" id="search-page"> <div class="search-box-wrapper"> <div class="search-box"> <button class="tag-trigger" id="tag-trigger"${addAttribute(t("search.selectTags"), "title")}> <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"> <line x1="4" y1="9" x2="20" y2="9"></line> <line x1="4" y1="15" x2="20" y2="15"></line> <line x1="10" y1="3" x2="8" y2="21"></line> <line x1="16" y1="3" x2="14" y2="21"></line> </svg> </button> <span class="divider"></span> <div class="input-area" id="input-area"> <div id="selected-tags"></div> <input id="search-input" type="text"${addAttribute(t("search.placeholder"), "placeholder")} class="search-input"${addAttribute(initialTitle, "value")}> </div> </div> </div> <div class="content-wrapper" id="content-wrapper" style="display:none;"> <div class="content-scroll-area"> <div class="tag-cloud-container" id="tag-cloud" style="display:none;"> <div class="tags-grid"> ${allTagData.map((tagData) => renderTemplate`<button${addAttribute(tagData.name, "data-tag")}${addAttribute(["tag-cloud-item", [{ featured: tagData.name === "featured" || tagData.name === "精选" }]], "class:list")}> ${tagData.name === "featured" || tagData.name === "精选" ? t("tag.featured") : tagData.name} <span class="tag-count">${tagData.count}</span> </button>`)} </div> <div class="cloud-actions"> <button class="close-cloud-btn" id="close-cloud">${t("search.done")}</button> </div> </div> <div class="results-list" id="results-list"> <div class="loading" id="loading-state">${t("search.loading")}</div> <div class="empty" id="empty-state" style="display:none;">${t("search.noResults")}</div> <div id="results-container"></div> </div> </div> </div> </div> ` }), defineScriptVars({ postsJSON: JSON.stringify(posts), initialTitle, initialTagsJSON: JSON.stringify(initialTags), locale, featuredLabel: t("tag.featured") }));
}, "/opt/Chronicle/astro-frontend/src/pages/search.astro", void 0);

const $$file = "/opt/Chronicle/astro-frontend/src/pages/search.astro";
const $$url = "/search";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Search,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
