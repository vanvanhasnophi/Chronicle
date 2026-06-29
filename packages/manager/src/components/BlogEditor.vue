<template>
    <div class="blog-editor" :class="[`layout-${layout}`, { 'is-mobile': isMobile }]" @dragover.prevent>
        <!-- ═══ Ribbon Toolbar ═══ -->
        <div class="editor-ribbon">
            <!-- Hamburger menu (far left) -->
            <div class="ribbon-more ribbon-more--left">
                <button class="ribbon-btn icon-label-btn" @click="showMoreMenu = !showMoreMenu" title="Menu">
                    <span class="icon-svg" v-html="Icons.menu"></span> <span class="label ribbon-btn-label"
                        style="font-size: 13px">{{ t('editor.menu') }}</span>
                </button>
                <div v-if="showMoreMenu" class="more-dropdown" @click.self="showMoreMenu = false">
                    <button @click="openFileMenu(); showMoreMenu = false">
                        <span class="icon-svg more-icon" v-html="Icons.file"></span> {{ t('editor.fileLabel') }}
                    </button>
                    <button @click="openMetaModal(); showMoreMenu = false">
                        <span class="icon-svg more-icon" v-html="Icons.edit"></span> {{ t('editor.meta') || 'Properties'
                        }}
                    </button>
                    <button v-if="postStatus === 'modifying'" @click="restorePost(); showMoreMenu = false">
                        <span class="icon-svg more-icon" v-html="Icons.undo"></span> {{ t('editor.restore') }}
                    </button>
                    <hr>
                    <button :class="{ active: editorTheme === 'dark' }"
                        @click="editorTheme = 'dark'; showMoreMenu = false">
                        <span class="icon-svg more-icon" v-html="Icons.themeDark"></span> {{t('theme.dark')}}
                    </button>
                    <button :class="{ active: editorTheme === 'light' }"
                        @click="editorTheme = 'light'; showMoreMenu = false">
                        <span class="icon-svg more-icon" v-html="Icons.themeLight"></span> {{t('theme.light')}}
                    </button>
                    <hr>
                    <div class="more-locale-row">
                        <span class="icon-svg more-icon" v-html="Icons.globe"></span>
                        <select v-model="editorLocale" class="locale-select" @change="showMoreMenu = false">
                            <option value="en">English</option>
                            <option value="zh-CN">简体中文</option>
                        </select>
                    </div>
                </div>
            </div>
            <span class="ribbon-sep"></span>

            <!-- QAT: Quick Access Toolbar -->
            <div class="ribbon-qat">
                <button class="ribbon-btn qat-btn" @click="undo" :disabled="!canUndo" title="Undo (Ctrl+Z)">
                    <span class="icon-svg" v-html="Icons.undo"></span>
                </button>
                <button class="ribbon-btn qat-btn" @click="redo" :disabled="!canRedo" title="Redo (Ctrl+Y)">
                    <span class="icon-svg" v-html="Icons.redo"></span>
                </button>
                <span class="ribbon-sep"></span>
                <button class="ribbon-btn qat-btn qat-save" @click="() => handleTopRightSave('draft')"
                    :disabled="isSaving" title="Save (Ctrl+S)">
                    <span class="icon-svg" v-html="Icons.save"></span>
                </button>
            </div>

            <!-- Tab bar (responsive, config-driven) -->
            <div class="ribbon-tabs" ref="tabsRef" :data-overflow="tabsOverflow">
                <template v-if="!tabsOverflow">
                    <button v-for="tab in ribbonTabs" :key="tab.id" class="ribbon-tab"
                        :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">
                        <span class="icon-svg tab-icon" v-html="tab.icon"></span> {{ tab.label }} 
                    </button>
                </template>
                <template v-else>
                    <div class="ribbon-more">
                        <button class="ribbon-tab active" @click="tabMenuOpen = !tabMenuOpen">
                            <span class="icon-svg tab-icon" v-html="activeTabDef?.icon"></span> {{ activeTabDef?.label
                            }}
                        <span class="icon-svg ribbon-tab-chevron" v-html="Icons.chevron"></span>
                        </button>
                        <div v-if="tabMenuOpen" class="more-dropdown" @click.self="tabMenuOpen = false">
                            <button v-for="tab in ribbonTabs" :key="tab.id" :class="{ active: activeTab === tab.id }"
                                @click="activeTab = tab.id; tabMenuOpen = false">
                                <span class="icon-svg more-icon" v-html="tab.icon"></span> {{ tab.label }}
                            </button>
                        </div>
                    </div>
                </template>
            </div>

            <!-- Right controls -->
            <div class="ribbon-right">
                <!-- Title inline -->
                <div class="ribbon-title-area">
                    <input v-model="postTitle" class="ribbon-title-input" :placeholder="t('editor.untitled')"
                        spellcheck="false" />
                    <span v-if="!isAboutMode" :class="['ribbon-status', postStatus]">{{ $t('status.' + (postStatus ||
                        'published'))
                    }}</span>
                    <span class="ribbon-save-status" :class="{ building: isBuilding, saving: isSaving, dirty: isDirty || isNewAndClean }"
                        @click="showStatusPopover = !showStatusPopover" @blur="showStatusPopover = false" tabindex="0">
                        <span class="icon-svg"
                            v-html="isBuilding ? Icons.sync : isSaving ? Icons.save : (isNewAndClean || isDirty) ? Icons.dot : Icons.check"></span>
                    </span>
                    <div v-if="showStatusPopover" class="status-popover" @click.self="showStatusPopover = false">
                        <div class="status-popover-row"><span class="status-popover-label">{{ t("editor.statusLabel") }}</span> <span>{{
                            statusLabel
                        }}</span></div>
                        <div v-if="postDate" class="status-popover-row"><span
                                class="status-popover-label">{{ t("editor.createdLabel") }}</span> <span>{{
                                    formatDateTime(postDate, locale, 'absolute', 'show-weekday', 'hide-seconds', '24h', t)
                                }}</span>
                        </div>
                        <div v-if="lastSavedTime" class="status-popover-row"><span class="status-popover-label">Last
                                saved</span>
                            <span>{{ formatDateTime(lastSavedTime, locale, 'relative', 'show-weekday', 'hide-seconds',
                                '24h', t)
                            }}</span>
                        </div>
                        <div v-if="postUpdated" class="status-popover-row"><span class="status-popover-label">Last
                                published</span>
                            <span>{{ formatDateTime(postUpdated, locale, 'relative', 'show-weekday', 'hide-seconds',
                                '24h', t)
                            }}</span>
                        </div>
                    </div>
                </div>
                <span class="ribbon-sep"></span>
                <button class="ribbon-btn" @click="openPrintPreview()" title="Print (Ctrl+P)">
                    <span class="icon-svg" v-html="Icons.print"></span>
                </button>
                <button v-if="!isAboutMode" class="ribbon-btn ribbon-btn-primary icon-label-btn"
                    @click="openSaveModal('publish')" :disabled="isSaving" title="Publish">
                    <span class="icon-svg" v-html="Icons.publish"></span>
                    <span class="btn-label label">{{ isCloudEditing ? t('editor.publish') : t('editor.upload') }}</span>
                </button>
            </div>
        </div>

        <!-- ═══ Ribbon Content (tab-specific) ═══ -->
        <div class="ribbon-content">
            <template v-for="tab in ribbonTabs" :key="tab.id">
                <div v-show="activeTab === tab.id" class="ribbon-group-row">
                    <template v-for="(group, gi) in tab.groups" :key="gi">
                        <div class="ribbon-group">
                            <template v-for="tool in group.tools" :key="tool.id">
                                <span v-if="tool.type === 'spacer'" class="ribbon-spacer"></span>
                                <button v-else-if="tool.isStats" class="ribbon-btn ribbon-btn-wordcount"
                                    @click="activeModal = 'stats'">{{ wordCountLabel }}</button>
                                <button v-else class="ribbon-btn ribbon-btn-lg"
                                    :class="{ active: tool.action ? isToolActive(tool.action) : false }"
                                    @click="handleToolAction(tool.action || '')" :title="tool.label">
                                    <span v-if="tool.icon" class="icon-svg" v-html="tool.icon"></span>
                                    <span class="ribbon-btn-label">{{ t('editor.tool.' + tool.id) || tool.label }}</span>
                                </button>
                            </template>
                        </div>
                        <span v-if="gi < tab.groups.length - 1" class="ribbon-sep ribbon-sep--large"></span>
                    </template>
                </div>
            </template>
        </div>

        <!-- Editor Body: dynamic by route type -->
        <div class="editor-body-wrapper">
          <EditorArticleBody v-if="editorType === 'article'" :key="'article-' + bodyKey" ref="editorBodyRef" v-model="localValue"
            :disabled="!dataReady" :font-class="fontClass"
            :placeholder="t('editor.placeholder')" :layout-mode="(layout as any)" />
          <EditorSlidesBody v-else :key="'slides-' + bodyKey" ref="editorBodyRef" v-model="localValue"
            :disabled="!dataReady" :font-class="fontClass"
            :placeholder="t('editor.placeholder')" :layout-mode="(layout as any)" />
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
                        <!-- New Article / Slides -->
                        <div v-if="fileTab === 'new'" class="tab-pane">
                            <p>{{ t('editor.file.createNew') }}</p>
                            <div class="new-doc-grid">
                                <div class="new-doc-col">
                                    <span class="new-doc-label">{{ t('editor.file.local') }}</span>
                                    <button class="primary-btn" @click="createLocalNew('article')">{{ t('editor.createNewArticle') }}</button>
                                    <button class="primary-btn" @click="createLocalNew('slides')">{{ t('editor.createNewSlides') }}</button>
                                </div>
                                <div class="new-doc-col">
                                    <span class="new-doc-label">{{ t('editor.file.cloud') }}</span>
                                    <button class="secondary-btn" @click="createCloudNew('article')">{{ t('editor.file.newArticleCloud') }}</button>
                                    <button class="secondary-btn" @click="createCloudNew('slides')">{{ t('editor.file.newSlidesCloud') }}</button>
                                </div>
                            </div>
                            <div class="warning-box" style="margin-top:8px;">
                                {{ t('editor.file.createOnlineHint') }}
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
                                            :class="r.cloud ? 'published' : 'local'">{{
                                                r.cloud ? t('editor.file.cloud')
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
                    <FilePicker selectionMode="multiple" :allowLocalPick="!isCloudEditing"
                        :allowUpload="isCloudAuthenticated()"
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

    <!-- Group 2.5: Meta Properties Modal -->
    <div v-if="activeModal === 'meta'" class="modal-overlay">
        <div class="modal-content small-modal">
            <div class="modal-header">
                <h3>{{ t('editor.metaTitle') || 'Properties' }}</h3>
                <button class="close-btn" @click="activeModal = 'none'">
                    <span class="icon-svg" v-html="Icons.close"></span>
                </button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>{{ t('editor.postTitle') }}</label>
                    <input v-model="postTitle" class="modal-input" :placeholder="t('editor.titlePlaceholder')" />
                </div>
                <div class="form-group">
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
                            <button class="secondary-btn small-btn" @click="addTag">{{ t('editor.addTag') }}</button>
                            <button class="secondary-btn small-btn" :class="{ active: postTags.includes('featured') }"
                                @click="toggleFeatured" :title="$t('tag.featured')">
                                {{ $t('tag.featured') }}
                            </button>
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label>{{ t('editor.authorLabel') }}</label>
                    <input v-model="postAuthor" class="modal-input" :placeholder="t('editor.authorPlaceholder')" />
                </div>
                <CheckRow v-model="postAIGenerated" :title="$t('editor.aiGeneratedLabel')" />
                <div class="modal-actions">
                    <button class="primary-btn" @click="activeModal = 'none'">{{ t('editor.done') || 'Done' }}</button>
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
                <!-- About mode: simple confirmation -->
                <template v-if="isAboutMode">
                    <p class="about-save-confirm">{{ t('editor.confirmAboutSave') || 'Save about page content?' }}</p>
                </template>
                <!-- Normal mode: full form -->
                <template v-else>
                    <div class="form-group">
                        <label>{{ t('editor.postTitle') }}</label>
                        <input v-model="tempTitle" class="modal-input" :placeholder="t('editor.titlePlaceholder')"
                            @keyup.enter="doSave()" autofocus />
                    </div>

                    <div v-if="activeModal === 'publish' && !isCloudAuthenticated()"
                        class="login-placeholder upload-login-placeholder">
                        <p>{{ t('editor.file.loginRequired') }}</p>
                        <button class="primary-btn" @click="goToLogin('publish-post')">{{ t('editor.file.login')
                        }}</button>
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
                                <button class="secondary-btn small-btn"
                                    :class="{ active: postTags.includes('featured') }" @click="toggleFeatured"
                                    :title="$t('tag.featured')">
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
                </template>

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

    <!-- Text file insert choice modal -->
    <div v-if="textFileChoice" class="modal-overlay">
        <div class="modal-content small-modal">
            <div class="modal-header">
                <h3>{{ textFileChoice.name }}</h3>
            </div>
            <div class="modal-body">
                <p style="margin-top:6px;">{{ t('editor.textFileChoiceHint') || 'How would you like to insert this file?' }}</p>
                <div class="modal-actions" style="flex-wrap:wrap;">
                    <button class="secondary-btn"
                        @click="doInsertTextFile(textFileChoice!); textFileChoice = null; flushPendingFiles()">
                        {{ t('editor.insertAsText') || 'Insert as text' }}
                    </button>
                    <button class="secondary-btn"
                        @click="doInsertCodeBlock(textFileChoice!); textFileChoice = null; flushPendingFiles()">
                        {{ t('editor.insertAsCode') || 'Insert as code' }}
                    </button>
                    <button class="primary-btn"
                        @click="doInsertFileCard(textFileChoice!); textFileChoice = null; flushPendingFiles()">
                        {{ t('editor.insertAsFile') || 'Insert as a file' }}
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

    <!-- Math Formula Modal -->
    <div v-if="activeModal === 'math'" class="modal-overlay">
        <div class="modal-content small-modal">
            <div class="header">
                <h3>{{ t('editor.mathTitle') }}</h3>
                <button class="close-btn" @click="activeModal = 'none'"><span class="icon-svg"
                        v-html="Icons.close"></span></button>
            </div>
            <div class="modal-body math-modal-body">
                <textarea v-model="mathInput" class="modern-textarea modal-math-textarea" rows="4"
                    placeholder="E = mc^2"></textarea>
                <div class="math-options">
                    <label><input type="radio" v-model="mathMode" value="inline" /> {{ t("editor.mathInline") }}</label>
                    <label><input type="radio" v-model="mathMode" value="block" /> {{ t("editor.mathBlock") }}</label>
                </div>
                <div class="math-preview" >
                    <span class="math-preview-render" ref="mathPreviewRef"></span>
                </div>
                <div class="modal-actions">
                    <button class="secondary-btn" @click="activeModal = 'none'">{{ t('editor.cancel') }}</button>
                    <button class="primary-btn" @click="insertMath">{{ t('editor.insert') }}</button>
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
import { ref, computed, watch, onMounted, onUnmounted, nextTick, reactive, provide } from 'vue'
import { useRoute, useRouter, onBeforeRouteUpdate, onBeforeRouteLeave } from 'vue-router'
// Pipeline A disabled — keep import for future re-enablement
// import MdParser from './MdParser.vue'
import EditorArticleBody from './EditorArticleBody.vue'
import EditorSlidesBody from './EditorSlidesBody.vue'
import { debounce } from '../utils/debounce'
import { Icons } from '../utils/icons'
import { convertToHtml, injectHeadingIds, getStats } from '../utils/markdownParser'
import { renderPreview } from '../utils/markdownPreview'
import { sortTags } from '../utils/tagUtils'
import { useI18n } from 'vue-i18n'
import CheckRow from './ui/CheckRow.vue';
import FilePicker from './FilePicker.vue'
import { formatDate as formatDateUtil, formatDateTime } from '../utils/dateUtils'
import useToast from '../composables/useToast'
import { getNotificationCenter } from '../composables/useNotificationCenter'
import { triggerBuild } from '../composables/useAstroBuild'
import { serializeFrontmatter, parseFrontmatter } from '../composables/useFrontmatter'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const { show: showToast } = useToast()
const CDN_BASE_URL = import.meta.env.VITE_CDN_BASE_URL || ''
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
const isElectron = !!(typeof window !== 'undefined' && (window as any).chronicleElectron?.isElectron)

/** Create a renderable URL for a File: blob:// in browser, file:// in Electron */
async function fileToUrl(file: File): Promise<string> {
    if (isElectron) {
        // Resolve the absolute filesystem path as a file:// URI.
        // Only encode chars that break markdown links (spaces, control chars).
        // CJK stays as-is — same as encodeMarkdownUrl, keeps cloud file list in sync.
        const toFileUri = (raw: string) => {
            const normalized = raw.replace(/\\/g, '/')
            const absolute = normalized.startsWith('/') ? normalized : '/' + normalized
            return 'file://' + absolute.replace(/[\s\x00-\x1f]/g, (c) => encodeURIComponent(c))
        }
        // 1. Sync: try legacy .path property (drag-drop, <input type="file">)
        const p = (file as any).path as string | undefined
        if (p) return toFileUri(p)
        // 2. Async: webUtils.getPathForFile (Electron 32+) — covers clipboard paste
        try {
            const resolved = await ((window as any).chronicleElectron?.getPathForFile?.(file))
            if (resolved) return toFileUri(resolved)
        } catch { }
    }
    // 3. Fallback: in-memory blob (browser, or Electron with no disk backing)
    return URL.createObjectURL(file)
}

/**
 * Create a type-prefixed markdown URL for a File.
 * E.g. "audio:blob:http://...mp3", "document:file:///path/to/report.pdf"
 * The type prefix lets file-card detection work; the actual URL is still used for rendering.
 */
function fileToMarkdownUrl(file: File): Promise<string> {
    return fileToUrl(file).then(url => {
        const prefix = getTypePrefixForFile(file)
        return prefix ? `${prefix}:${url}` : url
    })
}

/** Map a File to a type prefix based on extension or MIME. Images return empty (use ![alt](url) syntax). */
function getTypePrefixForFile(file: File): string {
    const name = file.name || ''
    const ext = name.split('.').pop()?.toLowerCase() || ''
    const mime = (file.type || '').toLowerCase()

    if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return ''
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext)) return 'audio'
    if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext)) return 'video'
    if (mime === 'application/pdf' || ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)) return 'document'
    if (mime.startsWith('text/') || ['txt', 'md', 'js', 'ts', 'json', 'css', 'html', 'log', 'csv', 'xml', 'yaml', 'yml'].includes(ext)) return 'text'
    return 'attach'
}
const editorQueryId = computed(() => {
    const id = route.query.id
    return Array.isArray(id) ? id[0] : id
})

const isCloudEditing = computed(() => !!editorQueryId.value)
const isAboutMode = computed(() => editorQueryId.value === '__about__')

// Editor type — initialised from route, may be updated by API response.
// Uses a ref (not computed) so type correction can update it without
// triggering a router navigation / component remount.
const editorType = ref<'article' | 'slides'>(
  route.path.startsWith('/editor/slides') ? 'slides' : 'article'
)

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

// ── Skeleton & data-ready state ──────────────────────
const dataReady = ref(false)
const bodyKey = ref(0)  // bumped on type switch to force body recreation
const skeletonStatus = ref('editor.skeletonLoading')
const skeletonShowDirectEntry = ref(false)
let skeletonTimer: ReturnType<typeof setTimeout> | null = null

// Provide skeleton state to parent (TextEditor) for page-level overlay
provide('skeletonStatus', skeletonStatus)
provide('skeletonShowDirectEntry', skeletonShowDirectEntry)

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
            next: route.fullPath || '/editor/article',
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
    (e: 'ready'): void
}>()

// Notify parent (TextEditor) when data is ready to dismiss skeleton
watch(dataReady, (val) => { if (val) emit('ready') })

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
const postAuthor = ref<string>('')
const slideshowConfig = ref<Record<string, any>>({}) // æ–°å¢žä½œè€…å­—æ®µ
const postAIGenerated = ref<boolean>(false) // æ–°å¢žAIç”Ÿæˆå­—æ®µ
const postDate = ref<string>('')
const postUpdated = ref<string>('')

// UI State
const isSaving = ref(false)
const isBuilding = ref(false)
const activeModal = ref('none')

// Math modal
const mathInput = ref('')
const mathMode = ref<'inline' | 'block'>('inline')
const mathPreviewRef = ref<HTMLElement | null>(null)

let _katex: any = null
function loadKatex() {
  if (_katex) return Promise.resolve(_katex)
  return import('katex').then(m => { _katex = m.default || m; return _katex })
}

watch(mathInput, (val) => {
  void nextTick(async () => {
    const el = mathPreviewRef.value
    if (!el || !val.trim()) { if (el) el.innerHTML = ''; return }
    try {
      const katex = await loadKatex()
      katex.render(val, el, { throwOnError: false, displayMode: false })
    } catch { el.textContent = val }
  })
})

function insertMath() {
    if (!mathInput.value.trim()) return
    const formula = mathInput.value.trim()
    // Slides use $/$ delimiters (Marp/KaTeX), articles use \(/\[ delimiters
    const isSlides = editorType.value === 'slides'
    const md = mathMode.value === 'inline'
      ? (isSlides ? `$${formula}$` : `\\(${formula}\\)`)
      : (isSlides ? `\n$$\n${formula}\n$$\n` : `\n\\[\n${formula}\n\\]\n`)
    editorBodyRef.value?.insertAtCursor(md)
    mathInput.value = ''
    activeModal.value = 'none'
}

// Footnote modal

function insertFootnote() {
    const ref = `[^${Date.now().toString(36)}]`
    const body = editorBodyRef.value as any
    const view = body?.editorRef?.getEditor?.()
    if (!view) return
    const sel = view.state.selection.main
    const selText = sel.from !== sel.to ? view.state.sliceDoc(sel.from, sel.to) : ''
    // Insert ref after selection (or at cursor if no selection)
    view.dispatch({ changes: { from: sel.to, insert: ref } })
    // Find paragraph end and insert definition
    const doc = view.state.doc.toString()
    const pos = sel.to + ref.length
    const after = doc.slice(pos)
    const m = after.match(/\n\s*\n|$/)
    const insertAt = m?.index != null ? pos + m.index : doc.length
    view.dispatch({ changes: { from: insertAt, insert: `\n\n${ref}: ${selText}` } })
}
const nc = getNotificationCenter()
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
    savedFm.value = buildSavedFm()
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
                    currentFilePath.value = f.name
                    applyOpenedFile(txt, f.name)
                }
                reader.readAsText(f as File)
            } else if (selectedImportUrl.value) {
                const res = await fetch(selectedImportUrl.value)
                const txt = await res.text()
                const filename = selectedImportUrl.value.split('/').pop() || 'imported.md'
                currentFilePath.value = selectedImportUrl.value
                applyOpenedFile(txt, filename)
            }
        } catch (e) { console.error('import action failed', e) }
        return
    }
}

  // ── Shared FM helpers ─────────────────────────────
  const CHRONICLE_FM_KEYS = new Set(['title','date','updatedAt','tags','font','author','aiGenerated','marp','type','slideshow'])
  function isSlidesMeta(meta: Record<string, any>) { return meta.type === 'slides' || meta.marp === true || ['marp','theme','size','paginate','header','class','backgroundColor','backgroundImage','color'].some((k: string) => meta[k] !== undefined) }
  function buildLocalDetail(meta: Record<string, any>, content: string, filename: string, type: 'article' | 'slides') { return { id: null, title: meta.title || filename.replace(/\.[^/.]+$/, ''), date: meta.date || '', updatedAt: '', status: 'local' as const, tags: meta.tags || [], font: meta.font || 'sans', author: meta.author || '', aiGenerated: meta.aiGenerated || false, type, content } }

/**
 * Unified editor update — all open / create-new operations.
 * Detects type switch, bumps bodyKey, then dispatches to the right action.
 */
function updateEditor(targetType: 'article' | 'slides', action: {
  mode: 'local-new'
} | {
  mode: 'cloud-new'
} | {
  mode: 'file'; text: string; filename: string; handle?: any
}) {
  const typeChanged = editorType.value !== targetType
  if (typeChanged) { editorType.value = targetType; bodyKey.value++ }
  const path = targetType === 'slides' ? '/editor/slides' : '/editor/article'

  if (action.mode === 'local-new') {
    clearCurrentLocalDocument()
    if (!typeChanged) bodyKey.value++  // same-type new → force body reset
    router.push(path)
  } else if (action.mode === 'cloud-new') {
    router.push({ path, query: { id: 'new' } })
  } else if (action.mode === 'file') {
    const { meta, content } = parseFrontmatter(action.text)
    if (typeChanged) {
      // Cross-type: defer to initLoad via module variable
      pendingLocalFile = { text: action.text, filename: action.filename, handle: action.handle }
      router.push(path)
    } else {
      // Same-type: load directly
      const detail = buildLocalDetail(meta, action.text, action.filename, targetType)
      applyLoadedPost(detail, content, null, false)
      if (action.handle) { currentFileHandle.value = action.handle; currentFilePath.value = action.handle.name || action.filename }
      else currentFilePath.value = action.filename
      postId.value = null; postStatus.value = 'local'
      pushRecentProject({ title: detail.title, path: action.filename, cloud: false })
    }
  }
  activeModal.value = 'none'
}

// Apply a file's raw text: parse frontmatter, detect type → updateEditor
function applyOpenedFile(text: string, filename: string, handle?: any) {
  const { meta } = parseFrontmatter(text)
  updateEditor(isSlidesMeta(meta) ? 'slides' : 'article', { mode: 'file', text, filename, handle })
}

// File system helpers (browser FS API with fallback)
async function openLocalFilePicker() {
    try {
        if ((window as any).showOpenFilePicker) {
            const [handle] = await (window as any).showOpenFilePicker({
                mode: 'readwrite',
                multiple: false,
                types: [{
                    description: 'Markdown',
                    accept: { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.txt'] }
                }]
            })
            const file = await handle.getFile()
            const text = await file.text()
            applyOpenedFile(text, file.name, handle)
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
                currentFilePath.value = f.name
                applyOpenedFile(txt, f.name)
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

function createLocalNew(type: 'article' | 'slides') {
    const doNew = () => updateEditor(type, { mode: 'local-new' })
    if (isDirty.value) handleUnsavedCheck(doNew)
    else doNew()
}

function createCloudNew(type: 'article' | 'slides') {
    if (!isCloudAuthenticated()) {
        goToLogin('create-cloud-post')
        return
    }
    const doCloud = () => updateEditor(type, { mode: 'cloud-new' })
    if (isDirty.value) handleUnsavedCheck(doCloud)
    else doCloud()
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

/** Build the full file content: frontmatter + markdown body. */
function buildFileContent(): string {
    const now = new Date().toISOString()
    const fm: Record<string, any> = {
        title: postTitle.value || '',
        date: postDate.value || now,
        tags: postTags.value.length ? postTags.value : [],
        author: postAuthor.value || '',
        aiGenerated: postAIGenerated.value || false,
    }
    if (editorType.value !== 'slides') {
        fm.font = postFont.value || 'sans'
    }
    let body = localValue.value
    if (editorType.value === 'slides') {
        // Detect Marp frontmatter in body and merge it into Chronicle frontmatter
        const fmMatch = body.match(/^---\n([\s\S]*?)\n---\n?/)
        if (fmMatch) {
            const rawFm = fmMatch[1]
            const isMarp = /^(marp|theme|size|footer|paginate|header|class|backgroundColor|backgroundImage|color):/m.test(rawFm)
            if (isMarp) {
                body = body.slice(fmMatch[0].length)
                rawFm.split('\n').forEach(line => {
                    const c = line.indexOf(':')
                    if (c < 0) return
                    const k = line.slice(0, c).trim()
                    const v = line.slice(c + 1).trim().replace(/^"(.*)"$/, '$1')
                    if (k && !CHRONICLE_FM_KEYS.has(k)) {
                        fm[k] = v === 'true' ? true : v === 'false' ? false : v
                    }
                })
            }
        }
        fm.marp = true
        // Also pull from slideshow config if set in properties panel
        const ss = slideshowConfig.value || {}
        if (ss.theme && !fm.theme) fm.theme = ss.theme
        if (ss.ratio && !fm.size) fm.size = ss.ratio
        if (ss.footer && !fm.footer) fm.footer = ss.footer
    }
    return serializeFrontmatter(fm, body)
}

async function saveFile() {
    try {
        if (currentFileHandle.value) {
            if (!postDate.value) postDate.value = new Date().toISOString()
            const contents = buildFileContent()
            const ok = await writeFileHandle(currentFileHandle.value, contents)
            if (ok) {
                savedContent.value = localValue.value
                savedFm.value = buildSavedFm()
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
    if (!postDate.value) postDate.value = new Date().toISOString()
    const contents = buildFileContent()
    let saved = false
    // Try File System Access API first
    if ((window as any).showSaveFilePicker) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: `${(postTitle.value || 'untitled').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`,
          types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }]
        })
        const ok = await writeFileHandle(handle, contents)
        if (ok) {
          currentFileHandle.value = handle
          currentFilePath.value = handle.name || null
          savedContent.value = localValue.value
          savedFm.value = buildSavedFm()
          pushRecentProject({ title: postTitle.value, path: currentFilePath.value || undefined, cloud: false })
          showToast(t('editor.file.savedToFile') as string)
          activeModal.value = 'none'
          return true
        }
      } catch (e) {
        // User cancelled or API unavailable — fall through to Blob download
        console.error('saveAs: File System API failed, falling back to download', e)
      }
    }
    // Blob download fallback — always works, no file handle to track
    const blob = new Blob([contents], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const filename = `${(postTitle.value || 'untitled').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast(t('editor.file.savedToFile') as string)
    return true
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
    postFont.value = detail.type === 'slides' ? 'sans' : (detail.font || 'sans')
    postAuthor.value = readAuthorFromDetail(detail)
    postAIGenerated.value = readAiGeneratedFromDetail(detail)
    try { slideshowConfig.value = typeof detail.slideshow === 'object' ? detail.slideshow : JSON.parse(detail.slideshow || '{}') } catch { slideshowConfig.value = {} }
    // For slides: reconstruct Marp style frontmatter from content and prepend to editor
    const postType = detail.type || detail.meta?.type
    if (postType === 'slides') {
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/)
      if (fmMatch) {
        const styleLines: string[] = []
        fmMatch[1].split('\n').forEach(line => {
          const c = line.indexOf(':')
          if (c < 0) return
          const k = line.slice(0, c).trim()
          if (!CHRONICLE_FM_KEYS.has(k)) styleLines.push(line)
        })
        if (styleLines.length > 0) {
          const body = content.slice(fmMatch[0].length)
          localValue.value = `---\n${styleLines.join('\n')}\n---\n\n${body}`
        } else {
          localValue.value = content
        }
      } else {
        localValue.value = content
      }
    } else {
      localValue.value = content
    }
    // Baseline from editor content — guarantees same-source comparison.
    // Slides: keep full content (Marp FM is part of the body).
    // Documents: strip Chronicle FM, compare body only.
    savedContent.value = postType === 'slides' ? localValue.value : normalizeBody(localValue.value)
    // Parse slideshow the same way as slideshowConfig to keep comparisons consistent
    let parsedSlideshow: Record<string, any> | undefined = undefined
    if (postType === 'slides') {
      try {
        parsedSlideshow = typeof detail.slideshow === 'object'
          ? detail.slideshow
          : JSON.parse(detail.slideshow || '{}')
      } catch { parsedSlideshow = {} }
    }
    savedFm.value = {
      title: detail.title,
      date: detail.date || '',
      tags: detail.tags || [],
      author: readAuthorFromDetail(detail),
      aiGenerated: readAiGeneratedFromDetail(detail),
      font: postType === 'slides' ? undefined : (detail.font || 'sans'),
      slideshow: parsedSlideshow,
    }

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
    dataReady.value = true
    void nextTick(() => {
      editorBodyRef.value?.initContent?.(localValue.value)
    })
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
    const basePath = editorType.value === 'slides' ? '/editor/slides' : '/editor/article'
    router.push({ path: basePath })
}

function loadPost(id: string) {
    if (id === postId.value) return
    router.push({ query: { id } })
}
/** Normalized body baseline (frontmatter stripped, line-end trimmed). */
const savedContent = ref('')
/** Baseline frontmatter fields for dirty checking. */
const savedFm = ref<SavedFm>({
  title: '', date: '', tags: [], author: '', aiGenerated: false
})
watch(savedContent, (val) => { if (val) lastSavedTime.value = new Date().toISOString() })
// Maps type-prefix keys ("document:report.pdf") → original File objects
const fileMap = new Map<string, File>()
const pendingRoute = ref<any>(null) // To store where user wanted to go
const fmChanged = computed(() => {
  const s = savedFm.value
  const isSlides = editorType.value === 'slides'
  return (
    postTitle.value !== s.title ||
    postDate.value !== s.date ||
    JSON.stringify(postTags.value.slice().sort()) !== JSON.stringify((s.tags || []).slice().sort()) ||
    postAuthor.value !== s.author ||
    postAIGenerated.value !== s.aiGenerated ||
    (!isSlides && postFont.value !== (s.font || 'sans')) ||
    (isSlides && JSON.stringify(slideshowConfig.value || {}) !== JSON.stringify(s.slideshow || {}))
  )
})

const bodyChanged = computed(() => {
  if (editorType.value === 'slides') return localValue.value !== savedContent.value
  return normalizeBody(localValue.value) !== savedContent.value
})

const isDirty = computed(() => fmChanged.value || bodyChanged.value)
const isNewAndClean = computed(() =>
  !isDirty.value && !isSaving.value && !isBuilding.value &&
  (postStatus.value === 'local' || postStatus.value === 'draft') &&
  !localValue.value.trim()
)

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
    const source = postId === '__about__'
        ? (t('notification.source.aboutPublish') as string)
        : (t('notification.source.publish') as string)
    isBuilding.value = true
    try {
        await triggerBuild({ source, postId, t: (k: string) => t(k) as string })
        postStatus.value = 'published'
    } catch {
        // notification already updated by triggerBuild
    } finally {
        isBuilding.value = false
    }
}

async function doSave(action?: 'local' | 'draft' | 'publish' | 'upload' | 'unsaved') {
    // About mode: save to dedicated endpoint, optionally trigger build
    if (isAboutMode.value) {
        isSaving.value = true
        try {
            const res = await fetchWithAuth('/api/admin/about', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: localValue.value }),
            })
            const data = await res.json()
            savedContent.value = localValue.value
            activeModal.value = 'none'
            showToast(t('editor.saved') as string, { status: 'success', position: 'bottom-center', shape: 'capsule' })
            const settings = settingsStore.value
            if (settings?.autoBuildOnPublish) {
                try { await triggerAstroBuild('__about__') } catch { }
            }
        } catch (e: any) {
            showToast((e?.message || t('editor.saveFailed')) as string, { status: 'error', position: 'bottom-center', shape: 'capsule' })
        } finally {
            isSaving.value = false
        }
        return
    }

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
        savedFm.value = buildSavedFm()
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
                        type: editorType.value,
                        slideshow: editorType.value === 'slides' ? slideshowConfig.value : undefined,
                    }))
                    sessionStorage.setItem(`chronicle_history_${newId}`, JSON.stringify({
                        stack: history.value,
                        index: historyIndex.value,
                    }))

                    // 自动保存
                    savedContent.value = localValue.value
                    savedFm.value = buildSavedFm()
                    const editorPath = editorType.value === 'slides' ? '/editor/slides' : '/editor/article'
                    router.replace({ path: editorPath, query: { id: `new-${newId}` } })
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
        savedFm.value = buildSavedFm()
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

        // 上传本地文件（blob/file URL）并替换为服务器 URL（仅已登录）
        let contentToSend = localValue.value
        if (isCloudAuthenticated()) {
            const urlMapping = await resolveLocalFileUrls(contentToSend)
            if (Object.keys(urlMapping).length > 0) {
                contentToSend = applyUrlMappings(contentToSend, urlMapping)
                localValue.value = contentToSend
            }
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

        if (!postDate.value) postDate.value = new Date().toISOString()

        const res = await fetchWithAuth(`/api/post?t=${Date.now()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: requestId,
                title: titleToSend,
                content: buildFileContent(),
                status: status,
                tags: postTags.value,
                font: postFont.value,
                author: postAuthor.value,
                aiGenerated: postAIGenerated.value,
                type: editorType.value === 'slides' ? 'slides' : undefined,
                slideshow: editorType.value === 'slides' ? slideshowConfig.value : undefined,
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
                savedFm.value = buildSavedFm()

                if (previousPostId && previousPostId !== 'new') {
                    localStorage.removeItem(`chronicle_draft_${previousPostId}`)
                    sessionStorage.removeItem(`chronicle_history_${previousPostId}`)
                }

                if (!previousPostId && intent === 'publish') {
                    router.replace({ query: { ...route.query, id: data.id } as any })
                } else if (previousPostId === 'new' && route.query.id !== data.id) {
                    router.replace({ query: { ...route.query, id: data.id } as any })
                } else if (editorQueryId.value && editorQueryId.value.startsWith('new-')) {
                    router.replace({ query: { id: data.id } as any })
                }
            }

            // Notify other tabs (e.g. PostManager) that a post changed
            try { new BroadcastChannel('chronicle').postMessage({ type: 'post-updated', id: data.id }) } catch { }

            const shouldBuildAstro = status === 'published'
            closeModals()

            if (shouldBuildAstro) {
                postStatus.value = 'published'
                const settings = settingsStore.value
                if (settings && settings.autoBuildOnPublish) {
                    // Fire-and-forget — build runs in background, reported via notification center.
                    showToast(t('settings.buildSubmitted') as string, { status: 'info', position: 'bottom-center', shape: 'capsule' })
                    void triggerAstroBuild(data.id || postId.value || '')
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
                                router.replace({ query: { ...route.query, id: `new-${newId}` } as any })
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
        savedFm.value = buildSavedFm()

        const ok = await saveFile()
        if (ok) {
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
        // Route to the correct save path based on editing mode
        if (isCloudEditing.value) {
            await doSave('draft')
        } else {
            await saveLocalDirect()
        }
    }

    // Force clean state to allow navigation
    savedContent.value = localValue.value
    savedFm.value = buildSavedFm()

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
    if (suppressQueryWatch) { suppressQueryWatch = false; return }
    if (newId !== oldId) {
        await initLoad()
    }
})

// Watch path change — handles type-correction redirects where query.id
// stays the same but the path changes (e.g. /editor → /editor/article).
watch(() => route.path, async (newPath, oldPath) => {
    if (newPath !== oldPath && !dataReady.value && route.query.id) {
        await initLoad()
    }
})

async function loadPostById(id: string) {
    try {
        postAuthor.value = ''
        postAIGenerated.value = false
        const detailRes = await fetchWithAuth(`/api/post?id=${id}&mode=edit&t=${Date.now()}`)
        if (!detailRes.ok) {
            // 404 / not found → validate branch handles it
            skeletonStatus.value = 'editor.skeletonValidatingId'
            await handleLoad404Fallback(id)
            return true
        }
        const detail = await detailRes.json()
        const draft = localStorage.getItem(`chronicle_draft_${id}`)
        const sessionHistory = sessionStorage.getItem(`chronicle_history_${id}`)
        // Type correction: update editorType — the :key binding forces
        // Vue to recreate the body component when editorType changes.
        const postType = (detail.type || detail.meta?.type) as string
        const canonicalPath = postType === 'slides' ? '/editor/slides' : '/editor/article'
        if (route.path !== canonicalPath) {
            editorType.value = postType === 'slides' ? 'slides' : 'article'
            bodyKey.value++
            window.history.replaceState(null, '', canonicalPath + '?id=' + id)
        }
        if (draft && normalizeContentForCompare(draft) !== normalizeContentForCompare(detail.content || '')) {
            pendingConflictDetail.value = detail
            pendingConflictDraft.value = draft
            pendingConflictSessionHistory.value = sessionHistory
            activeModal.value = 'syncConflict'
            dataReady.value = true
            return true
        }
        applyLoadedPost(detail, draft || detail.content || '', sessionHistory, false)
        return true
    } catch (e) {
        console.error("Failed to load post", e)
        showToast(t('editor.loadFailed'))
        enterLocalMode()
        finishLocal()
        if (!pendingRedirect) dataReady.value = true
        return false
    }
}

/** Fallback when loading an existing post returns 404 — validate the raw UUID. */
async function handleLoad404Fallback(uuid: string) {
  try {
    const res = await fetchWithAuth('/api/post/validate-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: uuid })
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.valid) {
        // Valid UUID, no existing content → redirect to new-<uuid> format
        go(canonicalPath(), { id: `new-${uuid}` }); return
      } else if (data?.reason === 'invalid-format') {
        // Bad ID format → allocate fresh ID
        go(canonicalPath(), { id: 'new' }); return
      } else if (data?.reason === 'conflict') {
        // Race: got 404 but validate says conflict — retry load
        const detailRes2 = await fetchWithAuth(`/api/post?id=${uuid}&mode=edit&t=${Date.now()}`)
        if (detailRes2.ok) {
          const detail2 = await detailRes2.json()
          applyLoadedPost(detail2, detail2.content || '', null, false)
          return
        }
      }
    }
  } catch (e) { /* fall through */ }
  // Everything failed → local mode
  showToast(t('editor.loadFailed'))
  enterLocalMode()
  finishLocal()
  if (!pendingRedirect) dataReady.value = true
}

/**
 * Strip leading frontmatter block and normalize line endings.
 * Body = everything after the first ---\n...\n--- delimiter.
 */
function normalizeBody(raw: string): string {
  let body = raw.replace(/\r\n/g, '\n')
  const m = body.match(/^---\n[\s\S]*?\n---\n\n?/)
  if (m) body = body.slice(m[0].length)
  return body.split('\n').map(l => l.trimEnd()).join('\n')
}

interface SavedFm {
  title: string; date: string; tags: string[]; author: string
  aiGenerated: boolean; font?: string; slideshow?: Record<string, any>
}

/** Build a SavedFm snapshot from current shell state. */
function buildSavedFm(): SavedFm {
  return {
    title: postTitle.value,
    date: postDate.value,
    tags: [...postTags.value],
    author: postAuthor.value,
    aiGenerated: postAIGenerated.value,
    font: editorType.value === 'slides' ? undefined : postFont.value,
    slideshow: editorType.value === 'slides' ? { ...slideshowConfig.value } : undefined,
  }
}

// Pending redirect accumulator — applied once at end of initLoad branch
let pendingRedirect: { path?: string; query?: Record<string, any> } | null = null
let pendingLocalFile: { text: string; filename: string; handle?: any } | null = null
let suppressQueryWatch = false

// ── Shared helpers ────────────────────────────────────

const canonicalPath = () => editorType.value === 'slides' ? '/editor/slides' : '/editor/article'

function go(path: string, query?: Record<string, any>) {
  pendingRedirect = { path, query }
  suppressQueryWatch = true
  dataReady.value = true
  finalizeRedirect()
}

/** Enter local mode + if on /editor, redirect to /editor/article. */
function finishLocal() {
  enterLocalMode()
  if (route.path === '/editor') go(canonicalPath())
  else dataReady.value = true
}

/** Enter local mode — clear all state, no network, empty editor ready. */
function enterLocalMode() {
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
  savedFm.value = buildSavedFm()
  history.value = ['']
  historyIndex.value = 0
}

/** Restore localStorage/sessionStorage draft for a new cloud post UUID. */
function restoreDraft(uuid: string) {
  postId.value = uuid
  const dk = `chronicle_draft_${uuid}`
  const mk = `chronicle_draft_meta_${uuid}`
  const hk = `chronicle_history_${uuid}`
  const savedDraft = localStorage.getItem(dk)
  const savedMetaRaw = localStorage.getItem(mk)
  const savedHistoryRaw = sessionStorage.getItem(hk)
  let savedMeta: any = null
  try { savedMeta = savedMetaRaw ? JSON.parse(savedMetaRaw) : null } catch (e) { savedMeta = null }
  let savedHistory: any = null
  try { savedHistory = savedHistoryRaw ? JSON.parse(savedHistoryRaw) : null } catch (e) { savedHistory = null }

  postTitle.value = savedMeta?.title || t('editor.untitled')
  isDefaultTitle.value = !savedMeta?.title
  postStatus.value = 'draft'
  postDate.value = ''
  postUpdated.value = ''
  postAuthor.value = savedMeta?.author || ''
  postAIGenerated.value = !!(savedMeta?.aiGenerated)
  postTags.value = savedMeta?.tags || []
  postFont.value = savedMeta?.font || 'sans'
  localValue.value = savedDraft || ''
  savedContent.value = editorType.value === 'slides' ? localValue.value : normalizeBody(localValue.value)
  savedFm.value = buildSavedFm()
  history.value = (savedHistory?.stack) || ['']
  historyIndex.value = (savedHistory && typeof savedHistory.index === 'number') ? savedHistory.index : 0
  try { localStorage.removeItem(dk); localStorage.removeItem(mk); sessionStorage.removeItem(hk) } catch (e) { }
}

/** Shared validate-id → route: used by new-<uuid> init and 404 fallback. */
async function validateAndRoute(uuid: string) {
  let valid = false; let reason = ''
  try {
    const res = await fetchWithAuth('/api/post/validate-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: uuid })
    })
    if (res.ok) {
      const data = await res.json()
      valid = !!(data?.valid)
      reason = data?.reason || ''
    }
  } catch (e) {
    showToast(t('editor.validateFailed'))
    finishLocal()
    return
  }
  if (reason === 'conflict')         { await loadPostById(uuid); return }
  if (!valid || reason === 'invalid-format') { go(canonicalPath(), { id: 'new' }); return }
  // Valid UUID, no conflict → restore draft and stay
  restoreDraft(uuid)
  if (route.path === '/editor') go(canonicalPath(), { id: `new-${uuid}` })
  else dataReady.value = true
}

function finalizeRedirect() {
  if (!pendingRedirect) return
  const target = pendingRedirect
  pendingRedirect = null
  router.replace(target)
}

async function initLoad() {
    refreshCloudAuthState()
    const queryId = editorQueryId.value

    // ── Start skeleton ────────────────────────────────
    skeletonStatus.value = 'editor.skeletonLoading'
    skeletonShowDirectEntry.value = false
    if (skeletonTimer) clearTimeout(skeletonTimer)
    skeletonTimer = setTimeout(() => { skeletonShowDirectEntry.value = true }, 5000)

    // Cross-type file open: pendingLocalFile was set before router.push
    if (pendingLocalFile) {
      const { text, filename, handle } = pendingLocalFile
      pendingLocalFile = null
      const { meta, content } = parseFrontmatter(text)
      const targetType = isSlidesMeta(meta) ? 'slides' : 'article'
      const detail = buildLocalDetail(meta, text, filename, targetType)
      applyLoadedPost(detail, content, null, false)
      if (handle) { currentFileHandle.value = handle; currentFilePath.value = handle.name || filename }
      else currentFilePath.value = filename
      postId.value = null
      postStatus.value = 'local'
      return
    }

    // Strict query validation: only single `id` key allowed
    try {
      const qkeys = Object.keys(route.query || {})
      if (qkeys.length > 0 && !(qkeys.length === 1 && qkeys[0] === 'id')) {
        enterLocalMode()
        finishLocal()
        return
      }
    } catch (e) {
      enterLocalMode()
      finishLocal()
      return
    }

    // 1. Not authenticated → login redirect (the one pre-dataReady redirect)
    if (queryId && !isCloudAuthenticated()) {
      goToLogin(queryId === 'new' ? 'create-cloud-post' : 'open-cloud-post')
      return
    }

    // 2. id=new → allocate cloud ID
    if (queryId === 'new') {
      skeletonStatus.value = 'editor.skeletonAllocatingId'
      try {
        const res = await fetchWithAuth('/api/post/allocate-id', { method: 'POST' })
        if (res.ok) {
          const data = await res.json()
          if (data?.id) {
            go(canonicalPath(), { id: `new-${data.id}` }); return
          }
        }
      } catch (e) { }
      // Allocation failed → local mode, ensure canonical route
      showToast(t('editor.allocateFailed'))
      enterLocalMode()
      finishLocal()
      return
    }

    // 3. id=new-<uuid> → validate allocation
    if (queryId && /^new-([a-zA-Z0-9\-_]+)$/.test(queryId)) {
      skeletonStatus.value = 'editor.skeletonValidatingId'
      const match = queryId.match(/^new-([a-zA-Z0-9\-_]+)$/)
      const candidateId = match?.[1]
      if (!candidateId) { enterLocalMode(); dataReady.value = true; return }

      let valid = false; let reason = ''
      try {
        const res = await fetchWithAuth('/api/post/validate-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: candidateId })
        })
        if (res.ok) {
          const data = await res.json()
          valid = !!(data?.valid)
          reason = data?.reason || ''
        }
      } catch (e) {
        showToast(t('editor.validateFailed'))
        enterLocalMode()
        dataReady.value = true
        return
      }

      if (reason === 'conflict') {
        // UUID already taken → load existing post
        await loadPostById(candidateId)
        return
      }

      if (!valid || reason === 'invalid-format') {
        // Re-allocate — go through allocate branch by setting pendingRedirect
        go(canonicalPath(), { id: 'new' }); return
      }

      // Valid — restore draft or start fresh, ready for user input
      postId.value = candidateId
      const dk = `chronicle_draft_${candidateId}`
      const mk = `chronicle_draft_meta_${candidateId}`
      const hk = `chronicle_history_${candidateId}`
      const savedDraft = localStorage.getItem(dk)
      const savedMetaRaw = localStorage.getItem(mk)
      const savedHistoryRaw = sessionStorage.getItem(hk)
      let savedMeta: any = null
      try { savedMeta = savedMetaRaw ? JSON.parse(savedMetaRaw) : null } catch (e) { savedMeta = null }
      let savedHistory: any = null
      try { savedHistory = savedHistoryRaw ? JSON.parse(savedHistoryRaw) : null } catch (e) { savedHistory = null }

      postTitle.value = (savedMeta?.title) || t('editor.untitled')
      isDefaultTitle.value = !(savedMeta?.title)
      postStatus.value = 'draft'
      postDate.value = ''
      postUpdated.value = ''
      postAuthor.value = savedMeta?.author || ''
      postAIGenerated.value = !!(savedMeta?.aiGenerated)
      postTags.value = savedMeta?.tags || []
      postFont.value = savedMeta?.font || 'sans'
      localValue.value = savedDraft || ''
      savedContent.value = editorType.value === 'slides' ? localValue.value : normalizeBody(localValue.value)
      savedFm.value = buildSavedFm()
      history.value = (savedHistory?.stack) || ['']
      historyIndex.value = (savedHistory && typeof savedHistory.index === 'number') ? savedHistory.index : 0
      try { localStorage.removeItem(dk); localStorage.removeItem(mk); sessionStorage.removeItem(hk) } catch (e) { }
      finishLocal()
      if (!pendingRedirect) dataReady.value = true
      return
    }

    // 4. Invalid id format → local mode
    if (queryId && !/^[a-zA-Z0-9\-_]+$/.test(queryId)) {
      enterLocalMode()
      finishLocal()
      return
    }

    // 5. id=__about__ → load about page
    if (queryId === '__about__') {
      try {
        const res = await fetchWithAuth('/api/admin/about')
        const data = await res.json()
        localValue.value = data.content || ''
        savedContent.value = normalizeBody(data.content || '')
        postId.value = '__about__'
        postTitle.value = 'About'
        postStatus.value = 'published'
        isDefaultTitle.value = false
        postDate.value = data.lastModified || ''
        postUpdated.value = data.lastModified || ''
        savedFm.value = buildSavedFm()
      } catch {
        localValue.value = ''
        savedContent.value = ''
        postId.value = '__about__'
        postTitle.value = 'About'
        postStatus.value = 'published'
        savedFm.value = buildSavedFm()
      }
      dataReady.value = true
      return
    }

    // 6. id=<uuid> → load existing post
    if (queryId) {
      skeletonStatus.value = 'editor.skeletonLoadingPost'
      await loadPostById(queryId)
      return
    }

    // 7. No id → local mode
    enterLocalMode()
    finishLocal()
    if (!pendingRedirect) dataReady.value = true
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
    // Search source refresh is handled by EditorArticleBody internally
})

const editorBodyRef = ref<InstanceType<typeof EditorArticleBody> | InstanceType<typeof EditorSlidesBody> | null>(null)

// Toolbar tabs from body — reactive, updated on mount / switch
interface RibbonTool { type: 'button' | 'spacer'; id?: string; label?: string; icon?: string; action?: string; isStats?: boolean }
interface RibbonTabDef { id: string; label: string; icon: string; groups: Array<{ tools: RibbonTool[] }> }

const ribbonTabs = ref<RibbonTabDef[]>([])
const activeTab = ref('')

const activeTabDef = computed(() => ribbonTabs.value.find(t => t.id === activeTab.value))

function loadToolbarConfig() {
    void nextTick(() => {
        const config = editorBodyRef.value?.getToolbarConfig?.()
        if (config?.tabs) {
            ribbonTabs.value = (config.tabs as RibbonTabDef[]).map(tab => ({
              ...tab, label: t(`editor.tab.${tab.id}`) || tab.label
            }))
            if (!ribbonTabs.value.find(t => t.id === activeTab.value)) {
                activeTab.value = ribbonTabs.value[0]?.id || ''
            }
        }
    })
}
watch(editorType, loadToolbarConfig)
onMounted(loadToolbarConfig)

function isToolActive(action: string): boolean {
    if (action.startsWith('layout:')) return layout.value === action.slice(7)
    if (action.startsWith('font:')) return postFont.value === action.slice(5)
    if (action === 'preview:single') return (editorBodyRef.value as any)?.previewMode === 'single'
    if (action === 'preview:all') return (editorBodyRef.value as any)?.previewMode === 'all'
    if (action === 'toggleOutline') return !!(editorBodyRef.value as any)?.showThumbnailsLocal
    return false
}

function handleToolAction(action: string) {
    if (action.startsWith('layout:')) {
        layout.value = action.slice(7) as LayoutMode
    } else if (action.startsWith('font:')) {
        postFont.value = action.slice(5)
    } else if (action === 'openMediaModal') {
        openMediaModal()
    } else if (action === 'openLinkModal') {
        openLinkModal()
    } else if (action === 'openTableModal') {
        openTableModal()
    } else if (action === 'openMathModal') {
        mathInput.value = (editorBodyRef.value?.getSelection() as any)?.text || ''
        mathMode.value = 'inline'
        activeModal.value = 'math'
    } else if (action === 'insertFootnote') {
        insertFootnote()
    } else if (action === 'insertCode') {
        const sel = (editorBodyRef.value?.getSelection() as any)?.text || ''
        if (sel) {
            const isSingle = !sel.includes('\n')
            const md = isSingle ? '`' + sel + '`' : '\n```\n' + sel + '\n```\n'
            editorBodyRef.value?.insertAtCursor(md)
        } else { editorBodyRef.value?.insertAtCursor('\n```\n\n```\n') }
    } else if (action === 'insertTodo') {
        const sel = (editorBodyRef.value?.getSelection() as any)?.text?.trim() || ''
        if (sel) {
            const isSingle = !sel.includes('\n')
            const after = isSingle ? '\n\n' : '\n'
            const lines = '\n' + sel.split('\n').filter((l: string) => l.trim()).map((l: string) => `- [ ] ${l}`).join('\n') + after
            editorBodyRef.value?.insertAtCursor(lines)
        } else {
            editorBodyRef.value?.insertAtCursor('\n- [ ] \n')
        }
    } else if (action === 'insertQuote') {
        const sel = (editorBodyRef.value?.getSelection() as any)?.text || ''
        const text = sel.trim()
        if (text) {
            const isSingle = !text.includes('\n')
            const after = isSingle ? '\n\n' : '\n'
            const lines = '\n' + text.split('\n').map((l: string) => l.trim() ? `> ${l}` : '>').join('\n') + after
            editorBodyRef.value?.insertAtCursor(lines)
        } else {
            editorBodyRef.value?.insertAtCursor('\n> \n')
        }
    } else if (action === 'stats') {
        activeModal.value = 'stats'
    } else if (action === 'export') {
        activeModal.value = 'export'
    } else {
        ;(editorBodyRef.value as any)?.handleToolAction?.(action)
    }
}

function undo() {
    editorBodyRef.value?.undo()
}

function redo() {
    editorBodyRef.value?.redo()
}

function handleBeforeUnload(e: BeforeUnloadEvent) {
    // Only prevent unload when there are actual unsaved changes
    if (isDirty.value) {
        e.preventDefault()
        e.returnValue = ''
    }
}

onMounted(() => {
    // Log previous init state if redirected
    // Attempt to load from cloud to sync latest state
    initLoad()
    nc.registerAction('retry-build', () => {
        triggerAstroBuild(postId.value || '')
    })
    // Search source refresh is handled by EditorArticleBody internally

    // If locale changes and title is still default, update displayed title
    try {
        // `locale` is reactive from useI18n
        watch(() => locale.value, () => {
            if (isDefaultTitle.value) postTitle.value = t('editor.untitled')
        })
    } catch (e) { }

    // Tab overflow: collapse when viewport < 864px
    const checkTabOverflow = () => {
        tabsOverflow.value = window.innerWidth < 864
    }
    checkTabOverflow()
    window.addEventListener('resize', checkTabOverflow)

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('keydown', onKeydown)

        // Sync isDirty to a global flag so Electron's main process can check
        // whether to show the "Leave/Stay" dialog before closing the window.
        // Using a plain window property (not contextBridge) so that
        // webContents.executeJavaScript() can read it directly.
        ; (window as any).__chronicleDirty = isDirty.value
    watch(isDirty, (val) => {
        ; (window as any).__chronicleDirty = val
    })

    // Capture-phase: intercept paste/drop before CodeMirror handles them
    const blogEl = document.querySelector('.blog-editor')
    if (blogEl) {
        blogEl.addEventListener('paste', onEditorPaste as EventListener, true)
        blogEl.addEventListener('drop', onEditorDropCapture as EventListener, true)
        blogEl.addEventListener('keydown', onEditorKeydown as EventListener, true)
    }
})

onUnmounted(() => {
    ; (window as any).__chronicleDirty = false
    window.removeEventListener('beforeunload', handleBeforeUnload)
    window.removeEventListener('keydown', onKeydown)
    const blogEl = document.querySelector('.blog-editor')
    if (blogEl) {
        blogEl.removeEventListener('paste', onEditorPaste as EventListener, true)
        blogEl.removeEventListener('drop', onEditorDropCapture as EventListener, true)
        blogEl.removeEventListener('keydown', onEditorKeydown as EventListener, true)
    }
    if (skeletonTimer) clearTimeout(skeletonTimer)
})

const showMoreMenu = ref(false)
const tabMenuOpen = ref(false)
// canUndo/canRedo are reactive computed refs from the body (passthrough from CmEditor)
const canUndo = computed(() => !!(editorBodyRef.value as any)?.canUndo)
const canRedo = computed(() => !!(editorBodyRef.value as any)?.canRedo)
const tabsOverflow = ref(false)
const hideTitle = ref(false)
const tabsRef = ref<HTMLDivElement | null>(null)
const showStatusPopover = ref(false)
const lastSavedTime = ref('')

const statusLabel = computed(() => {
    if (isBuilding.value) return t('editor.buildingIndicator')
    if (isSaving.value) return t('editor.savingIndicator')
    if (isNewAndClean.value) return t('editor.newIndicator')
    if (isDirty.value) return t('editor.unsavedIndicator')
    return t('editor.savedIndicator')
})

type LayoutMode = 'split' | 'edit' | 'preview' | 'slideshow'
const layout = ref<LayoutMode>(editorType.value === 'slides' ? 'split' : 'split')
const isMobile = ref(false)

// Reset default layout when editor type changes
watch(editorType, (type) => {
    layout.value = type === 'slides' ? 'split' : 'split'
})

const showEditor = computed(() => layout.value === 'split' || layout.value === 'edit' || layout.value === 'slideshow')
const showPreview = computed(() => layout.value === 'split' || layout.value === 'preview' || layout.value === 'slideshow')

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

function buildStandalonePrintHtml(title: string, renderedHtml: string, lang: string): string {
    // Minimal standalone HTML for system browser printing.
    // Inlines essential styles from chronicle-markdown.css so the printed
    // output matches the CMS preview without depending on external assets.
    return `<!DOCTYPE html>
<html lang="${lang || 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'InterVariable','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Noto Sans SC','Microsoft YaHei',sans-serif;font-size:16px;line-height:1.7;color:#111;background:#fff;max-width:860px;margin:0 auto;padding:40px 48px}
  h1{font-size:2.4rem;line-height:1.25;font-weight:700;margin:0 0 28px;padding:0 0 20px;border-bottom:1px solid rgba(0,0,0,.08)}
  h2{font-size:1.6rem;line-height:1.35;font-weight:600;margin:36px 0 12px}
  h3{font-size:1.25rem;line-height:1.4;font-weight:600;margin:28px 0 8px}
  h4,h5,h6{font-size:1.05rem;font-weight:600;margin:22px 0 6px}
  p{margin:0 0 14px}
  a{color:#2563eb;text-decoration:underline}
  blockquote{margin:14px 0;padding:8px 16px;border-left:3px solid #d1d5db;color:#4b5563;background:#f9fafb}
  ul,ol{margin:8px 0 14px;padding-left:24px}
  li{margin:4px 0}
  hr{border:none;border-top:1px solid #e5e7eb;margin:28px 0}
  table{width:100%;border-collapse:collapse;margin:14px 0;font-size:14px}
  th,td{border:1px solid #e5e7eb;padding:8px 12px;text-align:left}
  th{background:#f3f4f6;font-weight:600}
  pre{background:#f5f5f5;border:1px solid #e5e7eb;border-radius:6px;padding:14px 18px;overflow-x:auto;font-size:13.5px;line-height:1.55;margin:14px 0}
  code{font-family:var(--app-font-stack-mono);font-size:.875em}
  p code,li code{background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:.85em}
  pre code{background:none;padding:0;font-size:inherit}
  img{max-width:100%;height:auto;border-radius:4px}
  .md-image-container{margin:14px 0}
  .md-image-caption{font-size:13px;color:#6b7280;text-align:center;margin-top:6px}
  .file-card{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin:10px 0}
  .file-card svg{width:22px;height:22px;flex-shrink:0;color:#6b7280}
  .file-card-title{font-weight:500;font-size:14px}
  .file-card-subtitle{font-size:12px;color:#9ca3af}
  .katex-placeholder{font-family:'KaTeX_Main','Times New Roman',serif;font-size:1.05em}
  @media print {
    body{padding:16px;max-width:none}
    h1{border-bottom:none}
    pre{white-space:pre-wrap;word-break:break-all}
    .no-print{display:none!important}
  }
  @media (prefers-color-scheme:dark) {
    body{color:#e5e7eb;background:#111}
    h1{border-color:rgba(255,255,255,.08)}
    blockquote{background:#1f1f1f;border-color:#374151;color:#9ca3af}
    pre{background:#1a1a1a;border-color:#333}
    p code,li code{background:#1f1f1f}
    th{background:#1f1f1f}
    th,td{border-color:#333}
    .file-card{background:#1a1a1a;border-color:#333}
  }
</style>
</head>
<body>
  ${title ? `<h1>${escapeHtml(title)}</h1>` : ''}
  ${renderedHtml}
</body>
</html>`
}

function escapeHtml(text: string) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function openPrintPreview(options?: { autoPrint?: boolean }) {
    try {
        const isElectron = typeof window !== 'undefined' && window.location.protocol === 'file:'

        if (isElectron) {
            // Electron: render markdown to a self-contained HTML file and open in system browser.
            // The system browser has no access to Electron's localStorage, so we inline everything.
            const renderedHtml = renderPreview(localValue.value || '')
            const printHtml = buildStandalonePrintHtml(
                postTitle.value || '',
                renderedHtml,
                locale.value || 'en',
            )
                ; (window as any).chronicleElectron?.openPrintInBrowser(printHtml, postTitle.value || 'Chronicle Print')
            return
        }

        // Web: pass data via localStorage token → new tab opens /editor/print route
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

function onKeydown(e: KeyboardEvent) {
    const key = (e.key || '').toLowerCase()
    const mod = e.ctrlKey || e.metaKey

    // Ctrl+A: select all in editor, even when focus is elsewhere
    if (mod && key === 'a') {
        const ed = editorBodyRef.value?.editorRef as any
        const active = document.activeElement
        const cmEl = document.querySelector('.blog-editor .cm-editor')
        const inEditor = cmEl && (active === cmEl || cmEl.contains(active as Node))
        if (!inEditor) {
            e.preventDefault()
            e.stopPropagation()
            ed?.focus?.()
            setTimeout(() => document.execCommand('selectAll'), 0)
        }
        return
    }

    if (!mod) return

    if (key === 'z') {
        e.preventDefault(); e.stopPropagation(); undo(); return
    }
    if (key === 'y') {
        e.preventDefault(); e.stopPropagation(); redo(); return
    }
    if (key === 'f' || key === 'h') {
        e.preventDefault(); e.stopPropagation()
        const view = (editorBodyRef.value?.editorRef as any)?.getEditor?.()
        const dom = view?.contentDOM
        if (dom) { dom.focus(); dom.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true })) }
        return
    }

    if (key === 's') {
        e.preventDefault(); e.stopPropagation()
        if (e.shiftKey) { saveAs(); return }
        if (!isCloudEditing.value) { void saveLocalDirect() } else { openSaveModal('publish') }
        return
    }

    if (key === 'p') {
        e.preventDefault(); e.stopPropagation(); openPrintPreview(); return
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

/** Encode only characters that break markdown link syntax (spaces, control chars).
 *  CJK and other non-ASCII is left as-is — browsers handle it, and encoding it
 *  would desync from server-side filenames in the cloud file list. */
function encodeMarkdownUrl(url: string): string {
    // Encode spaces and ASCII control characters that terminate markdown links
    return url.replace(/[\s\x00-\x1f]/g, (c) => encodeURIComponent(c))
}

// ... inside handleFileSelect ...
function insertMediaMarkdown(name: string, path: string, category?: string) {
    const editor = editorBodyRef.value?.editorRef as any
    if (!editor?.insertAtCursor) return

    // Determine Type
    const ext = name.split('.').pop()?.toLowerCase() || ''
    let insertText = ''

    const markdownPath = /^(https?:|blob:|data:|file:|\/|(?:audio|video|document|text|other):)/i.test(path)
        ? path : `${CDN_BASE_URL}${path}`

    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
        insertText = `\n![${name}](${encodeMarkdownUrl(markdownPath)})\n`
    } else {
        insertText = `\n[${name}](${encodeMarkdownUrl(markdownPath)})\n`
    }

    editor.insertAtCursor(insertText)
    activeModal.value = 'none'
}
function triggerFileUpload() {
    refreshCloudAuthState()
    fileInputRef.value?.click()
}

// ── Paste / Drop local files ─────────────────────────────────────────

// Text-file insertion choice (drop modal)
const textFileChoice = ref<File | null>(null)
const pendingFiles = ref<File[]>([])  // remaining files after modal choice

function isTextFile(file: File): boolean {
    const mime = (file.type || '').toLowerCase()
    return mime.startsWith('text/') || mime === 'application/json'
}

// ── Language detection for code blocks ───────────────────────────────

const EXT_LANG_MAP: Record<string, string> = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    jsx: 'javascript',
    py: 'python', rb: 'ruby', php: 'php',
    java: 'java', kt: 'kotlin', scala: 'scala',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
    cs: 'csharp', go: 'go', rs: 'rust', swift: 'swift',
    css: 'css', scss: 'scss', less: 'less',
    html: 'html', htm: 'html', xml: 'xml', svg: 'xml',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    md: 'markdown', markdown: 'markdown',
    sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash',
    ps1: 'powershell', bat: 'batch', cmd: 'batch',
    dockerfile: 'dockerfile', ini: 'ini', conf: 'nginx', nginx: 'nginx',
    vue: 'html', svelte: 'html',
    graphql: 'graphql', gql: 'graphql',
}

function getLangFromFile(file: File): string {
    const ext = (file.name || '').split('.').pop()?.toLowerCase() || ''
    return EXT_LANG_MAP[ext] || ''
}

function doInsertTextFile(file: File) {
    const reader = new FileReader()
    reader.onerror = () => showToast(`Cannot read file: ${file.name}`, { status: 'error' })
    reader.onload = () => {
        if (typeof reader.result !== 'string') return
        const editor = editorBodyRef.value?.editorRef as any
        if (!editor?.insertAtCursor) return
        void nextTick(() => {
            try { editor.insertAtCursor(reader.result as string) } catch { }
        })
    }
    reader.readAsText(file)
}

function doInsertCodeBlock(file: File) {
    const lang = getLangFromFile(file)
    const reader = new FileReader()
    reader.onerror = () => showToast(`Cannot read file: ${file.name}`, { status: 'error' })
    reader.onload = () => {
        if (typeof reader.result !== 'string') return
        const editor = editorBodyRef.value?.editorRef as any
        if (!editor?.insertAtCursor) return
        const code = `\n\`\`\`${lang}\n${reader.result}\n\`\`\`\n`
        void nextTick(() => {
            try { editor.insertAtCursor(code) } catch { }
        })
    }
    reader.readAsText(file)
}

async function doInsertFileCard(file: File) {
    if (isCloudEditing.value) {
        showToast('Uploading...')
        uploadMediaFile(file).then((url) => {
            if (url) insertMediaMarkdown(file.name, url)
        })
        return
    }
    const [markdownUrl, rawUrl] = await Promise.all([
        fileToMarkdownUrl(file),
        fileToUrl(file),
    ])
    fileMap.set(rawUrl, file)
    insertMediaMarkdown(file.name, markdownUrl)
}

function flushPendingFiles() {
    if (pendingFiles.value.length === 0) return
    const files = pendingFiles.value
    pendingFiles.value = []
    for (const file of files) doInsertFileCard(file)
}

function handleLocalFiles(files: FileList | File[], forceCard?: boolean) {
    const list = Array.from(files)
    for (let i = 0; i < list.length; i++) {
        const file = list[i]
        if (!forceCard && isTextFile(file)) {
            // Block: show modal, queue remaining files
            textFileChoice.value = file
            pendingFiles.value = list.slice(i + 1)
            return
        }
        doInsertFileCard(file)
    }
}

function onEditorPaste(e: ClipboardEvent) {
    const files = e.clipboardData?.files
    if (!files || files.length === 0) return
    e.preventDefault()
    e.stopPropagation()
    // Force card for pasted files
    handleLocalFiles(files, true)
}

function onEditorDrop(e: DragEvent) {
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return
    handleLocalFiles(files)
}

function onEditorKeydown(e: KeyboardEvent) {
    // Tab/Shift+Tab: indent/dedent in editor, regardless of focus
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        const ed = editorBodyRef.value?.editorRef as any
        ed?.focus?.()
        ed?.insertAtCursor?.(e.shiftKey ? '' : '\t')
        // Shift+Tab: no simple dedent via insertAtCursor — rely on manual backspace
    }
}

// Capture-phase wrapper — preventDefault before CodeMirror sees the event
function onEditorDropCapture(e: DragEvent) {
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        e.preventDefault()
        e.stopPropagation()
        onEditorDrop(e)
    }
}

async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement
    if (input.files && input.files.length > 0) {
        handleLocalFiles(input.files, true)  // toolbar always inserts as card
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

// ── Local file resolution (blob/file URL → File via fileMap) ────────

/** Find blob: and file:// URLs in markdown (with or without type prefix) */
function extractLocalUrls(markdown: string): string[] {
    // Match: blob:http://... or file:///... possibly with audio:/video:/document:/text:/file: prefix
    const pattern = /(?:(?:audio|video|document|text|other):)?(?:blob:https?:\/\/[^)\s\]]+|file:\/\/\/[^)\s\]]+)/gi
    const matches = markdown.match(pattern)
    return matches ? [...new Set(matches)] : []
}

/** Resolve a File from a raw URL: try fileMap first, then disk for file:// URLs */
async function getFileFromUrl(rawUrl: string): Promise<File | null> {
    // In-memory (blob URLs still alive, or recently dropped)
    const cached = fileMap.get(rawUrl)
    if (cached) return cached

    // Electron: read from disk when fileMap is gone (e.g. after refresh).
    // Uses preload IPC instead of fetch('file:///...') which is blocked
    // by SOP in dev mode (http→file) and may fail in production.
    if (isElectron && rawUrl.startsWith('file://')) {
        try {
            // file:///home/photo.jpg  →  /home/photo.jpg
            // file:///C:/Users/x.jpg  →  C:/Users/x.jpg (Windows)
            let filePath = rawUrl.replace(/^file:\/\//, '')
            if (/^\/[A-Za-z]:/.test(filePath)) filePath = filePath.slice(1)
            filePath = decodeURI(filePath)
            const base64 = await ((window as any).chronicleElectron?.readFileByPath?.(filePath))
            if (!base64) return null
            const binary = atob(base64)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
            const blob = new Blob([bytes])
            const filename = rawUrl.split('/').pop() || 'file'
            return new File([blob], filename, { type: blob.type || 'application/octet-stream' })
        } catch {
            return null
        }
    }

    return null
}

/** Upload files referenced by blob/file URLs, return { url → serverUrl } */
async function resolveLocalFileUrls(markdown: string): Promise<Record<string, string>> {
    const urls = extractLocalUrls(markdown)
    if (urls.length === 0) return {}

    const mapping: Record<string, string> = {}

    for (const fullUrl of urls) {
        // Strip the type prefix (audio:/video:/document:/text:/attach:) to get
        // the raw blob:/file:// URL.  file:/// is a URL scheme — now that the
        // generic type prefix is "attach:" instead of "file:", there is no ambiguity.
        const rawUrl = fullUrl.replace(/^(audio|video|document|text|other):/, '')
        const file = await getFileFromUrl(rawUrl)
        if (!file) { console.warn('[resolveLocalFileUrls] getFileFromUrl returned null for', fullUrl, '→ rawUrl:', rawUrl); continue }
        try {
            const cloudUrl = await uploadMediaFile(file)
            if (cloudUrl) {
                // Preserve the type prefix so file-card rendering works
                const prefix = fullUrl.match(/^(audio|video|document|text|other):/)?.[0] || ''
                // Encode spaces/CJK in the cloud URL for valid markdown link syntax
                const safeUrl = encodeMarkdownUrl(cloudUrl)
                mapping[fullUrl] = prefix ? prefix + safeUrl : safeUrl
                fileMap.delete(rawUrl)
            } else {
                showToast(`Upload failed: ${file.name}`, { status: 'error', duration: 3000 })
            }
        } catch {
            showToast(`Upload error: ${file.name}`, { status: 'error', duration: 3000 })
        }
    }

    return mapping
}

/** Replace blob/file URLs in markdown with resolved server URLs */
function applyUrlMappings(markdown: string, mapping: Record<string, string>): string {
    let result = markdown
    for (const [key, url] of Object.entries(mapping)) {
        result = result.split(key).join(url)
    }
    return result
}

async function handleMediaPicked(entry: any) {
    if (!entry) return
    try {
        const entries = Array.isArray(entry) ? entry : [entry]
        for (const ent of entries) {
            const name = ent.name || ent.file?.name || 'file'

            // Local file, local editing: type-prefixed blobURL/fileURL + fileMap
            if (ent.file && !isCloudEditing.value) {
                const rawUrl = await fileToUrl(ent.file)
                const prefix = getTypePrefixForFile(ent.file)
                const markdownUrl = prefix ? `${prefix}:${rawUrl}` : rawUrl
                fileMap.set(rawUrl, ent.file)
                insertMediaMarkdown(name, markdownUrl)
                continue
            }

            // Cloud file with server URL — works in both cloud and local editing modes
            if (ent.uploadedUrl) {
                insertMediaMarkdown(name, ent.uploadedUrl)
                continue
            }

            // Raw file, cloud editing: upload to server first
            if (ent.file && isCloudEditing.value) {
                showToast('Uploading...')
                const url = await uploadMediaFile(ent.file)
                if (url) insertMediaMarkdown(name, url)
                else showToast('Upload failed', { status: 'error' })
                continue
            }
        }
    } catch (e) { console.error('handleMediaPicked error', e) }
}

function insertImageMarkdown(name: string, path: string) {
    const editor = editorBodyRef.value?.editorRef as any
    if (!editor?.insertAtCursor) return

    const insertText = `\n![${name}](${path})\n`
    editor.insertAtCursor(insertText)
    activeModal.value = 'none'
}
// Link Modal
const linkText = ref('')
const linkUrl = ref('')

function openLinkModal() {
    // If text selected, pre-fill linkText
    const sel = (editorBodyRef.value?.editorRef as any)?.getSelection?.()
    if (sel && sel.from !== sel.to) {
        linkText.value = sel.text
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

function openMetaModal() {
    activeModal.value = 'meta'
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
    const editor = editorBodyRef.value?.editorRef as any
    if (!editor?.insertAtCursor) return
    editor.insertAtCursor(insertText)
}
// Scroll sync
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

const fontClass = computed(() => {
    return `font-${postFont.value}`
})
</script>

<style scoped>
@media (max-width: 600px) {
    .ribbon-title-input {
        display: none;
    }
}

.blog-editor {
    display: flex;
    flex-direction: column;
    height: var(--app-height);
    /* ensure editor fills viewport so internal panes scroll, not the page */
    border: none;
    background: var(--bg-primary);
}

/* ═══ Ribbon Toolbar ═══ */
.editor-ribbon {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 8px 12px 6px 8px;
    height: 36px;
    position: sticky;
    top: 0;
    z-index: 30;
    user-select: none;
}

.ribbon-qat {
    display: flex;
    align-items: center;
    gap: 0;
    flex-shrink: 0;
}

.ribbon-tabs {
    display: flex;
    align-items: center;
    margin-left: 12px;
    gap: 2px;
    flex-shrink: 1;
    overflow-x: auto;
    min-width: 0;
}

.ribbon-tabs::-webkit-scrollbar {
    height: 4px;
}



.ribbon-tabs[data-overflow="true"] {
    overflow:visible;
}


.ribbon-tab {
    display: inline-flex;
    border-radius: 0;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    height: 32px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--component-text-secondary);
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: background 0.15s, border-color 0.15s;
}

.ribbon-tab:hover {
    border-bottom-color: var(--component-text-secondary);
    color: var(--text-primary);
}

.ribbon-tab.active {
    color: var(--text-primary);
    border-bottom-color: var(--accent-color);
    font-weight: 600;
}

.icon-svg.ribbon-tab-chevron {
    color: var(--component-text-secondary);
    flex-shrink: 0;
}


.tab-icon {
    width: 14px;
    height: 14px;
    opacity: 0.7;
}

.ribbon-right {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
    flex-shrink: 0;
}

.ribbon-title-area {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 240px;
    flex-shrink: 1;
    min-width: 60px;
}

.ribbon-title-input {
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 3px;
    width: 100%;
    outline: none;
    min-width: 0;
}

.ribbon-title-input:hover {
    border-color: var(--border-color);
}

.ribbon-title-input:focus {
    border-color: var(--component-bg-accent);
    background: var(--bg-primary);
}

.ribbon-status {
    font-size: 10px;
    padding: 4px 6px;
    border-radius: 4px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    white-space: nowrap;
    flex-shrink: 0;
    line-height: 1;
}

.ribbon-status.local {
    color: var(--text-primary);
    background: transparent;
    border: 1px solid var(--text-primary);
}

.ribbon-status.draft {
    color: var(--component-text-secondary);
    background: var(--component-bg-hover);
    border: 1px solid var(--component-bg-hover);
}

.ribbon-status.published {
    color: var(--status-success);
    background: var(--status-success-bg);
    border: 1px solid var(--status-success);
}

.ribbon-status.modifying {
    color: var(--status-warning);
    background: var(--status-warning-bg);
    border: 1px solid var(--status-warning);
}

.ribbon-save-status {
    width: 18px;
    height: 18px;
    margin-right: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--status-success);
}

.ribbon-save-status .icon-svg {
    width: 18px;
    height: 18px;
}

.ribbon-save-status.saving {
    animation: save-pulse 1.2s ease-in-out infinite;
}

.ribbon-save-status.building {
    color: var(--status-progress);
    animation: spin 2s linear infinite;
}

.ribbon-save-status.dirty {
    color: var(--text-primary);
}

.ribbon-save-status {
    cursor: pointer;
}

.status-popover {
    position: absolute;
    top: 100%;
    right: 160px;
    margin-top: 6px;
    min-width: 220px;
    background: var(--component-bg-blur);
    border: 1px solid var(--border-color);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: 8px;
    box-shadow: var(--shadow-elev-3);
    padding: 12px 14px;
    z-index: 200;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.82rem;
}

.status-popover-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
}

.status-popover-label {
    color: var(--component-text-secondary);
    flex-shrink: 0;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

@keyframes save-pulse {

    0%,
    100% {
        opacity: 1;
    }

    50% {
        opacity: 0.2;
    }
}

.ribbon-sep {
    width: 1px;
    height: 18px;
    background: var(--border-color);
    margin: 0 2px;
    flex-shrink: 0;
}

.ribbon-sep--large {
    height: 28px;
    margin: 0 4px;
}

.ribbon-spacer {
    flex: 1;
}

.ribbon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--component-text-primary);
    cursor: pointer;
    padding: 0 8px;
    border-radius: 4px;
    height: 28px;
    font-size: 13px;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s, border-color 0.15s, opacity 0.15s;
    box-sizing: border-box;
    vertical-align: middle;
}

.ribbon-btn:hover:not(:disabled):not(.active) {
    background: var(--component-bg-hover);
    border-color: transparent;
}

.ribbon-btn.active {
    background: var(--component-bg-accent-blur);
    color: var(--component-text-primary-highlight);
    border: 1px solid var(--component-bg-accent);
}

.ribbon-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    border-color: transparent;
    pointer-events: none;
}

.btn-label {
    font-size: 13px;
    font-weight: 600;
}

.build-hint {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--component-text-secondary);
}

.ribbon-btn-primary {
    background: var(--accent-color);
    border-color: var(--accent-color);
    color: #fff;
    font-weight: 600;
}

.ribbon-btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    border-color: var(--accent-color);
    pointer-events: none;
}

.ribbon-btn.ribbon-btn-primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent-color) 80%, var(--component-text-primary));
}

.ribbon-btn-lg {
    height: 50px;
    flex-direction: column;
    gap: 2px;
    padding: 4px 10px;
    min-width: 50px;
}

.ribbon-btn-label {
    font-size: 12px;
    opacity: 0.8;
}

.ribbon-btn-wordcount {
    font-size: 11px;
    color: var(--component-text-secondary);
    padding: 3px 10px;
}

.ribbon-more {
    position: relative;
}

.ribbon-more--left .more-dropdown {
    left: 0;
    right: auto;
}

.more-dropdown {
    position: absolute;
    right: 0;
    top: 100%;
    margin-top: 4px;
    min-width: 185px;
    background: var(--component-bg-blur);
    border: 1px solid var(--border-color);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: 8px;
    box-shadow: var(--shadow-elev-3);
    padding: 6px;
    z-index: 200;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.more-dropdown button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    padding: 6px 12px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.8rem;
}

.more-dropdown button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    pointer-events: none;
}

.more-dropdown button:hover {
    background: var(--component-bg-hover);
}

.more-dropdown button.active {
    background: var(--component-bg-accent-blur);
    color: var(--accent-color);
    border: 1px solid var(--component-bg-accent);
}

.more-dropdown hr {
    margin: 3px 0;
    border: none;
    border-top: 1px solid var(--border-color);
}

.more-dropdown .icon-svg {
    width: 16px;
    height: 16px;
    opacity: 0.65;
    flex-shrink: 0;
}

.more-locale-row {
    font-size: 0.8rem;
    padding: 6px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
    font-size: 0.8rem;
}

.more-locale-row select {
    flex: 1;
    padding: 4px 8px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.8rem;
    outline: none;
    cursor: pointer;
}

/* ═══ Ribbon Content (tab area) ═══ */
.ribbon-content {
    background: var(--component-bg-blur);
    backdrop-filter: blur(6px);
    border: 1px solid var(--border-color);
    box-shadow: var(--shadow-elev-2);
    border-radius: 12px;
    min-height: 52px;
    position: relative;
    top: 0px;
    margin: 0 8px;
    z-index: 29;
}

.ribbon-group-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    height: 60px;
    overflow-x: auto;
}

.ribbon-group {
    display: flex;
    align-items: center;
    gap: 2px;
}

/* ═══ Legacy Toolbar Button (kept for modals that reuse) ═══ */
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
    height: 28px;
    font-size: 14px;
}

.toolbar-btn:hover:not(:disabled) {
    background: var(--component-bg-hover);
}

.toolbar-btn.active {
    background: var(--component-bg-accent-blur);
    border-color: var(--component-bg-accent);
}

.toolbar-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    pointer-events: none;
}

/* editor workspace + pane + search-float styles moved to EditorArticleBody.vue */

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

.modal-math-textarea {
    font-family: var(--app-font-stack-mono);
    font-size: 14px;
    min-height: 60px;
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
    padding: 6px 12px;
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

.status-chip {
    letter-spacing: 0.5px;
    white-space: nowrap;
    flex-shrink: 0;
}

.status-chip.local {
    color: var(--text-primary);
    background: transparent;
    border: 1px solid var(--text-primary);
}

.status-chip.draft {
    color: var(--component-text-secondary);
    background: var(--component-bg-hover);
}

.status-chip.published {
    color: var(--status-success);
    background: var(--status-success-bg);
    border: 1px solid var(--status-success);
}

.status-chip.modifying {
    color: var(--status-warning);
    background: var(--status-warning-bg);
    border: 1px solid var(--status-warning);
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
    padding: 6px;
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
    padding: 6px 12px;
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

.new-doc-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin: 12px 0;
}

.new-doc-col {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.new-doc-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--component-text-secondary);
    margin-bottom: 2px;
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
    font-size: 1rem;
    font-weight: bold;
    font-variation-settings: 'wght' 600;
    color: var(--text-primary);
    flex: 1;
    margin: 0 10px 0 0;
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
    padding: 6px;
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
    font-family: var(--app-font-stack-mono);
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

.locale-select {
    transition: background 0.2s;
    display: flex;
    justify-content: center;
    text-align: start;
}

.locale-select option {
    background: var(--bg-secondary);
    color: var(--component-text-primary);
}

.math-preview {
    background: var(--component-bg-blur-alt);
    border-radius: 8px;
    padding: 10px;
    margin-top: 10px;
    min-height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.math-options { display: flex; gap: 20px; margin-top: 2px; }

input[type="radio"] {
    accent-color: var(--accent-color);
    height: 16px;
    width: 16px;
    transform: translateY(2px);
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

/* ── Editor body wrapper ───────────────────────────── */
.editor-body-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

</style>