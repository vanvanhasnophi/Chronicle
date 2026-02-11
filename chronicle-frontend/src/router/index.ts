import { createRouter, createWebHistory } from 'vue-router'
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

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home,
    meta: { title: 'Home' }
  },
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { title: 'Login' }
  },
  {
    path: '/security',
    name: 'Security',
    component: Security,
    meta: { requiresAuth: true, title: 'Security' }
  },
  {
    path: '/blogs',
    name: 'BlogList',
    component: BlogList,
    meta: { title: 'Blogs' }
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
    meta: { requiresAuth: true, title: 'Manage Posts' }
  },
  {
    path: '/editor',
    name: 'TextEditor',
    component: TextEditor,
    meta: { requiresAuth: true, title: 'Editor' }
  },
  {
    path: '/files',
    name: 'FileManager',
    component: FileManager,
    meta: { requiresAuth: true, title: 'Files' }
  },
  {
    path: '/search',
    name: 'Search',
    component: Search,
    meta: { title: 'Search' }
  },
  {
    path: '/friends',
    name: 'Friends',
    component: Friends,
    meta: { title: 'Friends' }
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
  
  // Distinguish Management and Editor
  if (to.path.startsWith('/manage') || to.path.startsWith('/files') || to.path.startsWith('/security')) {
      appName = 'Chronicle Manager'
  } else if (to.path.startsWith('/editor')) {
      appName = 'Md Editor'
  }

  if (to.name === 'Home') {
      document.title = 'Chronicle'
  } else if (to.meta && to.meta.title) {
    document.title = `${to.meta.title} - ${appName}`
  } else if (to.name !== 'BlogPost') {
    // Default fallback if no title set and not a dynamic page handled elsewhere
    document.title = appName
  }
})

export default router
