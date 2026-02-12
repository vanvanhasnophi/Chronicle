<template>
  <div class="file-manager">
    <div class="sidebar">
      <div class="sidebar-header">Library</div>
      <div v-for="cat in categories" :key="cat.id" 
           class="folder-item" 
           :class="{ active: currentCategory === cat.id }"
           @click="navigate(cat.id)">
        <span class="cat-icon" v-html="cat.icon"></span> 
        {{ cat.label }}
      </div>
    </div>
    
    <div class="main-content">
      <div class="toolbar">
        <h3>{{ currentCategoryLabel }}</h3>
        <div class="actions">
           <label class="upload-btn">
             Upload
             <input type="file" @change="handleUpload" hidden multiple />
           </label>
           <button @click="refresh" class="icon-btn" v-html="Icons.refresh" title="Refresh"></button>
        </div>
      </div>

      <div class="file-grid">
         <div v-if="loading" class="loading">Loading...</div>
         <div v-else-if="items.length === 0" class="empty">No files in this category.</div>
         
         <div v-for="file in items" :key="file.name" class="grid-item file">
            <div class="preview" @click="openPreview(file)">
               <img v-if="isImage(file.name)" :src="file.url || `/server/data/upload/${file.path}`" loading="lazy" />
               <div v-else class="icon scalable-icon" v-html="getIconForFile(file.name)"></div>
            </div>
            <div class="name" :title="file.name">{{ file.name }}</div>
            <div class="actions-row">
                <button class="copy-btn" @click.stop="copyLink(file)" title="Copy Link" v-html="Icons.link"></button>
                <button class="delete-btn" @click.stop="deleteItem(file.path)" v-html="Icons.trash"></button>
            </div>
         </div>
      </div>
    

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { usePreview } from '../composables/usePreview'
import { useImagePreview } from '../composables/useImagePreview'
import { Icons } from '../utils/icons'

const router = useRouter()
const { openPreview: openGlobalPreview } = usePreview()
const { openImagePreview } = useImagePreview()

const categories = [
    { id: 'all', label: 'All Files', icon: Icons.folder },
    { id: 'pic', label: 'Images', icon: Icons.image },
    { id: 'video', label: 'Videos', icon: Icons.video },
    { id: 'sound', label: 'Audio', icon: Icons.audio },
    { id: 'doc', label: 'Documents', icon: Icons.document },
    { id: 'txt', label: 'Text/Code', icon: Icons.codeText },
    { id: 'other', label: 'Others', icon: Icons.archive }
]

const currentCategory = ref('all')
const items = ref<any[]>([])
const loading = ref(false)

// Preview state
// No local preview state needed anymore

const currentCategoryLabel = computed(() => {
    return categories.find(c => c.id === currentCategory.value)?.label || 'Library'
})

const loadItems = async () => {
  loading.value = true
  items.value = []
  try {
    const res = await fetch(`/api/files?path=${currentCategory.value}`)
    if (res.ok) {
       // Filter out subdirectories if any, we just want files 
       // (Backend ensures flat list structure for categories basically since we don't support sub-sub-folders in this UI view)
       const all = await res.json()
       items.value = all.filter((i: any) => i.type === 'file')
    }
  } catch(e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const navigate = (catId: string) => {
    currentCategory.value = catId
    loadItems()
}

// "Delete" logic now refers to file path
const deleteItem = async (path: string) => {
    if (!confirm(`Permanently delete this file?`)) return
    
    // Path comes partially from backend (e.g. "pic/foo.jpg" or "foo.jpg")
    // Our backend list returns relative to BASE_UPLOAD_DIR
    // Let's ensure we pass the correct relative path to delete API
    
    await fetch(`/api/files?path=${encodeURIComponent(path)}`, {
        method: 'DELETE'
    })
    loadItems()
}

const handleUpload = async (e: Event) => {
    const input = e.target as HTMLInputElement
    if (!input.files || input.files.length === 0) return

    for (const file of Array.from(input.files)) {
        const encodedName = encodeURIComponent(file.name)
        // We don't need to specify category manually, backend will auto-sort based on extension
        await fetch('/api/upload', {
            method: 'POST',
            headers: { 'x-filename': encodedName },
            body: file
        })
    }
    
    // Reload items. But wait, if user is in 'pic' and uploads a 'mp3', it won't show up.
    // That confuses users. Maybe we should switch to the category of the last uploaded item?
    // Or just alert "Uploaded".
    // For now, just refresh. If it appears, great.
    loadItems()
    input.value = ''
}

const isImage = (name: string) => /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(name)

const getIconForFile = (name: string) => {
    if (/\.(mp3|wav|ogg|flac)$/i.test(name)) return Icons.audio
    if (/\.(mp4|avi|mov|mkv)$/i.test(name)) return Icons.video
    if (/\.(pdf|doc|docx|ppt|pptx|xls|xlsx)$/i.test(name)) return Icons.document
    if (/\.(txt|md|js|ts|json|c|cpp|h|java|py|sh|bat|ini|log|csv|xml|yaml|yml|vue|css|html)$/i.test(name)) return Icons.codeText
    return Icons.generic // Using generic file icon for unknown
}

const copyLink = (file: any) => {
    const url = file.url || `/server/data/upload/${file.path}`
    navigator.clipboard.writeText(`![](${url})`)
}

const getFileType = (name: string) => {
    if (/\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(name)) return 'Audio'
    if (/\.(mp4|webm|mkv|mov|avi)$/i.test(name)) return 'Video'
    if (/\.(pdf|doc|docx|ppt|pptx|xls|xlsx)$/i.test(name)) return 'Document'
    if (/\.(txt|md|js|ts|json|c|cpp|h|java|py|sh|bat|ini|conf|vue|log|csv|xml|yaml|yml|rs|go|php)$/i.test(name)) return 'Code/Text'
    return 'File'
}

const openPreview = async (file: any) => {
    const url = file.url || `/server/data/upload/${file.path}`
    if (isImage(file.name)) {
        openImagePreview(url)
    } else {
        openGlobalPreview({
            name: file.name,
            path: url,
            type: getFileType(file.name)
        })
    }
}

const refresh = () => loadItems()

onMounted(() => {
    loadItems()
})
</script>

<style scoped>
.file-manager {
    display: flex;
    height: 100%;
    background: #1e1e1e;
    color: #e0e0e0;
}
.sidebar {
    width: 200px;
    background: #252526;
    border-right: 1px solid #333;
    padding: 10px;
    overflow-y: auto;
}
.folder-item {
    padding: 8px 12px;
    cursor: pointer;
    border-radius: 4px;
    margin-bottom: 2px;
    display: flex;
    align-items: center;
}
.folder-item:hover {
    background: #2a2d2e;
}
.folder-item.active {
    background: #2ea35f;
    color: white;
}
.sidebar-header {
    padding: 10px 12px;
    font-size: 11px;
    text-transform: uppercase;
    color: #888;
    font-weight: 600;
}
.cat-icon {
    margin-right: 8px;
}
.main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px;
    overflow-y: auto;
}
.toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 10px;
    border-bottom: 1px solid #333;
}
.actions {
    display: flex;
    gap: 10px;
}
button, .upload-btn {
    background: #2ea35f;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 2px;
    cursor: pointer;
    font-size: 13px;
    display: inline-block;
}
button:hover, .upload-btn:hover {
    background: #24804a;
}
.icon-btn {
    padding: 6px 10px;
}
.file-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 15px;
}
.grid-item {
    background: #252526;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    padding: 10px;
    text-align: center;
    position: relative;
    cursor: pointer;
    transition: background 0.2s;
}
.grid-item:hover {
    background: #2a2d2e;
}
.preview {
    height: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 8px;
    overflow: hidden;
    background: #1e1e1e;
    border-radius: 2px;
}
.preview img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
}
.preview .icon {
    width: 48px;
    height: 48px;
    color: #555;
    display: flex;
    align-items: center;
    justify-content: center;
}
.preview .icon :deep(svg) {
    width: 100%;
    height: 100%;
    stroke-width: 1;
}
.name {
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 6px;
    color: #ccc;
}
.delete-btn {
    position: absolute;
    top: 5px;
    right: 5px;
    background: rgba(0,0,0,0.5);
    width: 24px;
    height: 24px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    opacity: 0;
    transition: opacity 0.2s;
    color: white;
}
.delete-btn :deep(svg) {
    width: 14px;
    height: 14px;
}
.grid-item:hover .delete-btn {
    opacity: 1;
}
.delete-btn:hover {
    background: #cc3333;
}
.actions-row {
    display: flex;
    justify-content: center;
    gap: 5px;
}
.copy-btn {
    padding: 4px;
    background: #333;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    color: #ccc;
}
.copy-btn :deep(svg) {
    width: 14px;
    height: 14px;
}
.cat-icon {
    margin-right: 8px;
    display: flex;
    align-items: center;
}
.cat-icon :deep(svg) {
    width: 18px;
    height: 18px;
}
.icon-btn {
    padding: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
}
.icon-btn :deep(svg) {
    width: 16px;
    height: 16px;
}
.loading, .empty {
    grid-column: 1 / -1;
    text-align: center;
    color: #888;
    padding: 40px;
}
</style>