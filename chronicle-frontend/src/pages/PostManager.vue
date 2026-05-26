<template>
  <div class="manager-container">
    <div class="manager-header">
      <h1 class="page-title">{{ $t('post.manageTitle') }}</h1>
      <div class="header-actions">
        <button class="secondary-action-btn" @click="republishAll" :disabled="republishing || loading || posts.length === 0">
          {{ republishing ? $t('post.republishingAll') : $t('post.republishAll') }}
        </button>
        <button class="new-post-btn" @click="createNew">
          <span class="plus">+</span> {{ $t('post.newPost') }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading">{{ $t('post.loadingPosts') }}</div>
    <div v-else-if="posts.length === 0" class="empty">{{ $t('post.noPostsFound') }}</div>
    
    <div v-else class="table-wrapper">
      <table class="posts-table">
        <thead>
          <tr>
            <th>{{ $t('post.table.title') }}</th>
            <th>{{ $t('post.table.status') }}</th>
            <th>{{ $t('post.table.date') }}</th>
            <th>{{ $t('post.table.actions') }}</th>
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
              <div v-else class="title-container" @dblclick="startRename(post)" :title="$t('post.renameHint')">
                  <span class="title-text">{{ post.title }}</span>
                  <span class="edit-icon-hint" @click.stop="startRename(post)">✎</span>
              </div>
              
              <span v-if="post.tags && post.tags.length" class="tags-row">
                 <span v-for="tag in sortTags(post.tags)" :key="tag" class="tag-badge">{{ tag === 'featured' ? $t('tag.featured') : tag }}</span>
              </span>
            </td>
            <td>
              <span :class="['status-badge', (typeof post.status === 'string' ? post.status : 'published') ]">
                {{ $t('status.' + (typeof post.status === 'string' ? post.status : 'published')) }}
              </span>
            </td>
            <td>{{ formatDate(post.date) }}</td>
            <td>
              <button class="action-btn edit-btn" @click="editPost(post.id)">{{ $t('post.table.edit') }}</button>
              <button class="action-btn delete-btn" @click="deletePost(post.id)">{{ $t('post.table.delete') }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { fetchWithAuth } from '../utils/fetchWithAuth';
import { ref, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { sortTags } from '../utils/tagUtils'
import useToast from '../composables/useToast'

interface Post {
  id: string
  title: string
  date: string
  status?: 'draft' | 'published'
  tags?: string[]
}

const router = useRouter()
const { t } = useI18n()
const { show: showToast } = useToast()
const posts = ref<Post[]>([])
const loading = ref(true)
const republishing = ref(false)

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
             const res = await fetchWithAuth(`/api/post?t=${Date.now()}`, {
                 method: 'POST',
                 body: JSON.stringify({
                     id: post.id,
                     title: newTitle
                 })
             })
             if (res.ok) {
                 post.title = newTitle
             } else {
                 alert(t('post.renameFailed'))
             }
         } catch(e) {
             alert(t('post.errorRenaming'))
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
  const id = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
    ? `new-${(crypto as any).randomUUID()}`
    : `new-${Math.random().toString(36).substring(2, 9)}`
  window.open(`/editor?id=${id}`, '_blank')
}

const editPost = (id: string) => {
    window.open(`/editor?id=${id}`, '_blank')
}

const deletePost = async (id: string) => {
    if (!confirm(t('post.confirmDelete'))) return
    
    try {
    const authToken = (() => {
      try {
        const raw = localStorage.getItem('chronicle_auth')
        if (!raw) return ''
        const parsed = JSON.parse(raw)
        return typeof parsed?.token === 'string' ? parsed.token : ''
      } catch (e) {
        return ''
      }
    })()

        const res = await fetchWithAuth(`/api/post?id=${id}&t=${Date.now()}`, {
          method: 'DELETE',
          headers: authToken ? { 'X-Chronicle-Auth': authToken } : {},
        })
        
        if (res.ok) {
            // refresh
            loadPosts()
        } else {
            alert(t('post.failedToDelete'))
        }
    } catch(e) {
        alert(t('post.errorDeleting'))
    }
}

async function loadPosts() {
    loading.value = true
    try {
        const res = await fetchWithAuth(`/api/posts?includeDrafts=true&t=${Date.now()}`)
        if (res.ok) {
        posts.value = await res.json()
        }
    } catch (e) {
        console.error(e)
    } finally {
        loading.value = false
    }
}

async function republishAll() {
    if (republishing.value) return
    if (!posts.value.some((post) => getStatus(post.status) === 'published')) {
      showToast(t('post.noPublishedPosts'), { status: 'warning', position: 'bottom-center', shape: 'capsule', duration: 3000 })
      return
    }

    if (!confirm(t('post.republishAllConfirm'))) return

    republishing.value = true
    try {
      const res = await fetchWithAuth(`/api/admin/posts/republish-all?t=${Date.now()}`, {
        method: 'POST',
      })

      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.message || t('post.republishAllFailed'))
      }

      const successList = Array.isArray(payload.successList) ? payload.successList : Array.isArray(payload.republishedPosts) ? payload.republishedPosts : []
      const failureList = Array.isArray(payload.failureList) ? payload.failureList : []
      const skippedList = Array.isArray(payload.skippedList) ? payload.skippedList : Array.isArray(payload.skippedPosts) ? payload.skippedPosts : []

      const successCount = Number(payload.successCount ?? successList.length ?? 0)
      const failureCount = Number(payload.failureCount ?? failureList.length ?? 0)
      const skippedCount = Number(payload.skippedCount ?? skippedList.length ?? 0)
      const buildStatus = payload.build?.status
      const buildMessage = payload.build?.message ? ` ${payload.build.message}` : ''
      const html = buildRepublishToastHtml({
        successCount,
        failureCount,
        skippedCount,
        successList,
        failureList,
        skippedList,
      })
      const toastStatus = failureCount > 0 ? 'error' : (skippedCount > 0 ? 'warning' : 'success')
      showToast(`${t('post.republishToastTitle')}：${html}${buildStatus ? ` <span class="republish-build-note">(${escapeHtml(buildStatus)}${buildMessage ? ` ${escapeHtml(buildMessage)}` : ''})</span>` : ''}`, {
        status: toastStatus,
        position: 'bottom-center',
        shape: 'capsule',
        duration: 6000,
        rich: true,
      })
      await loadPosts()
    } catch (error: any) {
      showToast(error?.message || t('post.republishAllFailed'), { status: 'error', position: 'bottom-center', shape: 'capsule', duration: 4000 })
    } finally {
      republishing.value = false
    }
}

function escapeHtml(input: any) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildListLink(label: string, items: Array<{ id?: string; title?: string; reason?: string }>) {
  const encodedItems = encodeURIComponent(JSON.stringify(items || []))
  return `<a href="#" class="toast-link" data-toast-label="${escapeHtml(label)}" data-toast-items="${escapeHtml(encodedItems)}">${escapeHtml(label)} ${escapeHtml(items.length)}</a>`
}

function buildRepublishToastHtml(payload: {
  successCount: number
  failureCount: number
  skippedCount: number
  successList: Array<{ id?: string; title?: string; reason?: string }>
  failureList: Array<{ id?: string; title?: string; reason?: string }>
  skippedList: Array<{ id?: string; title?: string; reason?: string }>
}) {
  return [
    buildListLink(t('post.republishToastSuccess'), payload.successList),
    buildListLink(t('post.republishToastFailure'), payload.failureList),
    buildListLink(t('post.republishToastSkipped'), payload.skippedList),
  ].join('，')
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
  color: var(--text-primary);
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 15px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-title {
  margin: 0;
  font-size: 2em;
  color: var(--text-primary);
}

.new-post-btn {
  background: var(--accent-color);
  color: var(--text-on-accent);
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
  background: var(--accent-color-hover);
}

.secondary-action-btn {
  background: transparent;
  color: var(--component-text-primary);
  border: 1px solid var(--border-color);
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}
.secondary-action-btn:hover:not(:disabled) {
  border-color: var(--accent-color);
  color: var(--accent-color);
}
.secondary-action-btn:disabled,
.new-post-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.table-wrapper {
  background: var(--bg-primary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.posts-table {
  width: 100%;
  border-collapse: collapse;
}

.posts-table th, .posts-table td {
  padding: 16px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}

.posts-table th {
  background: var(--bg-secondary);
  color: var(--component-text-secondary);
  font-weight: 600;
  font-size: 0.9em;
}

.posts-table tr:hover {
  background: var(--component-bg-hover);
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
  color: var(--text-primary);
  font-weight: 500;
  cursor: pointer;
}
.title-container:hover .title-text {
  color: var(--accent-color);
  text-decoration: underline;
}
.edit-icon-hint {
    opacity: 0;
    margin-left: 8px;
    cursor: pointer;
    font-size: 12px;
    color: var(--component-text-secondary);
}
.title-container:hover .edit-icon-hint {
    opacity: 1;
}

.rename-input {
  background: var(--bg-primary);
  border: 1px solid var(--accent-color);
    color: var(--text-primary);
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
  background: var(--component-bg-hover);
  padding: 2px 6px;
  border-radius: 3px;
  color: var(--component-text-secondary);
}

.status-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.8em;
  font-weight: bold;
  font-variation-settings: 'wght' 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.status-badge.draft {
  background: var(--component-bg-secondary);
  color: var(--component-text-secondary);
  border: 1px solid var(--border-color);
}
.status-badge.published {
  background: var(--component-bg-hover);
  color: var(--accent-color);
  border: 1px solid var(--accent-color);
}
.status-badge.modifying {
  background: var(--component-bg-hover);
  color: var(--featured);
  border: 1px solid var(--featured);
}

.action-btn {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--component-text-primary);
  padding: 4px 10px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.9em;
  transition: all 0.2s;
}
.action-btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.delete-btn {
    margin-left: 8px;
    border-color: var(--border-color);
    color: var(--component-text-secondary);
}
.delete-btn:hover {
    border-color: var(--status-error);
    color: var(--status-error);
}

.loading, .empty {
  text-align: center;
  padding: 40px;
  color: var(--component-text-secondary);
}
</style>