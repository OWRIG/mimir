import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import zhCN from './zh-CN.json'

export const SUPPORTED_LOCALES = ['zh-CN', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

/** 新增 key 时 zh-CN 与 en 必须同时补齐（i18n.test.ts 守护） */
export const resources = { 'zh-CN': { translation: zhCN }, en: { translation: en } } as const

function detectLocale(): Locale {
  const stored = globalThis.localStorage?.getItem('mimir.locale')
  if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) return stored as Locale
  return globalThis.navigator?.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

void i18n.use(initReactI18next).init({
  resources,
  lng: detectLocale(),
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
})

export default i18n
