import { createApp } from 'vue'
import './style.css'
import 'katex/dist/katex.min.css'
import App from './App.vue'
import router from './router'
import { createI18n } from 'vue-i18n'

// Load locale messages
import en from './locales/en.json'
import zh from './locales/zh-CN.json'

const messages = {
	en,
	'zh-CN': zh
}

// Determine initial locale: prefer saved setting, otherwise browser language
const saved = localStorage.getItem('locale')
const browser = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'en'
const defaultLocale = saved || (browser.startsWith('zh') ? 'zh-CN' : 'en')

const i18n = createI18n({
	legacy: false,
	locale: defaultLocale,
	fallbackLocale: 'en',
	messages
})

const app = createApp(App)
app.use(router)
app.use(i18n)
app.mount('#app')
