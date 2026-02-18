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
// Pages are lazy-loaded per-route so only the visited page is fetched
const Home = () => import(/* webpackChunkName: "home" */ '../pages/Home.vue')
const BlogList = () => import(/* webpackChunkName: "blog-list" */ '../pages/BlogList.vue')
const BlogPost = () => import(/* webpackChunkName: "blog-post" */ '../pages/BlogPost.vue')
const Search = () => import(/* webpackChunkName: "search" */ '../pages/Search.vue')
const Friends = () => import(/* webpackChunkName: "friends" */ '../pages/Friends.vue')
const Login = () => import(/* webpackChunkName: "login" */ '../pages/Login.vue')
// Security backend page lazy-loaded
const Security = () => import(/* webpackChunkName: "security" */ '../pages/Security.vue')

// Backend pages are lazy-loaded so frontend bundle doesn't include admin code
const PostManager = () => import(/* webpackChunkName: "post-manager" */ '../pages/PostManager.vue')
const FileManager = () => import(/* webpackChunkName: "file-manager" */ '../pages/FileManager.vue')
const Settings = () => import(/* webpackChunkName: "settings" */ '../pages/Settings.vue')
const SettingsHome = () => import(/* webpackChunkName: "settings-home" */ '../pages/settings/SettingsHome.vue')
const SettingsFriends = () => import(/* webpackChunkName: "settings-friends" */ '../pages/settings/SettingsFriends.vue')
const SettingsI18nFonts = () => import(/* webpackChunkName: "settings-i18n" */ '../pages/settings/SettingsI18nFonts.vue')
const SettingsSecurity = () => import(/* webpackChunkName: "settings-security" */ '../pages/settings/SettingsSecurity.vue')
const TextEditorLazy = () => import(/* webpackChunkName: "text-editor" */ '../pages/TextEditor.vue')

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home,
    meta: { title: 'home.title' }
  },
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { title: 'login.title' }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: Settings,
    meta: { requiresAuth: true, title: 'settings.home' },
    children: [
      { path: 'homepage', name: 'SettingsHome', component: SettingsHome, meta: { title: 'settings.home' } },
      { path: 'friends', name: 'SettingsFriends', component: SettingsFriends, meta: { title: 'settings.friends' } },
      { path: 'i18n', name: 'SettingsI18n', component: SettingsI18nFonts, meta: { title: 'settings.i18n' } },
      { path: 'security', name: 'SettingsSecurity', component: SettingsSecurity, meta: { requiresAuth: true, title: 'settings.security' } }
    ]
  },
  {
    path: '/security',
    redirect: '/settings/security'
  },
  {
    path: '/blogs',
    name: 'BlogList',
    component: BlogList,
    meta: { title: 'nav.blogs' }
  },
  {
    path: '/post/:id',
    name: 'BlogPost',
    component: BlogPost
    // Title set dynamically in component
  },
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
    meta: { requiresAuth: true, title: 'editor.createNewPost' }
  },
  {
    path: '/files',
    name: 'FileManager',
    component: FileManager,
    meta: { requiresAuth: true, title: 'file.library' }
  },
  {
    path: '/search',
    name: 'Search',
    component: Search,
    meta: { title: 'nav.search' }
  },
  {
    path: '/friends',
    name: 'Friends',
    component: Friends,
    meta: { title: 'friends.title' }
  }
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
      appName = 'Workdown - Chronicle'
  }

  if (to.name === 'Home') {
      document.title = 'Chronicle'
  } else if (to.meta && to.meta.title) {
    const titleText = resolveMessage(String(to.meta.title))
    document.title = `${titleText} - ${appName}`
  } else if (to.name !== 'BlogPost') {
    // Default fallback if no title set and not a dynamic page handled elsewhere
    document.title = appName
  }
})

export default router
