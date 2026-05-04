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

const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '')

if (typeof window !== 'undefined' && apiBaseUrl) {
	const originalFetch = window.fetch.bind(window)
		window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
			const requestUrl = typeof input === 'string' || input instanceof URL ? String(input) : ''
			if (requestUrl.startsWith('/api/')) {
				const token = typeof window !== 'undefined' ? (localStorage.getItem('chronicle_auth') || '') : ''
				// clone/init headers safely and set x-chronicle-auth when present
				const newInit: RequestInit = { ...(init || {}) };
				const headers = new Headers(init && init.headers ? init.headers as HeadersInit : undefined);
				if (token && !headers.has('x-chronicle-auth')) headers.set('x-chronicle-auth', token);
				newInit.headers = headers;
				return originalFetch(`${apiBaseUrl}${requestUrl}`, newInit)
			}
			return originalFetch(input, init)
		}) as typeof fetch
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

async function cleanupLegacyServiceWorker() {
	if (typeof window === 'undefined') return
	if (!('serviceWorker' in navigator)) return

	const CLEANUP_FLAG = 'chronicle.sw.cleanup.v1'

	try {
		const registrations = await navigator.serviceWorker.getRegistrations()
		if (!registrations.length) return

		await Promise.all(registrations.map((registration) => registration.unregister()))

		if ('caches' in window) {
			const keys = await caches.keys()
			await Promise.all(keys.map((key) => caches.delete(key)))
		}

		if (!sessionStorage.getItem(CLEANUP_FLAG)) {
			sessionStorage.setItem(CLEANUP_FLAG, '1')
			const nextUrl = new URL(window.location.href)
			nextUrl.searchParams.set('_sw_cleaned', String(Date.now()))
			window.location.replace(nextUrl.toString())
		}
	} catch (err) {
		console.warn('[Chronicle] Service worker cleanup failed:', err)
	}
}

cleanupLegacyServiceWorker()

const app = createApp(App)
app.use(router)
app.use(i18n)
// Set a CSS variable --vh equal to 1% of the window innerHeight.
// Useful as a fallback for mobile browsers where 100vh is unstable.
function setVh() {
	if (typeof window !== 'undefined' && window.innerHeight) {
		document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
	}
}
setVh();
window.addEventListener('resize', setVh);

app.mount('#app')
