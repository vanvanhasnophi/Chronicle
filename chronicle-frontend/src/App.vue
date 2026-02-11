<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute ,useRouter } from 'vue-router'
import { Icons } from './utils/icons'
import FilePreviewModal from './components/FilePreviewModal.vue'
import ImagePreviewModal from './components/ImagePreviewModal.vue'

const route = useRoute()
const router = useRouter()
const isBackend = computed(() => {
    return ['/manage', '/files', '/security'].some(p => route.path.startsWith(p))
})

const isScrolled = ref(false)
const isMenuOpen = ref(false)

const handleScroll = (e: Event) => {
    const target = e.target as HTMLElement
    // User requested ~30px
    isScrolled.value = target.scrollTop > 30
}

watch(route, () => {
    isMenuOpen.value = false
})
</script>

<template>
  <div id="app">
    <nav class="nav-header" 
         v-if="route.path !== '/editor' && route.path !== '/login'"
         :class="{ 'at-top': !isScrolled }"
    >
      <div class="nav-content">
        <div @click="router.push('/')" style="cursor: pointer !important;">
          <h1 class="app-title" >Chronicle</h1>
        </div>

        <!-- Mobile Menu Toggle -->
        <button class="menu-toggle" @click="isMenuOpen = !isMenuOpen" v-html="isMenuOpen ? Icons.cross : Icons.menu"></button>
        
        <!-- Frontend Nav -->
        <div class="nav-links" :class="{ 'mobile-open': isMenuOpen }" v-if="!isBackend">
          <RouterLink to="/" class="nav-link">Home</RouterLink>
          <RouterLink to="/blogs" class="nav-link">Blogs</RouterLink>
          <RouterLink to="/search" class="nav-link">Search</RouterLink>
          <RouterLink to="/friends" class="nav-link">Friends</RouterLink>
        </div>

        <!-- Backend Nav -->
        <div class="nav-links" :class="{ 'mobile-open': isMenuOpen }" v-else>
          <RouterLink to="/manage" class="nav-link">Posts</RouterLink>
          <RouterLink to="/files" class="nav-link">Files</RouterLink>
          <RouterLink to="/security" class="nav-link">Security</RouterLink>
          <a href="/editor?id=new" target="_blank" class="nav-link new-post-btn">New Post</a>
        </div>
      </div>
    </nav>
    <main class="main-content" 
        :class="{ 'no-nav': route.path === '/editor' }"
        @scroll="handleScroll"
    >
      <RouterView />
    </main>
    <FilePreviewModal />
    <ImagePreviewModal />
  </div>
</template>

<style scoped>
#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.nav-header {
  background: rgba(45, 45, 48, 0.8);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(62, 62, 66, 0.5);
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  height: 70px;
  box-sizing: border-box;
  transition: background 0.3s ease, border-color 0.3s ease, backdrop-filter 0.3s ease;
}

.nav-header.at-top {
    background: transparent;
    border-bottom-color: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
}

.nav-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 2rem;
  height: 100%;
  max-width: 1200px;
  margin: 0 auto;
}

.app-title {
  color: #ffffff;
  margin: 0;
  font-size: 1.6rem;
}

.menu-toggle {
    display: none;
    background: transparent;
    border: none;
    color: #fff;
    cursor: pointer;
    padding: 8px;
    z-index: 102; /* Higher than nav-content */
}

.nav-links {
  display: flex;
  gap: 2rem;
}

@media (max-width: 768px) {
    .menu-toggle {
        display: block;
    }
    
    .nav-links {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        height: 100vh;
        background: #1e1e1e; /* Solid background for menu */
        flex-direction: column;
        justify-content: center;
        align-items: center;
        transform: translateY(-100%);
        transition: transform 0.3s ease;
        z-index: 101; /* Behind toggle, above content */
        gap: 30px;
    }

    .nav-links.mobile-open {
        transform: translateY(0);
    }

    .nav-link {
        font-size: 1.5em;
    }
}

.nav-link {
  color: #a9a9a9;
  text-decoration: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  transition: all 0.3s ease;
}

.nav-link.router-link-active {
  background: rgba(128,128,128, 0.2);
  color: #ffffff;
}

.new-post-btn {
    background: #2ea35f;
    color: white !important;
    font-weight: 600;
}
.new-post-btn:hover {
    background: #24804a !important;
}

.nav-link:hover {
  background: #3c3c3c;
  color: #ffffff;
}


.main-content {
  flex: 1;
  overflow-y: auto; /* Changed to auto to allow scrolling under nav */
  overflow-x: hidden;
  padding-top: 70px; /* Use padding instead of margin */
  height: 100vh;
  box-sizing: border-box;
}

.main-content.no-nav {
  padding-top: 0;
  overflow: hidden; /* Restore hidden for editor */
}
</style>
