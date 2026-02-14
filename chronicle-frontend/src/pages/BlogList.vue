<template>
    <div class="blog-container" ref="scrollContainer">
        <main class="blog-main">

            <!-- Featured Section -->
            <section v-if="featuredPosts.length > 0" class="section-block">
                <div class="section-header">
                    <h2 class="section-title">{{ $t('blog.featured') }}</h2>
                    <button v-if="featuredPosts.length > 3" class="toggle-btn"
                        @click="isFeaturedExpanded = !isFeaturedExpanded">
                        {{ isFeaturedExpanded ? $t('blog.collapse') : $t('blog.expand') }}
                    </button>
                </div>
                <div class="featured-grid">
                    <article v-for="post in visibleFeatured" :key="post.id" class="post-card featured-card"
                        @click="openPost(post.id)">
                        <div class="post-meta">
                            <span class="post-date">{{ formatDate(post.date) }}</span>
                        </div>
                        <h3 class="post-title">{{ post.title }}</h3>
                        <div class="post-tags">
                            <span v-for="tag in sortTags(post.tags)" :key="tag" class="tag"
                                :class="{ featured: tag === 'featured' }" style="margin-right:3px">#&nbsp;{{ tag === 'featured' ? $t('tag.featured') : tag }}</span>
                        </div>
                    </article>
                </div>
            </section>

            <!-- Archive Section -->
            <section class="section-block">
                <h2 class="section-title">{{ $t('blog.allPosts') }}</h2>
                <div v-if="loading" class="loading">{{ $t('blog.loadingPosts') }}</div>
                <div v-else-if="posts.length === 0" class="empty">{{ $t('blog.noPostsStartWriting') }}</div>

                <div v-else class="archive-list">
                    <div v-for="yearGroup in groupedPosts" :key="yearGroup.year" class="year-block">
                        <div class="year-header">{{ yearGroup.year }}</div>

                        <div v-for="monthGroup in yearGroup.months" :key="monthGroup.name" class="month-row">
                            <div class="month-label">
                                <span>{{ monthGroup.name }}</span>
                            </div>
                            <div class="month-posts">
                                <article v-for="post in monthGroup.posts" :key="post.id" class="post-card compact-card"
                                    @click="openPost(post.id)">
                                    <div class="post-header-row">
                                        <h4 class="post-title">{{ post.title }}</h4>
                                        <span class="post-day">{{ new Date(post.date).getDate() }}{{ $t('blog.daySuffix') }}</span>
                                    </div>
                                    <div class="post-tags" v-if="post.tags && post.tags.length">
                                        <span v-for="tag in sortTags(post.tags)" :key="tag" class="tag"
                                            :class="{ featured: tag === 'featured' }">#&nbsp;{{ tag === 'featured' ? $t('tag.featured') : tag }}</span>
                                    </div>
                                </article>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

        </main>

        <!-- Back to Top -->
        <button class="back-to-top" :class="{ visible: showBackToTop }" @click="scrollToTop" title="Back to Top">
            <span v-html="Icons.arrowUp"></span>
        </button>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Icons } from '../utils/icons'
import { sortTags } from '../utils/tagUtils'

interface Post {
    id: string
    title: string
    date: string
    summary: string
    tags?: string[]
}

const router = useRouter()
const { t } = useI18n()
const posts = ref<Post[]>([])
const loading = ref(true)
const scrollContainer = ref<HTMLElement | null>(null)
const showBackToTop = ref(false)
const isFeaturedExpanded = ref(false)
let mainContentEl: HTMLElement | null = null

const featuredPosts = computed(() => {
    return posts.value.filter(p => p.tags && (p.tags.includes('featured') || p.tags.includes('精选')))
})

const visibleFeatured = computed(() => {
    if (isFeaturedExpanded.value) return featuredPosts.value
    return featuredPosts.value.slice(0, 3) // Show first 3 by default
})

const groupedPosts = computed(() => {
    const groups: { year: number, months: { name: string, posts: Post[] }[] }[] = []

    // Copy posts to ensure sort safety, though inputs are likely sorted
    const sorted = [...posts.value].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    sorted.forEach(post => {
        const d = new Date(post.date)
        const y = d.getFullYear()
        // Format Month as "1月", "2月" or "Jan", "Feb" depending on locale.
        // User is using Chinese UI ("精选", "全部"). Let's use Chinese month if possible or numbers.
        // d.getMonth() is 0-indexed.
        const m = `${d.getMonth() + 1}月`

        let yGroup = groups.find(g => g.year === y)
        if (!yGroup) {
            yGroup = { year: y, months: [] }
            groups.push(yGroup)
        }

        let mGroup = yGroup.months.find(mg => mg.name === m)
        if (!mGroup) {
            mGroup = { name: m, posts: [] }
            yGroup.months.push(mGroup)
        }

        mGroup.posts.push(post)
    })

    return groups
})

const formatDate = (isoStr: string) => {
    if (!isoStr) return ''
    return new Date(isoStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })
}

const openPost = (id: string) => {
    router.push(`/post/${id}`)
}

const handleScroll = (e: Event) => {
    const target = e.target as HTMLElement
    showBackToTop.value = target.scrollTop > 300
}

const scrollToTop = () => {
    if (mainContentEl) {
        mainContentEl.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }
}

onMounted(async () => {
    mainContentEl = document.querySelector('.main-content')
    if (mainContentEl) {
        mainContentEl.addEventListener('scroll', handleScroll)
    } else {
        window.addEventListener('scroll', handleScroll)
    }

    try {
        const res = await fetch(`/api/posts?t=${Date.now()}`)
        if (res.ok) {
            posts.value = await res.json()
        }
    } catch (e) {
        console.error(e)
    } finally {
        loading.value = false
    }
})

onUnmounted(() => {
    if (mainContentEl) {
        mainContentEl.removeEventListener('scroll', handleScroll)
    } else {
        window.removeEventListener('scroll', handleScroll)
    }
})
</script>


<style scoped>
.blog-container {
    max-width: 900px;
    margin: 0 auto;
    padding: 40px 20px;
    color: #e0e0e0;
    box-sizing: border-box;
    scroll-behavior: smooth;
}

.section-block {
    margin-bottom: 60px;
}

.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    border-bottom: 2px solid #2ea35f;
    padding-bottom: 10px;
}

.section-title {
    font-size: 1.8em;
    margin: 0;
    color: #fff;
    padding-bottom: 0px;
    border-bottom: none;
    display: inline-block;
}

.toggle-btn {
    background: transparent;
    border: 1px solid #444;
    color: #888;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85em;
}

.toggle-btn:hover {
    color: #2ea35f;
    border-color: #2ea35f;
}

/* Featured Grid */
.featured-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px;
}

.featured-card {
    background: linear-gradient(145deg, #252526, #1e1e1e);
    border: 1px solid #3e3e42;
    padding: 16px;
    margin-bottom: 0;
}

.featured-card .post-title {
    font-size: 1.1em;
    margin-bottom: 8px;
}

.featured-card .post-meta {
    font-size: 0.8em;
}

.featured-card .tag {
    font-size: 0.7em;
}

/* Archive Layout */
.archive-list {
    margin-top: 20px;
}

.year-block {
    margin-bottom: 40px;
}

.year-header {
    font-size: 3em;
    font-weight: 800;
    color: #444;
    opacity: 0.3;
    margin-bottom: 20px;
    border-bottom: 1px solid #333;
    line-height: 1;
}

.month-row {
    display: flex;
    margin-bottom: 20px;
}

.month-label {
    width: 60px;
    flex-shrink: 0;
    text-align: right;
    padding-right: 20px;
    padding-top: 14px;
    /* Align with first card text */
    font-weight: bold;
    color: #2ea35f;
    font-size: 1.1em;
}

.month-posts {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.post-card {
    /* Default styles for featured cards still rely on this */
    padding: 16px;
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 8px;
    cursor: pointer;
    transition: transform 0.2s, border-color 0.2s;
}

.compact-card {
    padding: 14px 16px;
    margin-bottom: 0;
    border: 1px solid #2d2d30;
    background: transparent;
    border-radius: 4px;
}

.compact-card:hover {
    background: #252526;
    border-color: #555;
    transform: none;
}

.post-header-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
}

.compact-card .post-title {
    font-size: 1.1em;
    margin: 0;
    font-weight: 500;
    color: #ddd;
}

.compact-card .post-day {
    font-size: 0.85em;
    color: #666;
    font-family: monospace;
    margin-left: 10px;
    flex-shrink: 0;
}

.compact-card .post-tags {
    margin-top: 4px;
    display: flex;
    gap: 8px;
}

/* Shared */
.post-meta {
    font-size: 0.85em;
    color: #888;
    margin-bottom: 8px;
}

.post-summary {
    color: #aaa;
    line-height: 1.6;
    font-size: 0.95em;
}

.tag {
    background: #2d2d30;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.75em;
    color: #2ea35f;
}

.tag.featured {
    font-weight: 600;
    background: var(--featured-bg);
    color: var(--featured);
}

.loading,
.empty {
    text-align: center;
    padding: 60px;
    color: #666;
}


</style>
