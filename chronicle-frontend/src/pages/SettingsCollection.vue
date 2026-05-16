<template>
    <div class="settings-page">
        <h2 style="margin-bottom: 0;">{{ $t('settings.collection') }}</h2>
        <p class="hint">{{ $t('settings.collectionHint') }}</p>

        <label class="feature-row" style="padding: 1rem;">
            <span class="feature-copy">
                <strong>{{ $t('settings.featureToggle') }}</strong>
                <small>{{ $t('settings.featureCollectionHint') }}</small>
            </span>
            <input type="checkbox" v-model="enabled" />
        </label>
        <section class="card">

            <div class="editor-area">
                <div class="tree-actions">
                    <button class="primary" @click="addRoot">{{ $t('settings.addCollection') }}</button>
                    <button class="secondary" @click="loadDefault">{{ $t('settings.loadDefaultCollections') }}</button>
                </div>
                <ul class="collection-tree">
                    <li v-for="node in nodes" :key="node.id">
                        <div class="node-row">
                            <input v-model="node.title" class="node-title" />
                            <div class="node-actions">
                                <button class="secondary" @click="addChild(node)">+</button>
                                <button class="danger" @click="removeNode(node)">×</button>
                            </div>
                        </div>
                        <ul v-if="node.children && node.children.length">
                            <li v-for="child in node.children" :key="child.id">
                                <div class="node-row child">
                                    <input v-model="child.title" class="node-title" />
                                    <div class="node-actions">
                                        <button class="secondary" @click="addChild(child)">+</button>
                                        <button class="danger" @click="removeNode(child)">×</button>
                                    </div>
                                </div>
                            </li>
                        </ul>
                    </li>
                </ul>
            </div>
        </section>

        <div class="actions">
            <button class="primary" :disabled="saving" @click="saveAll">{{ $t('settings.save') }}</button>
            <button class="secondary" :disabled="saving" @click="resetAll">{{ $t('settings.reset') }}</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import { useI18n } from 'vue-i18n'
import useToast from '../composables/useToast'

const { t } = useI18n()
const { show } = useToast()

const key = 'chronicle.settings.collectionHtml'
const enabled = ref(true)
const saving = ref(false)
const nodes = ref<any[]>([])

function makeId() { return 'c_' + Math.random().toString(36).slice(2, 9) }

function addRoot() { nodes.value.push({ id: makeId(), title: 'New Collection', children: [] }) }
function addChild(parent: any) { parent.children = parent.children || []; parent.children.push({ id: makeId(), title: 'New Item', children: [] }) }
function removeNode(target: any) {
    function walk(list: any[]): boolean {
        const idx = list.findIndex((n: any) => n.id === target.id)
        if (idx >= 0) { list.splice(idx, 1); return true }
        for (const n of list) { if (n.children && walk(n.children)) return true }
        return false
    }
    walk(nodes.value)
}

function resetTree() { if (window.confirm(t('settings.resetConfirm') as string)) { nodes.value = []; localStorage.removeItem('chronicle.settings.collections') } }

function loadDefault() { nodes.value = [{ id: makeId(), title: 'Default Collection', children: [] }] }

async function saveFlag() {
    saving.value = true
    try {
        const r = await fetchWithAuth(`/api/settings?t=${Date.now()}`)
        const current = r.ok ? await r.json() : {}
        const existingFlags = current.featureFlags || {}
        const merged = Object.assign({}, existingFlags, { collectionPage: !!enabled.value })
        const resp = await fetchWithAuth(`/api/settings?t=${Date.now()}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ featureFlags: merged })
        })
        return resp.ok
    } catch (e) { show(t('settings.saveFailed') as string, { status: 'error' }) }
    finally { saving.value = false }
}

async function saveCollections() {
    // persist tree to backend under `collections`
    try {
        const resp = await fetchWithAuth(`/api/settings?t=${Date.now()}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collections: nodes.value })
        })
        return resp.ok
    } catch (e) { return false }
}

function resetFlag() { if (window.confirm(t('settings.resetConfirm') as string)) { enabled.value = true } }

async function saveAll() {
    saving.value = true
    try {
        const okFlag = await saveFlag()
        const okCollections = await saveCollections()
        if (okFlag && okCollections) show(t('settings.saveSuccess') as string, { status: 'success' })
        else show(t('settings.saveFailed') as string, { status: 'error' })
    } catch (e) { show(t('settings.saveFailed') as string, { status: 'error' }) } finally { saving.value = false }
}

async function resetAll() {
    if (!window.confirm(t('settings.resetConfirm') as string)) return
    enabled.value = true
    nodes.value = []
    await saveFlag()
    await saveCollections()
}

onMounted(async () => {
    try {
        const r = await fetchWithAuth(`/api/settings?t=${Date.now()}`)
        if (r.ok) {
            const settings = await r.json()
            enabled.value = settings?.featureFlags?.collectionPage !== false
            if (settings.collections) nodes.value = settings.collections
            else {
                const v = localStorage.getItem('chronicle.settings.collections')
                if (v) nodes.value = JSON.parse(v)
            }
        }
    } catch (e) { }
})
</script>

<style scoped>

.card {
    display: grid;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-radius: 12px;
    background: var(--component-bg-blur);
    border: 1px solid var(--border-color);
}

.editor-area textarea {
    width: 100%;
    font-family: var(--app-font-stack);
}

.actions {
    display: flex;
    gap: 0.5rem
}
</style>
