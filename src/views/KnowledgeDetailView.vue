<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type FunctionalComponent } from 'vue'
import { useRoute } from 'vue-router'
import {
  Upload,
  Link as LinkIcon,
  FileText,
  FileImage,
  FileSpreadsheet,
  Box,
  Boxes,
  File as FileIcon,
  Loader2,
  Search,
  CircleCheck as Ok,
  XCircle,
  Tag,
  X,
  Eye,
  ArrowLeft,
  Trash2,
  TriangleAlert,
} from 'lucide-vue-next'
import { ApiError } from '@/lib/api'
import {
  createTextDocument,
  createUrlDocument,
  deleteKnowledgeDocument,
  getKnowledgeBase,
  getKnowledgeDocumentPreview,
  listKnowledgeDocuments,
  searchKnowledge,
  uploadKnowledgeDocument,
  type KbDocItem,
  type KnowledgeBaseItem,
} from '@/lib/knowledge-api'
import { THREE_D_EXTS, fmtSize, readFileSmart } from '@/lib/read-file-smart'
import { useAuthStore } from '@/stores/auth'
import FbxViewer from '@/components/three-preview/FbxViewer.vue'

type KbItem = KbDocItem
type Tab = 'file' | 'url' | 'text'

type IconComp = FunctionalComponent

const FILE_TYPE_GROUPS: {
  label: string
  exts: string[]
  color: string
  icon: IconComp
}[] = [
  { label: 'PDF', exts: ['.pdf'], color: 'text-iron', icon: FileText },
  { label: 'Word', exts: ['.docx'], color: 'text-molybdenum', icon: FileText },
  {
    label: 'Excel',
    exts: ['.xls', '.xlsx', '.csv'],
    color: 'text-patina',
    icon: FileSpreadsheet,
  },
  {
    label: '图片',
    exts: ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'],
    color: 'text-sulfur',
    icon: FileImage,
  },
  {
    label: 'CAD',
    exts: ['.dwg', '.dxf', '.step', '.stp', '.iges', '.igs'],
    color: 'text-coolant',
    icon: Box,
  },
  {
    label: '三维图纸',
    exts: ['.fbx', '.obj', '.gltf', '.glb', '.stl'],
    color: 'text-iron',
    icon: Boxes,
  },
  {
    label: '文本',
    exts: ['.txt', '.md', '.json'],
    color: 'text-text-secondary',
    icon: FileText,
  },
]

const ACCEPT_LIST = FILE_TYPE_GROUPS.flatMap((g) => g.exts).join(',')

function iconForType(type?: string, kind?: string): IconComp {
  const t = (type || '').toLowerCase()
  if (kind === '3d' || THREE_D_EXTS.includes(t)) return Boxes
  if (['pdf'].includes(t)) return FileText
  if (['doc', 'docx'].includes(t)) return FileText
  if (['xls', 'xlsx', 'csv'].includes(t)) return FileSpreadsheet
  if (['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'].includes(t)) return FileImage
  if (['dwg', 'dxf', 'step', 'stp', 'iges', 'igs'].includes(t)) return Box
  return FileIcon
}

function colorForType(type?: string, kind?: string) {
  const t = (type || '').toLowerCase()
  if (kind === '3d' || THREE_D_EXTS.includes(t)) return 'text-iron'
  if (['pdf'].includes(t)) return 'text-iron'
  if (['doc', 'docx'].includes(t)) return 'text-molybdenum'
  if (['xls', 'xlsx', 'csv'].includes(t)) return 'text-patina'
  if (['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'].includes(t)) return 'text-sulfur'
  if (['dwg', 'dxf', 'step', 'stp', 'iges', 'igs'].includes(t)) return 'text-coolant'
  return 'text-text-secondary'
}

function fmtAgo(ts: number) {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60_000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  return `${d} 天前`
}

function fmtIngestToast(docName: string, item: KbDocItem, opts?: { metaOnly?: boolean }) {
  const chunks = item.chunks ?? 0
  const chars = item.charCount ?? 0
  if (opts?.metaOnly) {
    return `${docName} 已入库三维图纸元数据（${chunks} 切块）`
  }
  return `${docName} 已入库：${chars.toLocaleString()} 字符 · 切成 ${chunks} 块`
}

const route = useRoute()
const auth = useAuthStore()

const baseId = computed(() => String(route.params.baseId || ''))
const uploaderName = computed(
  () => auth.user?.display_name || auth.user?.username || '当前用户',
)

const base = ref<KnowledgeBaseItem | null>(null)
const tab = ref<Tab>('file')
const items = ref<KbItem[]>([])
const loading = ref(true)
const keyword = ref('')
const dragOver = ref(false)
const uploading = ref<string[]>([])
const toast = ref<{ type: 'ok' | 'err'; msg: string } | null>(null)
const fileRef = ref<HTMLInputElement | null>(null)

const urlForm = ref({ url: '', title: '', tags: '' })
const textForm = ref({ title: '', content: '', tags: '' })
const probe = ref('')
const probeRes = ref<{ content: string; score: number }[] | null>(null)
const probeLoading = ref(false)
const previewItem = ref<KbItem | null>(null)
const textPreview = ref<{
  item: KbItem
  content: string
  chunks: Array<{ chunkIndex: number; content: string }>
  truncated: boolean
} | null>(null)
const previewLoadingId = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const pendingDeleteDoc = ref<KbItem | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null

const filtered = computed(() => {
  if (!keyword.value.trim()) return items.value
  const k = keyword.value.trim().toLowerCase()
  return items.value.filter(
    (it) =>
      it.name.toLowerCase().includes(k) ||
      it.summary?.toLowerCase().includes(k) ||
      it.tags?.some((t) => t.toLowerCase().includes(k)),
  )
})

const totalChunks = computed(() => items.value.reduce((s, it) => s + (it.chunks || 0), 0))
const totalCharsK = computed(
  () => (items.value.reduce((s, it) => s + (it.charCount || 0), 0) / 1000).toFixed(1),
)

const tabs: { k: Tab; label: string; icon: IconComp }[] = [
  { k: 'file', label: '文件上传', icon: Upload },
  { k: 'url', label: 'URL 抓取', icon: LinkIcon },
  { k: 'text', label: '文本粘贴', icon: FileText },
]

async function fetchList() {
  if (!baseId.value) return
  try {
    const [baseInfo, docs] = await Promise.all([
      getKnowledgeBase(baseId.value),
      listKnowledgeDocuments(baseId.value),
    ])
    base.value = baseInfo
    items.value = docs
  } catch (e) {
    toast.value = {
      type: 'err',
      msg: e instanceof ApiError || e instanceof Error ? e.message : '加载失败',
    }
  } finally {
    loading.value = false
  }
}

watch(toast, (v) => {
  if (toastTimer) clearTimeout(toastTimer)
  if (!v) return
  toastTimer = setTimeout(() => {
    toast.value = null
  }, 3200)
})

watch(baseId, () => {
  loading.value = true
  void fetchList()
})

onMounted(() => {
  void fetchList()
})

onUnmounted(() => {
  if (toastTimer) clearTimeout(toastTimer)
})

async function handleFiles(files: FileList | File[]) {
  const arr = Array.from(files)
  if (arr.length === 0 || !baseId.value) return
  uploading.value = [...uploading.value, ...arr.map((f) => f.name)]
  for (const file of arr) {
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      const parsed = await readFileSmart(file)
      const result = await uploadKnowledgeDocument({
        baseId: baseId.value,
        name: file.name,
        fileType: ext,
        size: file.size,
        content: parsed.content,
        uploader: uploaderName.value,
        tags: THREE_D_EXTS.includes(ext) ? ['手动上传', '三维图纸'] : ['手动上传'],
      })
      items.value = result.items
      toast.value = {
        type: 'ok',
        msg: fmtIngestToast(file.name, result.item, {
          metaOnly: THREE_D_EXTS.includes(ext) || !parsed.fullText,
        }),
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : '未知错误'
      const hint = /embedding/i.test(raw)
        ? '（正文可能已解析，失败在向量化；长文档请确认 Embedding 模型可用）'
        : ''
      toast.value = {
        type: 'err',
        msg: `${file.name} 处理失败：${raw}${hint}`,
      }
    } finally {
      uploading.value = uploading.value.filter((n) => n !== file.name)
    }
  }
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) void handleFiles(input.files)
  input.value = ''
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  if (e.dataTransfer?.files) void handleFiles(e.dataTransfer.files)
}

async function submitUrl() {
  if (!urlForm.value.url.trim()) {
    toast.value = { type: 'err', msg: '请填写资料 URL' }
    return
  }
  if (!baseId.value) return
  const urlKey = urlForm.value.url
  uploading.value = [...uploading.value, urlKey]
  try {
    const result = await createUrlDocument({
      baseId: baseId.value,
      url: urlForm.value.url.trim(),
      title: urlForm.value.title.trim() || urlForm.value.url.trim(),
      uploader: uploaderName.value,
      tags: urlForm.value.tags
        ? urlForm.value.tags.split(/[,，\s]+/).filter(Boolean)
        : ['URL'],
    })
    items.value = result.items
    urlForm.value = { url: '', title: '', tags: '' }
    toast.value = { type: 'ok', msg: fmtIngestToast(result.item.name, result.item) }
  } catch (e) {
    toast.value = {
      type: 'err',
      msg: `入库失败：${e instanceof Error ? e.message : '未知错误'}`,
    }
  } finally {
    uploading.value = uploading.value.filter((n) => n !== urlKey)
  }
}

async function submitText() {
  if (!textForm.value.title.trim() || textForm.value.content.trim().length < 4) {
    toast.value = { type: 'err', msg: '请填写资料名称和正文（正文 ≥ 4 字）' }
    return
  }
  if (!baseId.value) return
  const titleKey = textForm.value.title
  uploading.value = [...uploading.value, titleKey]
  try {
    const result = await createTextDocument({
      baseId: baseId.value,
      title: textForm.value.title.trim(),
      content: textForm.value.content.trim(),
      uploader: uploaderName.value,
      tags: textForm.value.tags
        ? textForm.value.tags.split(/[,，\s]+/).filter(Boolean)
        : ['手录'],
    })
    items.value = result.items
    textForm.value = { title: '', content: '', tags: '' }
    toast.value = { type: 'ok', msg: fmtIngestToast(result.item.name, result.item) }
  } catch (e) {
    toast.value = {
      type: 'err',
      msg: `入库失败：${e instanceof Error ? e.message : '未知错误'}`,
    }
  } finally {
    uploading.value = uploading.value.filter((n) => n !== titleKey)
  }
}

async function runProbe() {
  if (!probe.value.trim() || !baseId.value) return
  probeLoading.value = true
  probeRes.value = null
  try {
    const chunks = await searchKnowledge({
      query: probe.value.trim(),
      baseId: baseId.value,
      topK: 5,
    })
    probeRes.value = chunks
  } catch (e) {
    toast.value = {
      type: 'err',
      msg: e instanceof Error ? e.message : '检索失败',
    }
    probeRes.value = []
  } finally {
    probeLoading.value = false
  }
}

function askDeleteDoc(doc: KbItem) {
  pendingDeleteDoc.value = doc
}

async function confirmDeleteDoc() {
  if (!baseId.value || !pendingDeleteDoc.value) return
  const doc = pendingDeleteDoc.value
  deletingId.value = doc.id
  try {
    items.value = await deleteKnowledgeDocument(baseId.value, doc.id)
    pendingDeleteDoc.value = null
    toast.value = { type: 'ok', msg: '资料已删除' }
  } catch (e) {
    toast.value = {
      type: 'err',
      msg: e instanceof Error ? e.message : '删除失败',
    }
  } finally {
    deletingId.value = null
  }
}

async function openDocPreview(doc: KbItem) {
  if (doc.kind === '3d' && doc.previewUrl) {
    previewItem.value = doc
    return
  }
  if (!baseId.value) return
  previewLoadingId.value = doc.id
  try {
    const data = await getKnowledgeDocumentPreview(baseId.value, doc.id)
    textPreview.value = {
      item: data.item,
      content: data.content || '',
      chunks: data.chunks || [],
      truncated: Boolean(data.truncated),
    }
  } catch (e) {
    toast.value = {
      type: 'err',
      msg: e instanceof Error ? e.message : '预览加载失败',
    }
  } finally {
    previewLoadingId.value = null
  }
}
</script>

<template>
  <div class="kb-detail-enter space-y-5">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <RouterLink
          to="/knowledge"
          class="inline-flex items-center gap-1 text-[11px] text-text-secondary hover:text-molybdenum mb-1.5"
        >
          <ArrowLeft class="size-3" />
          返回知识库列表
        </RouterLink>
        <h1 class="text-xl font-semibold">{{ base?.name || '知识库详情' }}</h1>
        <p class="mt-1 text-[12px] text-text-secondary">
          {{
            base?.description ||
            '支持 PDF / Word / Excel / 图片 / CAD / 文本 / URL 多源资料导入，向量化后作为 AI 智能问答的依据。'
          }}
        </p>
      </div>
      <div class="flex gap-3 text-[11px] font-mono text-text-secondary">
        <span>
          资料总数
          <span class="text-text-primary text-base font-semibold">{{ items.length }}</span>
        </span>
        <span>
          总切块
          <span class="text-molybdenum text-base font-semibold">{{ totalChunks }}</span>
        </span>
        <span>
          总字符
          <span class="text-patina text-base font-semibold">{{ totalCharsK }}k</span>
        </span>
      </div>
    </header>

    <!-- 导入资料 -->
    <section class="rounded-lg panel-surface overflow-hidden flex flex-col">
      <header class="flex items-center justify-between px-4 lg:px-5 py-3 border-b border-border">
        <h3 class="text-sm font-medium tracking-wide truncate flex items-center gap-2">
          <span class="inline-block w-1 h-3 bg-iron rounded-sm" />
          导入资料
        </h3>
      </header>
      <div class="p-4 lg:p-5">
        <div class="flex gap-1 border-b border-hairline mb-4">
          <button
            v-for="t in tabs"
            :key="t.k"
            type="button"
            class="px-4 py-2 -mb-px text-[12px] flex items-center gap-1.5 border-b-2 transition-colors"
            :class="
              tab === t.k
                ? 'border-iron text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            "
            @click="tab = t.k"
          >
            <component :is="t.icon" class="size-3.5" />
            {{ t.label }}
          </button>
        </div>

        <div v-if="tab === 'file'" class="space-y-3">
          <div
            class="border-2 border-dashed rounded-md transition-colors"
            :class="
              dragOver ? 'border-iron bg-iron/5' : 'border-hairline hover:border-molybdenum/60'
            "
            @dragover.prevent="dragOver = true"
            @dragleave="dragOver = false"
            @drop="onDrop"
          >
            <div class="py-10 flex flex-col items-center gap-3 text-center px-6">
              <Upload class="size-8 text-iron" />
              <div class="text-[13px]">
                拖拽资料到此处，或
                <button
                  type="button"
                  class="text-molybdenum hover:underline"
                  @click="fileRef?.click()"
                >
                  点击选择文件
                </button>
              </div>
              <div class="text-[11px] text-text-secondary max-w-xl">
                正文入库：.docx / .txt / .md / .csv / .json 等；三维图纸仅存元数据。 PDF / 旧版
                .doc / Excel / 图片请先转文本或用「文本粘贴」。单文件最大 30 MB。
                入库后列表「切块」列为后端实际向量分块数。
              </div>
              <input
                ref="fileRef"
                type="file"
                multiple
                :accept="ACCEPT_LIST"
                class="hidden"
                @change="onFileChange"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <div
              v-for="g in FILE_TYPE_GROUPS"
              :key="g.label"
              class="border border-hairline rounded-md px-3 py-2 flex items-center gap-2"
            >
              <component :is="g.icon" class="size-4" :class="g.color" />
              <div class="text-[11px]">
                <div class="text-text-primary">{{ g.label }}</div>
                <div class="text-text-muted font-mono">
                  {{ g.exts.slice(0, 2).join(' · ') }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="tab === 'url'" class="space-y-3">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <label class="block">
              <div class="text-[11px] text-text-secondary mb-1">资料 URL（必填）</div>
              <input
                v-model="urlForm.url"
                class="kb-input"
                placeholder="https://www.example.com/标准全文.html"
              />
            </label>
            <label class="block">
              <div class="text-[11px] text-text-secondary mb-1">资料名称（选填）</div>
              <input
                v-model="urlForm.title"
                class="kb-input"
                placeholder="如：GB 21369 解读"
              />
            </label>
            <label class="block">
              <div class="text-[11px] text-text-secondary mb-1">标签（逗号/空格分隔）</div>
              <input
                v-model="urlForm.tags"
                class="kb-input"
                placeholder="国标, 节能, 监测"
              />
            </label>
          </div>
          <div class="flex justify-end">
            <button
              type="button"
              class="kb-btn-primary"
              :disabled="uploading.includes(urlForm.url)"
              @click="submitUrl()"
            >
              <Loader2
                v-if="uploading.includes(urlForm.url)"
                class="size-3.5 animate-spin"
              />
              <LinkIcon v-else class="size-3.5" />
              抓取并入库
            </button>
          </div>
        </div>

        <div v-else class="space-y-3">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <label class="block">
              <div class="text-[11px] text-text-secondary mb-1">资料名称（必填）</div>
              <input
                v-model="textForm.title"
                class="kb-input"
                placeholder="如：TC-03 调质工艺要点"
              />
            </label>
            <label class="block">
              <div class="text-[11px] text-text-secondary mb-1">标签</div>
              <input
                v-model="textForm.tags"
                class="kb-input"
                placeholder="工艺, 调质, TC-03"
              />
            </label>
          </div>
          <label class="block">
            <div class="text-[11px] text-text-secondary mb-1">正文</div>
            <textarea
              v-model="textForm.content"
              class="kb-input min-h-[140px] font-sans"
              placeholder="粘贴或录入资料正文，长度 ≥ 4 字..."
            />
          </label>
          <div class="flex justify-end">
            <button
              type="button"
              class="kb-btn-primary"
              :disabled="uploading.includes(textForm.title)"
              @click="submitText()"
            >
              <Loader2
                v-if="uploading.includes(textForm.title)"
                class="size-3.5 animate-spin"
              />
              <FileText v-else class="size-3.5" />
              入库
            </button>
          </div>
        </div>

        <div
          v-if="uploading.length > 0"
          class="mt-3 px-3 py-2 rounded-md bg-bg-base/40 border border-hairline text-[11px] text-text-secondary flex items-center gap-2"
        >
          <Loader2 class="size-3 animate-spin text-iron" />
          正在处理 {{ uploading.length }} 项：{{ uploading.slice(0, 3).join(' · ')
          }}{{ uploading.length > 3 ? ` 等 ${uploading.length} 项` : '' }}
        </div>
      </div>
    </section>

    <!-- 语义检索测试 -->
    <section class="rounded-lg panel-surface overflow-hidden flex flex-col">
      <header class="flex items-center justify-between px-4 lg:px-5 py-3 border-b border-border">
        <div class="min-w-0">
          <h3 class="text-sm font-medium tracking-wide truncate flex items-center gap-2">
            <span class="inline-block w-1 h-3 bg-iron rounded-sm" />
            语义检索测试
          </h3>
          <div class="text-[11px] text-muted-foreground mt-0.5 pl-3">
            验证知识库召回质量。输入问题，查看返回的相似片段与分数。
          </div>
        </div>
      </header>
      <div class="p-4 lg:p-5">
        <div class="flex gap-2">
          <input
            v-model="probe"
            class="kb-input flex-1"
            placeholder="如：智能助手如何使用知识库？"
            @keydown.enter="runProbe()"
          />
          <button
            type="button"
            class="kb-btn-primary whitespace-nowrap"
            :disabled="probeLoading || !probe.trim()"
            @click="runProbe()"
          >
            <Loader2 v-if="probeLoading" class="size-3.5 animate-spin" />
            <Search v-else class="size-3.5" />
            检索
          </button>
        </div>
        <div v-if="probeRes" class="mt-3 space-y-2">
          <div v-if="probeRes.length === 0" class="text-[12px] text-text-secondary">
            未召回任何片段。
          </div>
          <div
            v-for="(c, i) in probeRes"
            v-else
            :key="i"
            class="border border-hairline rounded-md px-3 py-2 bg-bg-base/40"
          >
            <div class="flex justify-between text-[10px] text-text-muted font-mono mb-1">
              <span>#{{ i + 1 }}</span>
              <span class="text-molybdenum">相似度 {{ (c.score ?? 0).toFixed(4) }}</span>
            </div>
            <div
              class="text-[12px] leading-relaxed text-text-primary whitespace-pre-wrap line-clamp-5"
            >
              {{ c.content }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 资料列表 -->
    <section class="rounded-lg panel-surface overflow-hidden flex flex-col">
      <header class="flex items-center justify-between px-4 lg:px-5 py-3 border-b border-border">
        <h3 class="text-sm font-medium tracking-wide truncate flex items-center gap-2">
          <span class="inline-block w-1 h-3 bg-iron rounded-sm" />
          已导入资料（{{ filtered.length }}/{{ items.length }}）
        </h3>
        <input
          v-model="keyword"
          placeholder="按名称/标签/摘要过滤..."
          class="kb-input h-8 w-56 text-[12px]"
        />
      </header>
      <div class="p-4 lg:p-5">
        <div
          v-if="loading"
          class="py-12 text-center text-text-secondary text-[12px]"
        >
          <Loader2 class="inline size-4 animate-spin mr-2" /> 正在加载知识库...
        </div>
        <div
          v-else-if="filtered.length === 0"
          class="py-12 text-center text-text-secondary text-[12px]"
        >
          暂无资料。请通过上方上传文件、抓取 URL 或粘贴文本进行入库。
        </div>
        <div v-else class="overflow-x-auto -mx-4 px-4">
          <table class="w-full min-w-[1080px] table-fixed text-[12px]">
            <colgroup>
              <col class="w-[34%]" />
              <col class="w-[7%]" />
              <col class="w-[8%]" />
              <col class="w-[7%]" />
              <col class="w-[6%]" />
              <col class="w-[12%]" />
              <col class="w-[8%]" />
              <col class="w-[8%]" />
              <col class="w-[5%]" />
              <col class="w-[9%]" />
            </colgroup>
            <thead>
              <tr class="text-text-muted border-b border-hairline">
                <th class="text-left px-3 py-2 font-medium">资料名称</th>
                <th class="text-left px-2 py-2 font-medium whitespace-nowrap">来源</th>
                <th class="text-right px-2 py-2 font-medium font-mono whitespace-nowrap">
                  大小
                </th>
                <th class="text-right px-2 py-2 font-medium font-mono whitespace-nowrap">
                  字符
                </th>
                <th
                  class="text-right px-2 py-2 font-medium font-mono whitespace-nowrap"
                  title="后端向量化分块数量（kb_chunk_size≈1000）"
                >
                  切块
                </th>
                <th class="text-left px-2 py-2 font-medium whitespace-nowrap">标签</th>
                <th class="text-left px-2 py-2 font-medium whitespace-nowrap">上传者</th>
                <th class="text-right px-2 py-2 font-medium whitespace-nowrap">时间</th>
                <th class="text-center px-2 py-2 font-medium whitespace-nowrap">状态</th>
                <th class="text-center px-2 py-2 font-medium whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="it in filtered"
                :key="it.id"
                class="border-b border-hairline/70 hover:bg-bg-base/40"
              >
                <td class="px-3 py-2.5 align-middle">
                  <div class="flex items-start gap-2 min-w-0">
                    <component
                      :is="iconForType(it.fileType || it.source, it.kind)"
                      class="size-4 shrink-0 mt-0.5"
                      :class="colorForType(it.fileType, it.kind)"
                    />
                    <div class="min-w-0 flex-1">
                      <div
                        class="text-text-primary truncate flex items-center gap-1.5"
                        :title="it.name"
                      >
                        <span class="truncate">{{ it.name }}</span>
                        <span
                          v-if="it.kind === '3d'"
                          class="shrink-0 px-1 py-0.5 rounded text-[9px] bg-iron/15 text-iron border border-iron/30 font-mono"
                        >
                          3D
                        </span>
                      </div>
                      <div
                        v-if="it.summary"
                        class="text-[10.5px] text-text-muted truncate mt-0.5"
                        :title="it.summary"
                      >
                        {{ it.summary }}
                      </div>
                    </div>
                  </div>
                </td>
                <td class="px-2 py-2.5 align-middle whitespace-nowrap">
                  <span
                    class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-bg-base/60 text-text-secondary border border-hairline"
                  >
                    {{
                      it.source === 'file'
                        ? (it.fileType || 'FILE').toUpperCase()
                        : it.source.toUpperCase()
                    }}
                  </span>
                </td>
                <td
                  class="px-2 py-2.5 text-right font-mono text-text-secondary whitespace-nowrap align-middle"
                >
                  {{ fmtSize(it.size) }}
                </td>
                <td
                  class="px-2 py-2.5 text-right font-mono text-text-secondary whitespace-nowrap align-middle"
                >
                  {{ it.charCount ? it.charCount.toLocaleString() : '—' }}
                </td>
                <td
                  class="px-2 py-2.5 text-right font-mono text-molybdenum whitespace-nowrap align-middle"
                  :title="it.chunks != null ? `已切成 ${it.chunks} 块向量片段` : undefined"
                >
                  {{ it.chunks != null ? `${it.chunks} 块` : '—' }}
                </td>
                <td class="px-2 py-2.5 align-middle">
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="t in (it.tags || []).slice(0, 3)"
                      :key="t"
                      class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-molybdenum/10 text-molybdenum whitespace-nowrap"
                    >
                      <Tag class="size-2.5 shrink-0" />
                      {{ t }}
                    </span>
                  </div>
                </td>
                <td
                  class="px-2 py-2.5 text-text-secondary whitespace-nowrap align-middle truncate"
                  :title="it.uploader || undefined"
                >
                  {{ it.uploader || '—' }}
                </td>
                <td
                  class="px-2 py-2.5 text-right text-text-muted font-mono text-[11px] whitespace-nowrap align-middle"
                >
                  {{ fmtAgo(it.createdAt) }}
                </td>
                <td class="px-2 py-2.5 text-center align-middle whitespace-nowrap">
                  <Ok v-if="it.status === 'ready'" class="inline size-4 text-patina" />
                  <XCircle
                    v-else-if="it.status === 'failed'"
                    class="inline size-4 text-iron"
                  />
                  <Loader2 v-else class="inline size-4 animate-spin text-sulfur" />
                </td>
                <td class="px-2 py-2.5 text-center align-middle whitespace-nowrap">
                  <button
                    type="button"
                    :disabled="previewLoadingId === it.id"
                    class="inline-flex items-center gap-1 px-2 py-1 rounded text-[10.5px] text-text-secondary hover:text-molybdenum hover:bg-molybdenum/10 transition-colors whitespace-nowrap"
                    title="预览入库文本内容"
                    @click="openDocPreview(it)"
                  >
                    <Loader2
                      v-if="previewLoadingId === it.id"
                      class="size-3 animate-spin"
                    />
                    <Eye v-else class="size-3" />
                    预览
                  </button>
                  <button
                    type="button"
                    :disabled="deletingId === it.id"
                    class="ml-0.5 inline-flex items-center gap-1 px-2 py-1 rounded text-[10.5px] text-text-secondary hover:text-iron hover:bg-iron/10 transition-colors whitespace-nowrap"
                    @click="askDeleteDoc(it)"
                  >
                    <Loader2 v-if="deletingId === it.id" class="size-3 animate-spin" />
                    <Trash2 v-else class="size-3" />
                    删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Toast -->
    <div
      v-if="toast"
      class="fixed top-6 left-1/2 z-50 -translate-x-1/2 px-4 py-2.5 rounded-md text-[12px] shadow-lg border max-w-[min(92vw,28rem)] text-center"
      :class="
        toast.type === 'ok'
          ? 'bg-patina/10 border-patina/40 text-patina'
          : 'bg-iron/10 border-iron/40 text-iron'
      "
    >
      {{ toast.msg }}
    </div>

    <!-- Delete confirm -->
    <div
      v-if="pendingDeleteDoc"
      class="fixed inset-0 z-[60] bg-bg-base/80 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="!deletingId && (pendingDeleteDoc = null)"
    >
      <div class="w-full max-w-md rounded-lg border border-hairline bg-bg-elevated shadow-2xl overflow-hidden">
        <div class="px-5 pt-5 pb-3">
          <div class="flex items-start gap-3">
            <span
              class="mt-0.5 size-9 shrink-0 rounded-md bg-iron/15 text-iron inline-flex items-center justify-center border border-iron/25"
            >
              <TriangleAlert class="size-4" />
            </span>
            <div class="min-w-0 space-y-1.5 text-left">
              <div class="text-[14px] font-medium text-text-primary">删除资料</div>
              <div class="text-[12px] text-text-secondary leading-relaxed">
                确认删除「
                <span class="text-text-primary font-medium">{{ pendingDeleteDoc.name }}</span>
                」？相关向量片段将一并移除。
              </div>
            </div>
          </div>
        </div>
        <div class="px-5 py-3 border-t border-hairline bg-bg-base/30 flex justify-end gap-2">
          <button
            type="button"
            :disabled="Boolean(deletingId)"
            class="h-8 px-3 text-[12px] rounded-md border border-hairline bg-transparent text-text-secondary hover:bg-hairline/40"
            @click="pendingDeleteDoc = null"
          >
            取消
          </button>
          <button
            type="button"
            :disabled="Boolean(deletingId)"
            class="h-8 px-3 text-[12px] rounded-md bg-iron text-white hover:brightness-110 inline-flex items-center gap-1.5"
            @click="confirmDeleteDoc()"
          >
            <template v-if="deletingId">
              <Loader2 class="size-3.5 animate-spin" />
              删除中…
            </template>
            <template v-else>
              <Trash2 class="size-3.5" />
              确认删除
            </template>
          </button>
        </div>
      </div>
    </div>

    <!-- 3D preview -->
    <div
      v-if="previewItem && previewItem.previewUrl"
      class="fixed inset-0 z-[60] bg-bg-base/85 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        class="bg-bg-elevated border border-hairline rounded-lg shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh]"
      >
        <div class="flex items-center justify-between px-5 py-3 border-b border-hairline">
          <div class="flex items-center gap-2.5">
            <Boxes class="size-5 text-iron" />
            <div>
              <div class="text-[13.5px] text-text-primary font-medium">
                {{ previewItem.name }}
              </div>
              <div class="text-[11px] text-text-muted mt-0.5 font-mono">
                三维图纸 · {{ previewItem.fileType?.toUpperCase() }} ·
                {{ fmtSize(previewItem.size) }} · 上传人 {{ previewItem.uploader || '—' }}
              </div>
            </div>
          </div>
          <button
            type="button"
            class="size-8 rounded hover:bg-hairline/60 inline-flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
            aria-label="关闭"
            @click="previewItem = null"
          >
            <X class="size-4" />
          </button>
        </div>
        <div class="p-4 flex-1 overflow-hidden">
          <FbxViewer
            :url="previewItem.previewUrl"
            :file-type="previewItem.fileType"
            height="60vh"
            fallback-hint="若预签名 URL 已过期，请重新刷新列表后再试。"
          />
          <div
            v-if="previewItem.summary"
            class="mt-3 text-[12px] text-text-secondary leading-relaxed"
          >
            {{ previewItem.summary }}
          </div>
          <div
            v-if="previewItem.tags && previewItem.tags.length > 0"
            class="mt-2.5 flex flex-wrap gap-1.5"
          >
            <span
              v-for="t in previewItem.tags"
              :key="t"
              class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-molybdenum/10 text-molybdenum"
            >
              <Tag class="size-2.5" />
              {{ t }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Text preview -->
    <div
      v-if="textPreview"
      class="fixed inset-0 z-[60] bg-bg-base/85 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        class="bg-bg-elevated border border-hairline rounded-lg shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]"
      >
        <div
          class="flex items-center justify-between px-5 py-3 border-b border-hairline shrink-0"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <FileText class="size-5 text-molybdenum shrink-0" />
            <div class="min-w-0">
              <div class="text-[13.5px] text-text-primary font-medium truncate">
                {{ textPreview.item.name }}
              </div>
              <div class="text-[11px] text-text-muted mt-0.5 font-mono">
                {{
                  (
                    textPreview.item.fileType ||
                    textPreview.item.source ||
                    'DOC'
                  ).toUpperCase()
                }}
                · {{ fmtSize(textPreview.item.size) }} ·
                {{
                  textPreview.chunks.length
                    ? `${textPreview.chunks.length} 块`
                    : `${textPreview.item.charCount?.toLocaleString?.() ?? textPreview.item.charCount} 字`
                }}
                {{ textPreview.truncated ? ' · 仅摘要' : '' }}
              </div>
            </div>
          </div>
          <button
            type="button"
            class="size-8 rounded hover:bg-hairline/60 inline-flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors shrink-0"
            aria-label="关闭"
            @click="textPreview = null"
          >
            <X class="size-4" />
          </button>
        </div>
        <div class="px-5 py-4 overflow-y-auto flex-1 min-h-0">
          <template v-if="textPreview.content">
            <div v-if="textPreview.chunks.length > 1" class="space-y-3">
              <div
                v-for="c in textPreview.chunks"
                :key="c.chunkIndex"
                class="rounded-md border border-hairline bg-bg-base/40 px-3 py-2.5"
              >
                <div class="text-[10px] font-mono text-text-muted mb-1.5">
                  切块 #{{ c.chunkIndex + 1 }}
                </div>
                <div
                  class="text-[12.5px] leading-relaxed text-text-primary whitespace-pre-wrap"
                >
                  {{ c.content }}
                </div>
              </div>
            </div>
            <div
              v-else
              class="text-[12.5px] leading-relaxed text-text-primary whitespace-pre-wrap"
            >
              {{ textPreview.content }}
            </div>
          </template>
          <div v-else class="py-16 text-center text-[12px] text-text-secondary">
            暂无可用正文（可能入库失败或向量库中无切块）。
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kb-detail-enter {
  animation: kbDetailEnter 320ms cubic-bezier(0.25, 0.8, 0.25, 1) both;
}
@keyframes kbDetailEnter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
:deep(.kb-input) {
  background: var(--bg-surface);
  border: 1px solid var(--hairline);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 12px;
  padding: 8px 10px;
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
:deep(.kb-input::placeholder) {
  color: var(--text-muted);
}
:deep(.kb-input:focus) {
  outline: none;
  border-color: var(--accent-molybdenum);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-molybdenum) 18%, transparent);
}
</style>
