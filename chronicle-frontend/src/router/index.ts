import { createRouter, createWebHistory } from 'vue-router'
// Import locale messages so we can translate route meta titles without
// depending on the app instance. We pick locale from localStorage or navigator.
import en from '../locales/en.json'
import zh from '../locales/zh-CN.json'

const messages: Record<string, any> = { en, 'zh-CN': zh }

function getLocale() {
  const stored = localStorage.getItem('locale')
  if (stored) return stored
  const nav = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'en'
  return nav.startsWith('zh') ? 'zh-CN' : 'en'
}

function resolveMessage(key: string) {
  try {
    const locale = getLocale()
    const parts = key.split('.')
    let cur: any = messages[locale] || messages['en']
    for (const p of parts) {
      if (!cur) return key
      cur = cur[p]
    }
    return (typeof cur === 'string') ? cur : key
  } catch (e) {
    return key
  }
}
// 前台内容页面已弃用（主页、帖子列表、帖子详情、搜索、朋友页）
// 为避免打包和路由暴露，这些路由在路由表中重定向到后台登录。
const Login = () => import(/* webpackChunkName: "login" */ '../pages/Login.vue')
// Security backend page lazy-loaded
const Security = () => import(/* webpackChunkName: "security" */ '../pages/Security.vue')

// Backend pages are lazy-loaded so frontend bundle doesn't include admin code
const PostManager = () => import(/* webpackChunkName: "post-manager" */ '../pages/PostManager.vue')
const FileManager = () => import(/* webpackChunkName: "file-manager" */ '../pages/FileManager.vue')
const Dashboard = () => import(/* webpackChunkName: "dashboard" */ '../pages/Dashboard.vue')
const Traffic = () => import(/* webpackChunkName: "traffic" */ '../pages/Traffic.vue')
const Settings = () => import(/* webpackChunkName: "settings" */ '../pages/Settings.vue')
const SettingsHome = () => import(/* webpackChunkName: "settings-home" */ '../pages/SettingsHome.vue')
const SettingsCollection = () => import(/* webpackChunkName: "settings-collection" */ '../pages/SettingsCollection.vue')
const SettingsFriends = () => import(/* webpackChunkName: "settings-friends" */ '../pages/SettingsFriends.vue')
const SettingsAbout = () => import(/* webpackChunkName: "settings-about" */ '../pages/SettingsAbout.vue')
const SettingsAppearance = () => import(/* webpackChunkName: "settings-appearance" */ '../pages/settings/SettingsAppearance.vue')
const SettingsFeatures = () => import(/* webpackChunkName: "settings-features" */ '../pages/settings/SettingsFeatures.vue')
const SettingsSecurity = () => import(/* webpackChunkName: "settings-security" */ '../pages/settings/SettingsSecurity.vue')
const TextEditorLazy = () => import(/* webpackChunkName: "text-editor" */ '../pages/TextEditor.vue')
const EditorPrintPreview = () => import(/* webpackChunkName: "editor-print-preview" */ '../pages/EditorPrintPreview.vue')

const routes = [
  { path: '/', redirect: '/dashboard' },
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { title: 'login.title' }
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: Dashboard,
    meta: { requiresAuth: true, title: 'nav.dashboard' }
  },
  {
    path: '/traffic',
    name: 'Traffic',
    component: Traffic,
    meta: { requiresAuth: true, title: 'nav.traffic' }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: Settings,
    meta: { requiresAuth: true, title: 'settings.home' },
    children: [
      { path: 'homepage', name: 'SettingsHome', component: SettingsHome, meta: { requiresAuth: true, title: 'settings.home' } },
      { path: 'collection', name: 'SettingsCollection', component: SettingsCollection, meta: { requiresAuth: true, title: 'settings.collection' } },
      { path: 'friends', name: 'SettingsFriends', component: SettingsFriends, meta: { requiresAuth: true, title: 'settings.friends' } },
      { path: 'about', name: 'SettingsAbout', component: SettingsAbout, meta: { requiresAuth: true, title: 'settings.about' } },
      { path: 'i18n', redirect: 'appearance' },
      { path: 'appearance', name: 'SettingsAppearance', component: SettingsAppearance, meta: { requiresAuth: true, title: 'settings.appearance' } },
      { path: 'features', name: 'SettingsFeatures', component: SettingsFeatures, meta: { requiresAuth: true, title: 'settings.features' } },
      { path: 'security', name: 'SettingsSecurity', component: SettingsSecurity, meta: { requiresAuth: true, title: 'settings.security' } },
      { path: 'build', name: 'SettingsBuild', component: () => import(/* webpackChunkName: "settings-build" */ '../pages/SettingsBuild.vue'), meta: { requiresAuth: true, title: 'settings.build' } }
    ]
  },
  {
    path: '/security',
    redirect: '/settings/security'
  },
  { path: '/blogs', redirect: '/login' },
  { path: '/post/:id', redirect: '/login' },
  {
    path: '/manage',
    name: 'PostManager',
    component: PostManager,
    meta: { requiresAuth: true, title: 'post.manageTitle' }
  },
  {
    path: '/editor',
    name: 'TextEditor',
    component: TextEditorLazy,
    meta: { title: 'editor.createNewPost' }
  },
  {
    path: '/editor/print',
    name: 'EditorPrintPreview',
    component: EditorPrintPreview,
    meta: { title: 'editor.print' }
  },
  {
    path: '/files',
    name: 'FileManager',
    component: FileManager,
    meta: { requiresAuth: true, title: 'file.library' }
  },
  { path: '/search', redirect: '/login' },
  { path: '/friends', redirect: '/login' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const authRecord = localStorage.getItem('chronicle_auth')
  let isAuthenticated = false

  if (authRecord) {
    try {
      const session = JSON.parse(authRecord)
      if (session.expiry > Date.now()) {
        isAuthenticated = true
      } else {
        localStorage.removeItem('chronicle_auth')
      }
    } catch(e) {
      if (authRecord === 'true') {
        // Legacy support (user just logged in before update) - Migrate or just allow once
        isAuthenticated = true 
      }
    }
  }

  // 处理根路径：已认证跳转到dashboard，未认证跳转到login
  if (to.path === '/') {
    if (isAuthenticated) {
      next('/dashboard')
    } else {
      next('/login')
    }
    return
  }

  // 其他需要认证的页面
  if (to.meta.requiresAuth && !isAuthenticated) {
    next('/login')
  } else {
    next()
  }
})

router.afterEach((to) => {
  let appName = 'Chronicle'

  // Distinguish Management and Editor for suffixing
  if (to.path.startsWith('/manage') || to.path.startsWith('/files') || to.path.startsWith('/security') || to.path.startsWith('/settings')) {
      appName = 'Chronicle Manager'
  } else if (to.path.startsWith('/editor')) {
      appName = 'Chronicle Workdown'
  }

  if (to.name === 'Home') {
      document.title = 'Chronicle'
  } else if (to.meta && to.meta.title) {
    const titleText = resolveMessage(String(to.meta.title))
    document.title = `${titleText} - ${appName}`
  } else {
    // Default fallback if no title set. For dynamic pages like BlogPost
    // the component will overwrite document.title once data is ready,
    // but we should avoid leaving the previous route's title visible.
    document.title = appName
  }

  // Google Analytics page_view for SPA backend routes
  try {
    const settings = (window as any).__CHRONICLE_SETTINGS__ || {};
    const trafficEnabled = settings?.featureFlags?.traffic !== false;
    if (trafficEnabled && typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'page_view', { page_path: to.fullPath || to.path, page_title: document.title });
    }
  } catch (e) {
    // fail silently
  }
})

export default router