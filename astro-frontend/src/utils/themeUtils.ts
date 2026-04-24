import { hexToRgbString } from './colorUtils';

/**
 * 解析背景元数据
 */
export function parseBackgroundMeta(raw: any) {
  try {
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    return null;
  }
}

/**
 * 写入背景元数据CSS变量
 */
export function writeBackgroundMetaVars(scope: 'frontend' | 'backend', meta: any) {
  if (!meta) return;
  const prefix = scope === 'frontend' ? '--frontend' : '--backend';

  try {
    document.documentElement.style.setProperty(`${prefix}-bg-pos`, `${meta.posX || 50}% ${meta.posY || 50}%`);
    document.documentElement.style.setProperty(`${prefix}-bg-size`, `${meta.size || 100}%`);
    document.documentElement.style.setProperty(`${prefix}-bg-blur`, `${meta.blur || 0}px`);

    const overlayLight = meta.overlayLightColor || meta.overlayColor || 'transparent';
    const overlayLightOpa = (meta.overlayLightOpacity != null) ? ((meta.overlayLightOpacity || 0) / 100) : ((meta.overlayOpacity || 0) / 100);
    const overlayDark = meta.overlayDarkColor || meta.overlayColor || 'transparent';
    const overlayDarkOpa = (meta.overlayDarkOpacity != null) ? ((meta.overlayDarkOpacity || 0) / 100) : ((meta.overlayOpacity || 0) / 100);

    if (overlayLight === 'transparent') {
      document.documentElement.style.setProperty(`${prefix}-bg-overlay-light`, 'transparent');
    } else {
      const rgbL = hexToRgbString(overlayLight);
      document.documentElement.style.setProperty(`${prefix}-bg-overlay-light`, `rgba(${rgbL}, ${overlayLightOpa})`);
    }

    if (overlayDark === 'transparent') {
      document.documentElement.style.setProperty(`${prefix}-bg-overlay-dark`, 'transparent');
    } else {
      const rgbD = hexToRgbString(overlayDark);
      document.documentElement.style.setProperty(`${prefix}-bg-overlay-dark`, `rgba(${rgbD}, ${overlayDarkOpa})`);
    }
  } catch (e) {
    console.error('[themeUtils] Error writing background meta vars:', e);
  }
}

/**
 * 更新已解析的overlay CSS变量
 */
export function updateResolvedOverlays() {
  try {
    // Frontend overlay
    const light = getComputedStyle(document.documentElement).getPropertyValue('--frontend-bg-overlay-light') || '';
    const dark = getComputedStyle(document.documentElement).getPropertyValue('--frontend-bg-overlay-dark') || '';
    let chosen = '';
    const dt = document.documentElement.getAttribute('data-theme');

    if (dt === 'light') {
      chosen = light;
    } else if (dt === 'dark') {
      chosen = dark;
    } else {
      try {
        chosen = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? dark : light;
      } catch (e) {
        chosen = light;
      }
    }

    if (chosen && chosen.trim()) {
      document.documentElement.style.setProperty('--frontend-bg-overlay', chosen);
    }

    // 同时更新背景层的overlay元素
    const layer = document.getElementById('chronicle-bg-layer');
    if (layer) {
      const overlayEl = layer.querySelector('.bg-overlay') as HTMLElement | null;
      if (overlayEl) {
        overlayEl.style.background = (chosen && chosen.trim()) ? chosen : 'transparent';
      }
    }
  } catch (e) {
    console.error('[themeUtils] Error updating resolved overlays:', e);
  }
}

/**
 * 应用主题设置
 */
export function applyTheme(theme: string) {
  try {
    if (theme === 'follow' || theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    // 更新resolved overlays
    updateResolvedOverlays();
  } catch (e) {
    console.error('[themeUtils] Error applying theme:', e);
  }
}
