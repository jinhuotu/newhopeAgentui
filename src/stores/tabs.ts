import { defineStore } from 'pinia'
import { ref } from 'vue'

export type TabItem = {
  href: string
  label: string
}

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<TabItem[]>([{ href: '/', label: '总览' }])

  function ensureTab(href: string, label?: string) {
    const existing = tabs.value.find((t) => t.href === href)
    if (existing) {
      if (label) existing.label = label
      return
    }
    const fallback =
      label ||
      (href === '/' ? '总览' : decodeURIComponent(href.replace(/^\//, '')))
    tabs.value.push({ href, label: fallback })
  }

  function openTab(href: string, label: string) {
    ensureTab(href, label)
  }

  /** 关闭标签；若需跳转则返回目标 path，否则 null */
  function closeTab(href: string, activeHref: string): string | null {
    const idx = tabs.value.findIndex((t) => t.href === href)
    if (idx < 0) return null
    const next = tabs.value.filter((t) => t.href !== href)
    if (next.length === 0) {
      tabs.value = [{ href: '/', label: '总览' }]
      return '/'
    }
    tabs.value = next
    if (href === activeHref) {
      return next[Math.max(0, idx - 1)].href
    }
    return null
  }

  return { tabs, ensureTab, openTab, closeTab }
})
