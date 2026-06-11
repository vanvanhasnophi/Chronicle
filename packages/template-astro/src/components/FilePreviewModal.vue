<template>
    <div v-if="visible" class="file-preview-overlay" @click.self="close">
        <div class="file-preview-container">
            <header class="file-preview-header">
                <h3 class="file-preview-title">{{ title }}</h3>
                <div class="preview-header-actions">
                    <select v-if="type === 'text'" class="encoding-select" v-model="selectedEncoding" @change="loadText" title="Change text encoding">
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
import '@chronicle/shared/src/styles/chronicle-markdown.css'
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

