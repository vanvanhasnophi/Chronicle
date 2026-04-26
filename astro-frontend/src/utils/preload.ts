/**
 * 智能预加载系统
 * 在当前页面加载完毕后，异步并行预加载其他可见链接的页面
 */

// 预加载缓存，避免重复加载
const preloadedUrls = new Set<string>();

// 页面类型定义
interface PageInfo {
  url: string;
  priority: number;
  type: 'nav' | 'content';
}

/**
 * 获取当前页面的预加载目标
 */
function getPreloadTargets(): PageInfo[] {
  const currentPath = window.location.pathname;
  const targets: PageInfo[] = [];
  
  // 获取所有可见的导航链接
  const navLinks = document.querySelectorAll('nav a[href], header a[href], footer a[href]');
  
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href && href.startsWith('/') && !href.startsWith('//')) {
      // 排除帖子详情页
      if (!href.startsWith('/blog/') || href === '/blog') {
        // 在生产环境中使用绝对URL
        const absoluteUrl = window.location.origin + href;
        targets.push({
          url: absoluteUrl,
          priority: 1,
          type: 'nav'
        });
      }
    }
  });
  
  // 获取内容区域的重要链接（比如搜索结果中的链接）
  const contentLinks = document.querySelectorAll('.results-list a[href], .post-list a[href]');
  
  contentLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href && href.startsWith('/') && !href.startsWith('//')) {
      // 排除帖子详情页
      if (!href.startsWith('/blog/') || href === '/blog') {
        // 在生产环境中使用绝对URL
        const absoluteUrl = window.location.origin + href;
        targets.push({
          url: absoluteUrl,
          priority: 2,
          type: 'content'
        });
      }
    }
  });
  
  // 去重并排序（优先级高的先加载）
  return Array.from(new Map(targets.map(item => [item.url, item])).values())
    .sort((a, b) => b.priority - a.priority);
}

/**
 * 预加载单个页面
 */
function preloadPage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (preloadedUrls.has(url)) {
      resolve(true);
      return;
    }
    
    preloadedUrls.add(url);
    
    // 使用GET请求预加载，获取完整的响应体
    fetch(url, {
      method: 'GET',
      cache: 'force-cache',
      priority: 'low',
      headers: {
        'X-Preload': 'true' // 添加预加载标识，后端可以识别
      }
    })
    .then(response => {
      if (response.ok) {
        // 读取响应体以确保内容被缓存
        return response.text().then(() => {
          console.log(`[Preload] Successfully preloaded: ${url}`);
          resolve(true);
        });
      } else {
        console.warn(`[Preload] Failed to preload ${url}: ${response.status}`);
        resolve(false);
      }
    })
    .catch(error => {
      console.warn(`[Preload] Failed to preload ${url}:`, error);
      resolve(false);
    });
  });
}

/**
 * 批量预加载页面
 */
async function preloadPages(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  
  console.log(`[Preload] Starting preload for ${urls.length} pages`);
  
  // 并行预加载，限制并发数避免性能问题
  const concurrencyLimit = 3;
  const batches = [];
  
  for (let i = 0; i < urls.length; i += concurrencyLimit) {
    batches.push(urls.slice(i, i + concurrencyLimit));
  }
  
  for (const batch of batches) {
    await Promise.allSettled(
      batch.map(url => preloadPage(url))
    );
    
    // 批次之间短暂延迟，避免阻塞主线程
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`[Preload] Completed preloading ${urls.length} pages`);
}

/**
 * 执行智能预加载
 */
function executeSmartPreload(): void {
  // 等待页面完全加载
  if (document.readyState !== 'complete') {
    window.addEventListener('load', () => {
      setTimeout(executeSmartPreload, 100);
    });
    return;
  }
  
  // 延迟执行，确保不影响首屏加载
  setTimeout(() => {
    const targets = getPreloadTargets();
    const urls = targets.map(t => t.url);
    
    if (urls.length > 0) {
      console.log(`[Preload] Found ${urls.length} pages to preload`);
      
      // 异步执行预加载，不阻塞主线程
      preloadPages(urls).catch(error => {
        console.error('[Preload] Preload error:', error);
      });
    } else {
      console.log('[Preload] No pages to preload');
    }
  }, 2000); // 页面加载完成后2秒开始预加载
}

/**
 * 初始化预加载系统
 */
function initPreloadSystem(): void {
  // 避免在移动设备上过度预加载
  if (window.innerWidth < 768) {
    console.log('[Preload] Skipping preload on mobile device');
    return;
  }
  
  // 开发环境仍然可以预加载，但使用不同的策略
  const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  if (isDevelopment) {
    console.log('[Preload] Running in development environment');
  } else {
    console.log('[Preload] Running in production environment');
  }
  
  executeSmartPreload();
}

// 导出函数
export {
  initPreloadSystem,
  executeSmartPreload,
  preloadPage,
  preloadPages,
  getPreloadTargets
};