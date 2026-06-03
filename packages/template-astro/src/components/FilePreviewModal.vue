<template>
    <div v-if="visible" class="file-preview-overlay" @click.self="close">
        <div class="file-preview-container">
            <header class="file-preview-header">
                <h3 style="color: #fff">{{ title }}</h3>
                <div class="preview-header-actions">
                    <select v-if="type === 'text'" class="modern-select encoding-select" v-model="selectedEncoding" @change="loadText" title="Change text encoding">
                        <option v-for="enc in encodings" :key="enc" :value="enc">{{ enc }}</option>
                    </select>
                    <a download :href="url" target="_blank" rel="noopener" class="preview-action-btn download">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                    </a>
                    <button class="preview-action-btn close" @click="close">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            </header>
            <main class="file-preview-body">
                <div v-if="type === 'audio'" class="fp-media">
                    <audio :src="url" controls preload="metadata" style="width:70%"></audio>
                </div>

                <div v-else-if="type === 'video'" class="fp-media">
                    <video :src="url" controls style="width:90%" preload="metadata"></video>
                </div>

                <div v-else-if="type === 'pdf'" class="fp-doc fp-pdf">
                    <object :data="pdfBlobUrl || url" type="application/pdf" width="100%" height="100%">
                        <div class="fp-file">
                            <p>{{ pdfError || pdfFallbackMessage }}</p>
                            <p><a :href="url" target="_blank" rel="noopener">{{ downloadText }}</a></p>
                        </div>
                    </object>
                </div>

                <div v-else-if="type === 'text'" class="text-wrapper">
                    <div class="text-scroll-container">
                        <div v-if="loadingText" class="loading-state">{{ loadingTextMessage }}</div>
                        <pre v-else-if="textHtml" class="fp-text" v-html="textHtml"></pre>
                        <div v-else class="fp-file">
                            <p v-if="textError">{{ textError }}</p>
                            <p v-else>{{ t('preview.textPreviewEmpty') }}</p>
                        </div>
                    </div>
                </div>

                <div v-else class="fp-file" style="flex-direction: column;">
                    <p class="filename" style="font-size: 1.2rem;">{{ title }}</p>
                    <p class="fp-unsupported">{{ t('preview.previewNotSupported') }}</p>
                </div>
            </main>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { getClientLocale, createT } from '../utils/i18n'

const visible = ref(false)
const url = ref('')
const title = ref('')
const type = ref('file')

function open(opts = { url: '', title: '', type: 'file' }) {
    url.value = opts.url || ''
    title.value = opts.title || ''
    type.value = opts.type || 'file'
    visible.value = true
}

function close() {
    visible.value = false
}

// expose globally for the lazy loader to call
// eslint-disable-next-line no-undef
if (typeof window !== 'undefined') {
    // mount point will set window.__filePreviewApi when created
}

// expose methods for parent via ref
defineExpose({ open, close })
// keyboard / focus management and body scroll lock
function onKeyDown(e) {
    if (!visible.value) return;
    if (e.key === 'Escape') {
        e.preventDefault();
        close();
    }
}

onMounted(() => {
    if (typeof window !== 'undefined') {
        window.addEventListener('keydown', onKeyDown);
    }
});

onUnmounted(() => {
    if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onKeyDown);
    }
});

watch(visible, async (val) => {
    if (typeof document === 'undefined') return;
    if (val) {
        document.body.style.overflow = 'hidden';
        await nextTick();
        const closeBtn = document.querySelector('.preview-action-btn.close');
        if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus();
    } else {
        document.body.style.overflow = '';
    }
});

// text preview state and helpers
// determine locale: prefer build-time PAGE_LOCALE if provided by page
const clientLocale =  getClientLocale();
const t = createT(clientLocale);

const encodings = ref(['utf-8', 'utf-16le', 'iso-8859-1', 'windows-1252', 'gbk']);
const selectedEncoding = ref('utf-8');
const loadingText = ref(false);
const textContent = ref('');
const textHtml = ref('');
const textError = ref('');
const loadingTextMessage = t('preview.textLoading');
const pdfFallbackMessage = t('preview.pdfUnsupported');
const downloadText = t('preview.downloadPdf');

async function loadText() {
    if (!url.value) {
        textError.value = 'No file URL';
        return;
    }
    loadingText.value = true;
    textError.value = '';
    textContent.value = '';
    try {
        const res = await fetch(url.value);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const buf = await res.arrayBuffer();
        let decoded = '';
        try {
            decoded = new TextDecoder(selectedEncoding.value).decode(buf);
        } catch (e) {
            // TextDecoder may not support some encodings (e.g., gbk). Try utf-8 fallback.
            try { decoded = new TextDecoder('utf-8').decode(buf); }
            catch (e2) { throw e; }
        }
        // Process text: only keep first 200 lines, truncate long lines (>300 chars)
        const maxLines = 200;
        const maxLineLen = 300;

        function escapeHtml(str) {
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        const lines = decoded.split(/\r?\n/);
        const out = [];
        for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
            const line = lines[i] || '';
                if (line.length > maxLineLen) {
                out.push(escapeHtml(line.slice(0, maxLineLen)) + '<span class="fp-truncated">' + t('preview.truncated') + '</span>');
            } else {
                out.push(escapeHtml(line));
            }
        }
        if (lines.length > maxLines) {
            out.push('<span class="fp-truncated">' + t('preview.truncated') + '</span>');
        }

        textContent.value = decoded;
        textHtml.value = out.join('\n');
    } catch (e) {
        console.error('[FilePreview] loadText failed', e);
        textError.value = t('preview.textDecodeError');
        textHtml.value = '';
    } finally {
        loadingText.value = false;
    }
}

function changeEncoding(e) {
    selectedEncoding.value = e.target.value;
    loadText();
}

// PDF handling: fetch blob and create object URL for reliable embedding
const pdfBlobUrl = ref('');
const pdfError = ref('');

async function loadPdf() {
    pdfError.value = '';
    pdfBlobUrl.value = '';
    if (!url.value) return;
    try {
        const res = await fetch(url.value);
        if (!res.ok) throw new Error('Fetch failed: ' + res.status);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        pdfBlobUrl.value = blobUrl;
    } catch (e) {
        console.error('[FilePreview] loadPdf failed', e);
        pdfError.value = t('preview.pdfUnsupported');
    }
}

// Auto-load when modal opens for text/pdf files
watch([visible, type], ([vis, tt]) => {
    if (vis && tt === 'text') loadText();
    if (vis && tt === 'pdf') loadPdf();
});

// revoke blob URL on close/unmount
watch(visible, (v) => {
    if (!v && pdfBlobUrl.value) {
        try { URL.revokeObjectURL(pdfBlobUrl.value); } catch (e) {}
        pdfBlobUrl.value = '';
    }
});

onUnmounted(() => {
    if (pdfBlobUrl.value) {
        try { URL.revokeObjectURL(pdfBlobUrl.value); } catch (e) {}
    }
});

// expose component-level API for debugging/fallback
if (typeof window !== 'undefined') {
    window.__filePreviewComponentApi = { open, close };
}

</script>

<style>
.modern-select.encoding-select{
    border-radius: 24px; 
    background: rgba(0, 0, 0, 0.5);
    border: none;
    padding: 6px 18px;
    font-size: 14px;
    width: 180px;
    height: 48px;
}

.modern-select.encoding-select:hover {
    background: #000;
    transform: font-size 1.05;
}

.preview-header-actions {
    padding: 0 5px;
    display: flex;
    gap: 20px;
}

.fp-text {
    margin: 12px;
    width: fit-content;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 14px;
    color: var(--text-primary);
    line-height: 1.6;
    background: transparent;
}


.fp-media {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 20px;
    background: transparent;
}

.fp-file {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: var(--component-bg-blur);
}

.fp-doc {
    width: 100%;
    height: 100%;
    background: var(--component-bg-blur);
}



.file-preview-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    z-index: 20000;
    /* Higher than image preview if needed */
    display: flex;
    justify-content: center;
    align-items: center;
    opacity: 0;
    animation: fadeIn 0.15s forwards;
}

@keyframes fadeIn {
    to {
        opacity: 1;
    }
}

.file-preview-container {
    background: transparent;
    width: 80%;
    max-width: 900px;
    height: 80%;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: none;
}

.file-preview-header {
    height: 100px;
    background: transparent;
    border-bottom: none;
    display: flex;

    align-items: center;
    justify-content: space-between;
    padding: 0;
}

.file-preview-title {
    color: var(--text-primary);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-right: 20px;
}

.header-actions {
    display: flex;
    gap: 10px;
}

.preview-action-btn {
    background: rgba(0, 0, 0, 0.5);
    border: none;
    color: #eee;
    width: 48px;
    height: 48px;
    min-width: 48px;
    min-height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
    padding: 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    text-decoration: none;
}

.preview-action-btn:hover {
    background: rgba(0, 0, 0, 0.8);
    color: #fff;
    transform: scale(1.05);
}

.preview-action-btn:active {
    transform: scale(0.95);
}


.file-preview-body {
    flex: 1;
    overflow: hidden;
    padding: 0;
    display: flex;
    flex-direction: column;
    position: relative;
    border-radius: 12px;
    background: transparent;
}

.loading-state {
    color: #888;
    align-self: center;
    margin-top: 20px;
}

.text-wrapper {
    width: 100%;
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: visible;
    background: var(--component-bg-blur);
    border: none;
    box-sizing: border-box;
    min-width: 100%;
    margin: 0;
    white-space: pre;
}

.text-scroll-container {
    flex: 1;
    width: 100%;
    overflow: auto;
    position: relative;
    display: flex;
    /* To ensure child min-height works */
    flex-direction: column;
}

.encoding-bar {
    padding: 8px 20px;
    background: #252526;
    border-bottom: 1px solid #333;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    flex-shrink: 0;
}

.encoding-select {
    background: #333;
    color: #eee;
    border: 1px solid #444;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
}


.file-media-content.pdf-content {
    padding: 0;
}

.file-generic-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: #aaa;
    height: 100%;
}

.file-generic-icon {
    width: 64px;
    height: 64px;
    color: #555;
    display: flex;
    justify-content: center;
    align-items: center;
}

.file-generic-icon :deep(svg) {
    width: 100%;
    height: 100%;
    stroke-width: 1;
}

.file-primary-action {
    color: #2ea35f;
    border: 1px solid #2ea35f;
    padding: 8px 24px;
    border-radius: 6px;
    text-decoration: none;
    transition: all 0.2s;
}

.file-primary-action:hover {
    background: rgba(46, 163, 95, 0.1);
}

.fp-unsupported {
    color: var(--text-secondary);
    font-size: 0.95rem;
}

.fp-truncated {
    background: var(--accent-color);
    color: var(--accent-contrast, #fff);
    padding: 0 6px;
    border-radius: 4px;
    margin-left: 6px;
}
</style>
