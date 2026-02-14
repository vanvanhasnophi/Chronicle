<template>
  <div class="settings-page">
    <aside class="settings-nav">
      <router-link to="/settings/homepage">{{ $t('settings.home') }}</router-link>
      <router-link to="/settings/friends">{{ $t('settings.friends') }}</router-link>
      <router-link to="/settings/i18n">{{ $t('settings.i18n') }}</router-link>
      <router-link to="/settings/security">{{ $t('settings.security') }}</router-link>
    </aside>

    <main class="settings-content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.settings-page { display:flex; gap:1rem; padding:1.5rem; }
.settings-nav { width:220px; display:flex; flex-direction:column; gap:0.5rem; position:sticky; top:86px; align-self:flex-start; padding:0.6rem; border-radius:8px; background:var(--bg-secondary); box-shadow: 0 8px 20px rgba(0,0,0,0.25); border:1px solid var(--border-color); }
.settings-nav a { padding:0.6rem 0.8rem; border-radius:6px; color:var(--text-primary); background:transparent; text-decoration:none }
.settings-nav a.router-link-active { background:var(--accent); color:var(--text-on-accent); }
.settings-content { flex:1; }
</style>
