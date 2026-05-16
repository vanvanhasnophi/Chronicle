<template>
  <div class="settings-page features-page">
    <h2 style="margin-bottom: 0;">{{ $t('settings.features') }}</h2>
    <p class="hint">{{ $t('settings.featuresHint') }}</p>

    <section class="feature-card">
        <label class="feature-row feature-disabled">
          <span class="feature-copy">
            <strong>{{ $t('settings.featureSearchSuggestions') }}</strong>
            <small>{{ $t('settings.featureSearchSuggestionsHint') }}</small>
          </span>
          <div class="disabled-note">{{ $t('settings.todo') }}</div>
        </label>

        <label class="feature-row feature-disabled">
          <span class="feature-copy">
            <strong>{{ $t('settings.featureRelatedPosts') }}</strong>
            <small>{{ $t('settings.featureRelatedPostsHint') }}</small>
          </span>
          <div class="disabled-note">{{ $t('settings.todo') }}</div>
        </label>

      <label class="feature-row">
        <span class="feature-copy">
          <strong>{{ $t('settings.featureCollection') }}</strong>
          <small>{{ $t('settings.featureCollectionHint') }}</small>
        </span>
        <input v-model="flags.collectionPage" type="checkbox" />
      </label>

      <label class="feature-row">
        <span class="feature-copy">
          <strong>{{ $t('settings.featureAboutPage') }}</strong>
          <small>{{ $t('settings.featureAboutPageHint') }}</small>
        </span>
        <input v-model="flags.aboutPage" type="checkbox" />
      </label>
      <label class="feature-row">
        <span class="feature-copy">
          <strong>{{ $t('settings.featureFriendsPage') }}</strong>
          <small>{{ $t('settings.featureFriendsPageHint') }}</small>
        </span>
        <input v-model="flags.friendsPage" type="checkbox" />
      </label>
    </section>

    <div class="actions">
      <button class="primary" :disabled="saving" @click="save">{{ $t('settings.save') }}</button>
      <button class="secondary" :disabled="saving" @click="reset">{{ $t('settings.reset') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchWithAuth } from '../../utils/fetchWithAuth'
import useToast from '../../composables/useToast'

const { t } = useI18n()
const { show } = useToast()
const flags = ref({
  searchSuggestions: true,
  relatedPosts: true,
  collectionPage: true,
  aboutPage: true,
  friendsPage: true,
})
const saving = ref(false)
const defaultFlags = { ...flags.value }

function normalizeFlags(input: any) {
  return {
    searchSuggestions: input?.searchSuggestions !== false,
    relatedPosts: input?.relatedPosts !== false,
    collectionPage: input?.collectionPage !== false,
    aboutPage: input?.aboutPage !== false,
    friendsPage: input?.friendsPage !== false,
  }
}

async function load() {
  try {
    const response = await fetchWithAuth(`/api/settings?t=${Date.now()}`)
    if (!response.ok) return
    const settings = await response.json()
    if (settings?.featureFlags) {
      flags.value = normalizeFlags(settings.featureFlags)
    }
  } catch (error) {
    // Keep local defaults when the settings API is unavailable.
  }
}

async function save() {
  if (saving.value) return
  saving.value = true
  try {
    const response = await fetchWithAuth(`/api/settings?t=${Date.now()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featureFlags: flags.value }),
    })
    if (response.ok) {
      show(t('settings.saveSuccess') as string, { status: 'success' })
    } else {
      show(t('settings.saveFailed') as string, { status: 'error' })
    }
  } catch (error) {
    show(t('settings.saveFailed') as string, { status: 'error' })
  } finally {
    saving.value = false
  }
}

function reset() {
  if (!window.confirm(t('settings.resetConfirm') as string)) return
  flags.value = { ...defaultFlags }
}

onMounted(() => {
  void load()
})
</script>

<style scoped>
.features-page {
  max-width: 840px;
  margin: 0 auto;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.feature-card {
  display: grid;
  gap: 0.75rem;
  padding: 1.25rem;
  border-radius: 12px;
  background: var(--component-bg-blur);
  border: 1px solid var(--border-color);
}

.feature-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  padding: 0.9rem 1rem;
  border-radius: 10px;
  background: var(--component-bg);
  border: 1px solid var(--border-color-blur);
}

.feature-row input {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
  flex: 0 0 auto;
}

.feature-copy {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.feature-copy strong {
  font-size: 0.98rem;
}

.feature-copy small {
  color: var(--component-text-secondary);
  line-height: 1.4;
}

.feature-disabled {
  opacity: 0.6;
  pointer-events: none;
}

.disabled-note {
  color: var(--component-text-secondary);
  font-size: 0.9rem;
}

.actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0;
}

@media (max-width: 640px) {
  .features-page {
    padding: 1.25rem;
  }

  .feature-row {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .feature-row input {
    justify-self: start;
  }
}
</style>
