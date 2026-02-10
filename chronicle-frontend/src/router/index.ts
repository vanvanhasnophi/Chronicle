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
    component: Home
  },
  {
    path: '/login',
    name: 'Login',
    component: Login
  },
  {
    path: '/security',
    name: 'Security',
    component: Security,
    meta: { requiresAuth: true }
  },
  {
    path: '/blogs',
    name: 'BlogList',
    component: BlogList
  },
  {
    path: '/post/:id',
    name: 'BlogPost',
    component: BlogPost
  },
  {
    path: '/manage',
    name: 'PostManager',
    component: PostManager,
    meta: { requiresAuth: true }
  },
  {
    path: '/editor',
    name: 'TextEditor',
    component: TextEditor,
    meta: { requiresAuth: true }
  },
  {
    path: '/files',
    name: 'FileManager',
    component: FileManager,
    meta: { requiresAuth: true }
  },
  {
    path: '/search',
    name: 'Search',
    component: Search
  },
  {
    path: '/friends',
    name: 'Friends',
    component: Friends
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

export default router
