// Lightweight lazy loader for FilePreviewModal
let mounted = false;
let api = null;

async function ensureMounted() {
  if (mounted) return api;
  mounted = true;
  // Dynamically import Vue and the component
  const [{ createApp, h }, module] = await Promise.all([
    import('vue'),
    import('./FilePreviewModal.vue')
  ]);

  const comp = module.default;
  const mountPoint = document.createElement('div');
  mountPoint.id = 'file-preview-mount';
  document.body.appendChild(mountPoint);

  const app = createApp({
    data() { return {} },
    render() { return h(comp, { ref: 'fp' }) }
  });

  const vm = app.mount(mountPoint);
  // window.__filePreviewApi will be set to an object with open/close
  api = {
    open(opts) {
      try {
        const fp = vm.$refs.fp;
        if (fp && typeof fp.open === 'function') fp.open(opts);
      } catch (e) { console.error('fp open failed', e); }
    },
    close() {
      try { const fp = vm.$refs.fp; if (fp && typeof fp.close === 'function') fp.close(); } catch (e) {}
    }
  };
  // expose for debugging
  window.__filePreviewApi = api;
  return api;
}

async function detectTypeByHints(url, hinted) {
  // precompute extension
  const ext = (url.split('?')[0].split('#')[0].match(/\.([0-9a-z]+)$/i) || [])[1] || '';

  function mapType(s) {
    if (!s) return null;
    const v = String(s).trim().toLowerCase();
    // keep 'document' as its own hint so we can inspect extension
    if (v === 'document') return 'document';
    if (v === 'file' || v === 'other') return 'file';
    if (v === 'text' || v === 'txt' || v === 'markdown' || v === 'md') return 'text';
    if (v === 'audio') return 'audio';
    if (v === 'video') return 'video';
    if (v === 'pdf') return 'pdf';
    return null;
  }

  // 1) use hinted type if maps
  const hintedMap = mapType(hinted);
  if (hintedMap) {
    // special-case: if hinted as 'document' but extension is pdf, treat as pdf
    if (hintedMap === 'document') {
      if (/^pdf$/i.test(ext)) return 'pdf';
      return 'file';
    }
    return hintedMap;
  }

  // 2) derive from extension
  try {
    const audioRe = /^(mp3|wav|ogg|m4a|flac|aac)$/i;
    const videoRe = /^(mp4|webm|mkv|mov|avi)$/i;
    const pdfRe = /^(pdf)$/i;
    const textRe = /^(txt|md|markdown|log|csv|json|xml|html|htm|css|js|ts|py|java|sh|ini|conf|yaml|yml)$/i;

    if (audioRe.test(ext)) return 'audio';
    if (videoRe.test(ext)) return 'video';
    if (pdfRe.test(ext)) return 'pdf';
    if (textRe.test(ext)) return 'text';
  } catch (e) {
    // ignore and try network probe
  }

  // 3) network probe: try HEAD for content-type, fallback to Range GET
  try {
    let res = null;
    try {
      res = await fetch(url, { method: 'HEAD' });
    } catch (headErr) {
      try {
        res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-1023' } });
      } catch (getErr) {
        res = null;
      }
    }

    if (res && res.headers) {
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.startsWith('audio/')) return 'audio';
      if (ct.startsWith('video/')) return 'video';
      if (ct.includes('pdf')) return 'pdf';
      if (ct.startsWith('text/') || ct.includes('json') || ct.includes('xml') || ct.includes('csv') || ct.includes('html') || ct.includes('javascript')) return 'text';
    }
  } catch (e) {
    // network probe failed, fallthrough
  }

  // default fallback
  return 'file';
}

function onClick(e) {
  const el = e.target.closest && e.target.closest('.file-card');
  if (!el) return;
  // If the file-card is an anchor, allow native navigation (mailto/http links)
  if (el.tagName === 'A') return;
  e.preventDefault();
  const url = el.getAttribute('data-url') || el.dataset.url || '';
  const name = el.getAttribute('data-name') || el.dataset.name || '';
  const hinted = el.getAttribute('data-type') || el.dataset.type || '';

  (async () => {
    let type = await detectTypeByHints(url, hinted);
    try { type = String(type || '').trim().toLowerCase(); } catch (e) { type = 'file'; }
    if (type === 'document') type = 'file';
    const mountedApi = await ensureMounted();
    if (mountedApi && typeof mountedApi.open === 'function') mountedApi.open({ url, title: name, type });
  })();
}

if (typeof window !== 'undefined') {
  // delegate clicks to document, but keep handler small
  document.addEventListener('click', onClick, { capture: false });
}
