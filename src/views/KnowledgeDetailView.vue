<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type FunctionalComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
  Shield,
  CircleCheckBig,
  Ban,
  ListTodo,
  ChevronLeft,
  ChevronRight,
} from 'lucide-vue-next'
import { ApiError } from '@/lib/api'
import {
  approveKnowledgeDocument,
  checkKnowledgeDocumentDuplicate,
  createTextDocument,
  createUrlDocument,
  deleteKnowledgeDocument,
  getKnowledgeBase,
  getKnowledgeDocumentPreview,
  listKnowledgeDocuments,
  rejectKnowledgeDocument,
  searchKnowledge,
  listIngestTasks,
  submitIngestBinaryTask,
  submitIngestTextTask,
  cancelIngestTask,
  type IngestTaskItem,
  type IngestTaskStatus,
  type KbDocItem,
  type KnowledgeBaseItem,
  type ReviewStatus,
} from '@/lib/knowledge-api'
import { THREE_D_EXTS, SERVER_PARSE_EXTS, MAX_FILE_BYTES, fmtSize, readFileSmart } from '@/lib/read-file-smart'
import { formatRelativeTime } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import FbxViewer from '@/components/three-preview/FbxViewer.vue'
import KbAclDialog from '@/components/knowledge/KbAclDialog.vue'

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

function fmtIngestToast(docName: string, item: KbDocItem, opts?: { metaOnly?: boolean }) {
  const chunks = item.chunks ?? 0
  const chars = item.charCount ?? 0
  const pending =
    item.reviewStatus === 'pending_review' ? '，已进入待审核（审核通过后才会被检索）' : ''
  if (opts?.metaOnly) {
    return `${docName} 已入库三维图纸元数据（${chunks} 切块）${pending}`
  }
  return `${docName} 已入库：${chars.toLocaleString()} 字符 · 切成 ${chunks} 块${pending}`
}

const REVIEW_FILTERS: { k: '' | ReviewStatus; label: string }[] = [
  { k: '', label: '全部' },
  { k: 'pending_review', label: '待审核' },
  { k: 'published', label: '已上线' },
  { k: 'rejected', label: '已驳回' },
]

function reviewStatusLabel(status?: ReviewStatus) {
  if (status === 'pending_review') return '待审核'
  if (status === 'published') return '已上线'
  if (status === 'rejected') return '已驳回'
  return status || '—'
}

function reviewStatusClass(status?: ReviewStatus) {
  if (status === 'pending_review') return 'bg-sulfur/15 text-sulfur border-sulfur/30'
  if (status === 'published') return 'bg-patina/15 text-patina border-patina/30'
  if (status === 'rejected') return 'bg-iron/15 text-iron border-iron/30'
  return 'bg-bg-base/60 text-text-secondary border-hairline'
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const baseId = computed(() => String(route.params.baseId || ''))
const uploaderName = computed(
  () => auth.user?.display_name || auth.user?.username || '当前用户',
)

const base = ref<KnowledgeBaseItem | null>(null)
const tab = ref<Tab>('file')
const items = ref<KbItem[]>([])
const docTotal = ref(0)
const docPage = ref(1)
const docPageSize = ref(20)
const loading = ref(true)
const searchLoading = ref(false)
const keyword = ref('')
const reviewFilter = ref<'' | ReviewStatus>('')
const dragOver = ref(false)
const batchCurrent = ref<string | null>(null)
const batchStats = ref({ total: 0, processed: 0, ok: 0, fail: 0 })
const batchRunning = ref(false)
const fileQueue = ref<File[]>([])
const ingestTasks = ref<IngestTaskItem[]>([])
const ingestTasksError = ref('')
const cancellingTaskId = ref<string | null>(null)
const uploading = ref<string[]>([]) // URL / 文本单条入库进度
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
const pendingRejectDoc = ref<KbItem | null>(null)
const rejectComment = ref('')
const reviewingId = ref<string | null>(null)
const pendingDuplicate = ref<{
  kind: 'file' | 'url' | 'text'
  label: string
  file?: File
  duplicates: KbDocItem[]
  inBatch?: boolean
} | null>(null)
const aclOpen = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null
let listSearchTimer: ReturnType<typeof setTimeout> | null = null
let ingestPollTimer: ReturnType<typeof setInterval> | null = null

const TASK_STATUS_LABEL: Record<string, string> = {
  queued: '排队中',
  running: '处理中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

const TASK_STAGE_LABEL: Record<string, string> = {
  queued: '等待 worker',
  starting: '启动',
  dedupe: '检查重复',
  parse: '解析正文',
  chunk: '切块向量化',
  done: '完成',
  failed: '失败',
  cancelled: '已取消',
}

function taskStatusClass(status: IngestTaskStatus) {
  if (status === 'succeeded') return 'bg-patina/15 text-patina border-patina/30'
  if (status === 'failed') return 'bg-iron/15 text-iron border-iron/30'
  if (status === 'running') return 'bg-sulfur/15 text-sulfur border-sulfur/30'
  if (status === 'cancelled') return 'bg-bg-base/60 text-text-muted border-hairline'
  return 'bg-molybdenum/10 text-molybdenum border-molybdenum/20'
}

const activeIngestCount = computed(() =>
  ingestTasks.value.filter((t) => t.status === 'queued' || t.status === 'running').length,
)

const canManage = computed(() => Boolean(base.value?.canManage))
const canUse = computed(() => Boolean(base.value?.canUse))
const canViewOnly = computed(() => Boolean(base.value) && !canUse.value && !canManage.value)

const batchProgressLabel = computed(() => {
  if (!batchRunning.value) return ''
  const s = batchStats.value
  const cur = batchCurrent.value
  if (s.total <= 1) {
    return cur ? `正在提交：${cur}` : '正在提交…'
  }
  return `正在提交 ${s.processed + 1}/${s.total}${cur ? ` · ${cur}` : ''}`
})

const totalChunks = computed(() => base.value?.chunkCount ?? 0)
const totalCharsK = computed(() => ((base.value?.charCount ?? 0) / 1000).toFixed(1))
const docTotalPages = computed(() =>
  Math.max(1, Math.ceil(docTotal.value / docPageSize.value)),
)
const docPageRange = computed(() => {
  if (docTotal.value === 0) return { from: 0, to: 0 }
  const from = (docPage.value - 1) * docPageSize.value + 1
  const to = Math.min(docPage.value * docPageSize.value, docTotal.value)
  return { from, to }
})

const tabs: { k: Tab; label: string; icon: IconComp }[] = [
  { k: 'file', label: '文件上传', icon: Upload },
  { k: 'url', label: 'URL 抓取', icon: LinkIcon },
  { k: 'text', label: '文本粘贴', icon: FileText },
]

async function fetchList(searchQ?: string) {
  if (!baseId.value) return
  const q = (searchQ ?? keyword.value).trim()
  if (q) searchLoading.value = true
  try {
    const [baseInfo, docRes] = await Promise.all([
      getKnowledgeBase(baseId.value),
      listKnowledgeDocuments(baseId.value, {
        q: q || undefined,
        reviewStatus: reviewFilter.value || undefined,
        page: docPage.value,
        pageSize: docPageSize.value,
      }),
    ])
    const totalPages = Math.max(1, Math.ceil(docRes.total / docRes.pageSize))
    if (docRes.total > 0 && docPage.value > totalPages) {
      docPage.value = totalPages
      return fetchList(searchQ)
    }
    base.value = baseInfo
    items.value = docRes.items
    docTotal.value = docRes.total
    docPage.value = docRes.page
    docPageSize.value = docRes.pageSize
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) {
      toast.value = { type: 'err', msg: '没有该知识库的访问权限' }
      await router.replace('/knowledge')
      return
    }
    toast.value = {
      type: 'err',
      msg: e instanceof ApiError || e instanceof Error ? e.message : '加载失败',
    }
  } finally {
    loading.value = false
    searchLoading.value = false
  }
}

watch(reviewFilter, () => {
  if (!baseId.value) return
  docPage.value = 1
  void fetchList()
})

watch(keyword, (v) => {
  if (listSearchTimer) clearTimeout(listSearchTimer)
  listSearchTimer = setTimeout(() => {
    if (!baseId.value) return
    docPage.value = 1
    void fetchList(v)
  }, 280)
})

watch(toast, (v) => {
  if (toastTimer) clearTimeout(toastTimer)
  if (!v) return
  toastTimer = setTimeout(() => {
    toast.value = null
  }, 3200)
})

watch(baseId, () => {
  loading.value = true
  docPage.value = 1
  void fetchList()
  void fetchIngestTasks()
})

onMounted(() => {
  void fetchList()
  void fetchIngestTasks()
})

function stopIngestPolling() {
  if (ingestPollTimer) {
    clearInterval(ingestPollTimer)
    ingestPollTimer = null
  }
}

function startIngestPolling() {
  if (ingestPollTimer) return
  void fetchIngestTasks()
  ingestPollTimer = setInterval(() => {
    void fetchIngestTasks()
  }, 2000)
}

function upsertIngestTask(task: IngestTaskItem) {
  const rest = ingestTasks.value.filter((t) => t.id !== task.id)
  ingestTasks.value = [task, ...rest].slice(0, 50)
}

async function fetchIngestTasks() {
  if (!baseId.value) return
  const prevActive = ingestTasks.value.filter(
    (t) => t.status === 'queued' || t.status === 'running',
  ).length
  const prevById = new Map(ingestTasks.value.map((t) => [t.id, t]))
  try {
    const res = await listIngestTasks(baseId.value, { limit: 50 })
    for (const task of res.items) {
      const prev = prevById.get(task.id)
      const wasActive =
        !prev || prev.status === 'queued' || prev.status === 'running'
      if (task.status === 'failed' && wasActive) {
        toast.value = {
          type: 'err',
          msg: `「${task.filename}」入库失败：${task.errorMsg || '未知错误'}`,
        }
      } else if (task.status === 'succeeded' && wasActive) {
        toast.value = {
          type: 'ok',
          msg: `「${task.filename}」已入库（${task.chunkCount ?? 0} 切块），待审核`,
        }
      }
    }
    ingestTasks.value = res.items
    ingestTasksError.value = ''
    const nowActive = res.items.filter(
      (t) => t.status === 'queued' || t.status === 'running',
    ).length
    if (nowActive > 0) {
      startIngestPolling()
    } else {
      stopIngestPolling()
      if (prevActive > 0) {
        await fetchList()
      }
    }
  } catch (e) {
    const msg =
      e instanceof ApiError || e instanceof Error
        ? e.message
        : '加载任务列表失败'
    ingestTasksError.value = msg
    if (/404|不存在|ingest-tasks/i.test(msg)) {
      ingestTasksError.value =
        '后台任务接口不可用：请确认已执行 alembic upgrade head（0006）并重启 API。'
    }
  }
}

async function cancelTask(task: IngestTaskItem) {
  if (!baseId.value || task.status !== 'queued') return
  cancellingTaskId.value = task.id
  try {
    await cancelIngestTask(baseId.value, task.id)
    await fetchIngestTasks()
    toast.value = { type: 'ok', msg: `已取消排队任务「${task.filename}」` }
  } catch (e) {
    toast.value = {
      type: 'err',
      msg: e instanceof Error ? e.message : '取消失败',
    }
  } finally {
    cancellingTaskId.value = null
  }
}

onUnmounted(() => {
  if (toastTimer) clearTimeout(toastTimer)
})

const overlayOpen = computed(
  () =>
    Boolean(pendingDuplicate.value) ||
    Boolean(pendingRejectDoc.value) ||
    Boolean(pendingDeleteDoc.value) ||
    Boolean(previewItem.value) ||
    Boolean(textPreview.value),
)

watch(overlayOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
})

onUnmounted(() => {
  if (toastTimer) clearTimeout(toastTimer)
  if (listSearchTimer) clearTimeout(listSearchTimer)
  stopIngestPolling()
  document.body.style.overflow = ''
})

async function submitIngestTask(
  file: File,
  force = false,
): Promise<IngestTaskItem> {
  if (!baseId.value) throw new Error('知识库未加载')
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (SERVER_PARSE_EXTS.includes(ext)) {
    return submitIngestBinaryTask({
      baseId: baseId.value,
      file,
      uploader: uploaderName.value,
      force,
    })
  }
  const parsed = await readFileSmart(file)
  const is3d = THREE_D_EXTS.includes(ext) || !parsed.fullText
  return submitIngestTextTask({
    baseId: baseId.value,
    name: file.name,
    content: parsed.content,
    fileType: ext,
    size: file.size,
    uploader: uploaderName.value,
    tags: is3d ? ['手动上传', '三维图纸'] : ['手动上传'],
    force,
    kind: is3d ? '3d' : 'doc',
  })
}

async function processFileQueue(opts?: { forceCurrent?: boolean }) {
  if (!baseId.value || fileQueue.value.length === 0) {
    if (batchRunning.value && fileQueue.value.length === 0) {
      finishBatchUpload()
    }
    return
  }
  const file = fileQueue.value[0]
  batchCurrent.value = file.name

  if (!opts?.forceCurrent) {
    try {
      const dup = await checkKnowledgeDocumentDuplicate({
        baseId: baseId.value,
        name: file.name,
      })
      if (dup.exists) {
        pendingDuplicate.value = {
          kind: 'file',
          label: file.name,
          file,
          duplicates: dup.duplicates,
          inBatch: batchStats.value.total > 1 || fileQueue.value.length > 1,
        }
        return
      }
    } catch (e) {
      fileQueue.value.shift()
      batchStats.value.processed += 1
      batchStats.value.fail += 1
      toast.value = {
        type: 'err',
        msg: e instanceof Error ? e.message : '重复检查失败',
      }
      await processFileQueue()
      return
    }
  }

  batchRunning.value = true

  try {
    const task = await submitIngestTask(
      file,
      Boolean(opts?.forceCurrent),
    )
    upsertIngestTask(task)
    startIngestPolling()
    fileQueue.value.shift()
    batchStats.value.processed += 1
    batchStats.value.ok += 1
    if (batchStats.value.total <= 1) {
      toast.value = {
        type: 'ok',
        msg: `「${file.name}」已加入后台队列，请在下方「后台入库任务」查看进度`,
      }
    }
  } catch (e) {
    fileQueue.value.shift()
    batchStats.value.processed += 1
    batchStats.value.fail += 1
    const raw = e instanceof Error ? e.message : '未知错误'
    const hint = /404|ingest-tasks/i.test(raw)
      ? '（请执行数据库迁移 0006 并重启 API）'
      : /embedding/i.test(raw)
        ? '（正文可能已解析，失败在向量化；长文档请确认 Embedding 模型可用）'
        : ''
    if (batchStats.value.total <= 1) {
      toast.value = { type: 'err', msg: `${file.name} 提交失败：${raw}${hint}` }
    }
  }

  if (fileQueue.value.length > 0) {
    await processFileQueue()
  } else {
    finishBatchUpload()
  }
}

function finishBatchUpload() {
  batchRunning.value = false
  batchCurrent.value = null
  const s = batchStats.value
  if (s.total > 1) {
    toast.value = {
      type: s.fail > 0 ? 'err' : 'ok',
      msg: `已提交 ${s.ok} 个文件到后台队列${s.fail ? `，${s.fail} 个提交失败` : ''}。服务端将逐个解析切块，请在下方任务列表查看进度。`,
    }
  }
  batchStats.value = { total: 0, processed: 0, ok: 0, fail: 0 }
}

function enqueueFiles(files: FileList | File[], opts?: { force?: boolean }) {
  const arr = Array.from(files)
  if (arr.length === 0 || !baseId.value) return

  const valid: File[] = []
  for (const file of arr) {
    if (file.size > MAX_FILE_BYTES) {
      toast.value = { type: 'err', msg: `${file.name}：单文件不能超过 30 MB，已跳过` }
      continue
    }
    valid.push(file)
  }
  if (valid.length === 0) return

  if (!batchRunning.value) {
    batchStats.value = { total: valid.length, processed: 0, ok: 0, fail: 0 }
    fileQueue.value = [...valid]
  } else {
    fileQueue.value.push(...valid)
    batchStats.value.total += valid.length
  }
  void processFileQueue(opts?.force ? { forceCurrent: true } : undefined)
}

async function handleFiles(files: FileList | File[], opts?: { force?: boolean }) {
  enqueueFiles(files, opts)
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

async function submitUrl(force = false) {
  if (!urlForm.value.url.trim()) {
    toast.value = { type: 'err', msg: '请填写资料 URL' }
    return
  }
  if (!baseId.value) return
  const title = urlForm.value.title.trim() || urlForm.value.url.trim()
  const urlKey = urlForm.value.url
  if (!force) {
    try {
      const dup = await checkKnowledgeDocumentDuplicate({
        baseId: baseId.value,
        name: title,
        url: urlForm.value.url.trim(),
      })
      if (dup.exists) {
        pendingDuplicate.value = {
          kind: 'url',
          label: title,
          duplicates: dup.duplicates,
        }
        return
      }
    } catch (e) {
      toast.value = {
        type: 'err',
        msg: e instanceof Error ? e.message : '重复检查失败',
      }
      return
    }
  }
  uploading.value = [...uploading.value, urlKey]
  try {
    const result = await createUrlDocument({
      baseId: baseId.value,
      url: urlForm.value.url.trim(),
      title,
      uploader: uploaderName.value,
      tags: urlForm.value.tags
        ? urlForm.value.tags.split(/[,，\s]+/).filter(Boolean)
        : ['URL'],
      force,
    })
    urlForm.value = { url: '', title: '', tags: '' }
    await fetchList()
    const replaced = (result.replaced?.length || 0) > 0
    toast.value = {
      type: 'ok',
      msg: fmtIngestToast(result.item.name, result.item) + (replaced ? '（已覆盖旧版）' : ''),
    }
  } catch (e) {
    toast.value = {
      type: 'err',
      msg: `入库失败：${e instanceof Error ? e.message : '未知错误'}`,
    }
  } finally {
    uploading.value = uploading.value.filter((n) => n !== urlKey)
  }
}

async function submitText(force = false) {
  if (!textForm.value.title.trim() || textForm.value.content.trim().length < 4) {
    toast.value = { type: 'err', msg: '请填写资料名称和正文（正文 ≥ 4 字）' }
    return
  }
  if (!baseId.value) return
  const titleKey = textForm.value.title.trim()
  if (!force) {
    try {
      const dup = await checkKnowledgeDocumentDuplicate({
        baseId: baseId.value,
        name: titleKey,
      })
      if (dup.exists) {
        pendingDuplicate.value = {
          kind: 'text',
          label: titleKey,
          duplicates: dup.duplicates,
        }
        return
      }
    } catch (e) {
      toast.value = {
        type: 'err',
        msg: e instanceof Error ? e.message : '重复检查失败',
      }
      return
    }
  }
  uploading.value = [...uploading.value, titleKey]
  try {
    const result = await createTextDocument({
      baseId: baseId.value,
      title: titleKey,
      content: textForm.value.content.trim(),
      uploader: uploaderName.value,
      tags: textForm.value.tags
        ? textForm.value.tags.split(/[,，\s]+/).filter(Boolean)
        : ['手录'],
      force,
    })
    textForm.value = { title: '', content: '', tags: '' }
    await fetchList()
    const replaced = (result.replaced?.length || 0) > 0
    toast.value = {
      type: 'ok',
      msg: fmtIngestToast(result.item.name, result.item) + (replaced ? '（已覆盖旧版）' : ''),
    }
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
  if (!canUse.value) return
  if (!probe.value.trim() || !baseId.value) return
  probeLoading.value = true
  probeRes.value = null
  try {
    const chunks = await searchKnowledge({
      query: probe.value.trim(),
      baseId: baseId.value,
      topK: 8,
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
  if (!canManage.value) return
  pendingDeleteDoc.value = doc
}

async function confirmDeleteDoc() {
  if (!baseId.value || !pendingDeleteDoc.value) return
  const doc = pendingDeleteDoc.value
  deletingId.value = doc.id
  try {
    await deleteKnowledgeDocument(baseId.value, doc.id)
    pendingDeleteDoc.value = null
    await fetchList()
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

async function confirmRejectDoc() {
  if (!baseId.value || !pendingRejectDoc.value) return
  const doc = pendingRejectDoc.value
  reviewingId.value = doc.id
  try {
    await rejectKnowledgeDocument({
      baseId: baseId.value,
      docId: doc.id,
      comment: rejectComment.value.trim() || undefined,
    })
    pendingRejectDoc.value = null
    rejectComment.value = ''
    await fetchList()
    toast.value = { type: 'ok', msg: `「${doc.name}」已驳回` }
  } catch (e) {
    toast.value = {
      type: 'err',
      msg: e instanceof Error ? e.message : '驳回失败',
    }
  } finally {
    reviewingId.value = null
  }
}

async function approveDoc(doc: KbItem) {
  if (!baseId.value || !canManage.value) return
  reviewingId.value = doc.id
  try {
    await approveKnowledgeDocument({ baseId: baseId.value, docId: doc.id })
    await fetchList()
    toast.value = { type: 'ok', msg: `「${doc.name}」已上线，可被检索` }
  } catch (e) {
    toast.value = {
      type: 'err',
      msg: e instanceof Error ? e.message : '审核通过失败',
    }
  } finally {
    reviewingId.value = null
  }
}

function askRejectDoc(doc: KbItem) {
  if (!canManage.value) return
  pendingRejectDoc.value = doc
  rejectComment.value = ''
}

async function confirmDuplicateUpload() {
  const pending = pendingDuplicate.value
  if (!pending) return
  pendingDuplicate.value = null
  if (pending.kind === 'file' && pending.file) {
    pendingDuplicate.value = null
    if (!batchRunning.value) {
      batchStats.value = { total: 1, processed: 0, ok: 0, fail: 0 }
      fileQueue.value = [pending.file]
    }
    await processFileQueue({ forceCurrent: true })
    return
  }
  if (pending.kind === 'url') {
    await submitUrl(true)
    return
  }
  if (pending.kind === 'text') {
    await submitText(true)
  }
}

function closeDuplicateDialog() {
  pendingDuplicate.value = null
  batchCurrent.value = null
}

async function skipDuplicateFile() {
  const pending = pendingDuplicate.value
  if (!pending?.inBatch || pending.kind !== 'file') {
    pendingDuplicate.value = null
    return
  }
  pendingDuplicate.value = null
  if (fileQueue.value.length > 0) {
    fileQueue.value.shift()
    batchStats.value.processed += 1
    batchStats.value.fail += 1
  }
  void processFileQueue()
}

function goDocPage(page: number) {
  const next = Math.min(Math.max(1, page), docTotalPages.value)
  if (next === docPage.value) return
  docPage.value = next
  void fetchList()
}

function onDocPageSizeChange(e: Event) {
  const size = Number((e.target as HTMLSelectElement).value)
  if (!size || size === docPageSize.value) return
  docPageSize.value = size
  docPage.value = 1
  void fetchList()
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
            '支持 PDF / Word / Excel / 图片 / 文本 / URL 多源资料导入，向量化后作为 AI 智能问答的依据。'
          }}
        </p>
      </div>
      <div class="flex flex-col items-end gap-2">
        <button
          v-if="canManage"
          type="button"
          class="h-8 px-3 text-[12px] rounded-md border border-hairline text-text-secondary hover:text-molybdenum hover:bg-molybdenum/10 inline-flex items-center gap-1.5"
          @click="aclOpen = true"
        >
          <Shield class="size-3.5" />
          分配权限
        </button>
        <div class="flex gap-3 text-[11px] font-mono text-text-secondary">
        <span>
          资料总数
          <span class="text-text-primary text-base font-semibold">{{ base?.docCount ?? docTotal }}</span>
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
      </div>
    </header>

    <div
      v-if="canViewOnly"
      class="rounded-md border border-hairline bg-bg-base/40 px-3 py-2 text-[12px] text-text-secondary"
    >
      你仅有查看权限：可以看资料列表和预览，不能做语义检索或导入。
    </div>

    <!-- 导入资料 -->
    <section v-if="canManage" class="rounded-lg panel-surface overflow-hidden flex flex-col">
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
                  :disabled="batchRunning"
                  @click="fileRef?.click()"
                >
                  点击选择文件（可多选）
                </button>
              </div>
              <div class="text-[11px] text-text-secondary max-w-xl">
                支持一次选择多个文件，将<strong class="text-text-primary font-normal">按顺序逐个</strong>上传、解析正文、切块并向量化（不并行）。正文入库：.pdf（含扫描件 OCR）/ .xlsx / .xls / 图片 OCR / .docx / .txt / .md / .csv /
                .json。扫描件与图片首次识别较慢。旧版 .doc 请另存为 .docx 或使用「文本粘贴」。
                单文件最大 30 MB。入库后默认<strong class="text-text-primary font-normal">待审核</strong>。
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
          v-if="batchRunning"
          class="mt-3 px-3 py-2.5 rounded-md bg-bg-base/40 border border-hairline text-[11px] text-text-secondary space-y-2"
        >
          <div class="flex items-center gap-2">
            <Loader2 class="size-3 animate-spin text-iron shrink-0" />
            <span>{{ batchProgressLabel }}</span>
          </div>
          <div
            v-if="batchStats.total > 1"
            class="h-1.5 rounded-full bg-hairline overflow-hidden"
          >
            <div
              class="h-full bg-iron transition-all duration-300"
              :style="{
                width: `${Math.min(100, (batchStats.processed / batchStats.total) * 100)}%`,
              }"
            />
          </div>
          <div v-if="batchStats.total > 1" class="text-[10px] text-text-muted font-mono">
            已完成 {{ batchStats.processed }}/{{ batchStats.total }} · 成功 {{ batchStats.ok }} · 失败
            {{ batchStats.fail }}
          </div>
        </div>
      </div>
    </section>

    <!-- 后台入库任务（管理员始终可见） -->
    <section
      v-if="canManage"
      class="rounded-lg panel-surface overflow-hidden flex flex-col"
    >
      <header class="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-5 py-3 border-b border-border">
        <div class="flex items-center gap-2 min-w-0">
          <ListTodo class="size-4 text-molybdenum shrink-0" />
          <h3 class="text-sm font-medium tracking-wide truncate">后台入库任务</h3>
          <span
            v-if="activeIngestCount > 0"
            class="text-[10px] px-1.5 py-0.5 rounded bg-sulfur/15 text-sulfur border border-sulfur/30 font-mono"
          >
            {{ activeIngestCount }} 进行中
          </span>
        </div>
        <button
          type="button"
          class="h-7 px-2.5 text-[11px] rounded-md border border-hairline text-text-secondary hover:bg-hairline/40"
          @click="fetchIngestTasks()"
        >
          刷新
        </button>
      </header>
      <div class="p-4 lg:p-5 overflow-x-auto">
        <p
          v-if="ingestTasksError"
          class="mb-3 text-[12px] text-iron rounded-md border border-iron/30 bg-iron/5 px-3 py-2"
        >
          {{ ingestTasksError }}
        </p>
        <div
          v-if="ingestTasks.length === 0 && !ingestTasksError"
          class="py-8 text-center text-[12px] text-text-secondary"
        >
          暂无入库任务。上传文件后会在此显示排队 / 解析 / 切块进度。
        </div>
        <table v-else class="w-full min-w-[880px] text-[12px]">
          <thead>
            <tr class="text-text-muted border-b border-hairline">
              <th class="text-left px-2 py-2 font-medium">文件名</th>
              <th class="text-left px-2 py-2 font-medium">状态</th>
              <th class="text-left px-2 py-2 font-medium">阶段</th>
              <th class="text-right px-2 py-2 font-medium font-mono">切块</th>
              <th class="text-left px-2 py-2 font-medium">说明</th>
              <th class="text-right px-2 py-2 font-medium">时间</th>
              <th class="text-center px-2 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="task in ingestTasks"
              :key="task.id"
              class="border-b border-hairline/70 hover:bg-bg-base/40"
            >
              <td class="px-2 py-2.5 max-w-[200px] truncate" :title="task.filename">
                {{ task.filename }}
              </td>
              <td class="px-2 py-2.5 whitespace-nowrap">
                <span
                  class="inline-flex px-1.5 py-0.5 rounded text-[10px] border font-medium"
                  :class="taskStatusClass(task.status)"
                >
                  <Loader2
                    v-if="task.status === 'running'"
                    class="inline size-3 animate-spin mr-1"
                  />
                  {{ TASK_STATUS_LABEL[task.status] || task.status }}
                </span>
              </td>
              <td class="px-2 py-2.5 text-text-secondary whitespace-nowrap">
                {{ TASK_STAGE_LABEL[task.stage || ''] || task.stage || '—' }}
              </td>
              <td class="px-2 py-2.5 text-right font-mono text-molybdenum whitespace-nowrap">
                {{
                  task.chunkCount != null && task.status === 'succeeded'
                    ? `${task.chunkCount} 块`
                    : '—'
                }}
              </td>
              <td class="px-2 py-2.5 text-text-muted max-w-[240px] truncate">
                <span v-if="task.status === 'failed'" class="text-iron" :title="task.errorMsg || ''">
                  {{ task.errorMsg || '失败' }}
                </span>
                <span v-else-if="task.status === 'succeeded'">
                  已入库 · 待审核{{ task.docId ? ` · ${task.docId.slice(0, 8)}…` : '' }}
                </span>
                <span v-else-if="task.status === 'queued'">等待按顺序处理</span>
                <span v-else-if="task.status === 'running'">正在解析 / 向量化</span>
                <span v-else>—</span>
              </td>
              <td class="px-2 py-2.5 text-right font-mono text-[11px] text-text-muted whitespace-nowrap">
                {{ formatRelativeTime(task.createdAt) }}
              </td>
              <td class="px-2 py-2.5 text-center whitespace-nowrap">
                <button
                  v-if="task.status === 'queued'"
                  type="button"
                  class="text-[10.5px] text-iron hover:underline"
                  :disabled="cancellingTaskId === task.id"
                  @click="cancelTask(task)"
                >
                  {{ cancellingTaskId === task.id ? '取消中…' : '取消' }}
                </button>
                <span v-else class="text-text-muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="mt-3 text-[11px] text-text-muted">
          服务端按队列<strong class="font-normal text-text-secondary">逐个</strong>解析、切块、写入向量库；仅显示进行中的任务，成功或失败后会自动从列表清除（需 API 保持运行）。
        </p>
      </div>
    </section>

    <!-- 语义检索测试 -->
    <section v-if="canUse" class="rounded-lg panel-surface overflow-hidden flex flex-col">
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
      <header class="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-5 py-3 border-b border-border">
        <div class="flex flex-wrap items-center gap-3 min-w-0">
          <h3 class="text-sm font-medium tracking-wide truncate flex items-center gap-2">
            <span class="inline-block w-1 h-3 bg-iron rounded-sm" />
            已导入资料（{{ docPageRange.from }}-{{ docPageRange.to }} / {{ docTotal }}）
          </h3>
          <div class="flex gap-1 flex-wrap">
            <button
              v-for="f in REVIEW_FILTERS"
              :key="f.k || 'all'"
              type="button"
              class="px-2.5 py-1 rounded text-[11px] border transition-colors"
              :class="
                reviewFilter === f.k
                  ? 'border-iron bg-iron/10 text-text-primary'
                  : 'border-hairline text-text-secondary hover:text-text-primary'
              "
              @click="reviewFilter = f.k"
            >
              {{ f.label }}
            </button>
          </div>
        </div>
        <div class="relative w-full sm:flex-1 sm:max-w-2xl lg:max-w-3xl sm:min-w-[18rem]">
          <Search
            class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-text-muted pointer-events-none"
          />
          <input
            v-model="keyword"
            placeholder="按名称 / 标签 / 摘要 / 上传者搜索..."
            class="kb-input kb-input-with-icon h-8 w-full text-[12px]"
          />
          <Loader2
            v-if="searchLoading"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-text-muted"
          />
          <button
            v-else-if="keyword.trim()"
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 size-6 rounded inline-flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-hairline/50"
            aria-label="清空搜索"
            @click="keyword = ''"
          >
            <X class="size-3.5" />
          </button>
        </div>
      </header>
      <div class="p-4 lg:p-5">
        <div
          v-if="loading"
          class="py-12 text-center text-text-secondary text-[12px]"
        >
          <Loader2 class="inline size-4 animate-spin mr-2" /> 正在加载知识库...
        </div>
        <div
          v-else-if="(base?.docCount ?? 0) === 0"
          class="py-12 text-center text-text-secondary text-[12px]"
        >
          暂无资料。请通过上方上传文件、抓取 URL 或粘贴文本进行入库。
        </div>
        <div
          v-else-if="items.length === 0"
          class="py-12 text-center text-text-secondary text-[12px]"
        >
          未找到匹配「{{ keyword.trim() }}」的资料，请换个关键词或
          <button type="button" class="text-molybdenum hover:underline" @click="keyword = ''">
            清空搜索
          </button>
        </div>
        <div v-else class="overflow-x-auto -mx-4 px-4">
          <table class="w-full min-w-[1180px] table-fixed text-[12px]">
            <colgroup>
              <col class="w-[30%]" />
              <col class="w-[6%]" />
              <col class="w-[7%]" />
              <col class="w-[6%]" />
              <col class="w-[5%]" />
              <col class="w-[11%]" />
              <col class="w-[7%]" />
              <col class="w-[7%]" />
              <col class="w-[5%]" />
              <col class="w-[7%]" />
              <col class="w-[12%]" />
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
                <th class="text-center px-2 py-2 font-medium whitespace-nowrap">解析</th>
                <th class="text-center px-2 py-2 font-medium whitespace-nowrap">审核</th>
                <th class="text-center px-2 py-2 font-medium whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="it in items"
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
                  {{ formatRelativeTime(it.createdAt) }}
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
                  <span
                    v-if="it.status === 'ready'"
                    class="inline-flex px-1.5 py-0.5 rounded text-[10px] border font-medium"
                    :class="reviewStatusClass(it.reviewStatus)"
                    :title="it.reviewComment || undefined"
                  >
                    {{ reviewStatusLabel(it.reviewStatus) }}
                  </span>
                  <span v-else class="text-text-muted">—</span>
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
                    v-if="canManage && it.status === 'ready' && it.reviewStatus === 'pending_review'"
                    type="button"
                    :disabled="reviewingId === it.id"
                    class="ml-0.5 inline-flex items-center gap-1 px-2 py-1 rounded text-[10.5px] text-patina hover:bg-patina/10 transition-colors whitespace-nowrap"
                    title="审核通过并上线"
                    @click="approveDoc(it)"
                  >
                    <Loader2 v-if="reviewingId === it.id" class="size-3 animate-spin" />
                    <CircleCheckBig v-else class="size-3" />
                    通过
                  </button>
                  <button
                    v-if="canManage && it.status === 'ready' && it.reviewStatus === 'pending_review'"
                    type="button"
                    :disabled="reviewingId === it.id"
                    class="ml-0.5 inline-flex items-center gap-1 px-2 py-1 rounded text-[10.5px] text-iron hover:bg-iron/10 transition-colors whitespace-nowrap"
                    title="驳回并移除向量"
                    @click="askRejectDoc(it)"
                  >
                    <Ban class="size-3" />
                    驳回
                  </button>
                  <button
                    v-if="canManage"
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
          <div
            v-if="docTotal > 0"
            class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4"
          >
            <div class="text-[11px] text-text-secondary font-mono">
              第 {{ docPage }} / {{ docTotalPages }} 页 · 共 {{ docTotal }} 条
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <label class="flex items-center gap-1.5 text-[11px] text-text-secondary">
                每页
                <select
                  :value="docPageSize"
                  class="kb-input h-7 w-[4.5rem] px-2 text-[11px]"
                  @change="onDocPageSizeChange"
                >
                  <option :value="10">10</option>
                  <option :value="20">20</option>
                  <option :value="50">50</option>
                </select>
                条
              </label>
              <button
                type="button"
                class="h-7 px-2.5 text-[11px] rounded-md border border-hairline text-text-secondary hover:bg-hairline/40 inline-flex items-center gap-1 disabled:opacity-40"
                :disabled="docPage <= 1 || searchLoading"
                @click="goDocPage(docPage - 1)"
              >
                <ChevronLeft class="size-3.5" />
                上一页
              </button>
              <button
                type="button"
                class="h-7 px-2.5 text-[11px] rounded-md border border-hairline text-text-secondary hover:bg-hairline/40 inline-flex items-center gap-1 disabled:opacity-40"
                :disabled="docPage >= docTotalPages || searchLoading"
                @click="goDocPage(docPage + 1)"
              >
                下一页
                <ChevronRight class="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <KbAclDialog
      :open="aclOpen"
      :base-id="baseId"
      :base-name="base?.name"
      @close="aclOpen = false"
    />

    <Teleport to="body">
    <!-- Toast -->
    <div
      v-if="toast"
      class="fixed top-6 left-1/2 z-[100] -translate-x-1/2 px-4 py-2.5 rounded-md text-[12px] shadow-lg border max-w-[min(92vw,28rem)] text-center"
      :class="
        toast.type === 'ok'
          ? 'bg-patina/10 border-patina/40 text-patina'
          : 'bg-iron/10 border-iron/40 text-iron'
      "
    >
      {{ toast.msg }}
    </div>

    <!-- Duplicate upload confirm -->
    <div
      v-if="pendingDuplicate"
      class="fixed inset-0 z-[100] bg-bg-base/80 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="closeDuplicateDialog()"
    >
      <div class="w-full max-w-md rounded-lg border border-hairline bg-bg-elevated shadow-2xl overflow-hidden">
        <div class="px-5 pt-5 pb-3">
          <div class="flex items-start gap-3">
            <span
              class="mt-0.5 size-9 shrink-0 rounded-md bg-sulfur/15 text-sulfur inline-flex items-center justify-center border border-sulfur/25"
            >
              <TriangleAlert class="size-4" />
            </span>
            <div class="min-w-0 space-y-1.5 text-left">
              <div class="text-[14px] font-medium text-text-primary">检测到重复资料</div>
              <div
                v-if="pendingDuplicate.inBatch"
                class="text-[11px] text-sulfur font-mono"
              >
                批量上传进行中 · 当前 {{ batchStats.processed + 1 }}/{{ batchStats.total }}
              </div>
              <div class="text-[12px] text-text-secondary leading-relaxed">
                「<span class="text-text-primary font-medium">{{ pendingDuplicate.label }}</span>」
                与当前知识库中已有资料同名。继续上传将<span class="text-text-primary font-medium">删除旧版</span>并替换为新内容（含向量片段与原文件）。
              </div>
              <div
                v-if="pendingDuplicate.duplicates[0]"
                class="mt-2 rounded-md border border-hairline bg-bg-base/40 px-3 py-2 text-[11px] text-text-muted"
              >
                已有记录：{{ pendingDuplicate.duplicates[0].uploader || '未知上传者' }} ·
                {{ formatRelativeTime(pendingDuplicate.duplicates[0].createdAt) }}
              </div>
            </div>
          </div>
        </div>
        <div class="px-5 py-3 border-t border-hairline bg-bg-base/30 flex justify-end gap-2">
          <button
            v-if="pendingDuplicate.inBatch"
            type="button"
            class="h-8 px-3 text-[12px] rounded-md border border-hairline bg-transparent text-text-secondary hover:bg-hairline/40"
            @click="skipDuplicateFile()"
          >
            跳过此文件
          </button>
          <button
            v-else
            type="button"
            class="h-8 px-3 text-[12px] rounded-md border border-hairline bg-transparent text-text-secondary hover:bg-hairline/40"
            @click="pendingDuplicate.inBatch ? skipDuplicateFile() : closeDuplicateDialog()"
          >
            取消
          </button>
          <button
            type="button"
            class="h-8 px-3 text-[12px] rounded-md bg-molybdenum text-white hover:brightness-110"
            @click="confirmDuplicateUpload()"
          >
            覆盖上传
          </button>
        </div>
      </div>
    </div>

    <!-- Reject confirm -->
    <div
      v-if="pendingRejectDoc"
      class="fixed inset-0 z-[100] bg-bg-base/80 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="pendingRejectDoc = null"
    >
      <div class="w-full max-w-md rounded-lg border border-hairline bg-bg-elevated shadow-2xl overflow-hidden">
        <div class="px-5 pt-5 pb-3 space-y-3 text-left">
          <div class="text-[14px] font-medium text-text-primary">驳回资料</div>
          <div class="text-[12px] text-text-secondary">
            将驳回「{{ pendingRejectDoc.name }}」并移除其向量片段，该资料将不再可被检索。
          </div>
          <label class="block">
            <div class="text-[11px] text-text-secondary mb-1">驳回原因（选填）</div>
            <textarea
              v-model="rejectComment"
              class="kb-input min-h-[72px] text-[12px]"
              placeholder="如：内容不完整、涉密未脱敏..."
            />
          </label>
        </div>
        <div class="px-5 py-3 border-t border-hairline bg-bg-base/30 flex justify-end gap-2">
          <button
            type="button"
            class="h-8 px-3 text-[12px] rounded-md border border-hairline bg-transparent text-text-secondary hover:bg-hairline/40"
            @click="pendingRejectDoc = null"
          >
            取消
          </button>
          <button
            type="button"
            class="h-8 px-3 text-[12px] rounded-md bg-iron text-white hover:brightness-110"
            :disabled="reviewingId === pendingRejectDoc.id"
            @click="confirmRejectDoc()"
          >
            确认驳回
          </button>
        </div>
      </div>
    </div>

    <!-- Delete confirm -->
    <div
      v-if="pendingDeleteDoc"
      class="fixed inset-0 z-[100] bg-bg-base/80 backdrop-blur-sm flex items-center justify-center p-4"
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
      class="fixed inset-0 z-[100] bg-bg-base/85 backdrop-blur-sm flex items-center justify-center p-4"
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
      class="fixed inset-0 z-[100] bg-bg-base/85 backdrop-blur-sm flex items-center justify-center p-4"
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
    </Teleport>
  </div>
</template>

<style scoped>
.kb-detail-enter {
  animation: kbDetailEnter 320ms cubic-bezier(0.25, 0.8, 0.25, 1) both;
}
@keyframes kbDetailEnter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
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
:deep(.kb-input-with-icon) {
  padding-left: 2.125rem;
  padding-right: 2rem;
}
</style>
