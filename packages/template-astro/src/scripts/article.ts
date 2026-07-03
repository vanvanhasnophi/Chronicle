/**
 * Article page interactive features.
 * Extracted from inline script to defer parsing and enable caching.
 *
 * Features: code copy, image viewer, Mermaid code block interactions.
 */

// ── Page lifecycle scope ──────────────────────────────────
interface ScopeEntry { t: EventTarget; ev: string; fn: EventListener; opts?: any }
let scope: { destroy(): void } | null = null;

function createScope() {
  const listeners: ScopeEntry[] = [];
  const bodyNodes: HTMLElement[] = [];
  return {
    on(ev: string, fn: EventListener, opts?: any) {
      document.addEventListener(ev, fn, opts);
      listeners.push({ t: document, ev, fn, opts });
    },
    onEl(el: EventTarget, ev: string, fn: EventListener, opts?: any) {
      el.addEventListener(ev, fn, opts);
      listeners.push({ t: el, ev, fn, opts });
    },
    toBody(el: HTMLElement) {
      document.body.appendChild(el);
      bodyNodes.push(el);
    },
    destroy() {
      listeners.forEach(l => l.t.removeEventListener(l.ev, l.fn, l.opts));
      listeners.length = 0;
      bodyNodes.forEach(el => el.remove());
      bodyNodes.length = 0;
    },
  };
}

// ── Code copy ─────────────────────────────────────────────
function showCopyInProgress(button: HTMLElement) {
  const copyIcon = button.querySelector('.copy-icon') as HTMLElement;
  if (copyIcon) copyIcon.style.opacity = '0.4';
  button.classList.add('copying');
}

function clearCopyInProgress(button: HTMLElement) {
  const copyIcon = button.querySelector('.copy-icon') as HTMLElement;
  if (copyIcon) copyIcon.style.opacity = '';
  button.classList.remove('copying');
}

function showCopySuccess(button: HTMLElement) {
  const copyIcon = button.querySelector('.copy-icon') as HTMLElement;
  const successIcon = button.querySelector('.success-icon') as HTMLElement;
  if (copyIcon) copyIcon.style.display = 'none';
  if (successIcon) successIcon.style.display = 'block';
  button.classList.add('success');
  setTimeout(() => {
    if (copyIcon) copyIcon.style.display = 'block';
    if (successIcon) successIcon.style.display = 'none';
    button.classList.remove('success');
  }, 1500);
}

function tryFallbackCopy(button: HTMLElement, code: string) {
  const textArea = document.createElement('textarea');
  textArea.value = code;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();
  try {
    const successful = document.execCommand('copy');
    if (successful) {
      clearCopyInProgress(button);
      showCopySuccess(button);
    } else {
      clearCopyInProgress(button);
      console.error('Fallback copy failed');
    }
  } catch (backupErr) {
    clearCopyInProgress(button);
    console.error('复制失败:', backupErr);
  } finally {
    document.body.removeChild(textArea);
  }
}

function copyCode(button: HTMLElement) {
  const code = button.getAttribute('data-code');
  if (!code) return;
  showCopyInProgress(button);
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(code).then(() => {
      clearCopyInProgress(button);
      showCopySuccess(button);
    }).catch(() => {
      tryFallbackCopy(button, code);
    });
    return;
  }
  tryFallbackCopy(button, code);
}

// ── Mermaid UI helpers ────────────────────────────────────
interface MermaidUiText {
  downloadSvg: string;
  split: string;
  code: string;
  preview: string;
  notPrerendered: string;
}

function getMermaidUiText(): MermaidUiText {
  const fallback: MermaidUiText = {
    downloadSvg: 'Download SVG',
    split: 'Split View',
    code: 'Code Only',
    preview: 'Preview Only',
    notPrerendered: 'No prerendered Mermaid SVG found.',
  };
  try {
    const el = document.querySelector('.post-content') as HTMLElement | null;
    const raw = el?.dataset.mermaidUi;
    if (raw) {
      const ui = JSON.parse(raw);
      return {
        downloadSvg: String(ui.downloadSvg || fallback.downloadSvg),
        split: String(ui.split || fallback.split),
        code: String(ui.code || fallback.code),
        preview: String(ui.preview || fallback.preview),
        notPrerendered: String(ui.notPrerendered || fallback.notPrerendered),
      };
    }
  } catch {}
  return fallback;
}

function initMermaidCodeBlocks() {
  const ui = getMermaidUiText();
  const blocks = document.querySelectorAll('.code-chunk-container.mermaid');
  if (!blocks || blocks.length === 0) return;

  blocks.forEach((block: Element) => {
    if (!(block instanceof HTMLElement)) return;
    if (block.dataset.mermaidEnhanced === '1') return;

    const editorWrapper = block.querySelector('.editor-wrapper') as HTMLElement | null;
    const editorFooter = block.querySelector('.editor-footer') as HTMLElement | null;
    if (!(editorWrapper instanceof HTMLElement)) return;

    const textarea = block.querySelector('.code-textarea') as HTMLTextAreaElement | null;
    const codeText = textarea?.value || '';
    if (!codeText.trim()) return;

    block.dataset.mermaidEnhanced = '1';

    const preview = block.querySelector('.mermaid-preview') as HTMLElement | null;
    const container = preview?.querySelector('.mermaid-container') as HTMLElement | null;
    let downloadBtn = block.querySelector('.mermaid-download-btn') as HTMLElement | null;
    let splitBtn   = block.querySelector('.mermaid-split-btn') as HTMLElement | null;
    let codeBtn    = block.querySelector('.mermaid-code-btn') as HTMLElement | null;
    let previewBtn = block.querySelector('.mermaid-preview-btn') as HTMLElement | null;

    const preSvg = container?.querySelector('svg');
    let lastRenderedSvg: string | null = preSvg ? preSvg.outerHTML : null;
    if (lastRenderedSvg && downloadBtn) (downloadBtn as HTMLButtonElement).disabled = false;

    let mode: 'split' | 'code' | 'preview' = 'preview';

    function setActiveButton() {
      splitBtn?.classList.toggle('active', mode === 'split');
      codeBtn?.classList.toggle('active', mode === 'code');
      previewBtn?.classList.toggle('active', mode === 'preview');
    }

    let mermaidRenderBusy = false;
    async function renderMermaidSvg() {
      if (mode === 'code' || !container) return;
      if (lastRenderedSvg) { container.innerHTML = lastRenderedSvg; return; }
      if (mermaidRenderBusy) return;
      mermaidRenderBusy = true;
      try {
        container.innerHTML = '<div class="mermaid-loading">Rendering…</div>';
        const mm = await import('mermaid');
        const mermaidLib = (mm as any).default || mm;
        mermaidLib.initialize({ startOnLoad: false, theme: 'base' });
        const id = 'mermaid_client_' + Math.random().toString(36).slice(2, 8);
        const { svg } = await mermaidLib.render(id, codeText);
        lastRenderedSvg = svg;
        container.innerHTML = svg;
        if (downloadBtn) (downloadBtn as HTMLButtonElement).disabled = false;
      } catch (e: any) {
        container.innerHTML = '<div class="mermaid-error">Mermaid render error</div>';
      } finally {
        mermaidRenderBusy = false;
      }
    }

    function applyMode(nextMode: 'split' | 'code' | 'preview') {
      mode = nextMode;
      setActiveButton();
      if (editorWrapper) editorWrapper.style.display = (mode === 'preview') ? 'none' : '';
      if (editorFooter) editorFooter.style.display = (mode === 'preview') ? 'none' : '';
      if (preview) preview.style.display = (mode === 'code') ? 'none' : '';
      if (mode !== 'code') {
        renderMermaidSvg();
      }
    }

    splitBtn?.addEventListener('click', () => applyMode('split'));
    codeBtn?.addEventListener('click', () => applyMode('code'));
    previewBtn?.addEventListener('click', () => applyMode('preview'));

    downloadBtn?.addEventListener('click', () => {
      if (!lastRenderedSvg) return;
      try {
        const raw = lastRenderedSvg;
        const parser = new DOMParser();
        const doc = parser.parseFromString(raw, 'image/svg+xml');
        const svgEl = doc.documentElement;

        let defs = svgEl.querySelector('defs');
        if (!defs) {
          defs = doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
          svgEl.insertBefore(defs, svgEl.firstChild);
        }

        try {
          const globalMarker = document.querySelector('marker#chronicle-mermaid-arrow');
          if (globalMarker) {
            const cloned = globalMarker.cloneNode(true);
            const existing = defs.querySelector('#chronicle-mermaid-arrow');
            if (existing) existing.remove();
            defs.appendChild(doc.importNode(cloned, true));
          }
        } catch (e) {}

        try {
          const cs = getComputedStyle(document.documentElement);
          const vars: Record<string, string> = {
            '--component-bg-blur-alt': cs.getPropertyValue('--component-bg-blur-alt') || '#ffffff',
            '--border-color': cs.getPropertyValue('--border-color') || '#e6e6e6',
            '--text-primary': cs.getPropertyValue('--text-primary') || '#111111',
            '--component-text-primary': cs.getPropertyValue('--component-text-primary') || '#111111',
          };
          const styleContent = [
            `svg { background: ${vars['--component-bg-blur-alt']}; }`,
            `rect { fill: ${vars['--component-bg-blur-alt']}; stroke: ${vars['--text-primary']}; }`,
            `path { stroke: ${vars['--component-text-primary']}; fill: none; }`,
            `text { fill: ${vars['--component-text-primary']}; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Arial, sans-serif; }`,
          ].join('\n');
          const prevStyle = svgEl.querySelector('style[data-chronicle-inline]');
          if (prevStyle) prevStyle.remove();
          const styleEl = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
          styleEl.setAttribute('data-chronicle-inline', '1');
          styleEl.textContent = styleContent;
          svgEl.insertBefore(styleEl, svgEl.firstChild);
        } catch (e) {}

        const serializer = new XMLSerializer();
        const outSvg = serializer.serializeToString(svgEl);
        const blob = new Blob([outSvg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mermaid-' + Date.now() + '.svg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        const blob = new Blob([lastRenderedSvg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mermaid-' + Date.now() + '.svg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    });

    if (!lastRenderedSvg && downloadBtn) (downloadBtn as HTMLButtonElement).disabled = true;
    applyMode('preview');
  });
}

// ── Image viewer ──────────────────────────────────────────
function setupImageViewer() {
  const globalState = window as any;

  if (!globalState.__CHRONICLE_IMAGE_CLICK_HANDLER_BOUND__) {
    globalState.__CHRONICLE_IMAGE_CLICK_HANDLER_BOUND__ = true;
    const imageClickHandler = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const img = target?.closest ? target.closest('img.md-image') as HTMLImageElement | null : null;
      if (!img) return;
      const hook = globalState.__CHRONICLE_OPEN_IMAGE_VIEWER__;
      if (typeof hook === 'function') {
        event.preventDefault();
        event.stopPropagation();
        hook({ src: img.src, alt: img.alt || '', element: img });
      }
    };
    scope!.on('click', imageClickHandler, { capture: true });
  }

  if (!globalState.__CHRONICLE_OPEN_IMAGE_VIEWER__) {
    globalState.__CHRONICLE_OPEN_IMAGE_VIEWER__ = function (info: { src: string; alt: string; element: HTMLImageElement }) {
      const existing = document.querySelector('.image-preview-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.className = 'image-preview-overlay';

      const actions = document.createElement('div');
      actions.className = 'preview-header-actions';
      actions.style.cssText = 'position:fixed;top:30px;right:30px;z-index:20002';

      const downloadBtn = document.createElement('a');
      downloadBtn.className = 'preview-action-btn';
      downloadBtn.href = info.src;
      downloadBtn.download = '';
      downloadBtn.target = '_blank';
      downloadBtn.title = 'Download';
      downloadBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'preview-action-btn';
      closeBtn.title = 'Close';
      closeBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

      actions.appendChild(downloadBtn);
      actions.appendChild(closeBtn);
      overlay.appendChild(actions);

      const container = document.createElement('div');
      container.className = 'image-preview-container';

      const img = document.createElement('img');
      img.src = info.src;
      img.alt = info.alt;
      img.draggable = false;
      img.className = 'image-preview-content';

      let scale = 1, x = 0, y = 0, dragging = false, startX = 0, startY = 0;

      img.addEventListener('dragstart', e => e.preventDefault());

      function apply() {
        img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      }

      overlay.addEventListener('wheel', e => {
        e.preventDefault();
        scale = Math.min(Math.max(0.5, scale * (e.deltaY > 0 ? 0.9 : 1.1)), 5);
        apply();
      });

      overlay.addEventListener('mousedown', e => {
        if (e.target === img || e.target === container) {
          dragging = true;
          startX = e.clientX - x;
          startY = e.clientY - y;
          img.classList.add('is-dragging');
        }
      });

      window.addEventListener('mousemove', e => {
        if (!dragging) return;
        x = e.clientX - startX;
        y = e.clientY - startY;
        apply();
      });

      window.addEventListener('mouseup', () => {
        dragging = false;
        img.classList.remove('is-dragging');
      });

      function close() {
        overlay.remove();
        document.removeEventListener('keydown', onEsc);
      }

      function onEsc(e: KeyboardEvent) {
        if (e.key === 'Escape') close();
      }
      scope!.on('keydown', onEsc);

      closeBtn.addEventListener('click', close);
      overlay.addEventListener('click', e => {
        if (e.target === overlay) close();
      });

      container.appendChild(img);
      overlay.appendChild(container);
      scope!.toBody(overlay);
    };
  }
}

// ── Init ──────────────────────────────────────────────────
function initPostPageFeatures() {
  if (scope) scope.destroy();
  scope = createScope();

  import('../utils/mathTooltip').then(({ initMathTooltip }) => {
    initMathTooltip(document.querySelector('.post-content'));
  }).catch((err) => {
    console.error('初始化数学公式 tooltip 失败:', err);
  });

  initMermaidCodeBlocks();

  // Reset copy buttons
  const copyButtons = document.querySelectorAll('.copy-btn');
  copyButtons.forEach(button => {
    const copyIcon = button.querySelector('.copy-icon') as HTMLElement;
    const successIcon = button.querySelector('.success-icon') as HTMLElement;
    if (copyIcon) copyIcon.style.display = 'block';
    if (successIcon) successIcon.style.display = 'none';
  });

  copyButtons.forEach(button => {
    (button as HTMLElement).removeEventListener('click', (button as any).__copyHandler__);
    const handler = (e: Event) => {
      e.stopPropagation();
      copyCode(button as HTMLElement);
    };
    (button as any).__copyHandler__ = handler;
    (button as HTMLElement).addEventListener('click', handler);
  });

  setupImageViewer();
}

// ── Bootstrap ─────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPostPageFeatures, { once: true });
} else {
  initPostPageFeatures();
}

document.addEventListener('astro:page-load', () => {
  if (scope) scope.destroy();
  initPostPageFeatures();
});

document.addEventListener('astro:before-swap', () => {
  if (scope) { scope.destroy(); scope = null; }
});
