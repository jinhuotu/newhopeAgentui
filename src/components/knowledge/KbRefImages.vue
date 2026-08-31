<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { Image as ImageIcon, X } from 'lucide-vue-next'
import { apiFetchBlob } from '@/lib/api'
import { getAccessToken } from '@/lib/auth'

export type KbFigureRef = {
  id: string
  page?: number | null
  kind?: string
  url: string
}

const props = defineProps<{
  images: KbFigureRef[]
  /** 紧凑模式：用在单条参考片段内 */
  compact?: boolean
}>()

const blobUrls = ref<Record<string, string>>({})
const loading = ref(false)
const preview = ref<{ src: string; title: string } | null>(null)

const uniqueImages = computed(() => {
  const seen = new Set<string>()
  const out: KbFigureRef[] = []
  for (const img of props.images || []) {
    const key = img.url || img.id
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(img)
  }
  return out
})

async function loadImages() {
  const token = getAccessToken()
  const list = uniqueImages.value
  // revoke old
  for (const url of Object.values(blobUrls.value)) {
    URL.revokeObjectURL(url)
  }
  blobUrls.value = {}
  if (list.length === 0) return
  loading.value = true
  const next: Record<string, string> = {}
  try {
    await Promise.all(
      list.map(async (img) => {
        try {
          const blob = await apiFetchBlob(img.url, { token })
          next[img.id] = URL.createObjectURL(blob)
        } catch {
          /* 单张失败忽略 */
        }
      }),
    )
    blobUrls.value = next
  } finally {
    loading.value = false
  }
}

watch(
  () => uniqueImages.value.map((i) => i.id + i.url).join('|'),
  () => {
    void loadImages()
  },
  { immediate: true },
)

onUnmounted(() => {
  for (const url of Object.values(blobUrls.value)) {
    URL.revokeObjectURL(url)
  }
})

function openPreview(img: KbFigureRef) {
  const src = blobUrls.value[img.id]
  if (!src) return
  const page = img.page ? `第 ${img.page} 页` : ''
  const kind = img.kind === 'page' ? '页预览' : '插图'
  preview.value = { src, title: [kind, page].filter(Boolean).join(' · ') || '图纸' }
}
</script>

<template>
  <div v-if="uniqueImages.length > 0" :class="compact ? 'mt-1.5' : 'mt-2'">
    <div
      v-if="!compact"
      class="flex items-center gap-1.5 text-[11px] text-molybdenum mb-1.5"
    >
      <ImageIcon class="size-3.5" />
      相关图纸 {{ uniqueImages.length }}
      <span v-if="loading" class="text-text-muted">加载中…</span>
    </div>
    <div class="flex flex-wrap gap-2">
      <button
        v-for="img in uniqueImages"
        :key="img.id"
        type="button"
        class="group relative overflow-hidden rounded-md border border-hairline bg-bg-base/50 hover:border-molybdenum/50 transition-colors"
        :class="compact ? 'w-16 h-16' : 'w-28 h-20'"
        :title="img.page ? `第 ${img.page} 页` : '图纸'"
        @click="openPreview(img)"
      >
        <img
          v-if="blobUrls[img.id]"
          :src="blobUrls[img.id]"
          alt=""
          class="w-full h-full object-cover"
        />
        <div
          v-else
          class="w-full h-full flex items-center justify-center text-text-muted"
        >
          <ImageIcon class="size-4 opacity-50" />
        </div>
        <span
          v-if="img.page"
          class="absolute bottom-0 inset-x-0 text-[9px] text-center bg-bg-base/80 text-text-muted py-0.5"
        >
          p.{{ img.page }}
        </span>
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="preview"
        class="fixed inset-0 z-[80] bg-bg-base/85 backdrop-blur-sm flex items-center justify-center p-4"
        @click.self="preview = null"
      >
        <div class="relative max-w-4xl max-h-[90vh] w-full flex flex-col gap-2">
          <div class="flex items-center justify-between text-[12px] text-text-secondary">
            <span>{{ preview.title }}</span>
            <button
              type="button"
              class="size-8 rounded-md border border-hairline hover:bg-hairline/40 inline-flex items-center justify-center"
              @click="preview = null"
            >
              <X class="size-4" />
            </button>
          </div>
          <img
            :src="preview.src"
            alt=""
            class="max-h-[80vh] w-auto max-w-full mx-auto rounded-lg border border-hairline object-contain bg-bg-elevated"
          />
        </div>
      </div>
    </Teleport>
  </div>
</template>
