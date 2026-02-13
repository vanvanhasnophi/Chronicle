<template>
  <div class="blog-post-container">
    <div v-if="loading" class="loading">Loading...</div>
    <div v-else-if="!post" class="error">Post not found.</div>
    <div v-else class="post-content-wrapper">
      <nav class="post-nav">
        <router-link to="/blogs" class="nav-back">← Back to Blogs</router-link>
      </nav>
      
      <header class="post-header">
        <h1 class="title" :class="fontClass">{{ post.title }}</h1>
        
        <div class="post-meta-info">
            <div class="meta-row stats" v-if="postStats">
                <span>{{ postStats.words }} words</span>
                <span class="separator">/</span>
                <span>{{ postStats.readTime }} min</span>
            </div>
            <div class="meta-row dates">
                <span>Created {{ formatDate(post.date) }}</span>
                <template v-if="post.updatedAt && post.updatedAt !== post.date">
                    <span class="separator">·</span>
                    <span>Modified {{ formatDate(post.updatedAt) }}</span>
                </template>
            </div>
        </div>

        <div class="tags" v-if="post.tags && post.tags.length">
            <span v-for="tag in sortTags(post.tags)" :key="tag" class="tag" :class="{ featured: tag === 'featured' }" @click="router.push('/search?tags='+tag)">#{{ tag }}</span>
        </div>
      </header>

                        <!-- 页面级目录（仅阅读模式） -->
        <div v-if="toc.length" class="markdown-toc">
            <div class="toc-header" @click="toggleInlineToc" :class="{ collapsed: inlineTocCollapsed }">
                <div class="toc-title">Table of Contents</div>
                <button class="toc-toggle-btn" :aria-expanded="!inlineTocCollapsed" :title="inlineTocCollapsed ? '展开' : '折叠'">
                     <span class="chev-icon" :class="{ folded: inlineTocCollapsed }" v-html="chevronIcon"></span>
                </button>
            </div>
            <transition name="toc-expand">
                                    <ul v-show="!inlineTocCollapsed" class="toc-list">
                                        <li v-for="(item, idx) in toc" :key="item.id" :class="`toc-level-${item.level}`">
                                            <a href="javascript:void(0)" @click.stop.prevent="scrollToHeading(item.id)"><span class="toc-text">{{ item.text }}</span></a>
                                        </li>
                                    </ul>
                                </transition>
                        </div>

            <div class="markdown-body" :class="fontClass">
                 <MdParser 
                        v-if="post.content"
                        :modelValue="post.content"
                        :readOnly="true"
                 />
            </div>

            <!-- 悬浮目录导航（页面级） -->
              <nav v-if="toc.length" class="toc-float" :class="{ collapsed: floatCollapsed }" aria-label="目录导航"
                   @mouseenter="onFloatMouseEnter" @mouseleave="onFloatMouseLeave">
                        <ul>
                            <li v-for="item in toc" :key="item.id" 
                                :class="[`toc-float-item`, `toc-level-${item.level}`, { active: item.id === activeId }]">
                                <a href="javascript:void(0)" @click.stop.prevent="scrollToHeading(item.id)" class="toc-link">
                                    <span class="toc-text">{{ item.text }}</span>
                                    <span class="toc-line" :style="{ width: lineWidth(item.level) }"></span>
                                </a>
                            </li>
                        </ul>
                    </nav>

        <!-- Back to Top -->
        <button class="back-to-top" :class="{ visible: showBackToTop }" @click="scrollToTop" title="Back to Top">
             <span v-html="Icons.arrowUp"></span>
        </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, nextTick, watch, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import MdParser from '../components/MdParser.vue'
import { getStats } from '../utils/markdownParser'
import { sortTags } from '../utils/tagUtils'
import { parseMarkdown } from '../utils/markdownParser'
import { Icons } from '../utils/icons'

interface PostDetail {
  id: string
  title: string
  date: string
  updatedAt?: string
  content: string
  tags?: string[]
  font?: string
}

const route = useRoute()
const post = ref<PostDetail | null>(null)
const loading = ref(true)

const fontClass = computed(() => {
    if (!post.value?.font) return 'font-sans'
    return `font-${post.value.font}`
})

// Update title when post changes
import router from '../router'

// Update title when post changes
watch(post, (newPost) => {
        if (newPost && newPost.title) {
                document.title = `${newPost.title} - Chronicle`
        }
})

// 页面级 TOC
const toc = ref<Array<{ id: string, text: string, level: number }>>([])
// UI state for collapsible TOC
const inlineTocCollapsed = ref(false)
const floatCollapsed = ref(true)
let floatCollapseTimer: any = null
const activeId = ref('')
const showBackToTop = ref(false)
let observer: IntersectionObserver | null = null

const chevronIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`

function toggleInlineToc() {
    inlineTocCollapsed.value = !inlineTocCollapsed.value
}

function onScroll(e: Event) {
    const target = e.target as HTMLElement
    showBackToTop.value = target.scrollTop > 300
}

function scrollToTop() {
    const container = document.querySelector('main.main-content')
    if (container) {
        container.scrollTo({ top: 0, behavior: 'smooth' })
    }
}

function onFloatMouseEnter() {
    if (floatCollapseTimer) {
        clearTimeout(floatCollapseTimer)
        floatCollapseTimer = null
    }
    floatCollapsed.value = false
}

function onFloatMouseLeave() {
    if (floatCollapseTimer) clearTimeout(floatCollapseTimer)
    floatCollapseTimer = setTimeout(() => {
        floatCollapsed.value = true
    }, 1000)
}

onBeforeUnmount(() => {
    if (floatCollapseTimer) clearTimeout(floatCollapseTimer)
    if (observer) observer.disconnect()
    
    const container = document.querySelector('main.main-content')
    if (container) {
        container.removeEventListener('scroll', onScroll)
    }
})

const maxLevel = computed(() => {
    if (!toc.value.length) return 1
    return Math.max(...toc.value.map(i => i.level))
})

function lineWidth(level: number) {
    // Smooth, shorter width scaling: level 1 => longest, level max => shortest
    const max = Math.max(1, maxLevel.value)
    const maxPx = 20
    const minPx = 10
    if (max <= 1) return `${maxPx}px`
    const ratio = (max - level) / (max - 1) // 1 -> longest, 0 -> shortest
    const len = Math.round(minPx + ratio * (maxPx - minPx))
    return `${len}px`
}

function slugify(text: string) {
    if (!text) return ''
    let s = text.toLowerCase().trim()
    s = s.replace(/<[^>]+>/g, '')
    s = s.replace(/[\s]+/g, '-')
    s = s.replace(/[^a-z0-9\-]/g, '')
    if (!s) s = 'heading'
    return s
}

function buildTocFromContent(content: string) {
    const itemsRaw: Array<{ id: string, text: string, level: number }> = []
    const blocks = parseMarkdown(content || '')
    const used = new Set<string>()
    blocks.forEach((b) => {
        if (b.type === 'heading' && typeof b.content === 'string') {
            const m = b.content.match(/^\s*(#{1,6})\s+(.*)$/)
            if (m) {
                const lvl = m[1].length
                const rawText = m[2].replace(/<[^>]+>/g, '')
                const text = rawText.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')
                let id = slugify(text)
                let base = id
                let i = 1
                while (used.has(id)) id = `${base}-${i++}`
                used.add(id)
                itemsRaw.push({ id, text, level: lvl })
            }
        }
    })

    // Determine the smallest numeric heading level present (e.g., 3 if only h3/h4/h5 used)
    if (itemsRaw.length === 0) {
        toc.value = []
        return
    }
    const minLevel = Math.min(...itemsRaw.map(i => i.level))

    // Convert to relative levels where minLevel becomes 1
    toc.value = itemsRaw.map(i => ({ id: i.id, text: i.text, level: i.level - minLevel + 1 }))
}

async function assignHeadingIds(retryCount = 0) {
    await nextTick()
    const container = document.querySelector('.markdown-body')
    if (!container) return
    
    // Select all headings
    let headings = Array.from(container.querySelectorAll('h1,h2,h3,h4,h5,h6')) as HTMLElement[]
    
    // If no headings found, retry up to 10 times (1 sec total)
    if (headings.length === 0 && retryCount < 10) {
        setTimeout(() => assignHeadingIds(retryCount + 1), 100)
        return
    }
    
    if (headings.length === 0) return

    // match headings with toc by order and text
    let idx = 0
    headings.forEach((h) => {
        if (idx >= toc.value.length) return
        const t = h.textContent ? h.textContent.trim().replace(/\s+/g, ' ') : ''
        const tocItem = toc.value[idx]

        const match = (domText: string, itemText: string) => {
             const dt = domText.toLowerCase()
             const it = itemText.toLowerCase()
             // Use strict equality first, then loose
             return dt === it || dt.includes(it) || it.includes(dt)
        }
        
        const isMatch = (item: { text: string }) => {
            if (!item) return false
            const simple = item.text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            return match(t, item.text) || match(t, simple)
        }

        if (tocItem && isMatch(tocItem)) {
            h.id = tocItem.id
            idx++
        } else {
            // try to find a later toc item that matches
            const found = toc.value.slice(idx).find(it => isMatch(it))
            if (found) {
                h.id = found.id
                // advance idx to after found
                idx = toc.value.indexOf(found) + 1
            } else {
                // fallback slug
                h.id = slugify(t || h.innerText || 'heading')
            }
        }
    })
    setupObserver()
}

function setupObserver() {
    if (observer) observer.disconnect()
    
    // Observer options: root: null uses viewport, but if container is scroller, it's relative to viewport too
    // But root margin should account for header
    const options = {
        root: document.querySelector('main.main-content'),
        rootMargin: '-80px 0px -70% 0px', // Trigger near top
        threshold: 0
    }

    observer = new IntersectionObserver((entries) => {
        // find matched entries
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                activeId.value = entry.target.id
            }
        })
    }, options)

    // Observe all toc headings
    toc.value.forEach(item => {
        const el = document.getElementById(item.id)
        if (el) observer?.observe(el)
    })
}

function scrollToHeading(id: string) {
    const el = document.getElementById(id)
    const container = document.querySelector('main.main-content')
    if (!el || !container) return
    
    const containerRect = container.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    const offset = 80 // Header + some padding
    
    const targetTop = container.scrollTop + (elRect.top - containerRect.top) - offset
    
    container.scrollTo({ top: targetTop, behavior: 'smooth' })
    activeId.value = id
}

const postStats = computed(() => {
    if (!post.value?.content) return null
    const s = getStats(post.value.content)
    // Estimate reading time. Rough estimate: 200 words per minute average
    const readTime = Math.max(1, Math.ceil(s.wordCount / 200))
    return {
        words: s.wordCount,
        readTime
    }
})

const formatDate = (isoStr: string) => {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

onMounted(async () => {
    // Attach scroll listener to main content
    const container = document.querySelector('main.main-content')
    if (container) {
        container.addEventListener('scroll', onScroll as EventListener)
    }

    const id = route.params.id as string
    if (!id) {
        loading.value = false
        return
    }

    try {
        const res = await fetch(`/api/post?id=${id}`)
        if (res.ok) {
            post.value = await res.json()
        }
    } catch(e) {
        console.error(e)
    } finally {
        loading.value = false
                // build TOC when post content available
                if (post.value && post.value.content) {
                     buildTocFromContent(post.value.content)
                     assignHeadingIds()
                }
    }
})

// rebuild TOC when post content changes (e.g., reloaded)
watch(() => post.value && post.value.content, (v) => {
    if (v) {
        buildTocFromContent(v as string)
        assignHeadingIds()
    } else {
        toc.value = []
    }
})
</script>

<style scoped>
.blog-post-container {
  max-width: 900px;
  margin: 0 auto;

  padding: 0 20px;
  color: #e0e0e0;
  box-sizing: border-box;
}

.post-nav {
    display: flex;
    justify-content: space-between;
    padding: 30px 0;
    margin-bottom: 20px;
    align-items: center;
}

.nav-back {
    color: #2ea35f;
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
}
.nav-back:hover {
    text-decoration: underline;
}

.nav-date {
    color: #666;
    font-size: 14px;
}

.post-header {
    margin-bottom: 40px;
    border-bottom: 1px solid #333;
    padding-bottom: 20px;
}

.title {
    font-size: 2.5em;
    margin: 0 0 16px 0;
    line-height: 1.2;
    color: #fff;
}

.post-meta-info {
    margin: 16px 0;
    font-size: 14px;
    color: #888;
}

.meta-row {
    margin-bottom: 4px;
}

.separator {
    margin: 0 8px;
    color: #555;
    font-weight: 300;
}

.tags {
    display: flex;
    gap: 8px;
    margin-top: 16px;
}
.tag {
    color: var(--accent-color);
    font-size: 14px;
    cursor: pointer;
}

.tag.featured {
    color: var(--featured);
    font-weight: 600;
}

.loading, .error {
    text-align: center;
    padding: 100px;
    color: #888;
}

.toc-float{
    font-size:0.8em;
    backdrop-filter: blur(10px);
    margin-right:10px;
}

.toc-float-item{
    margin-left: 10px;
}

.toc-float-item:hover{
    color: #fff !important;
}
.markdown-toc {padding: 10px 16px;}
.markdown-toc .toc-list { list-style: none; padding: 0; margin: 0; }
.markdown-toc .toc-list li { margin: 1px 0; }
.markdown-toc .toc-list li a { text-decoration: none; color: #cfd8dc; display: block; box-sizing: border-box; }
.markdown-toc .toc-list li .toc-text { display: block; width: 100%; padding: 4px 6px 4px 6px; padding-right: 10px; box-sizing: border-box; border-radius: 6px; transition: background 0.12s, color 0.12s; }
.markdown-toc .toc-list .toc-level-1 { padding-left: 0; }
.markdown-toc .toc-list .toc-level-2 { padding-left: 8px; }
.markdown-toc .toc-list .toc-level-3 { padding-left: 16px; }
.markdown-toc .toc-list .toc-level-4 { padding-left: 24px; }
.markdown-toc .toc-list .toc-level-5 { padding-left: 32px; }
.markdown-toc .toc-list .toc-level-6 { padding-left: 40px; }
.markdown-toc .toc-list li:hover .toc-text { background: rgba(255,255,255,0.04); color: #fff; }

.toc-float ul { list-style: none; margin: 0; padding: 4px }
.toc-float li { margin: 1px 0; }
.toc-float a { text-decoration: none; display: block; box-sizing: border-box; }
.toc-float .toc-text { display: block; width: 100%; padding: 3px 6px 3px 6px; padding-right: 10px; box-sizing: border-box; border-radius: 6px; transition: background 0.12s, color 0.12s; color: #eeeeee60; }
.toc-float .toc-level-1 { padding-left: 0 !important; }
.toc-float .toc-level-2 { padding-left: 6px !important; }
.toc-float .toc-level-3 { padding-left: 12px !important; }
.toc-float .toc-level-4 { padding-left: 18px !important; }
.toc-float .toc-level-5 { padding-left: 24px !important; }
.toc-float .toc-level-6 { padding-left: 30px !important; }
.toc-float li:hover .toc-text { background: rgba(255,255,255,0.04); color: #eee }
.toc-float li:active .toc-text, .toc-float li:focus .toc-text { background: rgba(255,255,255,0.08); color: #fff; }
.toc-float li.active .toc-text { background: rgba(255,255,255,0.08); color: #fff; }


/* Collapsible inline TOC header */
.toc-header { display:flex; justify-content:space-between; align-items:center; cursor:pointer; padding: 4px 0; border-radius: 6px; transition: background 0.2s }
.toc-header:hover { background: rgba(255,255,255,0.03); }
.toc-header.collapsed { justify-content: center; }
.toc-header.collapsed .toc-title { margin-right: 8px; }
.toc-title {margin-bottom:0;}

.toc-toggle-btn { background: transparent; border: none; color: #cfd8dc; cursor: pointer; padding: 6px; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
.chev-icon { display:flex; width: 16px; height: 16px; transition: transform 0.18s; align-items: center; justify-content: center; }
.chev-icon.folded { transform: rotate(-90deg) }


/* transition for inline TOC */
.toc-expand-enter-active, .toc-expand-leave-active { transition: max-height 0.22s ease, opacity 0.18s ease }
.toc-expand-enter-from, .toc-expand-leave-to { max-height: 0; opacity: 0 }
.toc-expand-enter-to, .toc-expand-leave-from { max-height: 800px; opacity: 1 }

/* Floating collapsed visual */
.toc-float { 
    right: 20px; 
    position: fixed; 
    top: 120px; 
    z-index: 1200; 
    overflow: hidden; 
    transition: width 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), background-color 0.3s ease; 
    box-sizing: border-box; 
    border-radius: 8px;
}
.toc-float.collapsed { width: 40px; border:none; background-color: transparent; }
.toc-float:not(.collapsed) { width: 220px; background-color: rgba(30, 30, 30, 0.95); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }

.toc-float ul { padding: 4px; list-style: none; margin: 0; transition: padding 0.3s ease; }
.toc-float.collapsed ul {padding: 0;}

.toc-float li { display: flex; align-items: center; transition: justify-content 0.3s ease; min-height: 24px; position: relative; }
.toc-float.collapsed li { justify-content: flex-end; }
.toc-float:not(.collapsed) li { justify-content: flex-start; }

.toc-link {
    display: flex;
    align-items: center;
    width: 100%;
    text-decoration: none;
    position: relative;
    /* Ensure link covers area */
    justify-content: inherit; 
}

/* Line style (collapsed state) */
.toc-float .toc-line { 
    display:block; 
    height:3px; 
    background: rgba(128, 128, 128, 0.5); 
    border-radius:1.5px; 
    transition: opacity 0.2s ease, transform 0.3s ease, background-color 0.3s ease; 
    position: absolute;
    right: 0;
}

/* Expanded State: Hide Line */
.toc-float:not(.collapsed) .toc-line {
    opacity: 0;
    transform: translateX(10px);
    pointer-events: none;
}

/* Collapsed State: Show Line */
.toc-float.collapsed .toc-line {
    opacity: 1;
    transform: translateX(0);
    position: relative; /* In flow when collapsed */
}

/* Active State for Line */
.toc-float li.active .toc-line { background: #fff; }
.toc-float li:hover .toc-line { background: #eee; }


/* Text style (expanded state) */
.toc-float .toc-text { 
    display: block; 
    width: 100%; 
    padding: 3px 6px; 
    padding-right: 10px; 
    box-sizing: border-box; 
    border-radius: 6px; 
    color: rgba(238, 238, 238, 0.6); 
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: opacity 0.2s ease, transform 0.3s ease, background-color 0.2s, color 0.2s;
}

/* Collapsed State: Hide Text */
.toc-float.collapsed .toc-text { 
    opacity: 0;
    transform: translateX(10px);
    position: absolute; /* Take out of flow */
    pointer-events: none;
}

/* Expanded State: Show Text */
.toc-float:not(.collapsed) .toc-text {
    opacity: 1;
    transform: translateX(0);
}

/* Hover/Active states for Text */
.toc-float:not(.collapsed) li:hover .toc-text { background: rgba(255,255,255,0.08); color: #fff }
.toc-float:not(.collapsed) li.active .toc-text { background: rgba(255,255,255,0.12); color: #fff; font-weight: 500; }

</style>
