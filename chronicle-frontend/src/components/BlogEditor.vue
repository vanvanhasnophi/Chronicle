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
                @click="openFileMenu"
                title="File Menu"
            >
                <span class="icon-svg" v-html="Icons.file"></span>
                <span>File</span>
            </button>
            <span class="divider"></span>
            
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
              title="Media Library"
            >
              <span class="icon-svg" v-html="Icons.media"></span>
              <span>Media</span>
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

            <span class="divider"></span>

            <button 
              v-for="font in fontOptions" 
              :key="font.value"
              class="toolbar-btn"
              :class="{ active: postFont === font.value , ['font-' + font.value]: true }"
              @click="postFont = font.value"
              :title="font.label"
            >
              <span class="icon-svg" v-html="font.icon"></span>
            </button>
        </div>
        <button class="stats-display" @click="activeModal = 'stats'">
            {{ editorStats.wordCount }} word{{ editorStats.wordCount === 1 ? '' : 's' }}
        </button>
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
        :class="fontClass"
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

    <!-- Group 1: File Menu Modal -->
    <div v-if="activeModal === 'file'" class="modal-overlay" @click.self="activeModal = 'none'">
        <div class="modal-content file-menu-modal">
            <div class="sidebar">
                <button 
                v-for="tab in fileTabs" 
                :key="tab.id"
                class="sidebar-btn" 
                :class="{ active: fileTab === tab.id }"
                @click="handleFileTabChange(tab.id)"
                >
                <span class="icon-svg sidebar-icon" v-html="tab.icon" ></span>
                {{ tab.label }}
                </button>
            </div>
            <div class="main-area">
                <div class="header">
                    <h3>{{ currentFileTabTitle }}</h3>
                    <button class="close-btn" @click="activeModal = 'none'">
                        <span class="icon-svg" v-html="Icons.close"></span>
                    </button>
                </div>
                
                <div class="content-body">
                    <!-- New Post -->
                    <div v-if="fileTab === 'new'" class="tab-pane">
                        <p>Create a new empty post.</p>
                        <div class="warning-box">
                            <strong>Note:</strong> Any unsaved changes in the current document will require confirmation.
                        </div>
                        <button class="primary-btn" @click="executeFileAction">Create New Post</button>
                    </div>

                    <!-- Open Post -->
                    <div v-if="fileTab === 'open'" class="tab-pane">
                        <div v-if="fileLoading" class="loading">Loading posts...</div>
                        <div v-else class="post-list">
                            <div 
                                v-for="post in filePosts" 
                                :key="post.id" 
                                class="post-item"
                                @click="handlePostOpen(post.id)"
                            >
                                <span class="post-title">{{ post.title }}</span>
                                <span class="post-status status-chip" :class="post.status || 'draft'">{{ post.status || 'draft' }}</span>
                                <span class="post-date">{{ new Date(post.date).toLocaleDateString() }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Import -->
                    <div v-if="fileTab === 'import'" class="tab-pane">
                        <p>Import a Markdown or text file from your device.</p>
                        <div class="file-drop-area" @click="triggerImportInput">
                            <span v-if="!selectedImportFile">Click to select file</span>
                            <span v-else>{{ selectedImportFile.name }}</span>
                        </div>
                        <input type="file" ref="fileInput" @change="handleImportSelect" accept=".md,.txt" style="display:none" />
                        <button class="primary-btn" :disabled="!selectedImportFile" @click="executeFileAction">Import File</button>
                    </div>

                    <!-- Export -->
                    <div v-if="fileTab === 'export'" class="tab-pane">
                        <p>Download current content as a Markdown file.</p>
                        <button class="primary-btn" @click="executeFileAction">Export to Markdown</button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Group 2: Insert Modals (Media, Link, Table) -->
    <div v-if="['media', 'link', 'table'].includes(activeModal)" class="modal-overlay" @click.self="activeModal = 'none'">
      <div class="modal-content" :class="activeModal === 'media' ? 'large-modal' : 'small-modal'">
        <div class="modal-header">
            <h3>{{ activeModal === 'media' ? 'Media Library' : (activeModal === 'link' ? 'Insert Link' : 'Insert Table') }}</h3>
            <button class="close-btn" @click="activeModal = 'none'">
                <span class="icon-svg" v-html="Icons.close"></span>
            </button>
        </div>
        
        <!-- Media Body -->
        <div v-if="activeModal === 'media'" class="modal-body media-manager-layout">
            <div class="modal-sidebar">
                <div v-for="cat in mediaCategories" 
                     :key="cat.id"
                     class="modal-sidebar-item"
                     :class="{ active: selectedCategory === cat.id }"
                     @click="selectedCategory = cat.id">
                     <span class="media-cat-icon" v-html="cat.icon"></span>
                     {{ cat.label }}
                </div>
            </div>
            <div class="media-content-area">
                <div class="media-toolbar">
                    <button class="primary-btn" @click="triggerFileUpload">
                        <span>Upload New File</span>
                    </button>
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
                            <div class="img-thumb" v-if="['pic'].includes(selectedCategory)" :style="{ backgroundImage: `url(${img.thumb || img.url})` }"></div>
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

        <!-- Link Body -->
        <div v-if="activeModal === 'link'" class="modal-body">
            <div class="form-group">
                <label>Link Text</label>
                <input v-model="linkText" class="modal-input" placeholder="Text to display" autofocus />
            </div>
            <div class="form-group">
                <label>URL</label>
                <input v-model="linkUrl" class="modal-input" placeholder="https://" @keyup.enter="insertLink" />
            </div>
            <div class="modal-actions">
                <button class="secondary-btn" @click="activeModal = 'none'">Cancel</button>
                <button class="primary-btn" @click="insertLink">Insert</button>
            </div>
        </div>

        <!-- Table Body -->
        <div v-if="activeModal === 'table'" class="modal-body">
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
                <button class="secondary-btn" @click="activeModal = 'none'">Cancel</button>
                <button class="primary-btn" @click="insertTable">Insert</button>
            </div>
        </div>
      </div>
    </div>

    <!-- Group 3: Save/Publish Modals -->
    <div v-if="['draft', 'publish'].includes(activeModal)" class="modal-overlay" @click.self="activeModal = 'none'">
      <div class="modal-content small-modal">
        <div class="modal-header">
            <h3>{{ activeModal === 'draft' ? 'Save as Draft' : 'Publish Post' }}</h3>
            <button class="close-btn" @click="activeModal = 'none'">
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

            <div v-if="activeModal === 'publish'" class="form-group">
                <label>Tags</label>
                <div class="tags-input-container">
                    <div class="tags-list">
                        <span 
                            class="tag-badge" 
                            v-for="tag in sortTags(postTags)" 
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
                <button class="secondary-btn" @click="activeModal = 'none'">Cancel</button>
                <button 
                  class="primary-btn" 
                  @click="doSave()"
                  :disabled="isSaving || !tempTitle.trim()"
                >
                  {{ isSaving ? 'Saving...' : (activeModal === 'draft' ? 'Save Draft' : 'Publish Now') }}
                </button>
            </div>
        </div>
      </div>
    </div>

    <!-- Group 4: Confirmation Modals (Restore, Unsaved) -->
    <div v-if="['restore', 'unsaved', 'stats'].includes(activeModal)" class="modal-overlay" @click.self="activeModal = 'none'">
      <div class="modal-content small-modal">
        <div class="modal-header">
            <h3 v-if="activeModal === 'restore'">Confirm Restore</h3>
            <h3 v-else-if="activeModal === 'unsaved'">Unsaved Changes</h3>
            <h3 v-else>Document Statistics</h3>

            <button class="close-btn" @click="activeModal = 'none'">
                <span class="icon-svg" v-html="Icons.close"></span>
            </button>
        </div>
        
        <!-- Restore Body -->
        <div v-if="activeModal === 'restore'" class="modal-body">
            <p style="color: #ccc; margin-bottom: 20px;">
                This will <strong>permanently delete</strong> your draft changes and restore the original published version from the server. <br><br>
                This action cannot be undone. Are you sure?
            </p>
            <div class="modal-actions">
                <button class="secondary-btn" @click="activeModal = 'none'">Cancel</button>
                <button class="primary-btn danger-action" @click="doRestore">Confirm Restore</button>
            </div>
        </div>

        <!-- Unsaved Body -->
        <div v-if="activeModal === 'unsaved'" class="modal-body">
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

        <!-- Stats Body -->
        <div v-if="activeModal === 'stats'" class="modal-body">
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="stat-label">Words</span>
                    <span class="stat-value">{{ editorStats.wordCount }}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Characters (with spaces)</span>
                    <span class="stat-value">{{ editorStats.charCount }}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Characters (no spaces)</span>
                    <span class="stat-value">{{ editorStats.charCountNoSpaces }}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Non-Western Characters</span>
                    <span class="stat-value">{{ editorStats.nonWesternCount }}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Original Markdown Chars</span>
                    <span class="stat-value">{{ editorStats.markdownCount }}</span>
                </div>
            </div>
        </div>
      </div>
    </div>
    <!-- Upload Toast -->
    <div v-if="uploadState.show" class="upload-toast" :class="uploadState.status">
        <div class="toast-content">
            <div class="toast-header-row">
                <span class="toast-title">File Upload</span>
                <button class="toast-close" @click="uploadState.show = false">
                    <span class="icon-svg" v-html="Icons.close"></span>
                </button>
            </div>
            <div class="toast-message">{{ uploadState.message }}</div>
            <div v-if="['uploading', 'processing'].includes(uploadState.status)" class="toast-progress-bg">
                <div class="toast-progress-bar" :style="{ width: uploadState.progress + '%' }"></div>
            </div>
        </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, reactive } from 'vue'
import { useRoute, useRouter, onBeforeRouteUpdate, onBeforeRouteLeave } from 'vue-router'
import MdParser from './MdParser.vue'
import { debounce } from '../utils/debounce'
import { Icons } from '../utils/icons'
import { getStats } from '../utils/markdownParser'
import { sortTags } from '../utils/tagUtils'

const route = useRoute()
const router = useRouter()
const CDN_BASE_URL = import.meta.env.VITE_CDN_BASE_URL || ''
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

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
watch(postTitle, (val) => {
    if (val) document.title = `${val} - Md Editor`
    else document.title = 'Md Editor'
}, { immediate: true })
const postId = ref<string | null>(null)
const postStatus = ref<'draft' | 'published' | 'modifying'>('draft')
const postTags = ref<string[]>([])
const postFont = ref<string>('sans')
const postDate = ref<string>('')
const postUpdated = ref<string>('')

// UI State
const isSaving = ref(false)
const activeModal = ref('none')
const tempTitle = ref('')

// File Menu State
const fileTab = ref('new')
const filePosts = ref<any[]>([])
const fileLoading = ref(false)
const fileInput = ref<HTMLInputElement|null>(null)
const selectedImportFile = ref<File|null>(null)

const fileTabs = [
    { id: 'new', label: 'New Post', icon: Icons.plus },
    { id: 'open', label: 'Open...', icon: Icons.folder },
    { id: 'import', label: 'Import', icon: Icons.document },
    { id: 'export', label: 'Export', icon: Icons.save }
]

const fontOptions = [
    { value: 'sans', label: 'Sans Serif', icon: 'A' },
    { value: 'serif', label: 'Serif', icon: 'A' },
    { value: 'mono', label: 'Monospaced', icon: 'M' }
]

const currentFileTabTitle = computed(() => {
    return fileTabs.find(t => t.id === fileTab.value)?.label || ''
})

// Stats
const editorStats = computed(() => getStats(localValue.value))

// File Menu Logic
async function openFileMenu() {
    activeModal.value = 'file'
    // Preload posts if switching to open tab? Or wait until user clicks.
    // Let's reset tab
    fileTab.value = 'new'
}

async function handleFileTabChange(tab: string) {
    fileTab.value = tab
    if (tab === 'open') {
        fileLoading.value = true
        try {
            const res = await fetch('/api/posts?includeDrafts=true')
            if (res.ok) {
                filePosts.value = await res.json()
            }
        } finally {
            fileLoading.value = false
        }
    }
}

function triggerImportInput() {
    fileInput.value?.click()
}

function handleImportSelect(e: Event) {
    const target = e.target as HTMLInputElement
    if (target.files && target.files.length > 0) {
        selectedImportFile.value = target.files[0]
    }
}

function executeFileAction() {
    if (fileTab.value === 'export') {
        const blob = new Blob([localValue.value], { type: 'text/markdown;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${postTitle.value.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`
        a.click()
        URL.revokeObjectURL(url)
        activeModal.value = 'none'
        return
    }

    if (fileTab.value === 'new') {
        const doNew = () => {
            resetEditor()
            activeModal.value = 'none'
        }
        if (isDirty.value) handleUnsavedCheck(doNew)
        else doNew()
        return
    }

    if (fileTab.value === 'import' && selectedImportFile.value) {
        const file = selectedImportFile.value
        const doImport = () => {
             const reader = new FileReader()
             reader.onload = (e) => {
                 if (e.target?.result) {
                     localValue.value = e.target.result as string
                     postTitle.value = file.name.replace(/\.[^/.]+$/, "")
                     activeModal.value = 'none'
                     postId.value = null 
                     postStatus.value = 'draft'
                     
                     // Clear selection
                     selectedImportFile.value = null
                     if (fileInput.value) fileInput.value.value = ''
                 }
             }
             reader.readAsText(file)
        }
        if (isDirty.value) handleUnsavedCheck(doImport)
        else doImport()
    }
}

function handlePostOpen(id: string) {
    const doOpen = async () => {
        await loadPost(id)
        activeModal.value = 'none'
    }
    if (isDirty.value) handleUnsavedCheck(doOpen)
    else doOpen()
}

// Reuseable unsaved check helper
let pendingActionCallback: (() => void) | null = null
function handleUnsavedCheck(callback: () => void) {
    pendingActionCallback = callback
    activeModal.value = 'unsaved'
}

function resetEditor() {
    router.push({ query: { id: 'new' } }) // Update URL
    setTimeout(() => {
         initLoad() // Will read 'new' from query
    }, 50)
}

function loadPost(id: string) {
    if (id === postId.value) return 
    router.push({ query: { id } })
}
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
    activeModal.value = 'restore'
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
            activeModal.value = 'none'
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
         const intent = activeModal.value 
         
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
             // Default to keeping current status
             status = postStatus.value
         }
    }
    
    isSaving.value = true
    try {
        const res = await fetch('/api/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: postId.value,
                title: tempTitle.value || postTitle.value, // Use tempTitle if set, else current title
                content: localValue.value,
                status: status,
                tags: postTags.value,
                font: postFont.value
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
    activeModal.value = type
}

function closeModals() {
    activeModal.value = 'none'
    pendingRoute.value = null
}

async function handleUnsavedOption(action: 'save' | 'discard') {
    if (action === 'save') {
        await doSave() // Saves with current status
    }
    
    // Force clean state to allow navigation
    savedContent.value = localValue.value
    savedTitle.value = postTitle.value
    
    activeModal.value = 'none'
    
    if (pendingActionCallback) {
        pendingActionCallback()
        pendingActionCallback = null
        return
    }

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
        activeModal.value = 'unsaved'
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
        activeModal.value = 'unsaved'
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
    // If opening a brand-new editor, force-clear any saved draft/history and reset state
    if (newId === 'new') {
        try { localStorage.removeItem(draftKey.value); } catch(e) {}
        try { sessionStorage.removeItem(historyKey.value); } catch(e) {}

        localValue.value = '';
        savedContent.value = '';
        savedTitle.value = '';
        postId.value = null;
        postTitle.value = 'Untitled Post';
        postStatus.value = 'draft';
        history.value = [];
        historyIndex.value = -1;
        return;
    }

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
                 postFont.value = detail.font || 'sans'
                 
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
             postFont.value = detail.font || 'sans'
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
        postFont.value = 'sans'
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
const uploadedImages = ref<{name: string, url: string, path: string, thumb?: string}[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)

// Upload Notification State
const uploadState = reactive({
    show: false,
    progress: 0,
    status: '' as 'uploading' | 'processing' | 'success' | 'error',
    message: ''
})
// ...existing code...


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
                url: i.url || `/server/data/upload/${i.path}`,
                path: i.url || `/server/data/upload/${i.path}`,
                thumb: (i.url || `/server/data/upload/${i.path}`).replace('/server/data/upload/', '/server/data/upload/.thumbs/')
            }))
     }
   } catch (e) { console.error(e) }
}

async function openImageModal() {
  activeModal.value = 'media'
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
        // 生产环境拼接CDN
        const url = !path.startsWith('http') ? `${CDN_BASE_URL}${path}` : path;
        insertText = `\n![${name}](${url})\n`;
    }
    // 2. Audio/Video/Doc/Other -> Use standard Link syntax, Parser will render as Card
    else {
        const url = !path.startsWith('http') ? `${CDN_BASE_URL}${path}` : path;
        insertText = `\n[${name}](${url})\n`;
    }
    
    localValue.value = text.substring(0, start) + insertText + text.substring(end);
    
    activeModal.value = 'none'
    
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
    const filename = encodeURIComponent(file.name)
    
    // Init Toast
    uploadState.show = true
    uploadState.progress = 0
    uploadState.status = 'uploading'
    uploadState.message = `Uploading: ${file.name}`

    try {
        const xhr = new XMLHttpRequest()
        // Upload should go directly to backend origin when configured to avoid CDN proxying upload requests
        const uploadUrl = API_BASE_URL ? `${API_BASE_URL.replace(/\/$/, '')}/api/upload` : '/api/upload'
        xhr.open('POST', uploadUrl, true)
        xhr.setRequestHeader('Content-Type', 'application/octet-stream')
        xhr.setRequestHeader('X-Filename', filename)
        
        // Progress: Browser -> Server transfer
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100)
                uploadState.progress = percent
                if (percent === 100) {
                     uploadState.status = 'processing'
                     uploadState.message = 'Processing...'
                }
            }
        }
        
        xhr.onload = () => {
             if (xhr.status === 200) {
                uploadState.status = 'success'
                uploadState.progress = 100
                uploadState.message = 'Upload successful'
                
                try {
                    const data = JSON.parse(xhr.responseText)
                    if (data.category === 'pic') fetchServerImages()
                    
                    if (/\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(file.name)) {
                        insertMediaMarkdown(file.name, data.url)
                    } else {
                        insertMediaMarkdown(file.name, data.url)
                    }
                } catch(e) {
                    console.error('JSON Parse error', e);
                }

                // Auto hide
                setTimeout(() => { uploadState.show = false }, 3000)
            } else {
                uploadState.status = 'error'
                uploadState.message = `Upload failed (${xhr.status})`
                setTimeout(() => { uploadState.show = false }, 5000) // Keep error longer
            }
        }
        
        xhr.onerror = () => {
            uploadState.status = 'error'
            uploadState.message = 'Network error'
            setTimeout(() => { uploadState.show = false }, 5000)
        }
        
        xhr.send(file)
    } catch (e) {
        uploadState.status = 'error'
        uploadState.message = 'Upload error'
        setTimeout(() => { uploadState.show = false }, 5000)
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
    
    activeModal.value = 'none'
    
    setTimeout(() => {
        if (editorRef.value) {
            editorRef.value.focus();
            const newCursorPos = start + insertText.length;
            editorRef.value.setSelectionRange(newCursorPos, newCursorPos);
        }
    }, 0);
}

// Link Modal
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
    activeModal.value = 'link'
}

function insertLink() {
    const text = linkText.value || 'Link'
    const url = linkUrl.value || '#'
    insertAtCursor(`[${text}](${url})`)
    activeModal.value = 'none'
}

// Table Modal
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
    activeModal.value = 'table'
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
    activeModal.value = 'none'
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
const fontClass = computed(() => {
    return `font-${postFont.value}`
})
</script>

<style scoped>

.blog-editor {
    display: flex;
    flex-direction: column;
    height: 100vh; /* ensure editor fills viewport so internal panes scroll, not the page */
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
    position: sticky; /* keep toolbar fixed inside editor viewport */
    top: 0;
    z-index: 30;
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
    background-color: var(--app-bg-dark);
    font-size: 12px;
    color: #666;
    border: none;
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

.toolbar-btn.font-sans, .toolbar-btn.font-serif, .toolbar-btn.font-mono {
  text-transform: capitalize;
  font-size: 1em;
}


.editor-workspace {
    flex: 1;
    min-height: 0; /* allow flex children to shrink and enable internal scrolling */
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
.modal-sidebar {
    width: 200px;
    background: #252526;
    border-right: 1px solid #333;
    padding: 10px;
    overflow-y: auto;
    flex-shrink: 0;
}

.modal-sidebar-item {
    padding: 8px 12px;
    cursor: pointer;
    border-radius: 4px;
    margin-bottom: 2px;
    display: flex;
    align-items: center;
    color: #ccc;
    font-size: 14px;
}
.modal-sidebar-item:hover {
    background: #2a2d2e;
}
.modal-sidebar-item.active {
  background: rgba(46, 163, 95, 0.2);
  border: 1px solid rgba(46, 163, 95, 0.4);
}

.modal-sidebar-item.active:hover {
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

.icon-svg.sidebar-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-right: 10px;
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
    color: var(--featured);
    border-color: var(--featured);
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
    background: var(--featured-bg);
    color: var(--featured);
    border-color: var(--featured);
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
    background: var(--featured-bg);
    color: var(--featured);
    border-color: var(--featured);
}

.primary-btn.danger-action {
    background: #d9534f;
}
.primary-btn.danger-action:hover {
    background: #c9302c;
}
/* File Menu Specifics */
.modal-content.file-menu-modal {
    flex-direction: row; 
    height: 600px;
}

.sidebar {
    width: 200px;
    background: #252526;
    border-right: 1px solid #333;
    padding: 14px;
    display: flex;
    flex-direction: column;
}
.sidebar-btn {
    padding: 8px 12px;
    background: transparent;
    cursor: pointer;
    border-radius: 4px;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    color: #ccc;
    font-size: 14px;
}
.sidebar-btn:hover {
    background: #2a2d2e;
    color: #fff;
}
.sidebar-btn.active {
  background: rgba(46, 163, 95, 0.2);
  border: 1px solid rgba(46, 163, 95, 0.4);
}
.sidebar-btn.active:hover {
  background: rgba(46, 163, 95, 0.4);
}
.main-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px;
    overflow: hidden;
}
.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    border-bottom: 1px solid #333;
    padding-bottom: 15px;
}
.header h3 { margin: 0; color: #fff; font-size: 18px; }
.content-body { flex: 1; overflow-y: auto; }

.warning-box {
    background: rgba(255, 165, 0, 0.1);
    border-left: 3px solid orange;
    padding: 10px;
    margin: 15px 0;
    color: #ddd;
    font-size: 13px;
}

.post-list { display: flex; flex-direction: column; gap: 8px; }
.post-item {
    padding: 12px;
    background: #333;
    border: 1px solid #444;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.post-item:hover { background: #3c3c3c; }
.post-title { font-weight: bold; color: #e0e0e0; flex: 1; margin-right: 10px; }
.post-date { color: #888; font-size: 0.85em; margin-right: 10px; }
.post-status {
    font-size: 0.75em; border-radius: 3px;
    padding: 2px 6px; text-transform: uppercase;
    margin-right:10px;
}

.file-drop-area {
    border: 2px dashed #444;
    padding: 40px;
    text-align: center;
    color: #888;
    margin: 20px 0;
    cursor: pointer;
    border-radius: 6px;
}
.file-drop-area:hover { border-color: #666; color: #aaa; }

.stats-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
    padding: 10px 0;
}
.stat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px;
    background:transparent;
    border-radius: 4px;
}
.stat-label {
    color: #aeaeae;
    font-size: 0.9em;
}
.stat-value {
    color: #2ea35f;
    font-weight: bold;
    font-family: monospace;
    font-size: 1.2em;
}
.stats-display {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 12px;
    color: #666;
    padding: 4px 8px;
    border-radius: 4px;
    transition: color 0.2s, background 0.2s;
}
.stats-display:hover {
    color: #e0e0e0;
    background: #333;
}

/* Font Selector */
.font-selector {
    display: flex;
    gap: 15px;
    margin-top: 5px;
}
.radio-label {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    font-size: 0.9em;
    color: #ccc;
}
.radio-label input {
    margin: 0;
}

/* Upload Toast */
.upload-toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 320px;
    background: #252526;
    border: 1px solid #454545;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 2000;
    overflow: hidden;
    animation: slideIn 0.3s ease-out;
    color: #cccccc;
    font-size: 13px;
}

.upload-toast.error {
    border-left: 4px solid #f48771;
}

.upload-toast.success {
    border-left: 4px solid #89d185;
}

.upload-toast.uploading, .upload-toast.processing {
    border-left: 4px solid #007acc;
}

.toast-content {
    padding: 12px 16px;
}

.toast-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.toast-title {
    font-weight: 600;
    color: #e0e0e0;
}

.toast-close {
    background: none;
    border: none;
    cursor: pointer;
    color: #aaa;
    padding: 0;
    line-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}
.toast-close:hover {
    color: #fff;
}
.toast-close .icon-svg {
    width: 14px;
    height: 14px;
    fill: currentColor;
}

.toast-message {
    color: #aaa;
    margin-bottom: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.toast-progress-bg {
    height: 4px;
    background: #3c3c3c;
    border-radius: 2px;
    overflow: hidden;
}

.toast-progress-bar {
    height: 100%;
    background: #007acc;
    transition: width 0.2s ease;
}

@keyframes slideIn {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}

</style>
