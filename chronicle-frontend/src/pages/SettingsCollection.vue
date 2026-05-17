<template>
    <div class="settings-page">
        <h2 style="margin-bottom: 0;">{{ $t('settings.collection') }}</h2>
        <p class="hint">{{ $t('settings.collectionHint') }}</p>
        <CheckRow 
            v-model="enabled" 
            :title="$t('settings.featureToggle')"
            :hint="$t('settings.featureCollectionHint')" 
        />
        <section class="card">

                <div class="editor-area">
                    <div class="tree-actions">
                        <button class="primary" @click="addCollection">{{ $t('settings.addCollection') }}</button>
                    </div>

                    <ul class="collection-list">
                        <li v-for="(col, cidx) in nodes" :key="col.name + '-' + cidx" class="collection-item">
                            <div class="collection-header">
                                <input v-model="col.name" placeholder="Collection name" class="collection-name" />
                                <input v-model="col.description" placeholder="Description" class="collection-desc" />
                                <div class="collection-actions">
                                    <button class="action-btn action-add icon-only" aria-label="新增节点" title="新增节点" @click="addNode(col)">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                            <line x1="12" y1="5" x2="12" y2="19"></line>
                                            <line x1="5" y1="12" x2="19" y2="12"></line>
                                        </svg>
                                    </button>
                                    <button class="action-btn action-delete icon-only" aria-label="删除合集" title="删除合集" @click="removeCollection(cidx)">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                            <line x1="18" y1="6" x2="6" y2="18"></line>
                                            <line x1="6" y1="6" x2="18" y2="18"></line>
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <CollectionNodeEditor :nodes="col.nodes" :onPostPicked="handlePostPicked" />
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
import CheckRow from '../components/ui/CheckRow.vue'
import CollectionNodeEditor from '../components/CollectionNodeEditor.vue'
import useToast from '../composables/useToast'

const { t } = useI18n()
const { show } = useToast()

const key = 'chronicle.settings.collectionHtml'
const enabled = ref(true)
const saving = ref(false)
const nodes = ref<any[]>([])

function makeId() { return 'n_' + Math.random().toString(36).slice(2, 9) }

function addCollection() { nodes.value.push({ name: 'New Collection', description: '', nodes: [] }) }
function removeCollection(idx: number) { nodes.value.splice(idx, 1) }
function addNode(col: any) { col.nodes = col.nodes || []; col.nodes.push({ id: '', type: 'post' }) }

function resetTree() { if (window.confirm(t('settings.resetConfirm') as string)) { nodes.value = []; localStorage.removeItem('chronicle.settings.collections') } }

function loadDefault() { nodes.value = [{ name: 'Default Collection', description: '', nodes: [] }] }

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
    // persist collections to backend under `server/data/collection.json`
    try {
        const resp = await fetchWithAuth(`/api/collections?t=${Date.now()}`, {
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

function handlePostPicked(targetNode: any, pickedId: string) {
    if (!pickedId) return

    // normalize
    const id = String(pickedId)

    // iterate all collections and clear other occurrences of this id
    for (const col of nodes.value || []) {
        function walk(list: any[]) {
            if (!Array.isArray(list)) return
            for (const n of list) {
                if (!n) continue
                if (n === targetNode) continue
                if (n.type === 'post') {
                    if (String(n.id || '') === id) {
                        n.id = ''
                    }
                } else if (n.type === 'group') {
                    walk(n.children || [])
                }
            }
        }
        walk(col.nodes || [])
    }

    // ensure target node has the id
    try { targetNode.id = id } catch (e) {}
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
        }

        const cr = await fetchWithAuth(`/api/collections?t=${Date.now()}`)
        if (cr.ok) {
            const data = await cr.json()
            nodes.value = data?.collections || []
        } else {
            const v = localStorage.getItem('chronicle.settings.collections')
            if (v) nodes.value = JSON.parse(v)
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

.editor-area {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.editor-area textarea {
    width: 100%;
    font-family: var(--app-font-stack);
}

.actions {
    display: flex;
    gap: 0.5rem
}

.collection-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px }
.collection-item { border: 1px solid var(--border-color); border-radius: 10px; padding: 10px; background: var(--component-bg); }
.collection-header { display:flex; gap:8px; align-items:center; margin-bottom:8px }
.collection-name { flex: 1 1 200px; padding:6px 8px; border-radius:6px; border:1px solid var(--border-color); }
.collection-desc { flex: 2 1 300px; padding:6px 8px; border-radius:6px; border:1px solid var(--border-color); }
.collection-actions { margin-left: auto; display:flex; gap:6px }

.action-btn {
    height: 30px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 0;
    cursor: pointer;
    transition: color .15s ease, background .15s ease, transform .08s ease;
}

.action-btn:hover {
    color: var(--text-primary);
    background: var(--component-bg-hover);
}

.action-btn.icon-only {
    width: 30px;
    min-width: 30px;
}

.action-btn.icon-only svg {
    width: 18px;
    height: 18px;
    display: block;
}

.action-delete {
    color: var(--status-error);
    background: transparent;
}

.action-delete:hover {
    background: var(--code-bg);
    color: var(--status-error);
}

.danger { background: #fff0f0; border: 1px solid #ffcccc }
.secondary { background: transparent; border: 1px solid var(--border-color) }
.primary { background: var(--accent-color); color: white }
</style>
