<template>
  <div class="page-container">
    <div class="search-box-wrapper">
      <div class="search-box">
        <!-- Tag Trigger -->
        <button 
           class="tag-trigger" 
           :class="{ active: selectedTags.length > 0 || isTagCloudOpen }" 
           @click="isTagCloudOpen = !isTagCloudOpen"
           title="Select Tags"
        >
          <span v-html="Icons.hash" class="icon"></span>
        </button>

        <!-- Input Area -->
        <div class="input-area" @click="focusInput">
           <div v-for="tag in selectedTags" :key="tag" class="selected-tag-chip">
              <span class="chip-text">{{ tag }}</span>
              <button class="chip-remove" @click.stop="removeTag(tag)">
                 <span v-html="Icons.cross" class="icon-sm"></span>
              </button>
           </div>
           <input 
              ref="searchInput"
              type="text" 
              v-model="searchQuery" 
              placeholder="Search by title..." 
              class="search-input" 
           />
        </div>
      </div>
    </div>

    <!-- Content Area: Tag Cloud OR Results -->
    <div class="content-area">
        <!-- Tag Cloud -->
        <div v-if="isTagCloudOpen" class="tag-cloud-container">
           <h3 class="cloud-title">Select Tags</h3>
           <div class="tags-grid">
              <button 
                  v-for="tag in allTags" 
                  :key="tag" 
                  class="tag-cloud-item" 
                  :class="{ selected: selectedTags.includes(tag) }"
                  @click="toggleTagAndKeepOpen(tag)"
              >
                  {{ tag }}
              </button>
           </div>
           <div v-if="allTags.length === 0" class="no-tags">No tags found</div>
           <button class="close-cloud-btn" @click="isTagCloudOpen = false">Done</button>
        </div>

        <!-- Search Results -->
        <div v-else class="results-list">
            <div v-if="loading" class="loading">Loading...</div>
            <div v-else-if="filteredPosts.length === 0" class="empty">
               No posts found matching your criteria.
            </div>
            <article 
              v-for="post in filteredPosts" 
              :key="post.id" 
              class="result-card" 
              @click="openPost(post.id)"
            >
               <div class="post-header">
                  <h3 class="post-title">{{ post.title }}</h3>
                  <span class="post-date">{{ formatDate(post.date) }}</span>
               </div>
               <div class="post-tags" v-if="post.tags && post.tags.length">
                   <span v-for="tag in post.tags" :key="tag" class="tag-display">#{{ tag }}</span>
               </div>
               <div class="post-summary">{{ post.summary }}</div>
            </article>
        </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Icons } from '../utils/icons'

interface Post {
  id: string
  title: string
  date: string
  summary: string
  tags?: string[]
}

const router = useRouter()
const posts = ref<Post[]>([])
const loading = ref(true)
const searchQuery = ref('')
const selectedTags = ref<string[]>([])
const isTagCloudOpen = ref(false)
const searchInput = ref<HTMLInputElement | null>(null)

const allTags = computed(() => {
    const tags = new Set<string>()
    posts.value.forEach(p => {
        if (p.tags) {
            p.tags.forEach(t => tags.add(t))
        }
    })
    return Array.from(tags).sort()
})

const filteredPosts = computed(() => {
    return posts.value.filter(post => {
        // 1. Title Match
        const matchesTitle = post.title.toLowerCase().includes(searchQuery.value.toLowerCase())
        
        // 2. Tag Match (AND)
        // If no tags selected, true. Else, post must have ALL selected tags.
        let matchesTags = true
        if (selectedTags.value.length > 0) {
            const tempTags = post.tags || []
            matchesTags = selectedTags.value.every(t => tempTags.includes(t))
        }

        return matchesTitle && matchesTags
    })
})

const toggleTagAndKeepOpen = (tag: string) => {
    if (selectedTags.value.includes(tag)) {
        selectedTags.value = selectedTags.value.filter(t => t !== tag)
    } else {
        selectedTags.value.push(tag)
    }
}

const removeTag = (tag: string) => {
    selectedTags.value = selectedTags.value.filter(t => t !== tag)
}

const focusInput = () => {
    searchInput.value?.focus()
}

const openPost = (id: string) => {
    router.push(`/post/${id}`)
}

const formatDate = (isoStr: string) => {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

onMounted(async () => {
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
</script>

<style scoped>
.page-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 20px;
  color: #e0e0e0;
}

/* Search Box */
.search-box-wrapper {
    margin-bottom: 2rem;
    position: sticky;
    top: 80px; /* Adjust based on navbar */
    z-index: 50;
    backdrop-filter: blur(8px);
    background: rgba(30,30,30,0.8);
    padding: 1rem 0;
    border-radius: 0 0 12px 12px;
}

.search-box {
    display: flex;
    align-items: center;
    background: #252526;
    border: 1px solid #3e3e42;
    border-radius: 12px;
    padding: 4px;
    transition: box-shadow 0.3s ease;
}
.search-box:focus-within {
    border-color: #2ea35f;
    box-shadow: 0 0 0 2px rgba(46, 163, 95, 0.2);
}

.tag-trigger {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 8px 12px;
    color: #555; /* Faint default */
    border-right: 1px solid #333;
    display: flex;
    align-items: center;
    transition: color 0.3s ease;
}
.tag-trigger.active {
    color: #2ea35f; /* Green if active */
}
.tag-trigger:hover {
    color: #2ea35f;
}

.input-area {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    padding: 4px 10px;
    gap: 6px;
    cursor: text;
}

.selected-tag-chip {
    display: inline-flex;
    align-items: center;
    background: rgba(46, 163, 95, 0.2);
    color: #2ea35f;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.9rem;
}
.chip-remove {
    background: transparent;
    border: none;
    color: #2ea35f;
    cursor: pointer;
    padding: 0;
    margin-left: 6px;
    display: flex;
    align-items: center;
    opacity: 0.7;
}
.chip-remove:hover {
    opacity: 1;
}

.search-input {
    flex: 1;
    min-width: 120px;
    background: transparent;
    border: none;
    color: #fff;
    font-size: 1rem;
    padding: 6px 0;
    outline: none;
}

/* Tag Cloud Overlay */
.tag-cloud-container {
    background: #1e1e1e;
    border: 1px solid #3e3e42;
    border-radius: 8px;
    padding: 20px;
    animation: fadeIn 0.2s ease;
}
.cloud-title {
    margin: 0 0 1rem 0;
    font-size: 1.2rem;
    color: #aaa;
}
.tags-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}
.tag-cloud-item {
    background: #2d2d30;
    color: #a9a9a9;
    border: 1px solid #3e3e42;
    padding: 6px 14px;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.2s ease;
}
.tag-cloud-item:hover {
    background: #3e3e42;
    color: #fff;
}
.tag-cloud-item.selected {
    background: #2ea35f;
    color: #fff;
    border-color: #2ea35f;
}
.close-cloud-btn {
    margin-top: 1.5rem;
    background: #3e3e42;
    color: #fff;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
}
.close-cloud-btn:hover {
    background: #4e4e52;
}

/* Results */
.results-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.result-card {
    background: #252526;
    border: 1px solid #2d2d30;
    padding: 16px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.2s ease;
}
.result-card:hover {
    background: #2d2d30;
}
.post-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 8px;
}
.post-title {
    margin: 0;
    font-size: 1.2rem;
    color: #fff;
}
.post-date {
    font-size: 0.9rem;
    color: #888;
}
.post-tags {
    margin-bottom: 8px;
}
.tag-display {
    color: #2ea35f;
    font-size: 0.85rem;
    margin-right: 10px;
}
.post-summary {
    color: #aaa;
    font-size: 0.95rem;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.icon {
    width: 24px;
    height: 24px;
    display: block;
}
.icon-sm {
    width: 16px;
    height: 16px;
    display: block;
    /* Ensure small icons are sized correctly */
}
.icon-sm :deep(svg) {
    width: 16px;
    height: 16px;
}

.empty, .loading {
    text-align: center;
    color: #666;
    padding: 2rem;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
}
</style>