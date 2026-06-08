<template>
    <div class="blog-editor" :class="[`layout-${layout}`, { 'is-mobile': isMobile }]">
        <div class="editor-toolbar">
            <!-- ROW 1: Meta & Main Actions -->
            <div class="toolbar-row row-meta">
                <div class="meta-left">
                    <h4 class="post-title-display">{{ postTitle }}</h4>
                    <span :class="['status-chip', postStatus]">{{ $t('status.' + (postStatus || 'published')) }}</span>
                    <span v-if="isBuilding" class="build-hint">
                        <QuarterCircleSpinner :size="18" />{{ t('editor.building') }}
                    </span>
                    <div class="meta-dates">
                        <span class="date-item" v-if="postUpdated" title="Last Edited">
                            <span class="icon-svg tiny" v-html="Icons.edit"></span>
                            {{ formatDateTime(postUpdated, locale, 'relative', 'show-weekday', 'hide-seconds', '24h', t)
                            }}
                        </span>
                        <span class="date-item faded" v-if="postDate" title="Created On">
                            <span class="icon-svg tiny" v-html="Icons.clock"></span>
                            {{ formatDateTime(postDate, locale, 'relative', 'show-weekday', 'hide-seconds', '24h', t) }}
                        </span>
                    </div>
                </div>
                <div class="actions-right">
                    <button v-if="postStatus === 'modifying'" class="toolbar-btn danger-btn" @click="restorePost"
                        :disabled="isSaving" :title="t('editor.restore')">
                        <span class="icon-svg" v-html="Icons.undo"></span>
                        <span v-if="!isMobile" class="btn-label">{{ t('editor.restore') }}</span>
                    </button>


                    <button class="toolbar-btn" @click="() => openPrintPreview()" :title="t('editor.print')">
                        <span class="icon-svg" v-html="Icons.print"></span>
                        <span v-if="!isMobile" class="btn-label">{{ t('editor.print') }}</span>
                    </button>

                    <button class="toolbar-btn" @click="() => handleTopRightSave('draft')" :disabled="isSaving">
                        <span class="icon-svg" v-html="Icons.save"></span>
                        <span v-if="!isMobile" class="btn-label">{{ isCloudEditing ? t('editor.draft') :
                            t('editor.save') }}</span>
                    </button>

                    <button class="toolbar-btn primary-action" @click="openSaveModal('publish')" :disabled="isSaving">
                        <span class="icon-svg" v-html="Icons.publish"></span>
                        <span v-if="!isMobile" class="btn-label">{{ isCloudEditing ? t('editor.publish') :
                            t('editor.upload') }}</span>
                    </button>
                </div>
            </div>

            <!-- ROW 2: Editing Tools -->
            <div class="toolbar-row row-tools">
                <div class="tool-group">
                    <button class="toolbar-btn" @click="openFileMenu" :title="t('editor.fileLabel')">
                        <span class="icon-svg" v-html="Icons.file"></span>
                        <span>{{ t('editor.fileLabel') }}</span>
                    </button>
                    <span class="divider"></span>

                    <button class="toolbar-btn" @click="undo" :title="t('editor.undo')">
                        <span class="icon-svg" v-html="Icons.undo"></span>
                    </button>
                    <button class="toolbar-btn" @click="redo"
                        :title="t('editor.redo')">
                        <span class="icon-svg" v-html="Icons.redo"></span>
                    </button>
                    <span class="divider"></span>
                    <button class="toolbar-btn" @click="openMediaModal" :title="t('editor.media')">
                        <span class="icon-svg" v-html="Icons.media"></span>
                        <span>{{ t('editor.media') }}</span>
                    </button>
                    <button class="toolbar-btn" @click="openLinkModal" :title="t('editor.link')">
                        <span class="icon-svg" v-html="Icons.link"></span>
                        <span>{{ t('editor.link') }}</span>
                    </button>
                    <button class="toolbar-btn" @click="openTableModal" :title="t('editor.table')">
                        <span class="icon-svg" v-html="Icons.table"></span>
                        <span>{{ t('editor.table') }}</span>
                    </button>

                    <span class="divider"></span>

                    <button v-for="font in fontOptions" :key="font.value" class="toolbar-btn"
                        :class="{ active: postFont === font.value, ['font-' + font.value]: true }"
                        @click="postFont = font.value" :title="font.label">
                        <span class="icon-svg" v-html="font.icon"></span>
                    </button>
                </div>
                <button class="stats-display" @click="activeModal = 'stats'">
                    {{ wordCountLabel }}
                </button>
            </div>

            <!-- ROW 3: View + Theme + Locale -->
            <div class="toolbar-row row-view">
                <div class="tool-group">
                    <button v-for="mode in displayModes" :key="mode.value" class="toolbar-btn"
                        :class="{ active: layout === mode.value }" @click="layout = mode.value" :title="mode.label">
                        <span class="icon-svg" v-html="mode.icon"></span>
                    </button>
                    <span class="divider"></span>
                    <button class="toolbar-btn" :class="{ active: editorTheme === 'dark' }" @click="editorTheme = 'dark'" title="Dark">
                        <span class="icon-svg" v-html="Icons.themeDark"></span>
                    </button>
                    <button class="toolbar-btn" :class="{ active: editorTheme === 'light' }" @click="editorTheme = 'light'" title="Light">
                        <span class="icon-svg" v-html="Icons.themeLight"></span>
                    </button>
                    <span class="divider"></span>
                    <select v-model="editorLocale" class="toolbar-btn locale-select" title="Language">
                        <option value="en">EN</option>
                        <option value="zh-CN">ZH-CN</option>
                    </select>
                </div>
            </div>
        </div>

        <div class="editor-workspace">
            <!-- Editor Pane -->
            <div v-show="showEditor" class="pane editor-pane">
                <CmEditor ref="editorRef" v-model="localValue" :placeholder="t('editor.placeholder')" :fontClass="fontClass" @mouseover="activeScroll = 'editor'" @cursorChange="onCursorChange" @changeRange="onChangeRange" @editorScroll="onEditorScroll" />
            </div>

            <!-- Preview Pane -->
            <div v-show="showPreview" class="pane preview-pane" :class="fontClass" ref="previewRef" tabindex="0"
                @scroll="syncScroll('preview')" @mouseover="activeScroll = 'preview'" @focus="activeScroll = 'preview'">
                <!-- Preview: markdown-it renderer — matches template-astro published output exactly -->
                <!-- Pipeline A (MdParser interactive preview) disabled for now; code preserved in markdownParser.ts + MdParser.vue -->
                <MarkdownItPreview :markdown="localValue" :cursorLine="cursorLine" :changeRange="changeRange" class="preview-content" />
            </div>
        </div>

        <div v-if="editorSearchOpen" class="search-float search-float--editor"
            @keydown.esc.prevent="closeSearchOverlay('editor')">
            <div class="search-float-header">
                <span class="search-float-title">Editor Search</span>
                <button class="search-close-btn" @click="closeSearchOverlay('editor')">
                    <span class="icon-svg" v-html="Icons.close"></span>
                </button>
            </div>
            <div class="search-float-body">
                <input ref="editorSearchInputRef" v-model="editorSearchQuery" class="search-input"
                    placeholder="Find in post"
                    @keydown.enter.prevent="jumpToSearchMatch('editor', $event.shiftKey ? -1 : 1)"
                    @keydown.esc.prevent="closeSearchOverlay('editor')" />
                <div class="search-float-actions">
                    <span class="search-counter">{{ editorSearchMatchLabel }}</span>
                    <div class="search-nav-buttons">
                        <button class="search-nav-btn" :disabled="!editorSearchMatchCount"
                            @click="jumpToSearchMatch('editor', -1)">
                            ↑
                        </button>
                        <button class="search-nav-btn" :disabled="!editorSearchMatchCount"
                            @click="jumpToSearchMatch('editor', 1)">
                            ↓
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="previewSearchOpen" class="search-float search-float--preview"
            @keydown.esc.prevent="closeSearchOverlay('preview')">
            <div class="search-float-header">
                <span class="search-float-title">Preview Search</span>
                <button class="search-close-btn" @click="closeSearchOverlay('preview')">
                    <span class="icon-svg" v-html="Icons.close"></span>
                </button>
            </div>
            <div class="search-float-body">
                <input ref="previewSearchInputRef" v-model="previewSearchQuery" class="search-input"
                    placeholder="Find in preview"
                    @keydown.enter.prevent="jumpToSearchMatch('preview', $event.shiftKey ? -1 : 1)"
                    @keydown.esc.prevent="closeSearchOverlay('preview')" />
                <div class="search-float-actions">
                    <span class="search-counter">{{ previewSearchMatchLabel }}</span>
                    <div class="search-nav-buttons">
                        <button class="search-nav-btn" :disabled="!previewSearchMatchCount"
                            @click="jumpToSearchMatch('preview', -1)">
                            ↑
                        </button>
                        <button class="search-nav-btn" :disabled="!previewSearchMatchCount"
                            @click="jumpToSearchMatch('preview', 1)">
                            ↓
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Group 1: File Menu Modal -->
        <div v-if="activeModal === 'file'" class="modal-overlay">
            <div class="modal-content file-menu-modal">
                <div class="sidebar file-menu-sidebar">
                    <button v-for="tab in fileTabs" :key="tab.id" class="sidebar-btn"
                        :class="{ active: fileTab === tab.id }" @click="handleFileTabChange(tab.id)">
                        <span class="icon-svg sidebar-icon" v-html="tab.icon"></span>
                        {{ tab.label }}
                    </button>

                    <button class="sidebar-btn sidebar-btn--print" type="button"
                        @click="openPrintPreview({ autoPrint: true })">
                        <span class="icon-svg sidebar-icon" v-html="Icons.print"></span>
                        {{ t('editor.print') }}
                    </button>
                </div>
                <div class="main-area">
                    <div class="header">
                        <h3>{{ currentFileTabTitle }}</h3>
                        <button class="close-btn" @click="activeModal = 'none'">
                            <span class="icon-svg" v-html="Icons.close"></span>
                        </button>
                    </div>

                    <div class="content-body">
                        <!-- New Post -->
                        <div v-if="fileTab === 'new'" class="tab-pane">
                            <p>{{ t('editor.file.createNew') }}</p>
                            <div class="warning-box">
                                {{ t('editor.file.createOnlineHint') }}
                            </div>
                            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
                                <button class="primary-btn" @click="createLocalNewPost">{{ t('editor.createNewPost')
                                }}</button>
                                <button class="secondary-btn" @click="createOnlinePost">{{
                                    t('editor.file.createOnlinePost') }}</button>
                            </div>
                        </div>

                        <!-- Open Post (Local Open / Recent / Uploaded) -->
                        <div v-if="fileTab === 'open'" class="tab-pane">
                            <div class="open-local-section">
                                <p>{{ t('editor.file.openLocalIntro') }}</p>
                                <div style="display:flex;gap:8px;align-items:center;">
                                    <button class="primary-btn" @click="requestOpenLocalFile">{{
                                        t('editor.file.openLocal') }}</button>
                                </div>
                            </div>

                            <div class="recent-section" style="margin-top:16px;">
                                <h4>{{ t('editor.file.recent') }}</h4>
                                <div v-if="recentProjects.length === 0" class="empty-library">{{
                                    t('editor.file.noRecent') }}</div>
                                <div v-else class="post-list">
                                    <div v-for="(r, idx) in recentProjects" :key="r.ts + '-' + idx" class="post-item"
                                        @click="openRecentProject(r)">
                                        <span class="post-title">{{ r.title }}</span>
                                        <span class="post-status status-chip"
                                            :class="r.cloud ? 'published' : 'local'">{{ r.cloud ? t('editor.file.cloud')
                                                : t('editor.file.local') }}</span>
                                        <span class="post-date">{{ new Date(r.ts).toLocaleString() }}</span>
                                    </div>
                                </div>
                            </div>

                            <div class="uploaded-section" style="margin-top:16px;">
                                <h4>{{ t('editor.file.uploaded') }}</h4>
                                <div v-if="!isCloudAuthenticated()" class="login-placeholder">
                                    <p>{{ t('editor.file.loginRequired') }}</p>
                                    <button class="primary-btn" @click="goToLogin('open-cloud-posts')">{{
                                        t('editor.file.login') }}</button>
                                </div>
                                <div v-else-if="fileLoading" class="loading">{{ t('post.loadingPosts') }}</div>
                                <div v-else class="post-list">
                                    <div v-for="post in filePosts" :key="post.id" class="post-item"
                                        @click="handlePostOpen(post.id)">
                                        <span class="post-title">{{ post.title }}</span>
                                        <span class="post-status status-chip" :class="post.status || 'draft'">{{
                                            $t('status.' + (post.status || 'draft')) }}</span>
                                        <span class="post-date">{{ formatDateUtil(post.date, locale) }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Import -->
                        <div v-if="fileTab === 'import'" class="tab-pane">
                            <p>{{ t('editor.file.importInstruction') }}</p>
                            <FilePicker @select="onFilePickerSelect" selectionMode="single"
                                :allowUpload="isCloudAuthenticated()" />
                            <div style="margin-top:.75rem;">
                                <button class="primary-btn" :disabled="!selectedImportFile && !selectedImportUrl"
                                    @click="executeFileAction">{{ t('editor.file.import') }}</button>
                            </div>
                        </div>

                        <!-- Export -->
                        <div v-if="fileTab === 'export'" class="tab-pane">
                            <p>{{ t('editor.file.exportIntro') }}</p>
                            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                                <button class="primary-btn" @click="saveFile">{{ t('editor.file.saveAsMarkdown')
                                }}</button>
                                <button class="secondary-btn" @click="exportAsHTML">{{ t('editor.file.exportAsHtml')
                                }}</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Group 2: Insert Modals (Media, Link, Table) -->
        <div v-if="['media', 'link', 'table'].includes(activeModal)" class="modal-overlay">
            <div class="modal-content" :class="activeModal === 'media' ? 'large-modal' : 'small-modal'">
                <div class="modal-header">
                    <h3>{{ activeModal === 'media' ? t('editor.media') : (activeModal === 'link' ? t('editor.link') :
                        t('editor.table')) }}</h3>
                    <button class="close-btn" @click="activeModal = 'none'">
                        <span class="icon-svg" v-html="Icons.close"></span>
                    </button>
                </div>

                <!-- Media Body -->
                <div v-if="activeModal === 'media'" class="modal-body media-manager-layout">
                    <FilePicker selectionMode="multiple" :allowLocalPick="true" :allowUpload="isCloudAuthenticated()"
                        :initialFiles="displayedFiles.map(f => ({ name: f.name, uploadedUrl: f.url, preview: f.thumb || f.url }))"
                        @select="handleMediaPicked" @cancel="activeModal = 'none'" />
                </div>

                <!-- Link Body -->
                <div v-if="activeModal === 'link'" class="modal-body">
                    <div class="form-group">
                        <label>{{ t('editor.linktext') }}</label>
                        <input v-model="linkText" class="modal-input" :placeholder="t('editor.texttoDisplay')"
                            autofocus />
                    </div>
                    <div class="form-group">
                        <label>URL</label>
                        <input v-model="linkUrl" class="modal-input" placeholder="https://" @keyup.enter="insertLink" />
                    </div>
                    <div class="modal-actions">
                        <button class="secondary-btn" @click="activeModal = 'none'">{{ t('editor.cancel') }}</button>
                        <button class="primary-btn" @click="insertLink">{{ t('editor.insert') }}</button>
                    </div>
                </div>

                <!-- Table Body -->
                <div v-if="activeModal === 'table'" class="modal-body">
                    <div class="table-grid-container">
                        <div class="table-grid" @mouseleave="tableGridHover(tblRows, tblCols)">
                            <div v-for="i in 64" :key="i"
                                :class="['grid-cell', { active: ((i - 1) % 8 < tblHoverC) && (Math.floor((i - 1) / 8) < tblHoverR) }]"
                                @mouseover="tableGridHover(Math.floor((i - 1) / 8) + 1, (i - 1) % 8 + 1)"
                                @click="tableGridClick(Math.floor((i - 1) / 8) + 1, (i - 1) % 8 + 1)"></div>
                        </div>
                        <div class="grid-info">{{ tblHoverR }} x {{ tblHoverC }} {{ t('editor.table') }}</div>
                    </div>
                    <div class="manual-inputs">
                        <div class="form-group">
                            <label>{{ t('editor.rows') }}</label>
                            <input type="number" v-model="tblRows" min="1" class="modal-input" />
                        </div>
                        <div class="form-group">
                            <label>{{ t('editor.cols') }}</label>
                            <input type="number" v-model="tblCols" min="1" class="modal-input" />
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button class="secondary-btn" @click="activeModal = 'none'">{{ t('editor.cancel') }}</button>
                        <button class="primary-btn" @click="insertTable">{{ t('editor.insert') }}</button>
                    </div>
                </div>
            </div>

        </div>
    </div>

    <!-- Group 3: Save/Publish Modals -->
    <div v-if="['draft', 'publish'].includes(activeModal)" class="modal-overlay">
        <div class="modal-content small-modal">
            <div class="modal-header">
                <h3>{{ activeModal === 'draft' ? (isCloudEditing ? t('editor.saveDraft') : t('editor.save')) :
                    (isCloudEditing ? t('editor.publishNow') : t('editor.upload')) }}</h3>
                <button class="close-btn" @click="activeModal = 'none'">
                    <span class="icon-svg" v-html="Icons.close"></span>
                </button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>{{ t('editor.postTitle') }}</label>
                    <input v-model="tempTitle" class="modal-input" :placeholder="t('editor.titlePlaceholder')"
                        @keyup.enter="doSave()" autofocus />
                </div>

                <div v-if="activeModal === 'publish' && !isCloudAuthenticated()"
                    class="login-placeholder upload-login-placeholder">
                    <p>{{ t('editor.file.loginRequired') }}</p>
                    <button class="primary-btn" @click="goToLogin('publish-post')">{{ t('editor.file.login') }}</button>
                </div>

                <div v-if="activeModal === 'publish' && isCloudAuthenticated()" class="form-group">
                    <label>{{ t('editor.tagsLabel') }}</label>
                    <div class="tags-input-container">
                        <div class="tags-list">
                            <span class="tag-badge" v-for="tag in sortTags(postTags)" :key="tag"
                                :class="{ featured: tag === 'featured' }">
                                {{ tag === 'featured' ? $t('tag.featured') : tag }}
                                <button class="tag-remove" @click="removeTag(tag)">
                                    <span class="icon-svg" v-html="Icons.close"></span>
                                </button>
                            </span>
                        </div>
                        <div class="tag-controls">
                            <input v-model="tagInput" class="modal-input small-input"
                                :placeholder="t('editor.addTagPlaceholder')" @keyup.enter="addTag" />
                            <button class="secondary-btn small-btn" @click="addTag">{{ t('editor.addTag')
                                }}</button>
                            <button class="secondary-btn small-btn" :class="{ active: postTags.includes('featured') }"
                                @click="toggleFeatured" :title="$t('tag.featured')">
                                {{ $t('tag.featured') }}
                            </button>
                        </div>
                    </div>
                </div>

                <div v-if="activeModal === 'publish' && isCloudAuthenticated()" class="form-group">
                    <label>{{ t('editor.authorLabel') }}</label>
                    <input v-model="postAuthor" class="modal-input" :placeholder="t('editor.authorPlaceholder')" />
                </div>

                <div v-if="activeModal === 'publish' && isCloudAuthenticated()" class="form-group">
                    <CheckRow v-model="postAIGenerated" :title="$t('editor.aiGeneratedLabel')" />
                </div>

                <div class="modal-actions">
                    <button class="secondary-btn" @click="activeModal = 'none'">{{ t('editor.cancel') }}</button>
                    <button v-if="activeModal === 'draft'" class="primary-btn" @click="doSave('draft')"
                        :disabled="isSaving || isBuilding || !tempTitle.trim()">
                        {{ isSaving ? t('editor.saving') : isBuilding ? t('editor.building') : t('editor.saveDraft') }}
                    </button>
                    <button v-else-if="activeModal === 'publish' && isCloudEditing" class="primary-btn"
                        @click="doSave('publish')" :disabled="isSaving || isBuilding || !tempTitle.trim()">
                        {{ isSaving ? t('editor.saving') : isBuilding ? t('editor.building') : t('editor.publishNow') }}
                    </button>
                    <button v-else class="primary-btn" @click="doSave('upload')"
                        :disabled="!isCloudAuthenticated() || isSaving || isBuilding || !tempTitle.trim()">
                        {{ isSaving ? t('editor.saving') : isBuilding ? t('editor.building') : t('editor.upload') }}
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Group 4: Confirmation Modals (Restore, Unsaved) -->
    <div v-if="['restore', 'unsaved', 'stats', 'syncConflict'].includes(activeModal)" class="modal-overlay">
        <div class="modal-content small-modal">
            <div class="modal-header">
                <h3 v-if="activeModal === 'restore'">{{ t('editor.confirmRestoreTitle') }}</h3>
                <h3 v-else-if="activeModal === 'unsaved'">{{ t('editor.unsavedTitle') }}</h3>
                <h3 v-else-if="activeModal === 'syncConflict'">{{ t('editor.versionConflictTitle') }}</h3>
                <h3 v-else>{{ t('editor.statsTitle') }}</h3>

                <button v-if="activeModal !== 'syncConflict'" class="close-btn" @click="activeModal = 'none'">
                    <span class="icon-svg" v-html="Icons.close"></span>
                </button>
            </div>

            <!-- Restore Body -->
            <div v-if="activeModal === 'restore'" class="modal-body">
                <p class="confirm-text">
                    {{ t('editor.confirmRestoreBody') }}
                </p>
                <div class="modal-actions">
                    <button class="secondary-btn" @click="activeModal = 'none'">{{ t('editor.cancel') }}</button>
                    <button class="primary-btn danger-action" @click="doRestore">{{ t('editor.confirmRestoreAction')
                        }}</button>
                </div>
            </div>

            <!-- Unsaved Body -->
            <div v-if="activeModal === 'unsaved'" class="modal-body">
                <p class="confirm-text">
                    {{ t('editor.unsavedBody', { title: postTitle || t('editor.untitled') }) }}
                </p>
                <div class="modal-actions">
                    <button class="secondary-btn" @click="closeModals">{{ t('editor.cancel') }}</button>
                    <button class="secondary-btn danger-outline" @click="handleUnsavedOption('discard')">{{
                        t('editor.discard') }}</button>
                    <button class="primary-btn" @click="handleUnsavedOption('save')">{{ t('editor.saveContinue')
                        }}</button>
                </div>
            </div>

            <div v-if="activeModal === 'syncConflict'" class="modal-body">
                <p class="confirm-text">
                    {{ t('editor.versionConflictBody', { title: pendingConflictDetail?.title || t('editor.untitled') })
                    }}
                </p>
                <div class="modal-actions">
                    <button class="secondary-btn" @click="resolveVersionConflict('local')">{{
                        t('editor.useLocalDraft') }}</button>
                    <button class="primary-btn" @click="resolveVersionConflict('cloud')">{{
                        t('editor.useCloudVersion') }}</button>
                </div>
            </div>

            <!-- Stats Body -->
            <div v-if="activeModal === 'stats'" class="modal-body">
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">{{ t('editor.stats.words') }}</span>
                        <span class="stat-value">{{ editorStats.wordCount }}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">{{ t('editor.stats.charsWithSpaces') }}</span>
                        <span class="stat-value">{{ editorStats.charCount }}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">{{ t('editor.stats.charsNoSpaces') }}</span>
                        <span class="stat-value">{{ editorStats.charCountNoSpaces }}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">{{ t('editor.stats.nonWestern') }}</span>
                        <span class="stat-value">{{ editorStats.nonWesternCount }}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">{{ t('editor.stats.markdownChars') }}</span>
                        <span class="stat-value">{{ editorStats.markdownCount }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <!-- Upload Toast -->
    <div v-if="uploadState.show" class="upload-toast" :class="uploadState.status">
        <div class="toast-content">
            <div class="toast-header-row">
                <span class="toast-title">{{ t('editor.fileUpload') }}</span>
                <button class="toast-close" @click="uploadState.show = false">
                    <span class="icon-svg" v-html="Icons.close"></span>
                </button>
            </div>
            <div class="toast-message">{{ uploadState.message }}</div>
            <div v-if="['uploading', 'processing'].includes(uploadState.status)" class="toast-progress-bg">
                <div class="toast-progress-bar" :style="{ width: uploadState.progress + '%' }"></div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { fetchWithAuth } from '../utils/fetchWithAuth';
import { settingsStore } from '../composables/settingsApi';
import { readApiErrorMessage } from '../utils/apiError'
import { ref, computed, watch, onMounted, onUnmounted, nextTick, reactive } from 'vue'
import { useRoute, useRouter, onBeforeRouteUpdate, onBeforeRouteLeave } from 'vue-router'
// Pipeline A disabled — keep import for future re-enablement
// import MdParser from './MdParser.vue'
import MarkdownItPreview from './MarkdownItPreview.vue'
import { debounce } from '../utils/debounce'
import { Icons } from '../utils/icons'
import { convertToHtml, injectHeadingIds, getStats } from '../utils/markdownParser'
import { sortTags } from '../utils/tagUtils'
import { useI18n } from 'vue-i18n'
import CheckRow from './ui/CheckRow.vue';
import FilePicker from './FilePicker.vue'
import CmEditor from './CmEditor.vue'
import { formatDate as formatDateUtil, formatDateTime } from '../utils/dateUtils'
import QuarterCircleSpinner from './ui/QuarterCircleSpinner.vue'
import useToast from '../composables/useToast'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const { show: showToast } = useToast()
const CDN_BASE_URL = import.meta.env.VITE_CDN_BASE_URL || ''
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
const editorQueryId = computed(() => {
    const id = route.query.id
    return Array.isArray(id) ? id[0] : id
})

const isCloudEditing = computed(() => !!editorQueryId.value)

function createOnlineDraftId() {
    return (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
        ? `new-${(crypto as any).randomUUID()}`
        : `new-${Math.random().toString(36).substring(2, 9)}`
}

function getCloudAuthSession() {
    try {
        const raw = localStorage.getItem('chronicle_auth')
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (parsed?.expiry && Number(parsed.expiry) > Date.now()) return parsed
        if (raw === 'true') return { token: 'active', expiry: Date.now() + 24 * 60 * 60 * 1000 }
    } catch (e) { }
    return null
}

const cloudAuthSession = ref(getCloudAuthSession())

function refreshCloudAuthState() {
    cloudAuthSession.value = getCloudAuthSession()
    return !!cloudAuthSession.value
}

function isCloudAuthenticated() {
    return !!cloudAuthSession.value
}

function goToLogin(action: string) {
    router.push({
        path: '/login',
        query: {
            next: route.fullPath || '/editor',
            source: 'editor',
            action,
        } as any,
    })
}

function requireCloudAuth(action: string) {
    refreshCloudAuthState()
    if (isCloudAuthenticated()) return true
    goToLogin(action)
    return false
}

const props = withDefaults(defineProps<{
    modelValue?: string
}>(), {
    modelValue: ''
})

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void
}>()

const localValue = ref(props.modelValue)
const assetMap = ref<Record<string, string>>({})
// Post Meta
const postTitle = ref('')
const isDefaultTitle = ref(true)
watch(postTitle, (val) => {
    if (val) document.title = `${val} - Chronicle Workdown`
    else document.title = 'Chronicle Workdown'
    if (val && val !== t('editor.untitled')) isDefaultTitle.value = false
}, { immediate: true })
const postId = ref<string | null>(null)
const postStatus = ref<'local' | 'draft' | 'published' | 'modifying' | 'building'>('local')
const postTags = ref<string[]>([])
const postFont = ref<string>('sans')
const postAuthor = ref<string>('') // æ–°å¢žä½œè€…å­—æ®µ
const postAIGenerated = ref<boolean>(false) // æ–°å¢žAIç”Ÿæˆå­—æ®µ
const postDate = ref<string>('')
const postUpdated = ref<string>('')

// UI State
const isSaving = ref(false)
const isBuilding = ref(false)
const activeModal = ref('none')
const tempTitle = ref('')
const pendingConflictDetail = ref<any>(null)
const pendingConflictDraft = ref('')
const pendingConflictSessionHistory = ref<string | null>(null)

// File Menu State
const fileTab = ref('new')
const filePosts = ref<any[]>([])
const fileLoading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const selectedImportFile = ref<File | null>(null)
const selectedImportUrl = ref<string | null>(null)

// Local file handle / path for desktop/browser FS API
const currentFileHandle = ref<any>(null)
const currentFilePath = ref<string | null>(null)

// Recent local projects (stored in localStorage as metadata only)
const RECENT_KEY = 'chronicle_recent_projects'
const recentProjects = ref<Array<{ title: string; path?: string; cloud?: boolean; ts: number }>>([])

function loadRecentProjects() {
    try {
        const raw = localStorage.getItem(RECENT_KEY)
        if (!raw) {
            recentProjects.value = []
            return
        }
        recentProjects.value = JSON.parse(raw || '[]')
    } catch (e) {
        recentProjects.value = []
    }
}

function saveRecentProjects() {
    try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(recentProjects.value.slice(0, 10)))
    } catch (e) { }
}

function pushRecentProject(meta: { title: string; path?: string; cloud?: boolean }) {
    const existing = recentProjects.value.findIndex(r => r.path && meta.path && r.path === meta.path)
    const entry = { title: meta.title || t('editor.untitled'), path: meta.path, cloud: !!meta.cloud, ts: Date.now() }
    if (existing >= 0) {
        recentProjects.value.splice(existing, 1)
    }
    recentProjects.value.unshift(entry)
    recentProjects.value = recentProjects.value.slice(0, 10)
    saveRecentProjects()
}

const fileTabs = computed(() => [
    { id: 'new', label: t('editor.file.new'), icon: Icons.plus },
    { id: 'open', label: t('editor.file.open'), icon: Icons.folder },
    { id: 'export', label: t('editor.file.export'), icon: Icons.save }
])

const fontOptions = [
    { value: 'sans', label: 'Sans Serif', icon: 'A' },
    { value: 'serif', label: 'Serif', icon: 'A' },
    { value: 'mono', label: 'Monospaced', icon: 'M' }
]

const currentFileTabTitle = computed(() => {
    return (fileTabs.value.find(f => f.id === fileTab.value)?.label) || ''
})

// Stats
const editorStats = computed(() => getStats(localValue.value))
const wordCountLabel = computed(() => {
    const n = editorStats.value.wordCount || 0
    if (n === 1) return t('editor.countWords', { count: n })
    return t('editor.countWordsPlural', { count: n })
})

function escapeTocText(text: string) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function buildTocFromMarkdown(markdown: string) {
    const items: Array<{ id: string; text: string; level: number }> = []
    const used = new Set<string>()
    const headingRegex = /^\s*(#{1,6})\s+(.*)$/gm
    let match: RegExpExecArray | null

    while ((match = headingRegex.exec(markdown || '')) !== null) {
        const level = match[1].length
        const text = String(match[2] || '').replace(/<[^>]+>/g, '').trim()
        if (!text) continue

        const base = escapeTocText(text)
            .replace(/&[a-z]+;|&#\d+;/gi, ' ')
            .replace(/\s+/g, '-')
            .replace(/[^\w\-\u4E00-\u9FFF]/g, '')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')

        let id = base || 'heading'
        let suffix = 1
        while (used.has(id)) {
            id = `${base || 'heading'}-${suffix++}`
        }
        used.add(id)
        items.push({ id, text, level })
    }

    if (!items.length) return []
    const minLevel = Math.min(...items.map((item) => item.level))
    return items.map((item) => ({
        id: item.id,
        text: item.text,
        level: item.level - minLevel + 1,
    }))
}

// File Menu Logic
async function openFileMenu() {
    refreshCloudAuthState()
    activeModal.value = 'file'
    // Preload posts if switching to open tab? Or wait until user clicks.
    // Let's reset tab
    fileTab.value = 'new'
}

async function handleFileTabChange(tab: string) {
    refreshCloudAuthState()
    fileTab.value = tab
    if (tab === 'open') loadRecentProjects()
    if (tab === 'open') {
        if (!isCloudAuthenticated()) {
            filePosts.value = []
            fileLoading.value = false
            return
        }
        fileLoading.value = true
        try {
            const res = await fetchWithAuth(`/api/posts?includeDrafts=true&t=${Date.now()}`)
            if (res.ok) {
                filePosts.value = await res.json()
            }
        } finally {
            fileLoading.value = false
        }
    }
}

function triggerImportInput() {
    fileInput.value?.click()
}

function handleImportSelect(e: Event) {
    const target = e.target as HTMLInputElement
    if (target.files && target.files.length > 0) {
        selectedImportFile.value = target.files[0]
    }
}

function onFilePickerSelect(entry: any) {
    const picked = Array.isArray(entry) ? entry[0] : entry
    if (!picked) return
    if (picked.uploadedUrl) {
        selectedImportUrl.value = picked.uploadedUrl
        selectedImportFile.value = null
        // If FilePicker returned a usable URL (local blob/data URL or server URL), close modal and return
        activeModal.value = 'none'
    } else if (picked.file) {
        selectedImportFile.value = picked.file
        selectedImportUrl.value = null
    }
}

function clearCurrentLocalDocument() {
    currentFileHandle.value = null
    currentFilePath.value = null
    postId.value = null
    postTitle.value = t('editor.untitled')
    isDefaultTitle.value = true
    postStatus.value = 'local'
    postDate.value = ''
    postUpdated.value = ''
    postTags.value = []
    postFont.value = 'sans'
    postAuthor.value = ''
    postAIGenerated.value = false
    localValue.value = ''
    savedContent.value = ''
    savedTitle.value = t('editor.untitled')
    history.value = ['']
    historyIndex.value = 0
}

async function executeFileAction() {
    if (fileTab.value === 'new') {
        const doNew = () => {
            clearCurrentLocalDocument()
            resetEditor()
            activeModal.value = 'none'
        }
        if (isDirty.value) handleUnsavedCheck(doNew)
        else doNew()
        return
    }
    // handle import selected file/url
    if (fileTab.value === 'import') {
        try {
            if (selectedImportFile.value) {
                const f = selectedImportFile.value
                const reader = new FileReader()
                reader.onload = (ev) => {
                    const txt = ev.target?.result as string || ''
                    localValue.value = txt
                    postTitle.value = f.name.replace(/\.[^/.]+$/, '')
                    currentFilePath.value = f.name
                    postId.value = null
                    postStatus.value = 'local'
                    savedContent.value = txt
                    savedTitle.value = postTitle.value
                    history.value = [txt]
                    historyIndex.value = 0
                    pushRecentProject({ title: postTitle.value, path: f.name, cloud: false })
                    activeModal.value = 'none'
                }
                reader.readAsText(f as File)
            } else if (selectedImportUrl.value) {
                const res = await fetch(selectedImportUrl.value)
                const txt = await res.text()
                localValue.value = txt
                postTitle.value = (selectedImportUrl.value.split('/').pop() || 'imported').replace(/\.[^/.]+$/, '')
                currentFilePath.value = selectedImportUrl.value
                postId.value = null
                postStatus.value = 'local'
                savedContent.value = txt
                savedTitle.value = postTitle.value
                history.value = [txt]
                historyIndex.value = 0
                pushRecentProject({ title: postTitle.value, path: selectedImportUrl.value, cloud: false })
                activeModal.value = 'none'
            }
        } catch (e) { console.error('import action failed', e) }
        return
    }
}

// File system helpers (browser FS API with fallback)
async function openLocalFilePicker() {
    try {
        if ((window as any).showOpenFilePicker) {
            const [handle] = await (window as any).showOpenFilePicker({
                multiple: false,
                types: [{
                    description: 'Markdown',
                    accept: { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.txt'] }
                }]
            })
            const file = await handle.getFile()
            const text = await file.text()
            currentFileHandle.value = handle
            currentFilePath.value = handle.name || file.name
            localValue.value = text
            postTitle.value = file.name.replace(/\.[^/.]+$/, '')
            postId.value = null
            postStatus.value = 'local'
            savedContent.value = text
            savedTitle.value = postTitle.value
            history.value = [text]
            historyIndex.value = 0
            pushRecentProject({ title: postTitle.value, path: file.name, cloud: false })
            activeModal.value = 'none'
            return
        }
        // Fallback: use hidden input
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.md,.markdown,.txt'
        input.onchange = (e: any) => {
            const f = e.target.files && e.target.files[0]
            if (!f) return
            const reader = new FileReader()
            reader.onload = (ev) => {
                const txt = ev.target?.result as string || ''
                localValue.value = txt
                postTitle.value = f.name.replace(/\.[^/.]+$/, '')
                currentFilePath.value = f.name
                postId.value = null
                postStatus.value = 'local'
                savedContent.value = txt
                savedTitle.value = postTitle.value
                history.value = [txt]
                historyIndex.value = 0
                pushRecentProject({ title: postTitle.value, path: f.name, cloud: false })
                activeModal.value = 'none'
            }
            reader.readAsText(f)
        }
        input.click()
    } catch (e) {
        console.error('openLocalFilePicker failed', e)
    }
}

function resetCurrentFile() {
    clearCurrentLocalDocument()
    resetEditor()
}

function openRecentProject(r: any) {
    if (r.cloud && r.path) {
        // treat path as cloud id if present
        void loadPostById(r.path)
        activeModal.value = 'none'
        return
    }
    // For local recent entries, prompt user to re-open file
    const doOpen = () => openLocalFilePicker()
    if (isDirty.value) handleUnsavedCheck(doOpen)
    else doOpen()
}

function requestOpenLocalFile() {
    const doOpen = () => void openLocalFilePicker()
    if (isDirty.value) handleUnsavedCheck(doOpen)
    else doOpen()
}

function createLocalNewPost() {
    const doNew = () => {
        clearCurrentLocalDocument()
        resetEditor()
        activeModal.value = 'none'
    }
    if (isDirty.value) handleUnsavedCheck(doNew)
    else doNew()
}

function createOnlinePost() {
    const doOnline = () => {
        activeModal.value = 'none'
        router.push({ path: '/editor', query: { id: createOnlineDraftId() } })
    }
    if (!isCloudAuthenticated()) {
        goToLogin('create-cloud-post')
        return
    }
    if (isDirty.value) handleUnsavedCheck(doOnline)
    else doOnline()
}

async function writeFileHandle(handle: any, contents: string) {
    if (!handle) return false
    try {
        if (handle.createWritable) {
            const writable = await handle.createWritable()
            await writable.write(contents)
            await writable.close()
            return true
        } else if (handle.write) {
            // older spec
            await handle.write(contents)
            return true
        }
    } catch (e) {
        console.error('writeFileHandle error', e)
    }
    return false
}

async function saveFile() {
    try {
        if (currentFileHandle.value) {
            const ok = await writeFileHandle(currentFileHandle.value, localValue.value)
            if (ok) {
                savedContent.value = localValue.value
                savedTitle.value = postTitle.value
                pushRecentProject({ title: postTitle.value, path: currentFilePath.value || undefined, cloud: false })
                showToast(t('editor.file.savedToFile') as string)
                activeModal.value = 'none'
                return true
            }
        }
        return await saveAs()
    } catch (e) {
        console.error('saveFile failed', e)
        return false
    }
}

async function saveAs() {
    try {
        if ((window as any).showSaveFilePicker) {
            const handle = await (window as any).showSaveFilePicker({
                suggestedName: `${(postTitle.value || 'untitled').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`,
                types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }]
            })
            const ok = await writeFileHandle(handle, localValue.value)
            if (ok) {
                currentFileHandle.value = handle
                currentFilePath.value = (handle.name || null)
                savedContent.value = localValue.value
                savedTitle.value = postTitle.value
                pushRecentProject({ title: postTitle.value, path: currentFilePath.value || undefined, cloud: false })
                showToast(t('editor.file.savedToFile') as string)
                activeModal.value = 'none'
                return true
            }
        }
        // Fallback: trigger download
        const blob = new Blob([localValue.value], { type: 'text/markdown;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        const filename = `${(postTitle.value || 'untitled').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
        currentFileHandle.value = null
        currentFilePath.value = filename
        savedContent.value = localValue.value
        savedTitle.value = postTitle.value
        pushRecentProject({ title: postTitle.value, path: filename, cloud: false })
        activeModal.value = 'none'
        return true
    } catch (e) {
        console.error('saveAs failed', e)
        return false
    }
}

async function exportAsHTML() {
    try {
        const html = convertToHtml(localValue.value, { wrapBlocks: true })
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${(postTitle.value || 'untitled').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`
        a.click()
        URL.revokeObjectURL(url)
        activeModal.value = 'none'
    } catch (e) {
        console.error('exportAsHTML failed', e)
    }
}

function handlePostOpen(id: string) {
    if (!requireCloudAuth('open-cloud-post')) return
    const doOpen = async () => {
        await loadPost(id)
        if (activeModal.value !== 'syncConflict') {
            activeModal.value = 'none'
        }
    }
    if (isDirty.value) handleUnsavedCheck(doOpen)
    else doOpen()
}

// Reuseable unsaved check helper
let pendingActionCallback: (() => void) | null = null
function handleUnsavedCheck(callback: () => void) {
    pendingActionCallback = callback
    activeModal.value = 'unsaved'
}

function normalizeContentForCompare(content: string) {
    return String(content || '').replace(/\r\n/g, '\n')
}

function clearVersionConflictState() {
    pendingConflictDetail.value = null
    pendingConflictDraft.value = ''
    pendingConflictSessionHistory.value = null
}

function applyLoadedPost(detail: any, content: string, sessionHistory: string | null, syncLocalCache = false) {
    if (!detail) return

    postId.value = detail.id
    postTitle.value = detail.title
    isDefaultTitle.value = false
    postStatus.value = detail.status || 'draft'
    postDate.value = detail.date || ''
    postUpdated.value = detail.updatedAt || detail.date || ''
    postTags.value = detail.tags || []
    postFont.value = detail.font || 'sans'
    postAuthor.value = readAuthorFromDetail(detail)
    postAIGenerated.value = readAiGeneratedFromDetail(detail)
    localValue.value = content

    savedContent.value = content
    savedTitle.value = detail.title

    if (sessionHistory) {
        try {
            const h = JSON.parse(sessionHistory)
            history.value = h.stack
            historyIndex.value = h.index
        } catch (e) {
            history.value = [content]
            historyIndex.value = 0
        }
    } else {
        history.value = [content]
        historyIndex.value = 0
    }

    if (syncLocalCache) {
        localStorage.setItem(`chronicle_draft_${detail.id}`, content)
        sessionStorage.setItem(`chronicle_history_${detail.id}`, JSON.stringify({
            stack: history.value,
            index: historyIndex.value,
        }))
    }
}

function resolveVersionConflict(choice: 'cloud' | 'local') {
    const detail = pendingConflictDetail.value
    if (!detail) return

    const draft = pendingConflictDraft.value
    const sessionHistory = pendingConflictSessionHistory.value

    if (choice === 'cloud') {
        applyLoadedPost(detail, detail.content || '', null, true)
    } else {
        applyLoadedPost(detail, draft || detail.content || '', sessionHistory, false)
    }

    clearVersionConflictState()
    activeModal.value = 'none'
}

function resetEditor() {
    router.push({ path: '/editor' })
}

function loadPost(id: string) {
    if (id === postId.value) return
    router.push({ query: { id } })
}
const savedContent = ref('')
const savedTitle = ref('')
const pendingRoute = ref<any>(null) // To store where user wanted to go
const isDirty = computed(() => {
    // Only dirty if we have a valid post loaded/initialized
    // and content differs
    return localValue.value !== savedContent.value || postTitle.value !== savedTitle.value
})

// Undo/Redo History (CodeMirror owns undo/redo; these remain for session persistence only)
const history = ref<string[]>([''])
const historyIndex = ref(0)
const isTimeTraveling = ref(false)
const MAX_HISTORY = 50
function pushHistory(val: string) {
  if (isTimeTraveling.value) return
  if (historyIndex.value >= 0 && history.value[historyIndex.value] === val) return
  if (historyIndex.value < history.value.length - 1) history.value = history.value.slice(0, historyIndex.value + 1)
  history.value.push(val)
  if (history.value.length > MAX_HISTORY) { history.value.shift(); historyIndex.value-- }
  historyIndex.value = history.value.length - 1
}
const debouncedPush = debounce(pushHistory, 500)

// Persist Logic
const draftKey = computed(() => {
    if (postId.value && postId.value !== 'new') return `chronicle_draft_${postId.value}`
    if (editorQueryId.value === 'new') return 'chronicle_draft_new'
    return 'chronicle_draft_local'
})
const historyKey = computed(() => {
    if (postId.value && postId.value !== 'new') return `chronicle_history_${postId.value}`
    if (editorQueryId.value === 'new') return 'chronicle_history_new'
    return 'chronicle_history_local'
})

// local draft autosave removed: local editing uses explicit file save/load operations

// Tag Management
const tagInput = ref('')

function readAuthorFromDetail(detail: any): string {
    const raw = detail?.author ?? detail?.meta?.author ?? ''
    return String(raw || '').trim()
}

function readAiGeneratedFromDetail(detail: any): boolean {
    const raw = detail?.aiGenerated ?? detail?.ai_generated ?? detail?.meta?.aiGenerated ?? detail?.meta?.ai_generated
    if (typeof raw === 'boolean') return raw
    if (typeof raw === 'number') return raw === 1
    if (typeof raw === 'string') {
        const normalized = raw.trim().toLowerCase()
        return normalized === 'true' || normalized === '1' || normalized === 'yes'
    }
    return false
}

function addTag() {
    const val = tagInput.value.trim()
    if (val && !postTags.value.includes(val)) {
        postTags.value.push(val)
    }
    tagInput.value = ''
}
function removeTag(tag: string) {
    postTags.value = postTags.value.filter(t => t !== tag)
}
function toggleFeatured() {
    if (postTags.value.includes('featured')) {
        removeTag('featured')
    } else {
        postTags.value.push('featured')
    }
}

async function restorePost() {
    if (!isCloudEditing.value || !postId.value) return
    if (!requireCloudAuth('restore-post')) return
    activeModal.value = 'restore'
}

async function doRestore() {
    if (!postId.value) return

    try {
        const res = await fetchWithAuth(`/api/restore?id=${postId.value}&t=${Date.now()}`, { method: 'POST' })
        if (res.ok) {
            // clear local draft too
            localStorage.removeItem(draftKey.value)

            // Also clear history
            sessionStorage.removeItem(historyKey.value)

            await initLoad()
            activeModal.value = 'none'
        } else {
            alert('Failed to restore')
        }
    } catch (e) {
        alert('Error restoring')
    }
}

// Render all ```mermaid ... ``` fenced blocks into inline SVGs.
// This runs only in the editor (admin) environment before saving.
async function renderMermaidBlocksInMarkdown(md: string) {
    if (!md || !/```\s*mermaid\b/.test(md)) return md
    let mod: any
    try {
        mod = await import('mermaid')
    } catch (e) {
        console.warn('Failed to load mermaid for rendering on save', e)
        return md
    }
    const mermaid = (mod && mod.default) || mod
    try {
        mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: { fontFamily: 'var(--app-font-stack)' } })
    } catch (e) {
        // ignore init errors
    }

    function sanitizeSvg(svg: string) {
        if (!svg) return svg
        // Normalize any absolute URL marker references to a single global fragment id
        // and fall back other url(#id) usages to the global arrow to ensure consistent rendering.
        try {
            // Remove absolute URL wrapper if present
            svg = svg.replace(/marker-(?:end|start)=("|')?url\([^#)]*#([^\)"']+)\)("|')?/g, 'marker-$1')
        } catch (e) {
            // noop
        }
        // Replace any marker-(end|start)="url(#whatever)" with the global id
        svg = svg.replace(/marker-(end|start)=("|')?url\(\#([^\)"']+)\)("|')?/g, (m, pos) => {
            return `marker-${pos}="url(#chronicle-mermaid-arrow)"`
        })
        // Also replace standalone url(#...) occurrences (e.g., in styles) to point to global arrow
        svg = svg.replace(/url\((?:"|')?\#([^\)"']+)(?:"|')?\)/g, 'url(#chronicle-mermaid-arrow)')
        return svg
    }

    const regex = /```\s*mermaid\s*\n([\s\S]*?)\n```/g
    let lastIndex = 0
    let out = ''
    let match: RegExpExecArray | null
    let idx = 0
    while ((match = regex.exec(md)) !== null) {
        const full = match[0]
        const code = match[1]
        out += md.slice(lastIndex, match.index)
        try {
            const id = 'mermaid_' + Date.now() + '_' + (idx++)
            const res = await mermaid.render(id, code)
            let svg = res && (res.svg || res)
            svg = String(svg || '')
            svg = sanitizeSvg(svg)
            out += `<div class="mermaid-svg">${svg}</div>`
        } catch (e) {
            console.warn('mermaid render failed on save, leaving source block', e)
            out += full
        }
        lastIndex = regex.lastIndex
    }
    out += md.slice(lastIndex)
    return out
}

// Prerender Mermaid SVG into compiled HTML code blocks (language=mermaid).
// This keeps frontend read-only: Astro side only consumes prerendered SVG.
async function prerenderMermaidInCompiledHtml(html: string) {
    if (!html || !/data-language="mermaid"/.test(html)) return html

    let mod: any
    try {
        mod = await import('mermaid')
    } catch (e) {
        console.warn('Failed to load mermaid for compiledHtml prerender', e)
        return html
    }

    const mermaid = (mod && mod.default) || mod
    try {
        mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: { fontFamily: 'var(--app-font-stack)' } })
    } catch (e) {
        // ignore init errors
    }

    const host = document.createElement('div')
    host.innerHTML = html

    const blocks = host.querySelectorAll('.content-block[data-language="mermaid"] .code-chunk-container, .code-chunk-container[data-language="mermaid"]')
    let idx = 0

    for (const block of Array.from(blocks)) {
        try {
            const textarea = block.querySelector('.code-textarea') as HTMLTextAreaElement | null
            const codeText = textarea ? (textarea.value || textarea.textContent || '').trim() : ''
            if (!codeText) continue

            const id = 'mermaid_compiled_' + Date.now() + '_' + (idx++)
            const res = await mermaid.render(id, codeText)
            let svg = (res && (res.svg || res)) ? String(res.svg || res) : ''
            // Normalize any marker references to use the global chronicle id so markers render consistently
            svg = svg.replace(/marker-(end|start)=("|')?url\([^#)]*#([^\)"']+)\)("|')?/g, (m, pos) => {
                return `marker-${pos}="url(#chronicle-mermaid-arrow)"`
            })
            svg = svg.replace(/url\((?:"|')?[^#\)"']*#([^\)"']+)(?:"|')?\)/g, 'url(#chronicle-mermaid-arrow)')
            if (!svg) continue

            let holder = block.querySelector('.mermaid-prerendered') as HTMLDivElement | null
            if (!holder) {
                holder = document.createElement('div')
                holder.className = 'mermaid-prerendered'
                holder.style.display = 'none'
                block.appendChild(holder)
            }
            holder.innerHTML = `<div class="mermaid-svg">${svg}</div>`
        } catch (e) {
            console.warn('mermaid render failed for compiledHtml block', e)
        }
    }

    return host.innerHTML
}

function getAdminAuthToken() {
    try {
        const raw = localStorage.getItem('chronicle_auth')
        if (!raw) return ''
        const parsed = JSON.parse(raw)
        return typeof parsed?.token === 'string' ? parsed.token : ''
    } catch (e) {
        return ''
    }
}

async function triggerAstroBuild(postId: string) {
    const token = getAdminAuthToken()
    if (!token) {
        throw new Error('Missing auth token')
    }

    isBuilding.value = true
    try {
        const res = await fetchWithAuth(`/api/admin/build/astro?t=${Date.now()}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Chronicle-Auth': token,
            },
            body: JSON.stringify({
                postId,
                reason: 'publish',
            }),
        })

        if (!res.ok) {
            throw new Error(await readApiErrorMessage(res, `HTTP ${res.status}`))
        }

        const data = await res.json().catch(() => ({}))
        if (data.status === 'timeout') {
            showToast((data.message || t('settings.buildTimeout')) as string, { status: 'warning', position: 'bottom-center', shape: 'capsule' })
        }

        postStatus.value = 'published'
    } finally {
        isBuilding.value = false
    }
}

async function doSave(action?: 'local' | 'draft' | 'publish' | 'upload' | 'unsaved') {
    // Determine intent based on action
    const intent = action || (activeModal.value || 'draft')
    if (intent === 'local' || !intent && (!isCloudEditing.value && activeModal.value !== 'publish')) {
        const titleToKeep = (tempTitle.value && tempTitle.value.trim())
            ? tempTitle.value
            : (isDefaultTitle.value ? t('editor.untitled') : postTitle.value)

        const now = new Date().toISOString()
        postId.value = null
        postTitle.value = titleToKeep
        postStatus.value = 'local'
        postUpdated.value = now
        if (!postDate.value) postDate.value = now
        savedContent.value = localValue.value
        savedTitle.value = titleToKeep
        activeModal.value = 'none'
        await saveFile()
        return
    }

    if (intent === 'upload' || !intent && (!isCloudEditing.value && activeModal.value === 'publish')) {
        if (!requireCloudAuth('create-cloud-post')) return

        const titleToSeed = (tempTitle.value && tempTitle.value.trim())
            ? tempTitle.value.trim()
            : (isDefaultTitle.value ? t('editor.untitled') : postTitle.value)

        // Request an id from backend now, store draft under id-specific keys, then redirect to new-[id]
        try {
            const allocRes = await fetchWithAuth('/api/post/allocate-id', { method: 'POST' })
            if (allocRes.ok) {
                const allocData = await allocRes.json()
                const newId = allocData && allocData.id
                if (newId) {
                    localStorage.setItem(`chronicle_draft_${newId}`, localValue.value)
                    localStorage.setItem(`chronicle_draft_meta_${newId}`, JSON.stringify({
                        title: titleToSeed,
                        tags: postTags.value,
                        font: postFont.value,
                        author: postAuthor.value,
                        aiGenerated: postAIGenerated.value,
                    }))
                    sessionStorage.setItem(`chronicle_history_${newId}`, JSON.stringify({
                        stack: history.value,
                        index: historyIndex.value,
                    }))

                    // 自动保存
                    savedContent.value = localValue.value 
                    savedTitle.value = postTitle.value
                    router.replace({ path: '/editor', query: { id: `new-${newId}` } })
                    postId.value = newId
                    activeModal.value = 'none'
                    await doSave('publish')
                    return
                }
            }
        } catch (e) {
            console.error('[BlogEditor] allocate-id failed during upload redirect', e)
        }

        // Fallback: behave as before (open new local)
        postId.value = null
        postTitle.value = t('editor.untitled')
        isDefaultTitle.value = true
        postStatus.value = 'local'
        postDate.value = ''
        postUpdated.value = ''
        postAuthor.value = ''
        postAIGenerated.value = false
        localValue.value = ''
        savedContent.value = ''
        savedTitle.value = t('editor.untitled')
        history.value = ['']
        historyIndex.value = 0
        return
    }

    const previousPostId = postId.value
    let status = postStatus.value

    if (intent === 'publish') {
        status = 'published'
    } else if (intent === 'draft') {
        // If we are currently published or modifying, we stay in modifying state (draft of published)
        if (postStatus.value === 'published' || postStatus.value === 'modifying') {
            status = 'modifying'
        } else {
            status = 'draft'
        }
    } else if (intent === 'unsaved' || intent === 'local') {
        // Default to keeping current status
        if (postStatus.value === 'local') {
            status = 'draft'
        } else {
            status = postStatus.value === 'building' ? 'published' : postStatus.value
        }
    }

    isSaving.value = true
    try {
        const titleToSend = (tempTitle.value && tempTitle.value.trim())
            ? tempTitle.value
            : (isDefaultTitle.value ? t('editor.untitled') : postTitle.value)

        // 处理 blob URL：上传本地文件并替换为云端 URL
        let contentToSend = localValue.value
        const blobMappings = await uploadBlobFiles(contentToSend)
        if (blobMappings.length > 0) {
            contentToSend = replaceBlobUrls(contentToSend, blobMappings)
            // 更新编辑器内容，替换 blob URL 为云端 URL
            localValue.value = contentToSend
        }

        const toc: Array<{ id: string; text: string; level: number }> = []
        let compiledHtml = ''
        if (status === 'published') {
            compiledHtml = convertToHtml(contentToSend, { wrapBlocks: true })
            compiledHtml = await prerenderMermaidInCompiledHtml(compiledHtml)
        }

        let requestId = postId.value
        let isNewPost = false

        if (!requestId) {
            const queryId = editorQueryId.value
            if (queryId && queryId.startsWith('new-')) {
                requestId = queryId.replace(/^new-/, '')
                isNewPost = true
            } else {
                const allocRes = await fetchWithAuth('/api/post/allocate-id', { method: 'POST' })
                if (allocRes.ok) {
                    const allocData = await allocRes.json()
                    requestId = allocData && allocData.id
                    isNewPost = true
                }
                if (!requestId) {
                    alert('Failed to allocate id')
                    return
                }
            }
        }

        const res = await fetchWithAuth(`/api/post?t=${Date.now()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: requestId,
                title: titleToSend,
                content: contentToSend,
                status: status,
                tags: postTags.value,
                font: postFont.value,
                author: postAuthor.value,
                aiGenerated: postAIGenerated.value,
                compiledHtml,
                toc,
                newPost: isNewPost,
            })
        })

        if (res.ok) {
            const data = await res.json()
            if (data.id) {
                if (previousPostId === 'new') {
                    localStorage.removeItem('chronicle_draft_new')
                    sessionStorage.removeItem('chronicle_history_new')
                }

                postId.value = data.id
                postTitle.value = tempTitle.value
                if (status) postStatus.value = status
                postUpdated.value = new Date().toISOString()
                if (!postDate.value) postDate.value = postUpdated.value

                savedContent.value = localValue.value
                savedTitle.value = tempTitle.value

                if (previousPostId && previousPostId !== 'new') {
                    localStorage.removeItem(`chronicle_draft_${previousPostId}`)
                    sessionStorage.removeItem(`chronicle_history_${previousPostId}`)
                }

                if (!previousPostId && intent === 'publish') {
                    const currentUrl = new URL(window.location.href)
                    currentUrl.searchParams.set('id', data.id)
                    router.replace(currentUrl.pathname + currentUrl.search)
                } else if (previousPostId === 'new' && route.query.id !== data.id) {
                    router.replace({ query: { ...route.query, id: data.id } as any })
                } else if (editorQueryId.value && editorQueryId.value.startsWith('new-')) {
                    router.replace({ query: { id: data.id } as any })
                }
            }

            const shouldBuildAstro = status === 'published'
            closeModals()

            if (shouldBuildAstro) {
                const settings = settingsStore.value
                const allowBuild = !!(settings && settings.autoBuildOnPublish)

                if (allowBuild) {
                    try {
                        await triggerAstroBuild(data.id || postId.value || '')
                    } catch (buildError) {
                        postStatus.value = 'published'
                        console.error('[BlogEditor] Astro build failed after publish', buildError)
                        const rawMessage = buildError instanceof Error ? buildError.message : (t('editor.buildFailed') as string)
                        showToast(`${t('settings.buildErrorPrefix') as string}${rawMessage}`, { status: 'error', position: 'bottom-center', shape: 'capsule' })
                    }
                } else {
                    postStatus.value = 'published'
                }
            }
        } else {
            const errorData = await res.json().catch(() => ({}))
            const errorMessage = errorData.message || 'Save failed'

            if (res.status === 400) {
                if (errorMessage === 'ID already exists' || errorMessage === 'Invalid id format' || errorMessage === 'ID required') {
                    try {
                        const allocRes = await fetchWithAuth('/api/post/allocate-id', { method: 'POST' })
                        if (allocRes.ok) {
                            const allocData = await allocRes.json()
                            const newId = allocData && allocData.id
                            if (newId) {
                                showToast(t('editor.usingNewIdRetry') as string, { status: 'warning', position: 'bottom-center', shape: 'capsule' })
                                const currentUrl = new URL(window.location.href)
                                currentUrl.searchParams.set('id', `new-${newId}`)
                                router.replace(currentUrl.pathname + currentUrl.search)
                                return
                            }
                        }
                    } catch (e) {
                        console.error('[BlogEditor] allocate-id failed after error', e)
                    }
                    alert(`${errorMessage}. Please try again.`)
                } else {
                    alert(errorMessage)
                }
            } else {
                alert(errorMessage)
            }
        }
    } catch (e) {
        console.error('[BlogEditor] Save error', e)
        alert('Error saving')
    } finally {
        isSaving.value = false
    }
}

// Directly save local posts without opening the modal
async function saveLocalDirect(titleArg?: string) {
    try {
        const titleToKeep = (titleArg && titleArg.trim())
            ? titleArg.trim()
            : (isDefaultTitle.value ? t('editor.untitled') : postTitle.value)

        const now = new Date().toISOString()
        postId.value = null
        postTitle.value = titleToKeep
        postStatus.value = 'local'
        postUpdated.value = now
        if (!postDate.value) postDate.value = now
        savedContent.value = localValue.value
        savedTitle.value = titleToKeep

        const ok = await saveFile()
        if (ok) {
            // If we have a file path/handle, use its filename as displayed title
            if (currentFilePath.value) {
                const name = String(currentFilePath.value).replace(/^.*[\\\/]/, '').replace(/\.[^/.]+$/, '')
                postTitle.value = name || titleToKeep
                savedTitle.value = postTitle.value
            }
            return true
        }
        return false
    } catch (e) {
        console.error('saveLocalDirect failed', e)
        return false
    }
}

function handleTopRightSave(type: 'draft' | 'publish') {
    // For local editing, perform direct save without modal
    if (!isCloudEditing.value) {
        void saveLocalDirect()
        return
    }
    // For cloud editing, keep previous behavior that may need modal input
    openSaveModal(type)
}

function openSaveModal(type: 'draft' | 'publish') {
    refreshCloudAuthState()
    tempTitle.value = postTitle.value
    activeModal.value = type
}

function closeModals() {
    activeModal.value = 'none'
    pendingRoute.value = null
    clearVersionConflictState()
}

async function handleUnsavedOption(action: 'save' | 'discard') {
    if (action === 'save') {
        await doSave() // Saves with current status
    }

    // Force clean state to allow navigation
    savedContent.value = localValue.value
    savedTitle.value = postTitle.value

    activeModal.value = 'none'

    if (pendingActionCallback) {
        pendingActionCallback()
        pendingActionCallback = null
        return
    }

    if (pendingRoute.value) {
        router.push(pendingRoute.value)
        pendingRoute.value = null
    }
}

/*
function pushHistory(val: string) {
    if (isTimeTraveling.value) return

    // Prevent duplicate adjacent states
    if (historyIndex.value >= 0 && history.value[historyIndex.value] === val) return

    // Limit stack size if starting from scratch isn't ideal, but for now just slice future
    if (historyIndex.value < history.value.length - 1) {
        history.value = history.value.slice(0, historyIndex.value + 1)
    }

    history.value.push(val)

    // Maintain max size
    if (history.value.length > MAX_HISTORY) {
        history.value.shift()
        historyIndex.value-- // Shift index as well since array shifted
    }
    historyIndex.value = history.value.length - 1

}

const debouncedPush = debounce(pushHistory, 500)
*/

// Navigation Guards
const handleNavigation = (to: any, from: any, next: any) => {
    if (isDirty.value) {
        // Pause navigation
        pendingRoute.value = to
        activeModal.value = 'unsaved'
        // If we cancel the navigation here, standard router behavior is to abort.
        // If it's a param change (update), it just stays.
        // But we want to show modal.
        // IMPORTANT: For route changes *within* same component, we need to pass next(false) 
        // OR simply not call next(). But we must call next(false) to reset URL if it changed?
        // Actually, if we use onBeforeRouteUpdate, the url hasn't changed effectively yet.
        next(false)
    } else {
        next()
    }
}

onBeforeRouteLeave(handleNavigation)

onBeforeRouteUpdate(async (to, from, next) => {
    if (isDirty.value) {
        pendingRoute.value = to
        activeModal.value = 'unsaved'
        next(false)
    } else {
        // Proceed with update
        next()
        // Manually trigger load since we are staying in component
        // Wait, next() will update the route object. 
        // We can just watch route.query.id, or better, call initLoad here if we want manual control.
        // But let's trust the Watcher or call initLoad manually?
        // The existing code has `initLoad` called on mounted.
        // Does it assume route change reloads?
        // User asked to "close existing... reload new".
        // If we use next(), the route updates. We should watch route query to reload.
    }
})

// Watch query change to reload data when navigation keeps component alive
watch(() => route.query.id, async (newId, oldId) => {
    if (newId !== oldId) {
        await initLoad()
    }
})

async function loadPostById(id: string) {
    try {
        postAuthor.value = ''
        postAIGenerated.value = false
        const detailRes = await fetchWithAuth(`/api/post?id=${id}&mode=edit&t=${Date.now()}`)
        if (!detailRes.ok) {
            return false
        }
        const detail = await detailRes.json()
        const draft = localStorage.getItem(`chronicle_draft_${id}`)
        const sessionHistory = sessionStorage.getItem(`chronicle_history_${id}`)
        if (draft && normalizeContentForCompare(draft) !== normalizeContentForCompare(detail.content || '')) {
            pendingConflictDetail.value = detail
            pendingConflictDraft.value = draft
            pendingConflictSessionHistory.value = sessionHistory
            activeModal.value = 'syncConflict'
            return true
        }
        applyLoadedPost(detail, draft || detail.content || '', sessionHistory, false)
        return true
    } catch (e) {
        console.error("Failed to load post", e)
        return false
    }
}

async function initLoad() {
    refreshCloudAuthState()
    const queryId = editorQueryId.value

    // 严格校验 query：仅允许存在单一的 `id` 参数；否则导航到无 query（本地 editor）
    try {
        const qkeys = Object.keys(route.query || {})
        if (qkeys.length > 0) {
            if (!(qkeys.length === 1 && qkeys[0] === 'id')) {
                router.replace({ path: '/editor' })
                return
            }
        }
    } catch (e) {
        // 如果读取 query 失败，回退到无 query
        router.replace({ path: '/editor' })
        return
    }

    // 1. 未登录直接跳转登录
    if (queryId && !isCloudAuthenticated()) {
        goToLogin(queryId === 'new' ? 'create-cloud-post' : 'open-cloud-post')
        return
    }


    // 2. id=new，向后端请求分配唯一id，跳转到 id=new-[id]
    if (queryId === 'new') {
        try {
            const res = await fetchWithAuth('/api/post/allocate-id', { method: 'POST' })
            if (res.ok) {
                const data = await res.json()
                if (data && data.id) {
                    router.replace({ path: '/editor', query: { id: `new-${data.id}` } })
                    return
                }
            }
        } catch (e) { }
        // 分配失败，回退本地新建
        postId.value = null
        postTitle.value = t('editor.untitled')
        isDefaultTitle.value = true
        postStatus.value = 'local'
        postDate.value = ''
        postUpdated.value = ''
        postAuthor.value = ''
        postAIGenerated.value = false
        localValue.value = ''
        savedContent.value = ''
        savedTitle.value = t('editor.untitled')
        history.value = ['']
        historyIndex.value = 0
        return
    }

    // 3. id=new-xxx，调用后端校验接口
    if (queryId && /^new-([a-zA-Z0-9\-_]+)$/.test(queryId)) {
        const match = queryId.match(/^new-([a-zA-Z0-9\-_]+)$/)
        const candidateId = match && match[1]
        let valid = false
        let reason = ''
        try {
            const res = await fetchWithAuth('/api/post/validate-id', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: candidateId })
            })
            if (res.ok) {
                const data = await res.json()
                valid = !!(data && data.valid)
                reason = data && data.reason || ''
            }
        } catch (e) { }

        // 如果id已存在（conflict），加载已有文章，地址栏变为id=xxx
        if (reason === 'conflict') {
            if (!candidateId) {
                router.replace({ path: '/editor', query: { id: 'new' } })
                return
            }
            const ok = await loadPostById(candidateId)
            if (ok) {
                router.replace({ query: { id: candidateId } as any })
            } else {
                router.replace({ path: '/editor', query: { id: 'new' } })
            }
            return
        }

        // 如果id格式不合法（invalid-format），回退到id=new
        if (!valid || reason === 'invalid-format') {
            router.replace({ path: '/editor', query: { id: 'new' } })
            return
        }

        // id可用，尝试从本地存储恢复临时草稿（如果存在），否则清空编辑区准备新建云端文章
        postId.value = candidateId
        const draftKey = `chronicle_draft_${candidateId}`
        const metaKey = `chronicle_draft_meta_${candidateId}`
        const historyKey = `chronicle_history_${candidateId}`
        const savedDraft = localStorage.getItem(draftKey)
        const savedMetaRaw = localStorage.getItem(metaKey)
        const savedHistoryRaw = sessionStorage.getItem(historyKey)
        let savedMeta = null
        try { savedMeta = savedMetaRaw ? JSON.parse(savedMetaRaw) : null } catch (e) { savedMeta = null }
        let savedHistory = null
        try { savedHistory = savedHistoryRaw ? JSON.parse(savedHistoryRaw) : null } catch (e) { savedHistory = null }

        postTitle.value = (savedMeta && savedMeta.title) ? savedMeta.title : t('editor.untitled')
        isDefaultTitle.value = !(savedMeta && savedMeta.title)
        postStatus.value = 'draft'
        postDate.value = ''
        postUpdated.value = ''
        postAuthor.value = (savedMeta && savedMeta.author) ? savedMeta.author : ''
        postAIGenerated.value = !!(savedMeta && savedMeta.aiGenerated)
        localValue.value = savedDraft || ''
        savedContent.value = ''
        savedTitle.value = postTitle.value
        history.value = (savedHistory && savedHistory.stack) ? savedHistory.stack : ['']
        historyIndex.value = (savedHistory && typeof savedHistory.index === 'number') ? savedHistory.index : 0
        postTags.value = (savedMeta && savedMeta.tags) ? savedMeta.tags : []
        postFont.value = (savedMeta && savedMeta.font) ? savedMeta.font : 'sans'
        // If we restored from localStorage, remove the temporary keys to avoid reuse
        try { localStorage.removeItem(draftKey); localStorage.removeItem(metaKey); sessionStorage.removeItem(historyKey) } catch (e) { }
        return
    }

    // 4. 非法 id，回退至本地 editor（no query）
    if (queryId && !/^[a-zA-Z0-9\-_]+$/.test(queryId)) {
        router.replace({ path: '/editor' })
        return
    }

    // 4. id=xxx，尝试加载，失败则回退到 id=new
    if (queryId) {
        const ok = await loadPostById(queryId)
        if (!ok) {
            router.replace({ path: '/editor', query: { id: 'new' } })
        }
        return
    }

    // 5. 无id，进入本地模式
    postId.value = null
    postTitle.value = t('editor.untitled')
    isDefaultTitle.value = true
    postStatus.value = 'local'
    postDate.value = ''
    postUpdated.value = ''
    postAuthor.value = ''
    postAIGenerated.value = false
    localValue.value = ''
    savedContent.value = ''
    savedTitle.value = t('editor.untitled')
    history.value = ['']
    historyIndex.value = 0
}

watch(() => props.modelValue, (val) => {
    if (val !== localValue.value) localValue.value = val
})

// Main Watcher
watch(localValue, (val) => {
    emit('update:modelValue', val)
    if (!isTimeTraveling.value) {
        debouncedPush(val)
    }
    void nextTick(() => {
        refreshPreviewSearchSource()
        applyPreviewSearchHighlights()
    })
})

function undo() {
  ;(editorRef.value as any)?.undo()
}

function redo() {
  ;(editorRef.value as any)?.redo()
}

function handleBeforeUnload(e: BeforeUnloadEvent) {
    // Show confirmation dialog
    e.preventDefault()
    e.returnValue = ''
}

onMounted(() => {
    // Attempt to load from cloud to sync latest state
    initLoad()
    void nextTick(() => {
        refreshPreviewSearchSource()
        applyPreviewSearchHighlights()
    })

    // If locale changes and title is still default, update displayed title
    try {
        // `locale` is reactive from useI18n
        watch(() => locale.value, () => {
            if (isDefaultTitle.value) postTitle.value = t('editor.untitled')
        })
    } catch (e) { }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
    window.removeEventListener('keydown', onKeydown)
})

type LayoutMode = 'split' | 'edit' | 'preview'
const layout = ref<LayoutMode>('split')
const isMobile = ref(false) // placeholder for responsiveness

const displayModes = computed(() => [
    { label: t('editor.view.split'), value: 'split' as LayoutMode, icon: Icons.columns },
    { label: t('editor.view.edit'), value: 'edit' as LayoutMode, icon: Icons.edit },
    { label: t('editor.view.preview'), value: 'preview' as LayoutMode, icon: Icons.eye }
])

const showEditor = computed(() => layout.value === 'split' || layout.value === 'edit')
const showPreview = computed(() => layout.value === 'split' || layout.value === 'preview')

const editorRef = ref<HTMLTextAreaElement | null>(null)
const previewRef = ref<HTMLDivElement | null>(null)
const activeScroll = ref<'editor' | 'preview' | null>(null)
type SearchPane = 'editor' | 'preview'
const editorSearchOpen = ref(false)
const previewSearchOpen = ref(false)
const editorSearchQuery = ref('')
const previewSearchQuery = ref('')
const editorSearchInputRef = ref<HTMLInputElement | null>(null)
const previewSearchInputRef = ref<HTMLInputElement | null>(null)
const editorSearchMatchIndex = ref(0)
const previewSearchMatchIndex = ref(0)
const previewSearchSource = ref('')
const editorHighlightScrollTop = ref(0)

function refreshPreviewSearchSource() {
    previewSearchSource.value = previewRef.value?.textContent || ''
}

function escapeHtml(text: string) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function buildHighlightedTextHtml(text: string, query: string) {
    const source = String(text || '')
    const needle = String(query || '').trim()
    if (!needle) return escapeHtml(source).replace(/\n/g, '<br>')

    const lowerSource = source.toLowerCase()
    const lowerNeedle = needle.toLowerCase()
    let cursor = 0
    let html = ''

    while (cursor < source.length) {
        const index = lowerSource.indexOf(lowerNeedle, cursor)
        if (index === -1) {
            html += escapeHtml(source.slice(cursor))
            break
        }
        html += escapeHtml(source.slice(cursor, index))
        html += `<mark class="search-hit">${escapeHtml(source.slice(index, index + needle.length))}</mark>`
        cursor = index + Math.max(needle.length, 1)
    }

    return html.replace(/\n/g, '<br>')
}

const editorSearchHighlightHtml = computed(() => buildHighlightedTextHtml(localValue.value || '', editorSearchQuery.value))

function buildSearchMatches(query: string, content: string) {
    const normalizedQuery = query.trim().toLowerCase()
    const normalizedContent = content.toLowerCase()
    if (!normalizedQuery) return [] as Array<{ start: number; end: number }>

    const matches: Array<{ start: number; end: number }> = []
    let cursor = 0
    while (cursor <= normalizedContent.length) {
        const index = normalizedContent.indexOf(normalizedQuery, cursor)
        if (index === -1) break
        matches.push({ start: index, end: index + normalizedQuery.length })
        cursor = index + Math.max(normalizedQuery.length, 1)
    }
    return matches
}

const editorSearchMatches = computed(() => buildSearchMatches(editorSearchQuery.value, localValue.value || ''))
const previewSearchMatches = computed(() => buildSearchMatches(previewSearchQuery.value, previewSearchSource.value))
const editorSearchMatchCount = computed(() => editorSearchMatches.value.length)
const previewSearchMatchCount = computed(() => previewSearchMatches.value.length)
const editorSearchMatchLabel = computed(() => {
    if (!editorSearchMatchCount.value) return '0/0'
    return `${Math.min(editorSearchMatchIndex.value + 1, editorSearchMatchCount.value)}/${editorSearchMatchCount.value}`
})
const previewSearchMatchLabel = computed(() => {
    if (!previewSearchMatchCount.value) return '0/0'
    return `${Math.min(previewSearchMatchIndex.value + 1, previewSearchMatchCount.value)}/${previewSearchMatchCount.value}`
})

function getSelectedTextForPane(pane: SearchPane) {
    if (pane === 'editor') {
        const el = editorRef.value
        if (!el) return ''
        const start = el.selectionStart ?? 0
        const end = el.selectionEnd ?? 0
        if (end <= start) return ''
        return el.value.slice(start, end).trim()
    }

    const selection = window.getSelection()
    const previewRoot = previewRef.value
    if (!selection || !previewRoot || selection.rangeCount === 0) return ''
    const text = selection.toString().trim()
    if (!text) return ''
    const anchor = selection.anchorNode
    return anchor && previewRoot.contains(anchor) ? text : ''
}

function scrollEditorToMatch(index: number) {
    const match = editorSearchMatches.value[index]
    if (!match || !editorRef.value) return

    editorSearchMatchIndex.value = index
    const lineHeight = Number.parseFloat(getComputedStyle(editorRef.value).lineHeight || '') || 20
    const textBefore = editorRef.value.value.slice(0, match.start)
    const lineNumber = textBefore.split('\n').length - 1
    const targetTop = Math.max(0, lineNumber * lineHeight - editorRef.value.clientHeight / 2)
    editorHighlightScrollTop.value = targetTop
    editorRef.value.scrollTop = targetTop
}

function findTextNodeAtOffset(root: HTMLElement, offset: number) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let current = walker.nextNode()
    let total = 0

    while (current) {
        const text = current.textContent || ''
        const nextTotal = total + text.length
        if (offset <= nextTotal) {
            return { node: current, offset: offset - total }
        }
        total = nextTotal
        current = walker.nextNode()
    }

    return null
}

function clearPreviewSearchHighlights() {
    const root = previewRef.value
    if (!root) return
    root.querySelectorAll('mark.search-hit, mark.search-hit-active').forEach((mark) => {
        const parent = mark.parentNode
        if (!parent) return
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark)
        parent.normalize()
    })
}

function applyPreviewSearchHighlights() {
    const root = previewRef.value
    if (!root) return
    clearPreviewSearchHighlights()

    const query = previewSearchQuery.value.trim()
    if (!query) return

    const activeIndex = previewSearchMatchIndex.value
    const matches = previewSearchMatches.value
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    let current = walker.nextNode() as Text | null
    while (current) {
        if (current.parentElement && !current.parentElement.closest('.search-float')) {
            nodes.push(current)
        }
        current = walker.nextNode() as Text | null
    }

    let globalOffset = 0
    for (const node of nodes) {
        const text = node.textContent || ''
        const lowerText = text.toLowerCase()
        const fragments: Array<Node> = []
        let cursor = 0
        let localOffsetBase = globalOffset

        while (cursor < text.length) {
            const localIndex = lowerText.indexOf(query.toLowerCase(), cursor)
            if (localIndex === -1) break

            if (localIndex > cursor) {
                fragments.push(document.createTextNode(text.slice(cursor, localIndex)))
            }

            const absoluteIndex = localOffsetBase + localIndex
            const matchIndex = matches.findIndex((m) => m.start === absoluteIndex)
            const mark = document.createElement('mark')
            mark.className = matchIndex === activeIndex ? 'search-hit search-hit-active' : 'search-hit'
            mark.textContent = text.slice(localIndex, localIndex + query.length)
            fragments.push(mark)
            cursor = localIndex + query.length
        }

        if (fragments.length) {
            if (cursor < text.length) {
                fragments.push(document.createTextNode(text.slice(cursor)))
            }
            const parent = node.parentNode
            if (parent) {
                fragments.forEach((fragment) => parent.insertBefore(fragment, node))
                parent.removeChild(node)
                parent.normalize()
            }
        }

        globalOffset += text.length
    }

    const activeMark = root.querySelector('mark.search-hit-active') as HTMLElement | null
    if (activeMark) {
        activeMark.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
}

function scrollPreviewToMatch(index: number) {
    const match = previewSearchMatches.value[index]
    const root = previewRef.value
    if (!match || !root) return

    previewSearchMatchIndex.value = index
    applyPreviewSearchHighlights()
    const activeMark = root.querySelector('mark.search-hit-active') as HTMLElement | null
    if (activeMark) {
        activeMark.scrollIntoView({ block: 'center', behavior: 'smooth' })
        return
    }

    const location = findTextNodeAtOffset(root, match.start)
    if (!location) return
    const parent = (location.node.parentElement || root)
    parent.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

function openSearchOverlay(pane: SearchPane, seedFromSelection = true) {
    if (pane === 'editor') {
        if (seedFromSelection) {
            const selectedText = getSelectedTextForPane('editor')
            if (selectedText) editorSearchQuery.value = selectedText
        }
        editorSearchOpen.value = true
        nextTick(() => {
            editorSearchInputRef.value?.focus()
            if (editorSearchMatchCount.value) scrollEditorToMatch(0)
        })
        return
    }

    if (seedFromSelection) {
        const selectedText = getSelectedTextForPane('preview')
        if (selectedText) previewSearchQuery.value = selectedText
    }
    previewSearchOpen.value = true
    nextTick(() => {
        previewSearchInputRef.value?.focus()
        if (previewSearchMatchCount.value) scrollPreviewToMatch(0)
    })
}

function closeSearchOverlay(pane: SearchPane) {
    if (pane === 'editor') editorSearchOpen.value = false
    else previewSearchOpen.value = false
}

function jumpToSearchMatch(pane: SearchPane, delta: number) {
    const count = pane === 'editor' ? editorSearchMatchCount.value : previewSearchMatchCount.value
    if (!count) return
    if (pane === 'editor') {
        const nextIndex = (editorSearchMatchIndex.value + delta + count) % count
        scrollEditorToMatch(nextIndex)
    } else {
        const nextIndex = (previewSearchMatchIndex.value + delta + count) % count
        scrollPreviewToMatch(nextIndex)
    }
}

function buildPrintSnapshot() {
    return {
        title: postTitle.value,
        content: localValue.value,
        font: postFont.value,
        assetMap: assetMap.value,
        postId: postId.value,
        postStatus: postStatus.value,
        postDate: postDate.value,
        postUpdated: postUpdated.value,
        tags: postTags.value,
        author: postAuthor.value,
        aiGenerated: postAIGenerated.value,
        locale: locale.value,
        createdAt: Date.now(),
    }
}

function openPrintPreview(options?: { autoPrint?: boolean }) {
    try {
        const token = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
            ? (crypto as any).randomUUID()
            : `print-${Math.random().toString(36).slice(2, 10)}`
        const storageKey = `chronicle_print_preview_${token}`
        localStorage.setItem(storageKey, JSON.stringify(buildPrintSnapshot()))

        const query = options?.autoPrint ? { token, autoPrint: '1' } : { token }
        const url = router.resolve({ path: '/editor/print', query }).href
        const openedWindow = window.open(url, '_blank')
        if (!openedWindow) {
            router.push({ path: '/editor/print', query })
        }
    } catch (e) {
        console.error('[BlogEditor] failed to open print preview', e)
    }
}

function onEditorScroll() {
    syncScroll('editor')
}

function getCurrentSearchPane(): SearchPane {
    const active = document.activeElement as HTMLElement | null
    if (active && editorSearchInputRef.value && (active === editorSearchInputRef.value || editorSearchInputRef.value.contains(active))) {
        return 'editor'
    }
    if (active && previewSearchInputRef.value && (active === previewSearchInputRef.value || previewSearchInputRef.value.contains(active))) {
        return 'preview'
    }
    if (active && editorRef.value && (active === editorRef.value || editorRef.value.contains(active))) {
        return 'editor'
    }
    if (active && previewRef.value && (active === previewRef.value || previewRef.value.contains(active))) {
        return 'preview'
    }
    return activeScroll.value || 'editor'
}

watch(editorSearchQuery, () => {
    editorSearchMatchIndex.value = 0
    if (editorSearchOpen.value && editorSearchMatchCount.value) {
        nextTick(() => scrollEditorToMatch(0))
    }
})

watch(previewSearchQuery, () => {
    previewSearchMatchIndex.value = 0
    nextTick(() => applyPreviewSearchHighlights())
    if (previewSearchOpen.value && previewSearchMatchCount.value) {
        nextTick(() => scrollPreviewToMatch(0))
    }
})

function onKeydown(e: KeyboardEvent) {
    const key = (e.key || '').toLowerCase()
    const mod = e.ctrlKey || e.metaKey
    if (!mod) return

    if (key === 'f' || key === 'h') {
        openSearchOverlay(getCurrentSearchPane(), true)
        e.preventDefault()
        e.stopPropagation()
        return
    }

    if (key === 's') {
        if (!isCloudEditing.value) {
            e.preventDefault()
            e.stopPropagation()
            void saveLocalDirect()
            return
        }
        openSaveModal('publish')
        e.preventDefault()
        e.stopPropagation()
        return
    }

    if (key === 'p') {
        openPrintPreview()
        e.preventDefault()
        e.stopPropagation()
        return
    }

    if (key === 'z') {
        if (e.shiftKey) {
            redo()
        } else {
            undo()
        }
        e.preventDefault()
        e.stopPropagation()
    } else if (key === 'y') {
        redo()
        e.preventDefault()
        e.stopPropagation()
    }
}

// Image Handling
const uploadedImages = ref<{ name: string, url: string, path: string, thumb?: string }[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)

// Upload Notification State
const uploadState = reactive({
    show: false,
    progress: 0,
    status: '' as 'uploading' | 'processing' | 'success' | 'error',
    message: ''
})
// ...existing code...


// Categories for simplified file manager view
const mediaCategories = computed(() => [
    { id: 'pic', label: t('file.categories.images'), icon: Icons.image },
    { id: 'video', label: t('file.categories.videos'), icon: Icons.video },
    { id: 'sound', label: t('file.categories.audio'), icon: Icons.audio },
    { id: 'doc', label: t('file.categories.documents'), icon: Icons.document },
    { id: 'txt', label: t('file.categories.text'), icon: Icons.codeText },
    { id: 'other', label: t('file.categories.others'), icon: Icons.archive }
])

// Defaults to 'pic' because this is the Image Modal -> Wait, now it's Media Modal
const selectedCategory = ref('pic')

// Update label for modal
const modalTitle = computed(() => t('editor.media'))

watch(selectedCategory, () => {
    fetchServerImages()
})

const displayedFiles = computed(() => uploadedImages.value)
// Helper for file type icons (simplified version of FileManager logic)
const getIconForFile = (name: string) => {
    if (/\.(mp3|wav|ogg|flac)$/i.test(name)) return Icons.audio
    if (/\.(mp4|avi|mov|mkv)$/i.test(name)) return Icons.video
    if (/\.(pdf|doc|docx|ppt|pptx|xls|xlsx)$/i.test(name)) return Icons.document
    if (/\.(txt|md|js|ts|json|c|cpp|h|java|py|sh|bat|ini|log|csv|xml|yaml|yml|vue|css|html)$/i.test(name)) return Icons.codeText
    return Icons.generic
}

async function fetchServerImages() {
    try {
        if (!isCloudAuthenticated()) {
            uploadedImages.value = []
            return
        }
        const path = selectedCategory.value
        const res = await fetchWithAuth(`/api/files?path=${encodeURIComponent(path)}&t=${Date.now()}`)
        if (res.ok) {
            const items = await res.json()
            uploadedImages.value = items
                .filter((i: any) => i.type === 'file')
                .map((i: any) => ({
                    name: i.name,
                    url: i.url || `/server/data/upload/${i.path}`,
                    path: i.url || `/server/data/upload/${i.path}`,
                    thumb: (i.url || `/server/data/upload/${i.path}`).replace('/server/data/upload/', '/server/data/upload/.thumbs/')
                }))
        }
    } catch (e) { console.error(e) }
}

async function openMediaModal() {
    refreshCloudAuthState()
    activeModal.value = 'media'
}

// ... inside handleFileSelect ...
function insertMediaMarkdown(name: string, path: string, category?: string) {
    if (!editorRef.value) return;
    const textarea = editorRef.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = localValue.value;

    // Determine Type
    const ext = name.split('.').pop()?.toLowerCase() || ''
    let insertText = ''

    // 1. Image (Keep standard markdown image)
    const markdownPath = /^(https?:|blob:|data:|file:|\/)/i.test(path) ? path : `${CDN_BASE_URL}${path}`

    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
        // ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂºÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¼ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥CDN
        insertText = `\n![${name}](${markdownPath})\n`;
    }
    // 2. Audio/Video/Doc/Other -> Use standard Link syntax, Parser will render as Card
    else {
        insertText = `\n[${name}](${markdownPath})\n`;
    }

    localValue.value = text.substring(0, start) + insertText + text.substring(end);

    activeModal.value = 'none'

    setTimeout(() => {
        if (editorRef.value) {
            editorRef.value.focus();
            const newCursorPos = start + insertText.length;
            editorRef.value.setSelectionRange(newCursorPos, newCursorPos);
        }
    }, 0);
}

function triggerFileUpload() {
    refreshCloudAuthState()
    fileInputRef.value?.click()
}

async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement
    if (input.files && input.files[0]) {
        if (!isCloudEditing.value) {
            const files = Array.from(input.files)
            files.forEach((file) => {
                const localPath = URL.createObjectURL(file)
                insertMediaMarkdown(file.name, localPath)
            })
            input.value = ''
            return
        }
        const file = input.files[0]
        const filename = encodeURIComponent(file.name)

        // Init Toast
        uploadState.show = true
        uploadState.progress = 0
        uploadState.status = 'uploading'
        uploadState.message = `Uploading: ${file.name}`

        try {
            const xhr = new XMLHttpRequest()
            // Upload should go directly to backend origin when configured to avoid CDN proxying upload requests
            const uploadUrl = API_BASE_URL ? `${API_BASE_URL.replace(/\/$/, '')}/api/upload` : '/api/upload'
            xhr.open('POST', uploadUrl, true)
            xhr.setRequestHeader('Content-Type', 'application/octet-stream')
            xhr.setRequestHeader('X-Filename', filename)

            // Progress: Browser -> Server transfer
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100)
                    uploadState.progress = percent
                    if (percent === 100) {
                        uploadState.status = 'processing'
                        uploadState.message = 'Processing...'
                    }
                }
            }

            xhr.onload = () => {
                if (xhr.status === 200) {
                    uploadState.status = 'success'
                    uploadState.progress = 100
                    uploadState.message = 'Upload successful'

                    try {
                        const data = JSON.parse(xhr.responseText)
                        if (data.category === 'pic') fetchServerImages()

                        if (/\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(file.name)) {
                            insertMediaMarkdown(file.name, data.url)
                        } else {
                            insertMediaMarkdown(file.name, data.url)
                        }
                    } catch (e) {
                        console.error('JSON Parse error', e);
                    }

                    // Auto hide
                    setTimeout(() => { uploadState.show = false }, 3000)
                } else {
                    uploadState.status = 'error'
                    uploadState.message = `Upload failed (${xhr.status})`
                    setTimeout(() => { uploadState.show = false }, 5000) // Keep error longer
                }
            }

            xhr.onerror = () => {
                uploadState.status = 'error'
                uploadState.message = 'Network error'
                setTimeout(() => { uploadState.show = false }, 5000)
            }

            xhr.send(file)
        } catch (e) {
            uploadState.status = 'error'
            uploadState.message = 'Upload error'
            setTimeout(() => { uploadState.show = false }, 5000)
        }
        input.value = ''
    }
}

async function uploadMediaFile(file: File) {
    try {
        const encodedName = encodeURIComponent(file.name)
        const uploadUrl = API_BASE_URL ? `${API_BASE_URL.replace(/\/$/, '')}/api/upload` : '/api/upload'
        const res = await fetchWithAuth(`${uploadUrl}?t=${Date.now()}`, {
            method: 'POST',
            headers: { 'x-filename': encodedName },
            body: file
        })
        if (!res.ok) throw new Error('upload failed')
        const j = await res.json()
        return j && j.url ? j.url : null
    } catch (e) {
        console.error('uploadMediaFile failed', e)
        return null
    }
}

// 提取 markdown 中的所有 blob URL
function extractBlobUrls(markdown: string): string[] {
    const blobUrlPattern = /blob:[^)\s\]]+/g
    const matches = markdown.match(blobUrlPattern)
    return matches ? [...new Set(matches)] : []
}

// 从 blob URL 获取文件对象
async function getFileFromBlobUrl(blobUrl: string): Promise<File | null> {
    try {
        const response = await fetch(blobUrl)
        if (!response.ok) return null
        const blob = await response.blob()
        const filename = `blob_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
        const mimeType = blob.type || 'application/octet-stream'
        return new File([blob], filename, { type: mimeType })
    } catch (e) {
        console.error('getFileFromBlobUrl failed', e)
        return null
    }
}

// 上传所有 blob 文件并返回映射关系
async function uploadBlobFiles(markdown: string): Promise<{ blobUrl: string; cloudUrl: string }[]> {
    const blobUrls = extractBlobUrls(markdown)
    if (blobUrls.length === 0) return []

    const mappings: { blobUrl: string; cloudUrl: string }[] = []

    for (const blobUrl of blobUrls) {
        const file = await getFileFromBlobUrl(blobUrl)
        if (file) {
            const cloudUrl = await uploadMediaFile(file)
            if (cloudUrl) {
                mappings.push({ blobUrl, cloudUrl })
            }
        }
    }

    return mappings
}

// 替换 markdown 中的 blob URL 为云端 URL
function replaceBlobUrls(markdown: string, mappings: { blobUrl: string; cloudUrl: string }[]): string {
    let result = markdown
    for (const { blobUrl, cloudUrl } of mappings) {
        result = result.split(blobUrl).join(cloudUrl)
    }
    return result
}

async function handleMediaPicked(entry: any) {
    if (!entry) return
    try {
        const entries = Array.isArray(entry) ? entry : [entry]
        for (const ent of entries) {
            if (ent.uploadedUrl) {
                insertMediaMarkdown(ent.name || ent.file?.name || 'file', ent.uploadedUrl)
                continue
            }
            if (ent.file) {
                if (isCloudAuthenticated()) {
                    showToast('Uploading...')
                    const url = await uploadMediaFile(ent.file)
                    if (url) insertMediaMarkdown(ent.name || ent.file.name, url)
                    else showToast('Upload failed', { status: 'error' })
                    continue
                }
                if (ent.preview) {
                    insertMediaMarkdown(ent.name || ent.file.name, ent.preview)
                    continue
                }
            }
        }
    } catch (e) { console.error('handleMediaPicked error', e) }
}

function insertImageMarkdown(name: string, path: string) {
    if (!editorRef.value) return;
    const textarea = editorRef.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = localValue.value;

    const insertText = `\n![${name}](${path})\n`;

    localValue.value = text.substring(0, start) + insertText + text.substring(end);

    activeModal.value = 'none'

    setTimeout(() => {
        if (editorRef.value) {
            editorRef.value.focus();
            const newCursorPos = start + insertText.length;
            editorRef.value.setSelectionRange(newCursorPos, newCursorPos);
        }
    }, 0);
}

// Link Modal
const linkText = ref('')
const linkUrl = ref('')

function openLinkModal() {
    // If text selected, pre-fill linkText
    if (editorRef.value) {
        const start = editorRef.value.selectionStart
        const end = editorRef.value.selectionEnd
        if (start !== end) {
            linkText.value = localValue.value.substring(start, end)
        }
    }
    linkUrl.value = ''
    activeModal.value = 'link'
}

function insertLink() {
    const text = linkText.value || 'Link'
    const url = linkUrl.value || '#'
    insertAtCursor(`[${text}](${url})`)
    activeModal.value = 'none'
}

// Table Modal
const tblRows = ref(2)
const tblCols = ref(2)
const tblHoverR = ref(2)
const tblHoverC = ref(2)

watch([tblRows, tblCols], ([r, c]) => {
    tblHoverR.value = r
    tblHoverC.value = c
})

function openTableModal() {
    tblRows.value = 2
    tblCols.value = 2
    tblHoverR.value = 2
    tblHoverC.value = 2
    activeModal.value = 'table'
}

function tableGridHover(r: number, c: number) {
    tblHoverR.value = r
    tblHoverC.value = c
}

function tableGridClick(r: number, c: number) {
    tblRows.value = r
    tblCols.value = c
}

function insertTable() {
    const r = Math.max(1, parseInt(tblRows.value as any) || 1)
    const c = Math.max(1, parseInt(tblCols.value as any) || 1)

    let md = '\n'
    // Header
    md += '| ' + Array(c).fill('Header').join(' | ') + ' |\n'
    // Separator
    md += '| ' + Array(c).fill('---').join(' | ') + ' |\n'
    // Rows
    for (let i = 0; i < r; i++) {
        md += '| ' + Array(c).fill('Cell ' + (i + 1)).join(' | ') + ' |\n'
    }
    md += '\n'

    insertAtCursor(md)
    activeModal.value = 'none'
}

function insertAtCursor(insertText: string) {
    if (!editorRef.value) return;
    const textarea = editorRef.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = localValue.value;

    localValue.value = text.substring(0, start) + insertText + text.substring(end);

    nextTick(() => {
        if (editorRef.value) {
            textarea.focus();
            const newCursorPos = start + insertText.length;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
        }
    });
}

// Scroll sync
function syncScroll(source: 'editor' | 'preview') {
    if (layout.value !== 'split') return
    if (activeScroll.value && activeScroll.value !== source) return

    const scrollDom = (editorRef.value as any)?.getScrollDom?.() as HTMLElement | null
    const preview = previewRef.value
    if (!scrollDom || !preview) return

    const edH = scrollDom.scrollHeight - scrollDom.clientHeight
    const pvH = preview.scrollHeight - preview.clientHeight
    if (edH <= 0 || pvH <= 0) return

    if (source === 'editor') {
        preview.scrollTop = (scrollDom.scrollTop / edH) * pvH
    } else {
        scrollDom.scrollTop = (preview.scrollTop / pvH) * edH
    }
}

/** Scroll preview so the active block is visible. Priority > syncScroll. */
function scrollActiveBlockIntoView() {
    if (!previewRef.value) return
    const el = previewRef.value.querySelector('.active-block') as HTMLElement | null
    if (!el) return
    const container = previewRef.value
    const elTop = el.offsetTop - container.offsetTop
    const elBot = elTop + el.offsetHeight
    const margin = 60
    if (elTop < container.scrollTop + margin) {
        container.scrollTop = Math.max(0, elTop - margin)
    } else if (elBot > container.scrollTop + container.clientHeight - margin) {
        container.scrollTop = elBot - container.clientHeight + margin
    }
}

// Page-level theme & locale — persisted in localStorage, optionally overridden by query params
const LS_THEME = 'chronicle_editor_theme'
const LS_LOCALE = 'chronicle_editor_locale'

function readInitialTheme(): 'dark' | 'light' {
  // 1. Explicit query param override
  const q = (route.query.theme as string) || ''
  if (q === 'dark' || q === 'light') return q
  // 2. localStorage
  const ls = localStorage.getItem(LS_THEME)
  if (ls === 'dark' || ls === 'light') return ls
  // 3. CMS current
  return (document.body.getAttribute('data-backend-theme') as 'dark' | 'light') || 'dark'
}

function readInitialLocale(): string {
  const q = (route.query.locale as string) || ''
  if (q) return q
  const ls = localStorage.getItem(LS_LOCALE)
  if (ls) return ls
  return locale.value
}

const editorTheme = ref<'dark' | 'light'>(readInitialTheme())
watch(editorTheme, (v) => {
  document.body.setAttribute('data-backend-theme', v)
  localStorage.setItem(LS_THEME, v)
}, { immediate: true })

const editorLocale = ref(readInitialLocale())
watch(editorLocale, (v) => {
  locale.value = v as any
  localStorage.setItem(LS_LOCALE, v)
}, { immediate: true })

const cursorLine = ref(1)
const changeRange = ref<{ from: number; to: number } | null>(null)

function onCursorChange(line: number, _col: number) {
    cursorLine.value = line
    // Scroll preview to keep active block visible
    setTimeout(() => scrollActiveBlockIntoView(), 80)
}

function onChangeRange(range: { from: number; to: number }) {
    changeRange.value = range
}
const fontClass = computed(() => {
    return `font-${postFont.value}`
})
</script>

<style scoped>
.blog-editor {
    display: flex;
    flex-direction: column;
    height: 100vh;
    /* ensure editor fills viewport so internal panes scroll, not the page */
    border: none;
    background: var(--bg-primary);
}

.editor-toolbar {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 4px 12px 0 12px;
    /*background: var(--bg-secondary);*/
    background: var(--component-bg-blur);
    border-bottom: 1px solid var(--border-color);
    position: sticky;
    /* keep toolbar fixed inside editor viewport */
    top: 0;
    z-index: 30;
}

.toolbar-row {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 8px 0;
}

.toolbar-row.row-meta {
    justify-content: space-between;
    border-bottom: 1px solid var(--border-color);
    margin-bottom: 0;
    padding-bottom: 8px;
}

.toolbar-row.row-tools {
    justify-content: space-between;
    border-bottom: 1px solid var(--border-color);
    margin-top: 0;
}

.toolbar-row.row-view {
    margin-top: 0;
    padding-top: 8px;
    border-top: none;
}

.meta-left {
    display: flex;
    align-items: center;
    overflow: hidden;
    gap: 12px;
    flex: 1;
}

.actions-right {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
}

.tool-group {
    display: flex;
    align-items: center;
}

.meta-dates {
    display: flex;
    flex-direction: column;
    font-size: 11px;
    line-height: 1.2;
    color: var(--component-text-secondary);
    overflow: hidden;
    transition: all 0.2s;
    --webkit-font-smoothing: antialiased;
    --moz-osx-font-smoothing: grayscale;
}

.date-item {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    gap: 4px;
}

.date-item.faded {
    color: var(--component-text-secondary);
    font-size: 10px;
}

.icon-svg.tiny {
    width: 10px;
    height: 10px;
    opacity: 0.7;
}

.post-title-display {
    margin: 0 0 0 10px;
    font-size: 16px;
    font-weight: 700;
    font-variation-settings: 'wght' 700;
    color: var(--text-primary);
    max-width: 200px;
    /* Reduced to allow space for dates */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.stats-display {
    background-color: transparent;
    font-size: 12px;
    color: var(--component-text-secondary);
    border: none;
}

.status-chip {
    font-size: 0.65em;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 600;
    font-variation-settings: 'wght' 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    border: 1px solid currentColor;
    flex-shrink: 0;
}

.divider {
    width: 1px;
    height: 16px;
    background-color: var(--border-color);
    margin: 0 6px;
}

.toolbar-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--component-text-primary);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    margin-right: 2px;
    height: 28px;
    font-size: 14px;
}

.toolbar-btn:hover {
    border-color: transparent;
}

.toolbar-btn:hover:not(:disabled) {
    background: var(--component-bg-hover);
}

.toolbar-btn.active {
    background: var(--component-bg-accent-blur);
    border: 1px solid var(--component-bg-accent);
}

.toolbar-btn.active:hover {
    background: var(--component-bg-accent);
}

.toolbar-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    color: var(--component-text-secondary-disabled);
    pointer-events: none;
}

.toolbar-btn.font-sans,
.toolbar-btn.font-serif,
.toolbar-btn.font-mono {
    text-transform: capitalize;
    font-size: 1em;
}


.editor-workspace {
    flex: 1;
    min-height: 0;
    /* allow flex children to shrink and enable internal scrolling */
    display: flex;
    overflow: hidden;
    position: relative;
}

.pane {
    flex: 1;
    overflow: auto;
    height: 100%;
}

.editor-pane {
    border-right: 1px solid var(--border-color);
    overflow: hidden;
}

.editor-pane-surface {
    position: relative;
    width: 100%;
    height: 100%;
}

.editor-highlight-layer {
    position: absolute;
    inset: 0;
    padding: 16px 16px 50vh 16px;
    font-family: 'Consolas', monospace;
    font-size: 14px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text-primary);
    pointer-events: none;
    overflow: hidden;
    box-sizing: border-box;
}

.markdown-input {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    background: var(--bg-primary);
    color: var(--text-primary);
    border: none;
    padding: 16px 16px 50vh 16px;
    font-family: 'Consolas', monospace;
    font-size: 14px;
    line-height: 1.5;
    resize: none;
    outline: none;
    box-sizing: border-box;
}

.markdown-input.is-searching {
    color: transparent;
    caret-color: var(--text-primary);
    background: transparent;
}

.preview-pane {
    background: var(--bg-primary);
    padding: 16px 16px 50vh 16px;
    box-sizing: border-box;
}

.preview-pane :deep(mark.search-hit) {
    background: rgba(255, 220, 90, 0.45);
    color: inherit;
    border-radius: 3px;
    padding: 0 1px;
}

.preview-pane :deep(mark.search-hit-active),
.editor-highlight-layer :deep(mark.search-hit-active) {
    background: rgba(255, 140, 0, 0.55);
    color: inherit;
    border-radius: 3px;
    padding: 0 1px;
}

.editor-highlight-layer :deep(mark.search-hit) {
    background: rgba(255, 220, 90, 0.45);
    color: inherit;
    border-radius: 3px;
    padding: 0 1px;
}

/* Layout modifiers */
.layout-split .pane {
    width: 50%;
}

.layout-edit .preview-pane {
    display: none;
}

.layout-preview .editor-pane {
    display: none;
}

.layout-preview .pane {
    width: 100%;
}

.search-float {
    position: fixed;
    bottom: 18px;
    z-index: 1200;
    width: 320px;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid var(--border-color);
    background: var(--component-bg-secondary);
    box-shadow: var(--shadow-elev-2);
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.search-float--editor {
    left: 18px;
}

.search-float--preview {
    right: 18px;
}

.search-float-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

.search-float-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--component-text-primary);
}

.search-close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--component-text-primary);
}

.search-close-btn:hover {
    background: var(--component-bg-hover);
}

.search-float-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.search-input {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--border-color);
    background: var(--bg-primary);
    color: var(--text-primary);
    outline: none;
}

.search-input:focus {
    border-color: var(--component-bg-accent);
}

.search-float-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

.search-counter {
    font-size: 12px;
    color: var(--component-text-secondary);
}

.search-nav-buttons {
    display: flex;
    gap: 8px;
}

button {
    transition: background-color 0.2s, color 0.2s, border-color 0.2s;
    border-radius: 8px;
}

button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}



.search-nav-btn {
    width: 30px;
    height: 30px;
    border-radius: 6px;
    border: 1px solid var(--border-color);
    background: var(--bg-primary);
    color: var(--component-text-primary);
}

.search-nav-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}


.modal-content {
    background: var(--component-bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;

    /* Adaptive Size */
    width: auto;
    min-width: 350px;
    max-width: 90vw;
    height: auto;

    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-elev-2);
    overflow: hidden;
}

/* Default larger modal preference if not specified small */
.modal-content:has(.media-manager-layout) {
    /* Fallback */
    width: 800px;
}

.large-modal {
    width: 800px;
    height: auto;
    min-height: 0;
    /* Ensure space for sidebar */
    max-width: 95vw;
}

.small-modal {
    width: auto;
    min-width: 380px;
    max-width: 500px;
}

.modal-header {
    padding: 0px 16px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--component-bg-primary);
    flex-shrink: 0;
    height: 48px;
}

.modal-header h3 {
    margin: 0;
    font-size: 16px;
    color: var(--component-text-primary);
}

.close-btn {
    background: none;
    border: none;
    color: var(--component-text-secondary);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
}

.close-btn:hover {
    background: transparent;
    color: var(--text-primary);
}

.close-btn :deep(svg) {
    min-width: 20px;
    min-height: 20px;
}

.modal-body {
    padding: 16px;
    overflow-y: auto;
    overflow-x: hidden;
}

.modal-body.media-manager-layout {
    display: flex;
    flex: 1;
    padding: 0;
    overflow: hidden;
}

/* Sidebar */
.modal-sidebar {
    width: 200px;
    background: var(--component-bg-secondary);
    border-right: 1px solid var(--border-color);
    padding: 10px;
    overflow-y: auto;
    flex-shrink: 0;
}

.modal-sidebar-item {
    padding: 8px 12px;
    cursor: pointer;
    border-radius: 4px;
    margin-bottom: 2px;
    display: flex;
    align-items: center;
    color: var(--component-text-primary);
    font-size: 14px;
}



.modal-sidebar-item:hover {
    background: var(--component-bg-hover);
}

.modal-sidebar-item.active {
    background: var(--component-bg-accent-blur);
    border: 1px solid var(--component-bg-accent);
}

.modal-sidebar-item.active:hover {
    background: var(--component-bg-accent);
}

.toolbar-btn.primary-action {
    background: var(--accent-color);
    color: var(--text-on-accent);
}

.toolbar-btn.primary-action:hover {
    background: var(--accent-color-hover);
}

.media-cat-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-right: 10px;
}

.media-cat-icon :deep(svg) {
    width: 100%;
    height: 100%;
}

/* Content Area */
.media-content-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px;
    background: var(--bg-primary);
    overflow: hidden;
}

.media-toolbar {
    margin-bottom: 20px;
    display: flex;
    justify-content: flex-start;
}

.library-section {
    flex: 1;
    overflow-y: auto;
}

.library-section h4 {
    margin-top: 0;
    margin-bottom: 12px;
    color: var(--component-text-primary);
}

.upload-section {
    display: none;
    /* Removed old section style */
}

.image-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 12px;
    padding-bottom: 20px;
}

.primary-btn {
    background: var(--accent-color);
    color: var(--text-on-accent);
    border: none;
    padding: 8px 16px;
    cursor: pointer;
}

.primary-btn:hover {
    background: var(--accent-color-hover);
}

.hidden-input {
    display: none;
}

.library-item {
    cursor: pointer;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    overflow: hidden;
    transition: border-color 0.2s;
    background: var(--bg-secondary);
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
}

.library-item:hover {
    border-color: var(--accent-color);
    background: var(--component-bg-hover);
}

.img-thumb {
    flex: 1;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    width: 100%;
    position: relative;
}

.img-name {
    display: block;
    padding: 6px;
    font-size: 11px;
    color: var(--component-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border-color);
}

.empty-library {
    text-align: center;
    color: var(--component-text-secondary);
    padding: 20px;
}

.img-thumb.icon-thumb {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    background: var(--component-bg-hover);
    color: var(--component-text-secondary);
}

.scalable-icon {
    width: 40px;
    height: 40px;
    display: block;
}

.scalable-icon :deep(svg) {
    width: 100%;
    height: 100%;
    stroke-width: 1;
}

.dataset-control button:hover {
    background: var(--component-bg-hover);
}

.icon-svg {
    display: inline-flex;
    width: 18px;
    height: 18px;
    align-items: center;
    justify-content: center;
    color: inherit;
}

.icon-svg svg {
    width: 100%;
    height: 100%;
    stroke-width: 1.5;
}

.icon-svg.sidebar-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-right: 10px;
}


.status-chip.draft {
    color: var(--component-text-secondary);
    border-color: var(--border-color);
    background: var(--component-bg-blur-alt);
}

.status-chip.published {
    color: var(--accent-color);
    border-color: var(--accent-color);
    background: var(--accent-color-bg);
}

.status-chip.modifying {
    color: var(--featured);
    border-color: var(--featured);
    background: var(--featured-bg);
}

.build-hint {
    color: var(--status-progress);
    font-size: 0.82rem;
    font-weight: 500;
    font-variation-settings: 'wght' 500;
    letter-spacing: 0.02em;
    align-items: center;
    display: inline-flex;
    gap: 6px;
}

.toolbar-btn.danger-btn {
    color: var(--status-error);
}

.toolbar-btn.danger-btn:hover:not(:disabled) {
    background: var(--component-bg-hover);
    color: var(--status-error);
}

.small-modal {
    max-width: 500px;
    width: 90%;
}

.modal-content {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    box-shadow: var(--shadow-elev-2);
    padding: 0;
    width: 80%;
    max-width: 900px;
    display: flex;
    flex-direction: column;
}

.form-group {
    margin-bottom: 12px;
}

.form-group label {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
    color: var(--component-text-primary);
}

.modal-input {
    width: 100%;
    /* Ensure no overflow */
    box-sizing: border-box;
    padding: 10px;
    font-size: 16px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    border-radius: 8px;
    outline: none;
}

.modal-input:focus {
    border-color: var(--accent-color);
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 12px;
}

.secondary-btn {
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--component-text-primary);
    padding: 8px 16px;
    cursor: pointer;
}

.secondary-btn:hover {
    background: var(--component-bg-hover);
}

/* Table Grid Styles */
.table-grid-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
}

.table-grid {
    display: grid;
    grid-template-columns: repeat(8, 24px);
    gap: 4px;
    padding: 10px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
}

.grid-cell {
    width: 24px;
    height: 24px;
    border: 1px solid var(--border-color);
    background: var(--component-bg-blur-alt);
    cursor: pointer;
    border-radius: 2px;
}

.grid-cell:hover {
    border-color: var(--component-bg-accent);
}

.grid-cell.active {
    background: var(--component-bg-accent-blur);
    border-color: var(--component-bg-accent);
}

.grid-info {
    font-size: 13px;
    color: var(--component-text-primary);
    font-weight: 500;
    font-variation-settings: 'wght' 500;
}

.manual-inputs {
    display: flex;
    gap: 15px;
    justify-content: center;
    margin-bottom: 20px;
}

.manual-inputs .form-group {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    margin-bottom: 0;
}

.manual-inputs input {
    width: 60px;
    text-align: center;
}

/* Tags Style */
.tags-input-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--component-bg-blur-alt);
    padding: 8px;
    border-radius: 8px;
    border: 1px solid var(--border-color);
}

.tags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-height: 28px;
}

.tag-badge {
    background: var(--accent-color-bg);
    color: var(--component-text-primary);
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
    border: none;
    user-select: none;
}

.tag-badge.featured {
    background: var(--featured-bg);
    color: var(--featured);
    border-color: var(--featured);
}

.tag-remove {
    background: none;
    border: none;
    color: var(--component-text-secondary);
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    width: 14px;
    height: 14px;
}

.tag-remove:hover {
    color: var(--text-primary);
}

.tag-remove .icon-svg {
    width: 12px;
    height: 12px;
}

.tag-controls {
    display: flex;
    gap: 8px;
}

.small-input {
    padding: 6px 10px;
    font-size: 13px;
    flex: 1;
}

.small-btn {
    padding: 6px 12px;
    font-size: 13px;
    border-color: var(--border-color-blur);
}

.small-btn.active {
    background: var(--featured-bg);
    color: var(--featured);
    border-color: var(--featured);
}

.primary-btn.danger-action {
    background: var(--status-error);
}

.primary-btn.danger-action:hover {
    background: var(--status-error);
    filter: brightness(0.92);
}

/* File Menu Specifics */
.modal-content.file-menu-modal {
    flex-direction: row;
    height: 600px;
}

.file-menu-sidebar {
    width: 200px;
    background: var(--bg-secondary);
    margin: .2rem;
    box-shadow: none;
    border: none;
    padding: 14px;
    display: flex;
    flex-direction: column;
}

.sidebar-btn {
    padding: 8px 12px;
    background: transparent;
    cursor: pointer;
    border-radius: 4px;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    color: var(--component-text-primary);
    font-size: 14px;
}

.sidebar-btn:hover {
    background: var(--component-bg-hover);
    color: var(--text-primary);
}

.sidebar-btn.active {
    background: var(--component-bg-accent-blur);
    border: 1px solid var(--component-bg-accent);
}

.sidebar-btn.active:hover {
    background: var(--component-bg-accent);
}

.main-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border-color);
    padding: 15px;
}

.header h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 18px;
}

.content-body {
    flex: 1;
    overflow-y: auto;
    margin-top: 0;
    padding: 10px 20px;
}

.warning-box {
    background: var(--featured-bg);
    border-left: 3px solid var(--featured);
    padding: 10px;
    margin: 15px 0;
    color: var(--component-text-primary);
    font-size: 13px;
}

.post-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.post-item {
    padding: 12px;
    background: var(--component-bg-blur-alt);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    transition: background 0.2s;
}

.post-item:hover {
    background: var(--component-bg-hover);
}

.post-title {
    font-weight: bold;
    color: var(--text-primary);
    flex: 1;
    margin-right: 10px;
}

.post-date {
    color: var(--component-text-secondary);
    font-size: 0.85em;
    margin-right: 10px;
}

.post-status {
    font-size: 0.75em;
    border-radius: 3px;
    padding: 2px 6px;
    text-transform: uppercase;
    margin-right: 10px;
}

.file-drop-area {
    border: 2px dashed var(--border-color);
    padding: 40px;
    text-align: center;
    color: var(--component-text-secondary);
    margin: 20px 0;
    cursor: pointer;
    border-radius: 6px;
}

.file-drop-area:hover {
    border-color: var(--accent-color);
    color: var(--component-text-primary);
}

.stats-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
    padding: 10px 0;
}

.stat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px;
    background: transparent;
    border-radius: 4px;
}

.stat-label {
    color: var(--component-text-secondary);
    font-size: 0.9em;
}

.stat-value {
    color: var(--accent-color);
    font-weight: bold;
    font-family: monospace;
    font-size: 1.2em;
}

.stats-display {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 12px;
    color: var(--component-text-secondary);
    padding: 4px 8px;
    border-radius: 4px;
    transition: color 0.2s, background 0.2s;
}

.stats-display:hover {
    color: var(--text-primary);
    background: var(--component-bg-hover);
}

/* Font Selector */
.font-selector {
    display: flex;
    gap: 15px;
    margin-top: 5px;
}

.radio-label {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    font-size: 0.9em;
    color: var(--component-text-primary);
}

.radio-label input {
    margin: 0;
}

/* Upload Toast */
.upload-toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 320px;
    background: var(--component-bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    box-shadow: var(--shadow-elev-1);
    z-index: 2000;
    overflow: hidden;
    animation: slideIn 0.3s ease-out;
    color: var(--component-text-primary);
    font-size: 13px;
}

.upload-toast.error {
    border-left: 4px solid var(--status-error);
}

.upload-toast.success {
    border-left: 4px solid var(--status-success);
}

.upload-toast.uploading,
.upload-toast.processing {
    border-left: 4px solid var(--accent-color);
}

.toast-content {
    padding: 12px 16px;
}

.toast-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.toast-title {
    font-weight: 600;
    color: var(--text-primary);
}

.toast-close {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--component-text-secondary);
    padding: 0;
    line-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}

.toast-close:hover {
    color: var(--text-primary);
}

.toast-close .icon-svg {
    width: 14px;
    height: 14px;
    fill: currentColor;
}

.toast-message {
    color: var(--component-text-secondary);
    margin-bottom: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.toast-progress-bg {
    height: 4px;
    background: var(--component-bg-secondary);
    border-radius: 2px;
    overflow: hidden;
}

.toast-progress-bar {
    height: 100%;
    background: var(--accent-color);
    transition: width 0.2s ease;
}

.confirm-text {
    color: var(--component-text-primary);
    margin-bottom: 20px;
}

.danger-outline {
    border-color: var(--status-error);
    color: var(--status-error);
}

.danger-outline:hover {
    background: var(--status-error);
    border-color: var(--status-error);
    color: var(--text-on-accent);
}

.locale-select{
    transition: background 0.2s;
    display: flex;
    justify-content: center;
    text-align: start;
}

.locale-select option{
    background: var(--bg-secondary);
    color: var(--component-text-primary);
}

@keyframes slideIn {
    from {
        transform: translateY(20px);
        opacity: 0;
    }

    to {
        transform: translateY(0);
        opacity: 1;
    }
}

</style>