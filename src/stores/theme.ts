import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export type ThemeMode = 'dark' | 'light'

/** v2：默认浅色；与旧 key 隔离，避免历史深色偏好覆盖新产品默认 */
const STORAGE_KEY = 'newhope-theme-v1'

function readStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* ignore */
  }
  return 'light'
}

function applyThemeClass(mode: ThemeMode) {
  const root = document.documentElement
  root.classList.toggle('dark', mode === 'dark')
  root.classList.toggle('light', mode === 'light')
  root.dataset.theme = mode
}

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>(readStoredTheme())

  const isDark = computed(() => mode.value === 'dark')
  const isLight = computed(() => mode.value === 'light')
  const label = computed(() => (mode.value === 'dark' ? '浅色' : '深色'))

  function setTheme(next: ThemeMode) {
    mode.value = next
  }

  function toggle() {
    mode.value = mode.value === 'dark' ? 'light' : 'dark'
  }

  watch(
    mode,
    (v) => {
      applyThemeClass(v)
      try {
        localStorage.setItem(STORAGE_KEY, v)
      } catch {
        /* ignore */
      }
    },
    { immediate: true },
  )

  return { mode, isDark, isLight, label, setTheme, toggle }
})
