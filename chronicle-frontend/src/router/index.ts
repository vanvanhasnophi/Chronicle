import { createRouter, createWebHistory } from 'vue-router'
import TextEditor from '../pages/TextEditor.vue'
import HelloWorld from '../components/HelloWorld.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: HelloWorld
  },
  {
    path: '/editor',
    name: 'TextEditor',
    component: TextEditor
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
