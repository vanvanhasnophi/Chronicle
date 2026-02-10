<template>
  <div class="blog-post-container">
    <div v-if="loading" class="loading">Loading...</div>
    <div v-else-if="!post" class="error">Post not found.</div>
    <div v-else class="post-content-wrapper">
      <nav class="post-nav">
        <router-link to="/" class="nav-back">← Back to Home</router-link>
        <span class="nav-date">{{ formatDate(post.date) }}</span>
      </nav>
      
      <header class="post-header">
        <h1 class="title">{{ post.title }}</h1>
        <div class="tags" v-if="post.tags && post.tags.length">
            <span v-for="tag in post.tags" :key="tag" class="tag">#{{ tag }}</span>
        </div>
      </header>

      <div class="markdown-body">
         <MdParser 
            v-if="post.content"
            :modelValue="post.content"
            :readOnly="true"
         />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import MdParser from '../components/MdParser.vue'

interface PostDetail {
  id: string
  title: string
  date: string
  content: string
  tags?: string[]
}

const route = useRoute()
const post = ref<PostDetail | null>(null)
const loading = ref(true)

const formatDate = (isoStr: string) => {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

onMounted(async () => {
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

.tags {
    display: flex;
    gap: 8px;
}
.tag {
    color: #888;
    font-size: 14px;
}

.loading, .error {
    text-align: center;
    padding: 100px;
    color: #888;
}
</style>
