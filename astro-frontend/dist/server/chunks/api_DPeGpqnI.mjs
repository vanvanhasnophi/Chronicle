import { d as defineStyleVars, r as renderComponent } from './server_Dsl36lsc.mjs';
import { Q as createRenderInstruction, a2 as addAttribute, P as renderTemplate, y as maybeRenderHead, B as renderSlot, a_ as renderTransition, a$ as renderHead, aZ as defineScriptVars } from './sequence_BkVCRbMA.mjs';
import { c as createComponent } from './astro-component_CMQZp1Ki.mjs';
import 'piccolore';
import 'clsx';

async function renderScript(result, id) {
  const inlined = result.inlinedScripts.get(id);
  let content = "";
  if (inlined != null) {
    if (inlined) {
      content = `<script type="module">${inlined}</script>`;
    }
  } else {
    const resolved = await result.resolve(id);
    content = `<script type="module" src="${result.userAssetsBase ? (result.base === "/" ? "" : result.base) + result.userAssetsBase : ""}${resolved}"></script>`;
  }
  return createRenderInstruction({ type: "script", id, content });
}

const $$ClientRouter = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$ClientRouter;
  const { fallback = "animate" } = Astro2.props;
  return renderTemplate`<meta name="astro-view-transitions-enabled" content="true"><meta name="astro-view-transitions-fallback"${addAttribute(fallback, "content")}>${renderScript($$result, "/opt/Chronicle/astro-frontend/node_modules/astro/components/ClientRouter.astro?astro&type=script&index=0&lang.ts")}`;
}, "/opt/Chronicle/astro-frontend/node_modules/astro/components/ClientRouter.astro", void 0);

const app$1 = {"title":"Chronicle"};
const nav$1 = {"home":"Home","blogs":"Blogs","search":"Search","friends":"Friends","posts":"Posts","files":"Files","settings":"Settings","newPost":"New Post","about":"About"};
const inblog$1 = {"toc-title":"Table of Contents","backToBlogs":"Back to Blogs","wordSing":"{count} word","wordPlural":"{count} words","min":"min","created":"Created","updated":"Updated"};
const misc$1 = {"backToTop":"Back to Top"};
const blog$1 = {"featured":"Featured","collapse":"Collapse","expand":"Expand","allPosts":"All Posts","loadingPosts":"Loading posts...","noPostsStartWriting":"No posts found. Start writing!","daySuffix":""};
const home$1 = {"title":"Chronicle for Eightyfor","tagline":"Love what you wanna love, be what you wanna be.<br/>爱我所爱，自成一派。","viewBlogs":"View Blogs","viewThemePost":"Read Theme Post"};
const file$1 = {"library":"Files","upload":"Upload","refresh":"Refresh","loading":"Loading...","noFiles":"No files in this category.","copyLink":"Copy Link","delete":"Delete","categories":{"all":"All Files","images":"Images","videos":"Videos","audio":"Audio","documents":"Documents","text":"Text/Code","others":"Others"},"type":{"audio":"Audio","video":"Video","document":"Document","code":"Code/Text","file":"File"}};
const friends$1 = {"title":"Friends"};
const settings$1 = {"home":"Home Page","homeHint":"Edit the HTML content of your homepage (stored in local config)","friends":"Friends Page","friendsHint":"Edit the HTML content of your friends page (stored in local config)","appearance":"Appearance","appearanceHint":"Configure language, typography and theme colors for frontend/backend with a live preview.","i18n":"Language & Fonts","i18nHint":"Set default language and font preferences for frontend/backend (UI only, does not affect post content)","security":"Security","locale":{"follow":"Follow Browser","zh":"中文（简体）","en":"English"},"copy_to_light":"Copy to Light","copy_to_dark":"Copy to Dark"};
const post$1 = {"manageTitle":"Manage Posts","newPost":"New Post","loadingPosts":"Loading posts...","noPostsFound":"No posts found.","table":{"title":"Title","status":"Status","date":"Date","actions":"Actions","edit":"Edit","delete":"Delete"},"renameHint":"Double click to rename","confirmDelete":"Are you sure you want to delete this post?","renameFailed":"Rename failed","errorRenaming":"Error renaming","failedToDelete":"Failed to delete","errorDeleting":"Error deleting"};
const search$1 = {"selectTags":"Select Tags","placeholder":"Search by title...","noTags":"No tags found","done":"Done","loading":"Loading...","noResults":"No posts found matching your criteria."};
const login$1 = {"title":"Chronicle Manager","password":"Password","placeholder":"Enter admin password","checking":"Checking...","enter":"Enter","2faRequired":"Two-Factor Authentication Required","usePasskey":"Use Passkey / FaceID","or":"OR","codePlaceholder":"6-digit code","verify":"Verify","backToPassword":"Back to Password","failed":"Login failed","connectionError":"Connection error","verifyFailed":"Verification failed","verifyError":"Verification error","passkeyFailed":"Passkey verification failed","cancelled":"Login cancelled by user","invalidAuthenticator":"Invalid authenticator state","authFailed":"Authentication failed. Please try again."};
const security$1 = {"title":"Security Settings","verificationTitle":"Login Verification Code","verificationHint":"Use this code to log in on another device requiring 2FA.","generateCode":"Generate Code","changePasswordTitle":"Change Password","currentPassword":"Current Password","newPassword":"New Password","confirmPassword":"Confirm New Password","updating":"Updating...","updatePassword":"Update Password","verifying":"Verifying 2FA...","newPasswordsMismatch":"New passwords do not match","enterCurrentPassword":"Please enter current password","2faFailed":"2FA Verification Failed","passwordUpdated":"Password updated successfully","failedToUpdate":"Failed to update password","connectionError":"Connection error","twoFactorTitle":"Two-Factor Authentication","twoFactorHint":"Register a Passkey device (FaceID/TouchID/YubiKey) to enforce 2FA verification after password login.","registering":"Registering...","registerNewPasskey":"Register New Passkey","passkeyRegistered":"Passkey registered successfully!","verificationFailed":"Verification failed","registrationCancelled":"Registration cancelled","authenticatorRegistered":"Authenticator already registered","registrationFailed":"Registration failed. Please try again.","registeredKeys":"Registered Keys","unnamedKey":"Unnamed Key","added":"Added","rename":"Rename","delete":"Delete","confirmDeletePasskey":"Are you sure you want to delete this passkey?","failedToDeletePasskey":"Failed to delete passkey","enterNewName":"Enter new name:","failedToRenamePasskey":"Failed to rename passkey","session":"Session","logout":"Log Out"};
const tag$1 = {"featured":"featured"};
const status$1 = {"draft":"Draft","published":"Published","modifying":"Modifying"};
const editor$1 = {"restore":"Restore","draft":"Draft","publish":"Publish","fileUpload":"File Upload","loading":"Editor Loading...","file":{"new":"New Post","open":"Open...","import":"Import","export":"Export","createNew":"Create a new empty post.","note":"Note: Any unsaved changes in the current document will require confirmation.","clickToSelect":"Click to select file","importInstruction":"Import a Markdown or text file from your device.","uploadNewFile":"Upload New File","exportasMarkdown":"Export as Markdown","exportasText":"Export as Text"},"fileLabel":"File","media":"Media","link":"Link","linktext":"Link Text","texttoDisplay":"Text to display","table":"Table","locked":"Read Only","editable":"Editable","lock":"Lock Preview","unlock":"Unlock Preview","saving":"Saving...","placeholder":"Start writing markdown...","untitled":"Untitled Post","cancel":"Cancel","insert":"Insert","saveDraft":"Save Draft","publishNow":"Publish Now","createNewPost":"Create New Post","toggleFeatured":"Toggle Featured","undo":"Undo","redo":"Redo","postTitle":"Post Title","titlePlaceholder":"Enter a title for this post...","tagsLabel":"Tags","addTagPlaceholder":"Add tag...","addTag":"Add","confirmRestoreTitle":"Confirm Restore","confirmRestoreBody":"This will permanently delete your draft changes and restore the original published version from the server. This action cannot be undone.","confirmRestoreAction":"Confirm Restore","unsavedTitle":"Unsaved Changes","unsavedBody":"You have unsaved changes in \"{title}\". Do you want to save them before leaving?","discard":"Discard","saveContinue":"Save & Continue","statsTitle":"Document Statistics","stats":{"words":"Words","charsWithSpaces":"Characters (with spaces)","charsNoSpaces":"Characters (no spaces)","nonWestern":"Non-Western Characters","markdownChars":"Original Markdown Chars"},"countWords":"{count} word","countWordsPlural":"{count} words","rows":"Rows","cols":"Cols","code":{"lineCol":"Line: {line} | Col: {col}","charSing":"{count} Char","charPlural":"{count} Chars","lineSing":"{count} Line","linePlural":"{count} Lines"},"view":{"split":"Split View","edit":"Editor Only","preview":"Preview Only"}};
const formula$1 = {"copied":"Formula copied"};
const enJSON = {
  app: app$1,
  nav: nav$1,
  inblog: inblog$1,
  misc: misc$1,
  blog: blog$1,
  home: home$1,
  file: file$1,
  friends: friends$1,
  settings: settings$1,
  post: post$1,
  search: search$1,
  login: login$1,
  security: security$1,
  tag: tag$1,
  status: status$1,
  editor: editor$1,
  formula: formula$1,
};

const app = {"title":"Chronicle"};
const nav = {"home":"首页","blogs":"博客","search":"搜索","friends":"朋友","posts":"文章","files":"文件管理","settings":"设置","newPost":"写文章","about":"关于"};
const inblog = {"toc-title":"目录","backToBlogs":"返回博客列表","wordSing":"{count} 字","wordPlural":"{count} 字","min":"分钟","created":"创建于","updated":"更新于"};
const misc = {"backToTop":"回到顶部"};
const blog = {"featured":"精选","collapse":"收起","expand":"展开","allPosts":"全部文章","loadingPosts":"正在加载文章...","noPostsStartWriting":"暂无文章，开始写第一篇吧！","daySuffix":"日"};
const home = {"title":"Chronicle for Eightyfor","tagline":"Love what you wanna love, be what you wanna be.<br/>爱我所爱，自成一派。","viewBlogs":"查看博客","viewThemePost":"阅读主题文章"};
const file = {"library":"文件管理","upload":"上传","refresh":"刷新","loading":"正在加载...","noFiles":"该分类暂无文件。","copyLink":"复制链接","delete":"删除","categories":{"all":"全部文件","images":"图片","videos":"视频","audio":"音频","documents":"文档","text":"文本/代码","others":"其他"},"type":{"audio":"音频","video":"视频","document":"文档","code":"文本/代码","file":"文件"}};
const friends = {"title":"友人"};
const settings = {"home":"首页设置","homeHint":"编辑首页自定义 HTML（将保存在本地配置中）","friends":"朋友页设置","friendsHint":"编辑朋友页自定义 HTML（将保存在本地配置中）","appearance":"外观","appearanceHint":"配置前台/后台语言、字体与主题配色，并实时预览界面效果。","i18n":"语言与字体","i18nHint":"设置前台/后台默认语言与字体偏好（仅调整 UI，不影响文章内容）","security":"安全","locale":{"follow":"跟随浏览器","zh":"中文（简体）","en":"英文"},"copy_to_light":"复制到浅色模式","copy_to_dark":"复制到深色模式"};
const post = {"manageTitle":"文章管理","newPost":"新建文章","loadingPosts":"正在加载文章...","noPostsFound":"暂无文章。","table":{"title":"标题","status":"状态","date":"日期","actions":"操作","edit":"编辑","delete":"删除"},"renameHint":"双击重命名","confirmDelete":"确认删除这篇文章吗？","renameFailed":"重命名失败","errorRenaming":"重命名出错","failedToDelete":"删除失败","errorDeleting":"删除时出错"};
const search = {"selectTags":"选择标签","placeholder":"按标题搜索...","noTags":"未找到标签","done":"完成","loading":"正在加载...","noResults":"未找到符合条件的文章。"};
const login = {"title":"管理登录","password":"密码","placeholder":"输入管理员密码","checking":"校验中...","enter":"登录","2faRequired":"需要两步验证","usePasskey":"使用访问密钥 / 面容 ID","or":"或","codePlaceholder":"6 位验证码","verify":"验证","backToPassword":"返回密码登录","failed":"登录失败","connectionError":"连接错误","verifyFailed":"校验失败","verifyError":"验证出错","passkeyFailed":"访问密钥验证失败","cancelled":"用户取消登录","invalidAuthenticator":"认证器状态无效","authFailed":"身份验证失败，请重试。"};
const security = {"title":"安全设置","verificationTitle":"登录验证码","verificationHint":"在需要两步验证的设备上使用此验证码登录。","generateCode":"生成验证码","changePasswordTitle":"修改密码","currentPassword":"当前密码","newPassword":"新密码","confirmPassword":"确认新密码","updating":"更新中...","updatePassword":"更新密码","verifying":"正在校验 2FA...","newPasswordsMismatch":"两次输入的新密码不一致","enterCurrentPassword":"请输入当前密码","2faFailed":"两步验证失败","passwordUpdated":"密码已更新","failedToUpdate":"更新失败","connectionError":"连接错误","twoFactorTitle":"两步验证（2FA）","twoFactorHint":"注册访问密钥（面容 ID/触控 ID/YubiKey）以在密码登录后启用两步验证。","registering":"注册中...","registerNewPasskey":"注册新的访问密钥","passkeyRegistered":"访问密钥注册成功！","verificationFailed":"验证失败","registrationCancelled":"注册已取消","authenticatorRegistered":"认证器已注册","registrationFailed":"注册失败，请重试。","registeredKeys":"已注册密钥","unnamedKey":"未命名密钥","added":"添加于","rename":"重命名","delete":"删除","confirmDeletePasskey":"确认删除此访问密钥吗？","failedToDeletePasskey":"删除访问密钥失败","enterNewName":"输入新名称：","failedToRenamePasskey":"重命名访问密钥失败","session":"会话","logout":"退出登录"};
const tag = {"featured":"精选"};
const status = {"draft":"草稿","published":"已发布","modifying":"修改中"};
const editor = {"restore":"恢复","draft":"存草稿","publish":"发布","fileUpload":"文件上传","loading":"正在挂载编辑器...","file":{"new":"新建文章","open":"打开...","import":"导入","export":"导出","createNew":"创建一篇新文章。","note":"注意：当前文档的未保存更改需要确认。","clickToSelect":"点击选择文件","importInstruction":"从你的设备导入一个 Markdown 或 文本 文件。","uploadNewFile":"上传新文件","exportasMarkdown":"导出为 Markdown","exportasText":"导出为文本"},"fileLabel":"文件","media":"媒体","link":"链接","linktext":"链接文本","texttoDisplay":"显示在链接上的文本","table":"表格","locked":"只读","editable":"编辑","lock":"锁定预览","unlock":"解锁预览","saving":"保存中...","placeholder":"开始书写 Markdown...","untitled":"未命名文章","cancel":"取消","insert":"插入","saveDraft":"保存草稿","publishNow":"立即发布","createNewPost":"创建文章","toggleFeatured":"切换为精选","undo":"撤销","redo":"重做","postTitle":"文章标题","titlePlaceholder":"为文章填写标题...","tagsLabel":"标签","addTagPlaceholder":"添加标签...","addTag":"添加","confirmRestoreTitle":"确认恢复","confirmRestoreBody":"这将永久删除你的草稿更改并从服务器恢复已发布版本。此操作不可撤销。","confirmRestoreAction":"确认恢复","unsavedTitle":"未保存的更改","unsavedBody":"你在 \"{title}\" 中有未保存的更改。离开前是否要保存？","discard":"放弃","saveContinue":"保存并继续","statsTitle":"文档统计","stats":{"words":"字数","charsWithSpaces":"字符数（含空格）","charsNoSpaces":"字符数（不含空格）","nonWestern":"非西文字符数","markdownChars":"原始 Markdown 字符数"},"countWords":"{count} 字","countWordsPlural":"{count} 字","code":{"lineCol":"行：{line} | 列：{col}","charSing":"{count} 字符","charPlural":"{count} 字符","lineSing":"{count} 行","linePlural":"{count} 行"},"rows":"行数","cols":"列数","view":{"split":"分屏","edit":"仅编辑","preview":"仅预览"}};
const formula = {"copied":"公式已复制"};
const zhCNJSON = {
  app,
  nav,
  inblog,
  misc,
  blog,
  home,
  file,
  friends,
  settings,
  post,
  search,
  login,
  security,
  tag,
  status,
  editor,
  formula,
};

const translations = {
  "en": enJSON,
  "zh-CN": zhCNJSON
};
function getTranslation(locale, key) {
  const keys = key.split(".");
  let value = translations[locale];
  for (const k of keys) {
    if (value && typeof value === "object") {
      value = value[k];
    } else {
      return key;
    }
  }
  return typeof value === "string" ? value : key;
}
function getLocale(locals) {
  return locals.locale || "zh-CN";
}

const $$NavHeader = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$NavHeader;
  const { currentPath, locale: propLocale } = Astro2.props;
  const locale = propLocale || getLocale(Astro2.locals);
  const t = (key) => getTranslation(locale, key);
  const isActive = (path) => {
    if (path === "/" && currentPath === "/") return true;
    if (path !== "/" && currentPath.startsWith(path)) return true;
    return false;
  };
  return renderTemplate`${maybeRenderHead()}<nav class="nav-header at-top" id="main-nav" data-astro-cid-fef6xg4b> <div class="nav-content" data-astro-cid-fef6xg4b> <div class="site-header" data-astro-cid-fef6xg4b> <a href="/" style="text-decoration:none; color:inherit;" data-astro-cid-fef6xg4b> <h1 class="app-title" data-astro-cid-fef6xg4b>Chronicle</h1> </a> </div> <div class="nav-actions" data-astro-cid-fef6xg4b> <!-- Mobile Menu Toggle --> <button class="menu-toggle" id="menu-toggle" aria-label="Toggle menu" data-astro-cid-fef6xg4b> <svg class="menu-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-fef6xg4b> <line x1="3" y1="12" x2="21" y2="12" data-astro-cid-fef6xg4b></line> <line x1="3" y1="6" x2="21" y2="6" data-astro-cid-fef6xg4b></line> <line x1="3" y1="18" x2="21" y2="18" data-astro-cid-fef6xg4b></line> </svg> <svg class="close-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-fef6xg4b> <line x1="18" y1="6" x2="6" y2="18" data-astro-cid-fef6xg4b></line> <line x1="6" y1="6" x2="18" y2="18" data-astro-cid-fef6xg4b></line> </svg> </button> <div class="nav-links" id="nav-links" data-astro-cid-fef6xg4b> <button class="nav-close" id="nav-close" aria-label="Close menu" data-astro-cid-fef6xg4b> <span class="nav-close-icon" data-astro-cid-fef6xg4b> <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-fef6xg4b> <line x1="18" y1="6" x2="6" y2="18" data-astro-cid-fef6xg4b></line> <line x1="6" y1="6" x2="18" y2="18" data-astro-cid-fef6xg4b></line> </svg> </span> </button> <a href="/"${addAttribute(["nav-link", { "router-link-active": isActive("/") }], "class:list")} data-astro-cid-fef6xg4b> ${t("nav.home")} </a> <a href="/blogs"${addAttribute([
    "nav-link",
    { "router-link-active": isActive("/blogs") }
  ], "class:list")} data-astro-cid-fef6xg4b> ${t("nav.blogs")} </a> <a href="/search"${addAttribute([
    "nav-link",
    { "router-link-active": isActive("/search") }
  ], "class:list")} data-astro-cid-fef6xg4b> ${t("nav.search")} </a> <a href="/friends"${addAttribute([
    "nav-link",
    { "router-link-active": isActive("/friends") }
  ], "class:list")} data-astro-cid-fef6xg4b> ${t("nav.friends")} </a> </div> <!-- Settings Button --> <button class="nav-setting-btn" id="nav-setting-btn" aria-label="Settings" data-astro-cid-fef6xg4b> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-fef6xg4b> <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" data-astro-cid-fef6xg4b></path> <circle cx="12" cy="12" r="3" data-astro-cid-fef6xg4b></circle> </svg> </button> <!-- Settings Menu --> <div class="nav-settings-menu" id="settings-menu" style="display:none;" data-astro-cid-fef6xg4b> <!-- Theme controls (top) --> <button class="popup-item" data-theme="follow" data-astro-cid-fef6xg4b> <span class="popup-label" data-astro-cid-fef6xg4b>${locale === "zh-CN" ? "跟随系统" : "Follow System"}</span> <span class="popup-check" data-astro-cid-fef6xg4b> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" data-astro-cid-fef6xg4b> <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-fef6xg4b></path> </svg> </span> </button> <button class="popup-item" data-theme="light" data-astro-cid-fef6xg4b> <span class="popup-label" data-astro-cid-fef6xg4b>${locale === "zh-CN" ? "浅色" : "Light"}</span> <span class="popup-check" data-astro-cid-fef6xg4b> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" data-astro-cid-fef6xg4b> <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-fef6xg4b></path> </svg> </span> </button> <button class="popup-item" data-theme="dark" data-astro-cid-fef6xg4b> <span class="popup-label" data-astro-cid-fef6xg4b>${locale === "zh-CN" ? "深色" : "Dark"}</span> <span class="popup-check" data-astro-cid-fef6xg4b> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" data-astro-cid-fef6xg4b> <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-fef6xg4b></path> </svg> </span> </button> <hr style="margin:6px 0; border:none; border-top:1px solid var(--border-color);" data-astro-cid-fef6xg4b> <!-- Language controls (below) --> <button class="popup-item" data-locale="follow" data-astro-cid-fef6xg4b> <span class="popup-label" data-astro-cid-fef6xg4b>${t("settings.locale.follow")}</span> <span class="popup-check" data-astro-cid-fef6xg4b> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" data-astro-cid-fef6xg4b> <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-fef6xg4b></path> </svg> </span> </button> <button class="popup-item" data-locale="zh-CN" data-astro-cid-fef6xg4b> <span class="popup-label" data-astro-cid-fef6xg4b>中文（简体）</span> <span class="popup-check" data-astro-cid-fef6xg4b> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" data-astro-cid-fef6xg4b> <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-fef6xg4b></path> </svg> </span> </button> <button class="popup-item" data-locale="en" data-astro-cid-fef6xg4b> <span class="popup-label" data-astro-cid-fef6xg4b>English</span> <span class="popup-check" data-astro-cid-fef6xg4b> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" data-astro-cid-fef6xg4b> <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-fef6xg4b></path> </svg> </span> </button> <hr style="margin:6px 0; border:none; border-top:1px solid var(--border-color);" data-astro-cid-fef6xg4b> <!-- About --> <a href="/about" class="popup-item popup-item-link" data-astro-cid-fef6xg4b> <span class="popup-label" data-astro-cid-fef6xg4b>${t("nav.about")}</span> </a> <div style="font-size: 0.8em; padding: 2px 10px 0 10px; color: var(--component-text-secondary);" data-astro-cid-fef6xg4b>
Chronicle ${"1.4.0"}<br data-astro-cid-fef6xg4b>
&copy; ${2026} Eightyfor All Rights Reserved.
</div> </div> </div> </div> </nav>  ${renderScript($$result, "/opt/Chronicle/astro-frontend/src/components/NavHeader.astro?astro&type=script&index=0&lang.ts")}`;
}, "/opt/Chronicle/astro-frontend/src/components/NavHeader.astro", void 0);

var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(cooked.slice()) }));
var _a;
const $$Layout = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Layout;
  const { title, settings } = Astro2.props;
  const siteTitle = settings?.siteName || "Chronicle";
  const displayTitle = title ? `${title} - ${siteTitle}` : siteTitle;
  const frontendTheme = settings?.frontendTheme || "follow";
  const frontendAccent = settings?.frontendAccent || "#2ea35f";
  const frontendBackground = settings?.frontendBackground || "";
  const frontendBackgroundMeta = settings?.frontendBackgroundMeta || null;
  const frontendFont = settings?.frontendFont || "sans";
  const locale = getLocale(Astro2.locals);
  const htmlLang = locale === "zh-CN" ? "zh-CN" : "en";
  const $$definedVars = defineStyleVars([{
    accentColor: frontendAccent,
    fontStack: frontendFont === "serif" ? "'Noto Serif SC', serif" : "var(--app-font-stack-inter)"
  }]);
  return renderTemplate(_a || (_a = __template(["<html", " data-astro-cid-sckkx6r4", '> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>', `</title><!-- 字体预连接与延迟加载 (非阻塞首屏渲染) --><link rel="preconnect" href="https://fonts.googleapis.com" crossorigin data-astro-transition-persist="font-pre-1"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin data-astro-transition-persist="font-pre-2"><link rel="preload" href="/fonts/inter.css" as="style" onload="this.onload=null;this.rel='stylesheet'" data-astro-transition-persist="font-inter"><link rel="preload" href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@200..900&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'" crossorigin="anonymous" data-astro-transition-persist="font-noto">`, '<noscript><link rel="stylesheet" href="/fonts/inter.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@200..900&display=swap" crossorigin="anonymous"></noscript>', "<script>(function(){", "\n      // 将settings传递给客户端\n      window.__CHRONICLE_SETTINGS__ = {\n        frontendTheme,\n        frontendAccent,\n        frontendBackground,\n        frontendBackgroundMeta,\n        frontendFont\n      };\n    })();<\/script><!-- Theme Initialization (runs before page render) --><script>\n      (function() {\n        // Apply theme immediately to prevent flash\n        try {\n          const settings = JSON.parse(localStorage.getItem('chronicle.settings') || '{}');\n          const theme = settings.frontendTheme || 'follow';\n\n          if (theme === 'follow' || theme === 'system') {\n            // Follow system preference\n            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;\n            if (prefersDark) {\n              document.documentElement.setAttribute('data-theme', 'dark');\n            } else {\n              document.documentElement.setAttribute('data-theme', 'light');\n            }\n          } else if (theme === 'light') {\n            document.documentElement.setAttribute('data-theme', 'light');\n          } else if (theme === 'dark') {\n            document.documentElement.setAttribute('data-theme', 'dark');\n          }\n        } catch (e) {\n          // Default to dark if error\n          document.documentElement.setAttribute('data-theme', 'dark');\n        }\n      })();\n    <\/script>", '</head> <body class="frontend-body" data-astro-cid-sckkx6r4', '> <!-- 背景层 - 使用transition:persist保持跨页面持久化 --> <div id="chronicle-bg-layer" data-astro-transition-persist="background-layer" data-astro-cid-sckkx6r4', '> <div class="bg-image" data-astro-cid-sckkx6r4', '></div> <div class="bg-surface" data-astro-cid-sckkx6r4', '></div> <div class="bg-overlay" data-astro-cid-sckkx6r4', '></div> </div> <div id="app" data-astro-cid-sckkx6r4', "> ", ' <div class="main-content" data-astro-cid-sckkx6r4', "", "> ", " </div> </div> ", " </body> </html>"])), addAttribute(htmlLang, "lang"), addAttribute($$definedVars, "style"), displayTitle, maybeRenderHead(), renderComponent($$result, "ClientRouter", $$ClientRouter, { "data-astro-cid-sckkx6r4": true }), defineScriptVars({ frontendTheme, frontendAccent, frontendBackground, frontendBackgroundMeta, frontendFont }), renderHead(), addAttribute($$definedVars, "style"), addAttribute($$definedVars, "style"), addAttribute($$definedVars, "style"), addAttribute($$definedVars, "style"), addAttribute($$definedVars, "style"), addAttribute($$definedVars, "style"), renderComponent($$result, "NavHeader", $$NavHeader, { "currentPath": Astro2.url.pathname, "locale": locale, "data-astro-cid-sckkx6r4": true }), addAttribute($$definedVars, "style"), addAttribute(renderTransition($$result, "rjla4hbl"), "data-astro-transition-scope"), renderSlot($$result, $$slots["default"]), renderScript($$result, "/opt/Chronicle/astro-frontend/src/layouts/Layout.astro?astro&type=script&index=0&lang.ts"));
}, "/opt/Chronicle/astro-frontend/src/layouts/Layout.astro", "self");

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:3000";
const API_PATH = "/api";
function getApiUrl(endpoint, isSSR = typeof window === "undefined") {
  endpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  if (isSSR) {
    return `${API_BASE_URL}${endpoint}`;
  } else {
    return `${API_PATH}${endpoint}`;
  }
}

export { $$Layout as $, getApiUrl as a, getTranslation as b, getLocale as g, renderScript as r };
