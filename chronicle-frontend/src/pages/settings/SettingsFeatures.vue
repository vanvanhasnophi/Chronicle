<template>
  <div class="settings-page">
    <h2 style="margin-bottom: 0;">{{ $t('settings.features') }}</h2>
    <p class="hint">{{ $t('settings.featuresHint') }}</p>

    <section class="feature-card">
      <CheckRow
        :disabled="true"
        :disabled-text="$t('settings.nslasha')"
        :hint="$t('settings.featureSearchSuggestionsHint')"
        :title="$t('settings.featureSearchSuggestions')"
      />

      <CheckRow
        :disabled="true"
        :disabled-text="$t('settings.nslasha')"
        :hint="$t('settings.featureRelatedPostsHint')"
        :title="$t('settings.featureRelatedPosts')"
      />

      <CheckRow
        v-model="flags.collectionPage"
        :hint="$t('settings.featureCollectionHint')"
        :title="$t('settings.featureCollection')"
      />

      <CheckRow
        v-model="flags.aboutPage"
        :hint="$t('settings.featureAboutPageHint')"
        :title="$t('settings.featureAboutPage')"
      />

      <CheckRow
        v-model="flags.friendsPage"
        :hint="$t('settings.featureFriendsPageHint')"
        :title="$t('settings.featureFriendsPage')"
      />
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
import CheckRow from '../../components/ui/CheckRow.vue'
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

.feature-card {
  display: grid;
  gap: 0.75rem;
  padding: 1.25rem;
  border-radius: 12px;
  background: var(--component-bg-blur);
  border: 1px solid var(--border-color);
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
}
</style>
