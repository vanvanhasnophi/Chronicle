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
import TextEditor from '../pages/TextEditor.vue'
import FileManager from '../pages/FileManager.vue'
import BlogList from '../pages/BlogList.vue'
import BlogPost from '../pages/BlogPost.vue'
import PostManager from '../pages/PostManager.vue'
import Search from '../pages/Search.vue'
import Friends from '../pages/Friends.vue'
import Home from '../pages/Home.vue'
import Login from '../pages/Login.vue'
import Security from '../pages/Security.vue'
import Settings from '../pages/Settings.vue'
import SettingsHome from '../pages/settings/SettingsHome.vue'
import SettingsFriends from '../pages/settings/SettingsFriends.vue'
import SettingsI18nFonts from '../pages/settings/SettingsI18nFonts.vue'
import SettingsSecurity from '../pages/settings/SettingsSecurity.vue'

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
    component: TextEditor,
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
