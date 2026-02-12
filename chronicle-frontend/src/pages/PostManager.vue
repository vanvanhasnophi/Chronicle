<template>
  <div class="manager-container">
    <div class="manager-header">
      <h1 class="page-title">Manage Posts</h1>
      <button class="new-post-btn" @click="createNew">
        <span class="plus">+</span> New Post
      </button>
    </div>

    <div v-if="loading" class="loading">Loading posts...</div>
    <div v-else-if="posts.length === 0" class="empty">No posts found.</div>
    
    <div v-else class="table-wrapper">
      <table class="posts-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Status</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="post in posts" :key="post.id">
            <td class="col-title">
              <div v-if="renamingId === post.id" class="rename-box">
                  <input 
                    :id="`rename-input-${post.id}`"
                    v-model="tempRenameTitle" 
                    @blur="saveRename(post)" 
                    @keyup.enter="saveRename(post)"
                    @keyup.esc="cancelRename"
                    class="rename-input"
                  />
              </div>
              <div v-else class="title-container" @dblclick="startRename(post)" title="Double click to rename">
                  <span class="title-text">{{ post.title }}</span>
                  <span class="edit-icon-hint" @click.stop="startRename(post)">✎</span>
              </div>
              
              <span v-if="post.tags && post.tags.length" class="tags-row">
                 <span v-for="tag in sortTags(post.tags)" :key="tag" class="tag-badge">{{ tag }}</span>
              </span>
            </td>
            <td>
              <span :class="['status-badge', getStatus(post.status).toLowerCase()]">
                {{ getStatus(post.status).toUpperCase() }}
              </span>
            </td>
            <td>{{ formatDate(post.date) }}</td>
            <td>
              <button class="action-btn edit-btn" @click="editPost(post.id)">Edit</button>
              <button class="action-btn delete-btn" @click="deletePost(post.id)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { sortTags } from '../utils/tagUtils'

interface Post {
  id: string
  title: string
  date: string
  status?: 'draft' | 'published'
  tags?: string[]
}

const router = useRouter()
const posts = ref<Post[]>([])
const loading = ref(true)

// Rename state
const renamingId = ref<string | null>(null)
const tempRenameTitle = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

function startRename(post: Post) {
    renamingId.value = post.id
    tempRenameTitle.value = post.title
    nextTick(() => {
        // Focus input if possible (v-for ref handling is tricky, simplified here assumption)
        // With v-for ref array, it's better to just use autofocus or find element
        const el = document.getElementById(`rename-input-${post.id}`)
        if (el) el.focus()
    })
}

async function saveRename(post: Post) {
    if (!renamingId.value) return
    const newTitle = tempRenameTitle.value.trim()
    
    if (newTitle && newTitle !== post.title) {
         try {
             const res = await fetch('/api/post', {
                 method: 'POST',
                 body: JSON.stringify({
                     id: post.id,
                     title: newTitle
                 })
             })
             if (res.ok) {
                 post.title = newTitle
             } else {
                 alert('Rename failed')
             }
         } catch(e) {
             alert('Error renaming')
         }
    }
    
    renamingId.value = null
}

function cancelRename() {
    renamingId.value = null
}

const getStatus = (s: any) => {
    if (typeof s === 'string') return s
    // If it's an object (likely Event due to bug) or undefined, fallback
    return 'published'
}

const formatDate = (isoStr: string) => {
  if (!isoStr) return '-'
  return new Date(isoStr).toLocaleDateString() + ' ' + new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const createNew = () => {
    window.open('/editor?id=new', '_blank')
}

const editPost = (id: string) => {
    window.open(`/editor?id=${id}`, '_blank')
}

const deletePost = async (id: string) => {
    if (!confirm('Are you sure you want to delete this post?')) return
    
    try {
        const res = await fetch(`/api/post?id=${id}`, { method: 'DELETE' })
        if (res.ok) {
            // refresh
            loadPosts()
        } else {
            alert('Failed to delete')
        }
    } catch(e) {
        alert('Error deleting')
    }
}

async function loadPosts() {
    loading.value = true
    try {
        const res = await fetch(`/api/posts?includeDrafts=true&t=${Date.now()}`)
        if (res.ok) {
        posts.value = await res.json()
        }
    } catch (e) {
        console.error(e)
    } finally {
        loading.value = false
    }
}

onMounted(() => {
    loadPosts()
})
</script>

<style scoped>
.manager-container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 40px 20px;
  color: #e0e0e0;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  border-bottom: 1px solid #333;
  padding-bottom: 15px;
}

.page-title {
  margin: 0;
  font-size: 2em;
  color: #fff;
}

.new-post-btn {
  background: #2ea35f;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.new-post-btn:hover {
  background: #24804a;
}

.table-wrapper {
  background: #1e1e1e;
  border-radius: 8px;
  border: 1px solid #333;
  overflow: hidden;
}

.posts-table {
  width: 100%;
  border-collapse: collapse;
}

.posts-table th, .posts-table td {
  padding: 16px;
  text-align: left;
  border-bottom: 1px solid #2d2d30;
}

.posts-table th {
  background: #252526;
  color: #aaa;
  font-weight: 600;
  font-size: 0.9em;
}

.posts-table tr:hover {
  background: #2d2d30;
}
.posts-table tr:last-child td {
  border-bottom: none;
}

.col-title {
  min-width: 200px;
}
.title-text {
  display: inline-block;
  font-size: 1.1em;
  color: #fff;
  font-weight: 500;
  cursor: pointer;
}
.title-container:hover .title-text {
  color: #2ea35f;
  text-decoration: underline;
}
.edit-icon-hint {
    opacity: 0;
    margin-left: 8px;
    cursor: pointer;
    font-size: 12px;
    color: #888;
}
.title-container:hover .edit-icon-hint {
    opacity: 1;
}

.rename-input {
    background: #1e1e1e;
    border: 1px solid #2ea35f;
    color: #fff;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 1.1em;
    width: 100%;
    box-sizing: border-box;
}

.tags-row {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}
.tag-badge {
  font-size: 0.75em;
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 3px;
  color: #888;
}

.status-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.8em;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.status-badge.draft {
  background: #3e3e42;
  color: #aaa;
  border: 1px solid #555;
}
.status-badge.published {
  background: rgba(46, 163, 95, 0.2);
  color: #2ea35f;
  border: 1px solid #2ea35f;
}
.status-badge.modifying {
  background: rgba(255, 215, 0, 0.2);
  color: var(--featured);
  border: 1px solid var(--featured);
}

.action-btn {
  background: transparent;
  border: 1px solid #555;
  color: #ccc;
  padding: 4px 10px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.9em;
  transition: all 0.2s;
}
.action-btn:hover {
  border-color: #2ea35f;
  color: #2ea35f;
}

.delete-btn {
    margin-left: 8px;
    border-color: #555;
    color: #888;
}
.delete-btn:hover {
    border-color: #d9534f;
    color: #d9534f;
}

.loading, .empty {
  text-align: center;
  padding: 40px;
  color: #666;
}
</style>