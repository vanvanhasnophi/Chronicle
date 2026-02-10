<template>
  <div class="blog-editor" :class="[`layout-${layout}`, { 'is-mobile': isMobile }]">
    <div class="editor-toolbar">
      <!-- ROW 1: Meta & Main Actions -->
      <div class="toolbar-row row-meta">
        <div class="meta-left">
           <h4 class="post-title-display">{{ postTitle }}</h4>
           <span :class="['status-chip', postStatus]">{{ postStatus.toUpperCase() }}</span>
           <div class="meta-dates">
             <span class="date-item" v-if="postUpdated" title="Last Edited">
                <span class="icon-svg tiny" v-html="Icons.edit"></span>
                {{ new Date(postUpdated).toLocaleString() }}
             </span>
             <span class="date-item faded" v-if="postDate" title="Created On">
                <span class="icon-svg tiny" v-html="Icons.clock"></span>
                {{ new Date(postDate).toLocaleString() }}
             </span>
           </div>
        </div>
        <div class="actions-right">
            <button 
              v-if="postStatus === 'modifying'"
              class="toolbar-btn danger-btn"
              @click="restorePost"
              :disabled="isSaving"
              title="Discard Draft & Restore Published"
            >
              <span class="icon-svg" v-html="Icons.undo"></span>
              <span v-if="!isMobile" class="btn-label">Restore</span>
            </button>

            <button 
              class="toolbar-btn"
              @click="openSaveModal('draft')"
              :disabled="isSaving"
            >
              <span class="icon-svg" v-html="Icons.save"></span>
              <span v-if="!isMobile" class="btn-label">Draft</span>
            </button>
            
            <button 
              class="toolbar-btn primary-action"
              @click="openSaveModal('publish')"
              :disabled="isSaving"
            >
               <span class="icon-svg" v-html="Icons.publish"></span>
               <span v-if="!isMobile" class="btn-label">Publish</span>
            </button>
        </div>
      </div>

      <!-- ROW 2: Editing Tools -->
      <div class="toolbar-row row-tools">
        <div class="tool-group">
            <button 
                class="toolbar-btn" 
                @click="undo" 
                :disabled="historyIndex <= 0"
                title="Undo"
            >
                <span class="icon-svg" v-html="Icons.undo"></span>
            </button>
            <button 
                class="toolbar-btn" 
                @click="redo" 
                :disabled="historyIndex >= history.length - 1"
                title="Redo"
            >
                <span class="icon-svg" v-html="Icons.redo"></span>
            </button>
            <span class="divider"></span>
            <button 
              class="toolbar-btn" 
              @click="openImageModal"
              title="Insert Media"
            >
              <span class="icon-svg" v-html="Icons.plus"></span>
              <span>Insert</span>
            </button>
            <button 
              class="toolbar-btn" 
              @click="openLinkModal"
              title="Insert Link"
            >
              <span class="icon-svg" v-html="Icons.link"></span>
              <span>Link</span>
            </button>
            <button 
              class="toolbar-btn" 
              @click="openTableModal"
              title="Insert Table"
            >
              <span class="icon-svg" v-html="Icons.table"></span>
              <span>Table</span>
            </button>
        </div>
        <div class="stats-display">
            Chars: {{ localValue.length }}
        </div>
      </div>

      <!-- ROW 3: View Settings -->
      <div class="toolbar-row row-view">
         <div class="tool-group">
            <button 
              class="toolbar-btn"
              :class="{ active: previewReadOnly }"
              @click="previewReadOnly = !previewReadOnly"
              :title="previewReadOnly ? 'Unlock Edit Mode' : 'Lock Read Only'"
            >
              <span class="icon-svg" v-html="previewReadOnly ? Icons.lock : Icons.unlock"></span>
              <span class="btn-label">{{ previewReadOnly ? 'Read Only' : 'Editable' }}</span>
            </button>
            <span class="divider"></span>
            <button 
              v-for="mode in displayModes" 
              :key="mode.value"
              class="toolbar-btn"
              :class="{ active: layout === mode.value }"
              @click="layout = mode.value"
              :title="mode.label"
            >
              <span class="icon-svg" v-html="mode.icon"></span>
            </button>
         </div>
      </div>
    </div>

    <div class="editor-workspace">
      <!-- Editor Pane -->
      <div v-show="showEditor" class="pane editor-pane">
        <textarea
          ref="editorRef"
          v-model="localValue"
          class="markdown-input"
          placeholder="Start writing markdown..."
          @scroll="syncScroll('editor')"
          @mouseover="activeScroll = 'editor'"
        ></textarea>
      </div>

      <!-- Preview Pane -->
      <div 
        v-show="showPreview" 
        class="pane preview-pane"
        ref="previewRef"
        @scroll="syncScroll('preview')"
        @mouseover="activeScroll = 'preview'"
      >
        <MdParser 
          v-model="localValue" 
          :readOnly="previewReadOnly" 
          :assetMap="assetMap"
          class="preview-content"
        />
      </div>
    </div>

    <!-- Image Modal -->
    <div v-if="showImageModal" class="modal-overlay" @click.self="showImageModal = false">
      <div class="modal-content large-modal">
        <div class="modal-header">
            <h3>{{ modalTitle }}</h3>
            <button class="close-btn" @click="showImageModal = false">
                <span class="icon-svg" v-html="Icons.close"></span>
            </button>
        </div>
        
        <div class="modal-body media-manager-layout">
            <!-- Sidebar -->
            <div class="media-sidebar">
                <div v-for="cat in mediaCategories" 
                     :key="cat.id"
                     class="media-cat-item"
                     :class="{ active: selectedCategory === cat.id }"
                     @click="selectedCategory = cat.id">
                     <span class="media-cat-icon" v-html="cat.icon"></span>
                     {{ cat.label }}
                </div>
            </div>

            <!-- Content Area -->
            <div class="media-content-area">
                <div class="media-toolbar">
                    <button class="primary-btn" @click="triggerFileUpload">Upload New File</button>
                    <input 
                        type="file" 
                        ref="fileInputRef" 
                        class="hidden-input" 
                        multiple
                        @change="handleFileSelect"
                    />
                </div>
                
                <div class="library-section">
                    <div v-if="uploadedImages.length > 0" class="image-grid">
                        <div 
                            v-for="(img, idx) in uploadedImages" 
                            :key="idx" 
                            class="library-item"
                            @click="insertMediaMarkdown(img.name, img.path)"
                            :title="img.name"
                        >
                            <div class="img-thumb" v-if="['pic'].includes(selectedCategory)" :style="{ backgroundImage: `url(${img.url})` }"></div>
                            <div class="img-thumb icon-thumb" v-else>
                                <span class="scalable-icon" v-html="getIconForFile(img.name)"></span>
                            </div>
                            <span class="img-name">{{ img.name }}</span>
                        </div>
                    </div>
                    <div v-else class="empty-library">
                        <p>No files found.</p>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>

    <!-- Save/Publish Modal -->
    <div v-if="currentModal !== 'none'" class="modal-overlay" @click.self="currentModal = 'none'">
      <div class="modal-content small-modal">
        <div class="modal-header">
            <h3>{{ currentModal === 'draft' ? 'Save as Draft' : 'Publish Post' }}</h3>
            <button class="close-btn" @click="currentModal = 'none'">
                <span class="icon-svg" v-html="Icons.close"></span>
            </button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label>Post Title</label>
                <input 
                  v-model="tempTitle" 
                  class="modal-input" 
                  placeholder="Enter a title for this post..."
                  @keyup.enter="doSave()"
                  autofocus
                />
            </div>

            <div v-if="currentModal === 'publish'" class="form-group">
                <label>Tags</label>
                <div class="tags-input-container">
                    <div class="tags-list">
                        <span 
                            class="tag-badge" 
                            v-for="tag in postTags" 
                            :key="tag"
                            :class="{ featured: tag === 'featured' }"
                        >
                            {{ tag }}
                            <button class="tag-remove" @click="removeTag(tag)">
                                <span class="icon-svg" v-html="Icons.close"></span>
                            </button>
                        </span>
                    </div>
                    <div class="tag-controls">
                         <input 
                            v-model="tagInput" 
                            class="modal-input small-input" 
                            placeholder="Add tag..." 
                            @keyup.enter="addTag"
                         />
                         <button class="secondary-btn small-btn" @click="addTag">Add</button>
                         <button 
                            class="secondary-btn small-btn" 
                            :class="{ active: postTags.includes('featured') }"
                            @click="toggleFeatured"
                            title="Toggle Featured"
                         >
                            ★ Featured
                         </button>
                    </div>
                </div>
            </div>

            <div class="modal-actions">
                <button class="secondary-btn" @click="currentModal = 'none'">Cancel</button>
                <button 
                  class="primary-btn" 
                  @click="doSave()"
                  :disabled="isSaving || !tempTitle.trim()"
                >
                  {{ isSaving ? 'Saving...' : (currentModal === 'draft' ? 'Save Draft' : 'Publish Now') }}
                </button>
            </div>
        </div>
      </div>
    </div>

    <!-- Link Modal -->
    <div v-if="showLinkModal" class="modal-overlay" @click.self="showLinkModal = false">
      <div class="modal-content small-modal">
        <div class="modal-header">
            <h3>Insert Link</h3>
            <button class="close-btn" @click="showLinkModal = false">
                <span class="icon-svg" v-html="Icons.close"></span>
            </button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label>Link Text</label>
                <input v-model="linkText" class="modal-input" placeholder="Text to display" autofocus />
            </div>
            <div class="form-group">
                <label>URL</label>
                <input v-model="linkUrl" class="modal-input" placeholder="https://" @keyup.enter="insertLink" />
            </div>
            <div class="modal-actions">
                <button class="secondary-btn" @click="showLinkModal = false">Cancel</button>
                <button class="primary-btn" @click="insertLink">Insert</button>
            </div>
        </div>
      </div>
    </div>

    <!-- Table Modal -->
    <div v-if="showTableModal" class="modal-overlay" @click.self="showTableModal = false">
      <div class="modal-content small-modal">
        <div class="modal-header">
            <h3>Insert Table</h3>
            <button class="close-btn" @click="showTableModal = false">
                <span class="icon-svg" v-html="Icons.close"></span>
            </button>
        </div>
        <div class="modal-body">
            <div class="table-grid-container">
                <div class="table-grid" @mouseleave="tableGridHover(tblRows, tblCols)">
                    <div 
                        v-for="i in 64" 
                        :key="i"
                        :class="['grid-cell', { active: ((i-1)%8 < tblHoverC) && (Math.floor((i-1)/8) < tblHoverR) }]"
                        @mouseover="tableGridHover(Math.floor((i-1)/8)+1, (i-1)%8+1)"
                        @click="tableGridClick(Math.floor((i-1)/8)+1, (i-1)%8+1)"
                    ></div>
                </div>
                <div class="grid-info">{{ tblHoverR }} x {{ tblHoverC }} Table</div>
            </div>
            
            <div class="manual-inputs">
                 <div class="form-group">
                    <label>Rows</label>
                    <input type="number" v-model="tblRows" min="1" class="modal-input" />
                 </div>
                 <div class="form-group">
                    <label>Cols</label>
                    <input type="number" v-model="tblCols" min="1" class="modal-input" />
                 </div>
            </div>

            <div class="modal-actions">
                <button class="secondary-btn" @click="showTableModal = false">Cancel</button>
                <button class="primary-btn" @click="insertTable">Insert</button>
            </div>
        </div>
      </div>
    </div>

    <!-- Restore Confirmation Modal -->
    <div v-if="currentModal === 'restore'" class="modal-overlay">
      <div class="modal-content small-modal">
        <div class="modal-header">
            <h3>Confirm Restore</h3>
            <button class="close-btn" @click="currentModal = 'none'">
                <span class="icon-svg" v-html="Icons.close"></span>
            </button>
        </div>
        <div class="modal-body">
            <p style="color: #ccc; margin-bottom: 20px;">
                This will <strong>permanently delete</strong> your draft changes and restore the original published version from the server. <br><br>
                This action cannot be undone. Are you sure?
            </p>
            <div class="modal-actions">
                <button class="secondary-btn" @click="currentModal = 'none'">Cancel</button>
                <button class="primary-btn danger-action" @click="doRestore">Confirm Restore</button>
            </div>
        </div>
      </div>
    </div>

    <!-- Unsaved Changes Modal -->
    <div v-if="currentModal === 'unsaved'" class="modal-overlay">
      <div class="modal-content small-modal">
        <div class="modal-header">
            <h3>Unsaved Changes</h3>
            <button class="close-btn" @click="closeModals">
                <span class="icon-svg" v-html="Icons.close"></span>
            </button>
        </div>
        <div class="modal-body">
            <p style="color: #ccc; margin-bottom: 20px;">
                You have unsaved changes in "<strong>{{ postTitle }}</strong>". <br>
                Do you want to save them before leaving?
            </p>
            <div class="modal-actions">
                <button class="secondary-btn" @click="closeModals">Cancel</button>
                <button class="secondary-btn" style="border-color:#d9534f; color:#d9534f" @click="handleUnsavedOption('discard')">Discard</button>
                <button class="primary-btn" @click="handleUnsavedOption('save')">Save & Continue</button>
            </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter, onBeforeRouteUpdate, onBeforeRouteLeave } from 'vue-router'
import MdParser from './MdParser.vue'
import { debounce } from '../utils/debounce'
import { Icons } from '../utils/icons'

const route = useRoute()
const router = useRouter()

const props = withDefaults(defineProps<{
  modelValue?: string
}>(), {
  modelValue: ''
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const localValue = ref(props.modelValue)
const previewReadOnly = ref(false)
const assetMap = ref<Record<string, string>>({})
// Post Meta
const postTitle = ref('Untitled Post')
const postId = ref<string | null>(null)
const postStatus = ref<'draft' | 'published' | 'modifying'>('draft')
const postTags = ref<string[]>([])
const postDate = ref<string>('')
const postUpdated = ref<string>('')

// UI State
const isSaving = ref(false)
const currentModal = ref<'none' | 'draft' | 'publish' | 'unsaved' | 'restore'>('none')
const tempTitle = ref('')

// Dirty State Tracking
const savedContent = ref('')
const savedTitle = ref('')
const pendingRoute = ref<any>(null) // To store where user wanted to go
const isDirty = computed(() => {
    // Only dirty if we have a valid post loaded/initialized
    // and content differs
    return localValue.value !== savedContent.value || postTitle.value !== savedTitle.value
})

// Undo/Redo History
const history = ref<string[]>([])
const historyIndex = ref(-1)
const isTimeTraveling = ref(false) // Flag to ignore component's own updates when doing undo/redo
const MAX_HISTORY = 50

// Persist Logic
const draftKey = computed(() => `chronicle_draft_${postId.value || 'new'}`)
const historyKey = computed(() => `chronicle_history_${postId.value || 'new'}`)

const saveToLocalStorage = debounce(() => {
    // Save Content Draft
    localStorage.setItem(draftKey.value, localValue.value)
    // Save History Stack (Session only)
    sessionStorage.setItem(historyKey.value, JSON.stringify({
        stack: history.value,
        index: historyIndex.value
    }))
}, 1000)

// Tag Management
const tagInput = ref('')
function addTag() {
    const val = tagInput.value.trim()
    if (val && !postTags.value.includes(val)) {
        postTags.value.push(val)
    }
    tagInput.value = ''
}
function removeTag(tag: string) {
    postTags.value = postTags.value.filter(t => t !== tag)
}
function toggleFeatured() {
    if (postTags.value.includes('featured')) {
        removeTag('featured')
    } else {
        postTags.value.push('featured')
    }
}

async function restorePost() {
    if (!postId.value) return
    currentModal.value = 'restore'
}

async function doRestore() {
    if (!postId.value) return
    
    try {
        const res = await fetch(`/api/restore?id=${postId.value}`, { method: 'POST' })
        if (res.ok) {
            // clear local draft too
            localStorage.removeItem(draftKey.value)
            
            // Also clear history
            sessionStorage.removeItem(historyKey.value)

            await initLoad()
            currentModal.value = 'none'
        } else {
            alert('Failed to restore')
        }
    } catch(e) {
        alert('Error restoring')
    }
}

async function doSave(forceStatus?: 'draft' | 'published' | 'modifying') {
    let status = forceStatus 
    if (!status) {
         // Determine intent based on modal
         const intent = currentModal.value // 'draft' or 'publish' or 'unsaved'
         
         if (intent === 'publish') {
             status = 'published'
         } else if (intent === 'draft') {
             // If we are currently published or modifying, we stay in modifying state (draft of published)
             if (postStatus.value === 'published' || postStatus.value === 'modifying') {
                 status = 'modifying'
             } else {
                 status = 'draft'
             }
         } else if (intent === 'unsaved') {
             // Default to keeping current status, but if we are 'published', simplistic auto-save might be dangerous
             // Safest is to keep status unless it's strictly published -> modifying transition logic needed?
             // For now, keep current status. If published, it overwrites published file. 
             // Ideally unsaved prompt shouldn't publish, it should draft.
             // But let's stick to existing logic: save with current status.
             status = postStatus.value
         }
    }
    
    isSaving.value = true
    try {
        const res = await fetch('/api/post', {
            method: 'POST',
            body: JSON.stringify({
                id: postId.value,
                title: tempTitle.value || postTitle.value, // Use tempTitle if set, else current title
                content: localValue.value,
                status: status,
                tags: postTags.value
            })
        })
        if (res.ok) {
            const data = await res.json()
            if (data.id) {
                // If we were new, clear the 'new' draft before switching ID
                if (!postId.value) {
                    localStorage.removeItem('chronicle_draft_new')
                    sessionStorage.removeItem('chronicle_history_new')
                }

                postId.value = data.id
                postTitle.value = tempTitle.value
                if(status) postStatus.value = status
                postUpdated.value = new Date().toISOString()
                if (!postDate.value) postDate.value = postUpdated.value 
                
                // Update baseline
                savedContent.value = localValue.value
                savedTitle.value = tempTitle.value

                // Update history to include this save point if not already
                // But usually save doesn't change content, just persists.
                
                // Clear draft for current ID since it's saved
                localStorage.removeItem(draftKey.value)
            }
            // Show toast?
            // alert(`Successfully ${status === 'draft' ? 'saved as Draft' : 'Published'}!`)
            closeModals()
        } else {
            alert('Save failed')
        }
    } catch(e) {
        alert('Error saving')
    } finally {
        isSaving.value = false
    }
}

function openSaveModal(type: 'draft' | 'publish') {
    tempTitle.value = postTitle.value
    currentModal.value = type
}

function closeModals() {
    currentModal.value = 'none'
    pendingRoute.value = null
}

async function handleUnsavedOption(action: 'save' | 'discard') {
    if (action === 'save') {
        await doSave() // Saves with current status
    }
    
    // Force clean state to allow navigation
    savedContent.value = localValue.value
    savedTitle.value = postTitle.value
    
    currentModal.value = 'none'
    
    if (pendingRoute.value) {
        router.push(pendingRoute.value)
        pendingRoute.value = null
    }
}


function pushHistory(val: string) {
    if (isTimeTraveling.value) return
    
    // Prevent duplicate adjacent states
    if (historyIndex.value >= 0 && history.value[historyIndex.value] === val) return

    // Limit stack size if starting from scratch isn't ideal, but for now just slice future
    if (historyIndex.value < history.value.length - 1) {
        history.value = history.value.slice(0, historyIndex.value + 1)
    }

    history.value.push(val)
    
    // Maintain max size
    if (history.value.length > MAX_HISTORY) {
        history.value.shift()
        historyIndex.value-- // Shift index as well since array shifted
    }
    historyIndex.value = history.value.length - 1
    
    saveToLocalStorage()
}

const debouncedPush = debounce(pushHistory, 500)

// Navigation Guards
const handleNavigation = (to: any, from: any, next: any) => {
    if (isDirty.value) {
        // Pause navigation
        pendingRoute.value = to
        currentModal.value = 'unsaved'
        // If we cancel the navigation here, standard router behavior is to abort.
        // If it's a param change (update), it just stays.
        // But we want to show modal.
        // IMPORTANT: For route changes *within* same component, we need to pass next(false) 
        // OR simply not call next(). But we must call next(false) to reset URL if it changed?
        // Actually, if we use onBeforeRouteUpdate, the url hasn't changed effectively yet.
        next(false)
    } else {
        next()
    }
}

onBeforeRouteLeave(handleNavigation)

onBeforeRouteUpdate(async (to, from, next) => {
    if (isDirty.value) {
        pendingRoute.value = to
        currentModal.value = 'unsaved'
        next(false)
    } else {
        // Proceed with update
        next()
        // Manually trigger load since we are staying in component
        // Wait, next() will update the route object. 
        // We can just watch route.query.id, or better, call initLoad here if we want manual control.
        // But let's trust the Watcher or call initLoad manually?
        // The existing code has `initLoad` called on mounted.
        // Does it assume route change reloads?
        // User asked to "close existing... reload new".
        // If we use next(), the route updates. We should watch route query to reload.
    }
})

// Watch query change to reload data when navigation keeps component alive
watch(() => route.query.id, async (newId, oldId) => {
    if (newId !== oldId) {
        await initLoad()
    }
})

async function loadPostById(id: string) {
    try {
        // First check for local draft
        const draft = localStorage.getItem(`chronicle_draft_${id}`)
        const sessionHistory = sessionStorage.getItem(`chronicle_history_${id}`)

        if (draft) {
            // We have a local unsaved draft for this ID
            // Load base from server to get metadata, then override content
             const detailRes = await fetch(`/api/post?id=${id}&mode=edit`)
             if (detailRes.ok) {
                 const detail = await detailRes.json()
                 postId.value = detail.id
                 postTitle.value = detail.title
                 postStatus.value = detail.status || 'draft'
                 postDate.value = detail.date || ''
                 postUpdated.value = detail.updatedAt || detail.date || ''
                 postTags.value = detail.tags || []
                 
                 savedContent.value = detail.content // Base is server content
                 savedTitle.value = detail.title
             }
             
             localValue.value = draft // Override with draft
             // Restore history if available
             if (sessionHistory) {
                 try {
                     const h = JSON.parse(sessionHistory)
                     history.value = h.stack
                     historyIndex.value = h.index
                 } catch(e) {
                      history.value = [draft]
                      historyIndex.value = 0
                 }
             } else {
                 history.value = [draft]
                 historyIndex.value = 0
             }
             return
        }

        const detailRes = await fetch(`/api/post?id=${id}&mode=edit`)
        if (detailRes.ok) {
             const detail = await detailRes.json()
             postId.value = detail.id
             postTitle.value = detail.title
             postStatus.value = detail.status || 'draft'
             postDate.value = detail.date || ''
             postUpdated.value = detail.updatedAt || detail.date || ''
             postTags.value = detail.tags || []
             localValue.value = detail.content
             
             // Update baseline
             savedContent.value = detail.content
             savedTitle.value = detail.title

             // Restore session history if exists (e.g. reload page without draft change)
             if (sessionHistory) {
                 try {
                     const h = JSON.parse(sessionHistory)
                     history.value = h.stack
                     historyIndex.value = h.index
                 } catch(e) {
                      history.value = [detail.content]
                      historyIndex.value = 0
                 }
             } else {
                 history.value = [detail.content]
                 historyIndex.value = 0
             }
        }
    } catch(e) {
        console.error("Failed to load post", e)
    }
}

async function initLoad() {
    const queryId = route.query.id as string
    
    if (queryId === 'new') {
        // Reset state for new post
        postId.value = null
        postTitle.value = 'Untitled Post'
        postStatus.value = 'draft'
        postTags.value = []
        localValue.value = ''
        
        savedContent.value = ''
        savedTitle.value = 'Untitled Post'

        // Check draft/history for 'new'
        const draft = localStorage.getItem('chronicle_draft_new')
        const sessionHistory = sessionStorage.getItem('chronicle_history_new')

        if (draft) {
            localValue.value = draft
        }
        
        if (sessionHistory) {
             try {
                 const h = JSON.parse(sessionHistory)
                 history.value = h.stack
                 historyIndex.value = h.index
             } catch(e) {
                  history.value = [localValue.value]
                  historyIndex.value = 0
             }
        } else {
            history.value = [localValue.value]
            historyIndex.value = 0
        }
        return
    }
    
    if (queryId) {
        await loadPostById(queryId)
        return
    }

    // No ID parameter -> Same as 'new' logic for now or redirect
    // We treat no ID as create mode
    postId.value = null
    postTitle.value = 'Untitled Post'
    postStatus.value = 'draft'
    postDate.value = ''
    postUpdated.value = ''
    localValue.value = ''
    savedContent.value = ''
    savedTitle.value = 'Untitled Post'
    
    // Check 'new' draft
    const draft = localStorage.getItem('chronicle_draft_new')
    if (draft) localValue.value = draft
    history.value = [localValue.value]
    historyIndex.value = 0
}

watch(() => props.modelValue, (val) => {
  if (val !== localValue.value) localValue.value = val
})

// Main Watcher
watch(localValue, (val) => {
  emit('update:modelValue', val)
  if (!isTimeTraveling.value) {
     debouncedPush(val)
  }
  // Also invoke save immediately (debounced inside) for draft
  saveToLocalStorage()
})

function undo() {
    if (historyIndex.value > 0) {
        isTimeTraveling.value = true
        historyIndex.value--
        localValue.value = history.value[historyIndex.value]
        nextTick(() => {
            isTimeTraveling.value = false
            saveToLocalStorage()
        })
    }
}

function redo() {
    if (historyIndex.value < history.value.length - 1) {
        isTimeTraveling.value = true
        historyIndex.value++
        localValue.value = history.value[historyIndex.value]
        nextTick(() => {
            isTimeTraveling.value = false
            saveToLocalStorage()
        })
    }
}

function handleBeforeUnload(e: BeforeUnloadEvent) {
    // Show confirmation dialog
    e.preventDefault()
    e.returnValue = ''
}

onMounted(() => {
    // Attempt to load from cloud to sync latest state
    initLoad()

    window.addEventListener('beforeunload', handleBeforeUnload)
})

onUnmounted(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
})

type LayoutMode = 'split' | 'edit' | 'preview'
const layout = ref<LayoutMode>('split')
const isMobile = ref(false) // placeholder for responsiveness

const displayModes = computed(() => [
  { label: 'Split View', value: 'split' as LayoutMode, icon: Icons.columns },
  { label: 'Editor Only', value: 'edit' as LayoutMode, icon: Icons.edit },
  { label: 'Preview Only', value: 'preview' as LayoutMode, icon: Icons.eye }
])

const showEditor = computed(() => layout.value === 'split' || layout.value === 'edit')
const showPreview = computed(() => layout.value === 'split' || layout.value === 'preview')

const editorRef = ref<HTMLTextAreaElement | null>(null)
const previewRef = ref<HTMLDivElement | null>(null)
const activeScroll = ref<'editor' | 'preview' | null>(null)

// Image Handling
const showImageModal = ref(false)
const uploadedImages = ref<{name: string, url: string, path: string}[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)

// Categories for simplified file manager view
const mediaCategories = [
    { id: 'pic', label: 'Images', icon: Icons.image },
    { id: 'video', label: 'Videos', icon: Icons.video },
    { id: 'sound', label: 'Audio', icon: Icons.audio },
    { id: 'doc', label: 'Documents', icon: Icons.document },
    { id: 'txt', label: 'Text/Code', icon: Icons.codeText },
    { id: 'other', label: 'Others', icon: Icons.archive }
]

// Defaults to 'pic' because this is the Image Modal -> Wait, now it's Media Modal
const selectedCategory = ref('pic')

// Update label for modal
const modalTitle = computed(() => {
    return 'Insert Media'
})

watch(selectedCategory, () => {
    fetchServerImages()
})

const displayedFiles = computed(() => uploadedImages.value)
// Helper for file type icons (simplified version of FileManager logic)
const getIconForFile = (name: string) => {
    if (/\.(mp3|wav|ogg|flac)$/i.test(name)) return Icons.audio
    if (/\.(mp4|avi|mov|mkv)$/i.test(name)) return Icons.video
    if (/\.(pdf|doc|docx|ppt|pptx|xls|xlsx)$/i.test(name)) return Icons.document
    if (/\.(txt|md|js|ts|json|c|cpp|h|java|py|sh|bat|ini|log|csv|xml|yaml|yml|vue|css|html)$/i.test(name)) return Icons.codeText
    return Icons.generic
}

async function fetchServerImages() {
   try {
     const path = selectedCategory.value
     const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`)
     if(res.ok) {
        const items = await res.json()
        uploadedImages.value = items
          .filter((i:any) => i.type === 'file')
          .map((i:any) => ({
               name: i.name,
               url: `/server/data/upload/${i.path}`,
               path: `/server/data/upload/${i.path}`,
               cat: path
          }))
     }
   } catch (e) { console.error(e) }
}

async function openImageModal() {
  showImageModal.value = true
  selectedCategory.value = 'pic' // Default start
  fetchServerImages()
}

// ... inside handleFileSelect ...
function insertMediaMarkdown(name: string, path: string, category?: string) {
    if(!editorRef.value) return;
    const textarea = editorRef.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = localValue.value; 
    
    // Determine Type
    const ext = name.split('.').pop()?.toLowerCase() || ''
    let insertText = ''

    // 1. Image (Keep standard markdown image)
    if (['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext)) {
        insertText = `\n![${name}](${path})\n`;
    }
    // 2. Audio/Video/Doc/Other -> Use standard Link syntax, Parser will render as Card
    else {
        // Remove emoji if I added it previously to name
        insertText = `\n[${name}](${path})\n`;
    }
    
    localValue.value = text.substring(0, start) + insertText + text.substring(end);
    
    showImageModal.value = false
    
    setTimeout(() => {
        if (editorRef.value) {
            editorRef.value.focus();
            const newCursorPos = start + insertText.length;
            editorRef.value.setSelectionRange(newCursorPos, newCursorPos);
        }
    }, 0);
}

function triggerFileUpload() {
  fileInputRef.value?.click()
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files[0]) {
    const file = input.files[0]
    
    // Upload filename encoding
    const filename = encodeURIComponent(file.name)
    
    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
                'X-Filename': filename
                // No X-Category header needed, backend auto-sorts
            },
            body: file
        })
        
        if (res.ok) {
            const data = await res.json()
            // data.category will be returned confirmed by backend
            if (data.category === 'pic') {
                 // only refresh list if it's actually an image
                 fetchServerImages() 
            } else {
                 alert(`File uploaded to ${data.category}`)
            }
            
            // If it IS an image, insert it
            if (/\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(file.name)) {
                insertMediaMarkdown(file.name, data.url)
            } else {
                // Determine if we should insert other media types automatically?
                // Yes, user probably wants to use it immediately
                insertMediaMarkdown(file.name, data.url)
            }
        } else {
            console.error('Upload failed')
            alert('Image upload failed')
        }
    } catch (e) {
        console.error(e)
        alert('Error uploading image')
    }
    
    input.value = ''
  }
}

function insertImageMarkdown(name: string, path: string) {
    if(!editorRef.value) return;
    const textarea = editorRef.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = localValue.value; 
    
    const insertText = `\n![${name}](${path})\n`;
    
    localValue.value = text.substring(0, start) + insertText + text.substring(end);
    
    showImageModal.value = false
    
    setTimeout(() => {
        if (editorRef.value) {
            editorRef.value.focus();
            const newCursorPos = start + insertText.length;
            editorRef.value.setSelectionRange(newCursorPos, newCursorPos);
        }
    }, 0);
}

// Link Modal
const showLinkModal = ref(false)
const linkText = ref('')
const linkUrl = ref('')

function openLinkModal() {
    // If text selected, pre-fill linkText
    if (editorRef.value) {
        const start = editorRef.value.selectionStart
        const end = editorRef.value.selectionEnd
        if (start !== end) {
            linkText.value = localValue.value.substring(start, end)
        }
    }
    linkUrl.value = ''
    showLinkModal.value = true
}

function insertLink() {
    const text = linkText.value || 'Link'
    const url = linkUrl.value || '#'
    insertAtCursor(`[${text}](${url})`)
    showLinkModal.value = false
}

// Table Modal
const showTableModal = ref(false)
const tblRows = ref(2)
const tblCols = ref(2)
const tblHoverR = ref(2)
const tblHoverC = ref(2)

watch([tblRows, tblCols], ([r, c]) => {
    tblHoverR.value = r
    tblHoverC.value = c
})

function openTableModal() {
    tblRows.value = 2
    tblCols.value = 2
    tblHoverR.value = 2
    tblHoverC.value = 2
    showTableModal.value = true
}

function tableGridHover(r: number, c: number) {
    tblHoverR.value = r
    tblHoverC.value = c
}

function tableGridClick(r: number, c: number) {
    tblRows.value = r
    tblCols.value = c
}

function insertTable() {
    const r = Math.max(1, parseInt(tblRows.value as any) || 1)
    const c = Math.max(1, parseInt(tblCols.value as any) || 1)
    
    let md = '\n'
    // Header
    md += '| ' + Array(c).fill('Header').join(' | ') + ' |\n'
    // Separator
    md += '| ' + Array(c).fill('---').join(' | ') + ' |\n'
    // Rows
    for (let i = 0; i < r; i++) {
        md += '| ' + Array(c).fill('Cell ' + (i+1)).join(' | ') + ' |\n'
    }
    md += '\n'
    
    insertAtCursor(md)
    showTableModal.value = false
}

function insertAtCursor(insertText: string) {
    if(!editorRef.value) return;
    const textarea = editorRef.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = localValue.value; 
    
    localValue.value = text.substring(0, start) + insertText + text.substring(end);
    
    nextTick(() => {
        if (editorRef.value) {
            textarea.focus();
            const newCursorPos = start + insertText.length;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
        }
    });
}

// Scroll sync
function syncScroll(source: 'editor' | 'preview') {
  if (layout.value !== 'split') return
  if (activeScroll.value && activeScroll.value !== source) return

  const editor = editorRef.value
  const preview = previewRef.value

  if (!editor || !preview) return

  if (source === 'editor') {
    const percentage = editor.scrollTop / (editor.scrollHeight - editor.clientHeight)
    if (!isNaN(percentage)) {
      preview.scrollTop = percentage * (preview.scrollHeight - preview.clientHeight)
    }
  } else {
    const percentage = preview.scrollTop / (preview.scrollHeight - preview.clientHeight)
    if (!isNaN(percentage)) {
      editor.scrollTop = percentage * (editor.scrollHeight - editor.clientHeight)
    }
  }
}
</script>

<style scoped>

.blog-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: none;
  background: #1e1e1e;
}

.editor-toolbar {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0 12px;
  background: #252526;
  border-bottom: 1px solid #333;
}

.toolbar-row {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 0;
}

.toolbar-row.row-meta {
  justify-content: space-between;
  border-bottom: 1px solid #333;
  margin-bottom: 0;
  padding-bottom: 8px;
}

.toolbar-row.row-tools {
  justify-content: space-between;
  border-bottom: 1px solid #333;
  margin-top: 0;
}

.toolbar-row.row-view {
  margin-top: 0;
  padding-top: 8px;
  border-top: none; 
}

.meta-left {
    display: flex;
    align-items: center;
    overflow: hidden;
    gap: 12px;
    flex: 1;
}

.actions-right {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
}

.tool-group {
    display: flex;
    align-items: center;
}

.meta-dates {
    display: flex;
    flex-direction: column;
    font-size: 11px;
    line-height: 1.2;
    color: #888;
    overflow: hidden;
}

.date-item {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    gap: 4px;
}
.date-item.faded {
    color: #555;
    font-size: 10px;
}

.icon-svg.tiny {
    width: 10px;
    height: 10px;
    opacity: 0.7;
}

.post-title-display {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: #e0e0e0;
    max-width: 200px; /* Reduced to allow space for dates */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.stats-display {
    font-size: 12px;
    color: #666;
}

.status-chip {
    font-size: 0.65em;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    border: 1px solid currentColor;
    flex-shrink: 0;
}

.divider {
  width: 1px;
  height: 16px;
  background-color: #444;
  margin: 0 6px;
}

.toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: transparent;
  border: 1px solid transparent;
  color: #ccc;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  margin-right: 2px;
  height: 28px;
  font-size:14px;
}
.toolbar-btn:hover:not(:disabled) {
  background: #333;
}
.toolbar-btn.active {
  background: rgba(46, 163, 95, 0.2);
  border: 1px solid rgba(46, 163, 95, 0.4);
}

.toolbar-btn.active:hover {
  background: rgba(46, 163, 95, 0.4);
}
.toolbar-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  color: #555;
  pointer-events: none;
}

.editor-workspace {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.pane {
  flex: 1;
  overflow: auto;
  height: 100%;
}

.editor-pane {
  border-right: 1px solid #333;
  overflow: hidden;
}

.markdown-input {
  display: block;
  width: 100%;
  height: 100%;
  background: #1e1e1e;
  color: #d4d4d4;
  border: none;
  padding: 16px;
  font-family: 'Consolas', monospace;
  font-size: 14px;
  resize: none;
  outline: none;
  box-sizing: border-box;
}

.preview-pane {
  background: #1e1e1e;
  padding: 16px;
  box-sizing: border-box;
}

/* Layout modifiers */
.layout-split .pane {
  width: 50%;
}
.layout-edit .preview-pane { display: none; }
.layout-preview .editor-pane { display: none; }
.layout-preview .pane { width: 100%; }

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: #252526;
  border: 1px solid #444;
  border-radius: 6px;
  
  /* Adaptive Size */
  width: auto;
  min-width: 350px;
  max-width: 90vw;
  height: auto;
  max-height: 85vh;
  
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  overflow: hidden;
}

/* Default larger modal preference if not specified small */
.modal-content:has(.media-manager-layout) {
    /* Fallback */
    width: 800px;
}
.large-modal {
    width: 800px;
    height: auto;
    min-height: 450px; /* Ensure space for sidebar */
    max-width: 95vw;
    max-height: 90vh;
}

.small-modal {
    width: auto;
    min-width: 380px;
    max-width: 500px;
}

.modal-header {
  padding: 0px 16px;
  border-bottom: 1px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #2d2d30;
  flex-shrink: 0;
  height: 48px;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: #eee;
}

.close-btn {
  background: none;
  border: none;
  color: #ccc;
  cursor: pointer;
  padding: 4px;
  display: flex; 
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}
.close-btn:hover {
  background: transparent;
  color: #fff;
}

.modal-body {
    padding: 16px;
    overflow-y: auto;
    overflow-x: hidden;
}

.modal-body.media-manager-layout {
  display: flex;
  flex: 1;
  padding: 0;
  overflow: hidden;
}

/* Sidebar */
.media-sidebar {
    width: 200px;
    background: #252526;
    border-right: 1px solid #333;
    padding: 10px;
    overflow-y: auto;
    flex-shrink: 0;
}

.media-cat-item {
    padding: 8px 12px;
    cursor: pointer;
    border-radius: 4px;
    margin-bottom: 2px;
    display: flex;
    align-items: center;
    color: #ccc;
    font-size: 14px;
}
.media-cat-item:hover {
    background: #2a2d2e;
}
.media-cat-item.active {
  background: rgba(46, 163, 95, 0.2);
  border: 1px solid rgba(46, 163, 95, 0.4);
}

.media-cat-item.active:hover {
  background: rgba(46, 163, 95, 0.4);
}

.toolbar-btn.primary-action {
    background: #2ea35f;
    color: white;
}
.toolbar-btn.primary-action:hover {
    background: #43cd7c;
}

.media-cat-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-right: 10px;
}
.media-cat-icon :deep(svg) {
    width: 100%;
    height: 100%;
}

/* Content Area */
.media-content-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px;
    background: #1e1e1e;
    overflow: hidden;
}

.media-toolbar {
    margin-bottom: 20px;
    display: flex;
    justify-content: flex-start;
}

.library-section {
    flex: 1;
    overflow-y: auto;
}

.library-section h4 {
  margin-top: 0;
  margin-bottom: 12px;
  color: #ccc;
}

.upload-section {
    display: none; /* Removed old section style */
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
  padding-bottom: 20px;
}

.primary-btn {
  background: #2ea35f;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}
.primary-btn:hover {
  background: #24804a;
}

.hidden-input {
  display: none;
}

.library-item {
  cursor: pointer;
  border: 1px solid #333;
  border-radius: 4px;
  overflow: hidden;
  transition: border-color 0.2s;
  background: #252526;
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
}
.library-item:hover {
  border-color: #2ea35f;
  background: #2a2d2e;
}

.img-thumb {
  flex: 1;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  width: 100%;
  position: relative;
}

.img-name {
  display: block;
  padding: 6px;
  font-size: 11px;
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  background: #252526;
  border-top: 1px solid #333;
}

.empty-library {
  text-align: center;
  color: #666;
  padding: 20px;
}
.img-thumb.icon-thumb {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    background: #333;
    color: #888;
}

.scalable-icon {
    width: 40px;
    height: 40px;
    display: block;
}
.scalable-icon :deep(svg) {
    width: 100%;
    height: 100%;
    stroke-width: 1;
}

.dataset-control button:hover {
    background: #444;
}

.icon-svg {
  display: inline-flex;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  color: inherit;
}
.icon-svg svg {
  width: 100%;
  height: 100%;
  stroke-width: 1.5;
}


.status-chip.draft {
    color: #aaa;
    border-color: #555;
    background: #333;
}
.status-chip.published {
    color: #2ea35f;
    border-color: #2ea35f;
    background: rgba(46, 163, 95, 0.1);
}
.status-chip.modifying {
    color: #ffd700;
    border-color: #ffd700;
    background: rgba(255, 215, 0, 0.1);
}
.toolbar-btn.danger-btn {
    color: #fa5252;
}
.toolbar-btn.danger-btn:hover:not(:disabled) {
    background: rgba(250, 82, 82, 0.15);
    color: #ff8787;
}

.small-modal {
    max-width: 500px;
    width: 90%;
}

.modal-content {
    background: #252526;
    border: 1px solid #454545;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    padding: 0;
    width: 80%;
    max-width: 900px;
    display: flex;
    flex-direction: column;
    max-height: 85vh;
}

.form-group {
    margin-bottom: 12px;
}
.form-group label {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
    color: #ccc;
}

.modal-input {
    width: 100%;
    /* Ensure no overflow */
    box-sizing: border-box;
    padding: 10px;
    font-size: 16px;
    background: #252526;
    border: 1px solid #3c3c3c;
    color: #fff;
    border-radius: 4px;
    outline: none;
}
.modal-input:focus {
    border-color: #2ea35f;
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}

.secondary-btn {
    background: transparent;
    border: 1px solid #3c3c3c;
    color: #ccc;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
}
.secondary-btn:hover {
    background: #333;
}

/* Table Grid Styles */
.table-grid-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
}
.table-grid {
    display: grid;
    grid-template-columns: repeat(8, 24px);
    gap: 4px;
    padding: 10px;
    background: #252526;
    border: 1px solid #333;
    border-radius: 4px;
}
.grid-cell {
    width: 24px;
    height: 24px;
    border: 1px solid #555;
    background: #333;
    cursor: pointer;
    border-radius: 2px;
}
.grid-cell:hover {
    border-color: rgba(67, 194, 120, 0.4); 
}
.grid-cell.active {
  background: rgba(46, 163, 95, 0.2);
  border-color: rgba(46, 163, 95, 0.4);
}
.grid-info {
    font-size: 13px;
    color: #ccc;
    font-weight: 500;
}
.manual-inputs {
    display: flex;
    gap: 15px;
    justify-content: center;
    margin-bottom: 20px;
}
.manual-inputs .form-group {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    margin-bottom: 0;
}
.manual-inputs input {
    width: 60px;
    text-align: center;
}
/* Tags Style */
.tags-input-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: #333;
    padding: 8px;
    border-radius: 4px;
    border: 1px solid #444;
}

.tags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-height: 28px;
}

.tag-badge {
    background: #444;
    color: #eee;
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 4px;
    border: 1px solid #555;
    user-select: none;
}
.tag-badge.featured {
    background: rgba(255, 215, 0, 0.15);
    color: #ffd700;
    border-color: #ffd700;
}

.tag-remove {
    background: none;
    border: none;
    color: #aaa;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    width: 14px;
    height: 14px;
}
.tag-remove:hover {
    color: #fff;
}
.tag-remove .icon-svg {
    width: 12px;
    height: 12px;
}

.tag-controls {
    display: flex;
    gap: 8px;
}
.small-input {
    padding: 6px 10px;
    font-size: 13px;
    flex: 1;
}
.small-btn {
    padding: 6px 12px;
    font-size: 13px;
}
.small-btn.active {
    background: rgba(255, 215, 0, 0.15);
    color: #ffd700;
    border-color: #ffd700;
}

.primary-btn.danger-action {
    background: #d9534f;
}
.primary-btn.danger-action:hover {
    background: #c9302c;
}
</style>