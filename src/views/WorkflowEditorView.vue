<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { VueFlow, type Connection } from '@vue-flow/core'

/** 避免直接用 Vue Flow 的 Node/Edge 泛型：vue-tsc 会报 TS2589（实例化过深）。 */
type CanvasNode = {
  id: string
  type?: string
  position: { x: number; y: number }
  label?: string
  data?: Record<string, unknown>
  class?: string
}

type CanvasEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import {
  ArrowLeft,
  Check,
  Loader2,
  Pencil,
  Play,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { listAgents, type AgentItem } from '@/lib/agents-api'
import { listKnowledgeBases, type KnowledgeBaseItem } from '@/lib/knowledge-api'
import { listPrompts, type PromptItem } from '@/lib/prompts-api'
import { listMcpServers, type McpServerItem } from '@/lib/mcp-api'
import {
  getWorkflow,
  publishWorkflow,
  runWorkflowTrial,
  saveWorkflowGraph,
  updateWorkflow,
  type WorkflowGraph,
  type WorkflowItem,
  type WorkflowNodeType,
} from '@/lib/workflows-api'

const NODE_META: Record<
  WorkflowNodeType,
  { label: string; tone: string }
> = {
  start: { label: '开始', tone: 'bg-patina/20 border-patina/40' },
  end: { label: '结束', tone: 'bg-muted/40 border-border' },
  knowledge: { label: '知识检索', tone: 'bg-coolant/15 border-coolant/40' },
  llm: { label: 'LLM', tone: 'bg-molybdenum/15 border-molybdenum/40' },
  agent: { label: '场景智能体', tone: 'bg-iron/15 border-iron/40' },
  mcp: { label: 'MCP 工具', tone: 'bg-sulfur/15 border-sulfur/40' },
}

const PALETTE: WorkflowNodeType[] = ['knowledge', 'llm', 'agent', 'mcp']

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const workflowId = computed(() => String(route.params.id || ''))

const showGate = computed(() => auth.loading || (!auth.isAdmin && !auth.loading))

const item = ref<WorkflowItem | null>(null)
const nodes = ref<CanvasNode[]>([])
const edges = ref<CanvasEdge[]>([])
const selectedId = ref<string | null>(null)
const selectedEdgeId = ref<string | null>(null)
const loading = ref(true)
const saving = ref(false)
const publishing = ref(false)
const running = ref(false)
const error = ref('')
const toast = ref('')
const nameEdit = ref('')
const nameEditing = ref(false)
const nameSaving = ref(false)
const nameInputRef = ref<HTMLInputElement | null>(null)
const trialInput = ref(
  '{"inventoryGuid":"F77529AB-5A23-4628-BF0D-663F30A4EB34","query":"生成同型号最优良率实践文档"}',
)
const runLog = ref<string[]>([])
const runOutput = ref('')

const prompts = ref<PromptItem[]>([])
const kbs = ref<KnowledgeBaseItem[]>([])
const agents = ref<AgentItem[]>([])
const mcpServers = ref<McpServerItem[]>([])

const selected = computed(() => {
  const id = selectedId.value
  if (!id) return null
  return nodes.value.find((n) => n.id === id) ?? null
})

const selectedNodeType = computed(() => {
  const t = (selected.value?.data as { nodeType?: string } | undefined)?.nodeType
  return (t || '') as WorkflowNodeType | ''
})

const canDeleteSelected = computed(() => {
  if (!selected.value) return false
  return selectedNodeType.value !== 'start' && selectedNodeType.value !== 'end'
})

const toolOptions = computed(() => {
  const out: { id: string; label: string }[] = []
  for (const s of mcpServers.value) {
    for (const t of s.tools || []) {
      if (!t.enabled) continue
      out.push({ id: t.id, label: `${s.name} / ${t.name}` })
    }
  }
  return out
})

function onConnect(c: Connection) {
  if (!c.source || !c.target) return
  const id = `e_${c.source}_${c.target}_${Date.now()}`
  if (edges.value.some((e) => e.source === c.source && e.target === c.target)) return
  edges.value = [
    ...edges.value,
    {
      id,
      source: c.source,
      target: c.target,
      sourceHandle: c.sourceHandle || undefined,
      targetHandle: c.targetHandle || undefined,
    },
  ]
}

function toFlowNodes(graph: WorkflowGraph): CanvasNode[] {
  return (graph.nodes || []).map((n) => ({
    id: n.id,
    type: 'default',
    position: n.position || { x: 100, y: 100 },
    label: NODE_META[n.type as WorkflowNodeType]?.label || n.type,
    data: {
      nodeType: n.type,
      ...(n.data || {}),
    },
    class: NODE_META[n.type as WorkflowNodeType]?.tone || '',
  }))
}

function toFlowEdges(graph: WorkflowGraph): CanvasEdge[] {
  return (graph.edges || []).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle || undefined,
    targetHandle: e.targetHandle || undefined,
  }))
}

function exportGraph(): WorkflowGraph {
  return {
    nodes: nodes.value.map((n) => ({
      id: n.id,
      type: String((n.data as { nodeType?: string })?.nodeType || n.type || 'llm'),
      position: { ...n.position },
      data: (() => {
        const d = { ...(n.data as Record<string, unknown>) }
        delete d.nodeType
        return d
      })(),
    })),
    edges: edges.value.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    })),
  }
}

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    const [wf, p, kb, ag, mcp] = await Promise.all([
      getWorkflow(workflowId.value),
      listPrompts().catch(() => [] as PromptItem[]),
      listKnowledgeBases().catch(() => [] as KnowledgeBaseItem[]),
      listAgents().catch(() => [] as AgentItem[]),
      listMcpServers().catch(() => [] as McpServerItem[]),
    ])
    item.value = wf
    nameEdit.value = wf.name
    prompts.value = p
    kbs.value = kb
    agents.value = ag.filter((a) => a.enabled)
    mcpServers.value = mcp
    const graph = wf.draftVersion?.graph || { nodes: [], edges: [] }
    nodes.value = toFlowNodes(graph)
    edges.value = toFlowEdges(graph)
    selectedId.value = null
    selectedEdgeId.value = null
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function onNodeClick(ev: { node: { id: string } }) {
  selectedId.value = ev.node.id
  selectedEdgeId.value = null
}

function onEdgeClick(ev: { edge: { id: string } }) {
  selectedEdgeId.value = ev.edge.id
  selectedId.value = null
}

function onPaneClick() {
  selectedId.value = null
  selectedEdgeId.value = null
}

function removeSelectedNode() {
  const n = selected.value
  if (!n) return
  const ntype = String((n.data as { nodeType?: string })?.nodeType || '')
  if (ntype === 'start' || ntype === 'end') {
    error.value = '开始 / 结束节点不可删除'
    return
  }
  const id = n.id
  nodes.value = nodes.value.filter((x) => x.id !== id)
  edges.value = edges.value.filter((e) => e.source !== id && e.target !== id)
  selectedId.value = null
  error.value = ''
}

function removeSelectedEdge() {
  if (!selectedEdgeId.value) return
  const id = selectedEdgeId.value
  edges.value = edges.value.filter((e) => e.id !== id)
  selectedEdgeId.value = null
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

function onEditorKeydown(e: KeyboardEvent) {
  if (e.key !== 'Delete' && e.key !== 'Backspace') return
  if (nameEditing.value || isTypingTarget(e.target)) return
  if (selectedId.value) {
    e.preventDefault()
    removeSelectedNode()
    return
  }
  if (selectedEdgeId.value) {
    e.preventDefault()
    removeSelectedEdge()
  }
}

function onArgsChange(raw: string) {
  try {
    updateSelectedData('arguments', JSON.parse(raw || '{}'))
  } catch {
    updateSelectedData('arguments', raw)
  }
}

function addNode(type: WorkflowNodeType) {
  const id = `${type}_${Date.now().toString(36)}`
  const position = { x: 180 + (nodes.value.length % 3) * 40, y: 100 + nodes.value.length * 48 }
  nodes.value = [
    ...nodes.value,
    {
      id,
      type: 'default',
      position,
      label: NODE_META[type].label,
      data: { nodeType: type },
      class: NODE_META[type].tone,
    },
  ]
  selectedId.value = id
}

function updateSelectedData(key: string, value: unknown) {
  const n = selected.value
  if (!n) return
  nodes.value = nodes.value.map((x) =>
    x.id === n.id
      ? {
          ...x,
          data: { ...x.data, [key]: value },
        }
      : x,
  )
}

function toggleKb(id: string) {
  const cur = ((selected.value?.data as { knowledgeBaseIds?: string[] })?.knowledgeBaseIds ||
    []) as string[]
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
  updateSelectedData('knowledgeBaseIds', next)
}

async function startRename() {
  if (loading.value || nameSaving.value) return
  nameEdit.value = item.value?.name || nameEdit.value
  nameEditing.value = true
  await nextTick()
  nameInputRef.value?.focus()
  nameInputRef.value?.select()
}

function cancelRename() {
  nameEdit.value = item.value?.name || ''
  nameEditing.value = false
}

async function commitRename() {
  const next = nameEdit.value.trim()
  if (!next) {
    error.value = '工作流名称不能为空'
    return
  }
  if (next === item.value?.name) {
    nameEditing.value = false
    return
  }
  nameSaving.value = true
  error.value = ''
  try {
    item.value = await updateWorkflow(workflowId.value, { name: next })
    nameEdit.value = item.value.name
    nameEditing.value = false
    toast.value = '名称已更新'
  } catch (e) {
    error.value = e instanceof Error ? e.message : '重命名失败'
  } finally {
    nameSaving.value = false
  }
}

async function onSave() {
  saving.value = true
  error.value = ''
  toast.value = ''
  try {
    if (nameEditing.value) {
      await commitRename()
    } else if (nameEdit.value.trim() && nameEdit.value !== item.value?.name) {
      item.value = await updateWorkflow(workflowId.value, { name: nameEdit.value.trim() })
    }
    item.value = await saveWorkflowGraph(workflowId.value, exportGraph())
    toast.value = '草稿已保存'
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function onPublish() {
  publishing.value = true
  error.value = ''
  try {
    await onSave()
    item.value = await publishWorkflow(workflowId.value, 'publish from editor')
    const graph = item.value.draftVersion?.graph
    if (graph) {
      nodes.value = toFlowNodes(graph)
      edges.value = toFlowEdges(graph)
    }
    toast.value = `已发布 v${item.value.publishedVersion?.version ?? ''}`
  } catch (e) {
    error.value = e instanceof Error ? e.message : '发布失败'
  } finally {
    publishing.value = false
  }
}

async function onTrial() {
  running.value = true
  error.value = ''
  runLog.value = []
  runOutput.value = ''
  try {
    await saveWorkflowGraph(workflowId.value, exportGraph())
    let input: unknown = trialInput.value
    const trimmed = trialInput.value.trim()
    if (trimmed.startsWith('{')) {
      try {
        input = JSON.parse(trimmed)
      } catch {
        input = trialInput.value
      }
    }
    await runWorkflowTrial(
      workflowId.value,
      { input, useDraft: true },
      {
        onStepStart: (p) => {
          runLog.value.push(`▶ ${p.nodeType || ''} (${p.nodeId || ''})`)
        },
        onStepEnd: (p) => {
          runLog.value.push(`✓ ${p.nodeType || ''} 完成`)
          if (p.detail) {
            try {
              runLog.value.push(`  ${JSON.stringify(p.detail).slice(0, 200)}`)
            } catch {
              /* ignore */
            }
          }
        },
        onDone: (p) => {
          const out = p.output as { text?: string } | string | undefined
          if (typeof out === 'string') runOutput.value = out
          else if (out && typeof out === 'object')
            runOutput.value = String(out.text || JSON.stringify(out))
          else runOutput.value = JSON.stringify(p.output ?? '')
          runLog.value.push('■ 运行完成')
        },
        onError: (msg) => {
          error.value = msg
          runLog.value.push(`✗ ${msg}`)
        },
      },
    )
  } catch (e) {
    error.value = e instanceof Error ? e.message : '试跑失败'
  } finally {
    running.value = false
  }
}

watch(
  () => workflowId.value,
  () => {
    if (auth.isAdmin && workflowId.value) void loadAll()
  },
)

onMounted(async () => {
  window.addEventListener('keydown', onEditorKeydown)
  if (auth.isAdmin) {
    await loadAll()
    await nextTick()
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onEditorKeydown)
})
</script>

<template>
  <div v-if="showGate" class="p-8 text-sm text-muted-foreground">
    <span v-if="auth.loading">加载中…</span>
    <span v-else>仅管理员可编辑工作流。</span>
  </div>

  <div v-else class="flex flex-col h-[calc(100vh-7rem)] min-h-[560px]">
    <div class="flex flex-wrap items-center gap-3 mb-3">
      <button
        type="button"
        class="h-9 px-2.5 inline-flex items-center gap-1 text-xs rounded-md border border-border hover:bg-accent shrink-0"
        @click="router.push('/workflows')"
      >
        <ArrowLeft class="size-3.5" />返回
      </button>

      <div class="min-w-0 flex-1 flex flex-col gap-0.5">
        <div class="text-[10px] uppercase tracking-wide text-muted-foreground">工作流名称</div>
        <div v-if="nameEditing" class="flex items-center gap-1.5 min-w-0">
          <input
            ref="nameInputRef"
            v-model="nameEdit"
            maxlength="128"
            placeholder="输入工作流名称"
            class="h-9 px-2.5 text-[15px] font-semibold rounded-md border border-molybdenum/50 bg-background text-foreground outline-none focus:ring-2 focus:ring-molybdenum/30 min-w-[220px] max-w-full w-[min(420px,100%)]"
            :disabled="nameSaving"
            @keydown.enter.prevent="commitRename()"
            @keydown.escape.prevent="cancelRename()"
          />
          <button
            type="button"
            title="确认"
            class="size-9 rounded-md border border-patina/40 text-patina hover:bg-patina/10 inline-flex items-center justify-center disabled:opacity-50"
            :disabled="nameSaving"
            @click="commitRename()"
          >
            <Loader2 v-if="nameSaving" class="size-3.5 animate-spin" />
            <Check v-else class="size-4" />
          </button>
          <button
            type="button"
            title="取消"
            class="size-9 rounded-md border border-border text-muted-foreground hover:bg-accent inline-flex items-center justify-center"
            :disabled="nameSaving"
            @click="cancelRename()"
          >
            <X class="size-4" />
          </button>
        </div>
        <button
          v-else
          type="button"
          class="group inline-flex items-center gap-2 max-w-full text-left rounded-md px-1 -mx-1 py-0.5 hover:bg-accent/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-molybdenum/40"
          title="点击修改名称"
          :disabled="loading"
          @click="startRename()"
        >
          <span class="text-[15px] font-semibold text-foreground truncate">
            {{ item?.name || nameEdit || '未命名工作流' }}
          </span>
          <span
            class="inline-flex items-center gap-1 shrink-0 text-[11px] text-molybdenum opacity-80 group-hover:opacity-100"
          >
            <Pencil class="size-3.5" />
            重命名
          </span>
        </button>
        <div class="text-[10px] text-muted-foreground">
          草稿 v{{ item?.draftVersion?.version ?? '—' }}
          · 已发布
          {{ item?.publishedVersion ? `v${item.publishedVersion.version}` : '无' }}
        </div>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <button
          type="button"
          class="h-9 px-3 inline-flex items-center gap-1.5 text-xs rounded-md border border-border hover:bg-accent disabled:opacity-50"
          :disabled="saving || loading"
          @click="onSave"
        >
          <Loader2 v-if="saving" class="size-3.5 animate-spin" />
          <Save v-else class="size-3.5" />
          保存草稿
        </button>
        <button
          type="button"
          class="h-9 px-3 inline-flex items-center gap-1.5 text-xs rounded-md border border-molybdenum/40 text-molybdenum hover:bg-molybdenum/10 disabled:opacity-50"
          :disabled="publishing || loading"
          @click="onPublish"
        >
          <Upload class="size-3.5" />发布
        </button>
      </div>
    </div>

    <p v-if="error" class="mb-2 text-xs text-iron">{{ error }}</p>
    <p v-if="toast" class="mb-2 text-xs text-patina">{{ toast }}</p>

    <div v-if="loading" class="text-xs text-muted-foreground inline-flex items-center gap-1.5">
      <Loader2 class="size-3.5 animate-spin" />加载画布…
    </div>

    <div v-else class="flex-1 grid grid-cols-12 gap-3 min-h-0">
      <!-- palette -->
      <aside class="col-span-2 rounded-md border border-border bg-card/40 p-2 space-y-1.5 overflow-auto">
        <div class="text-[10px] text-muted-foreground px-1 mb-1">添加节点</div>
        <button
          v-for="t in PALETTE"
          :key="t"
          type="button"
          class="w-full text-left text-xs px-2 py-1.5 rounded-md border border-border hover:border-iron/40"
          @click="addNode(t)"
        >
          <Plus class="size-3 inline mr-1" />{{ NODE_META[t].label }}
        </button>
        <p class="text-[10px] text-muted-foreground px-1 pt-2 leading-relaxed">
          从开始连到结束。选中中间节点后可删除（或按 Delete）；连线同理。开始/结束不可删。
        </p>
      </aside>

      <!-- canvas -->
      <div class="col-span-6 rounded-md border border-border overflow-hidden bg-background">
        <VueFlow
          v-model:nodes="nodes"
          v-model:edges="edges"
          fit-view-on-init
          :default-viewport="{ zoom: 1 }"
          :delete-key-code="null"
          @node-click="onNodeClick"
          @edge-click="onEdgeClick"
          @pane-click="onPaneClick"
          @connect="onConnect"
        >
          <Background />
          <Controls />
        </VueFlow>
      </div>

      <!-- inspector + trial -->
      <aside class="col-span-4 flex flex-col gap-3 min-h-0 overflow-hidden">
        <div class="rounded-md border border-border p-3 overflow-auto max-h-[45%]">
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="text-xs font-medium">节点属性</div>
            <button
              v-if="selected && canDeleteSelected"
              type="button"
              class="h-7 px-2 inline-flex items-center gap-1 text-[11px] rounded-md border border-iron/40 text-iron hover:bg-iron/10"
              title="删除该节点（Delete）"
              @click="removeSelectedNode()"
            >
              <Trash2 class="size-3" />
              删除节点
            </button>
          </div>
          <div
            v-if="!selected && selectedEdgeId"
            class="space-y-2 text-xs"
          >
            <p class="text-[11px] text-muted-foreground">已选中一条连线。</p>
            <button
              type="button"
              class="h-7 px-2 inline-flex items-center gap-1 text-[11px] rounded-md border border-iron/40 text-iron hover:bg-iron/10"
              title="删除连线（Delete）"
              @click="removeSelectedEdge()"
            >
              <Trash2 class="size-3" />
              删除连线
            </button>
          </div>
          <div
            v-else-if="!selected"
            class="text-[11px] text-muted-foreground"
          >
            点击画布节点进行配置；选中后可删除（开始/结束除外）。
          </div>
          <div v-else class="space-y-2 text-xs">
            <div>
              类型：
              <span class="font-medium">
                {{ NODE_META[(selected.data as any).nodeType as WorkflowNodeType]?.label || (selected.data as any).nodeType }}
              </span>
            </div>
            <p
              v-if="!canDeleteSelected"
              class="text-[10px] text-muted-foreground"
            >
              开始 / 结束节点为流程锚点，不可删除。
            </p>

            <template v-if="(selected.data as any).nodeType === 'knowledge'">
              <label class="block text-[11px] text-muted-foreground">知识库</label>
              <div class="max-h-28 overflow-auto space-y-1 border border-border rounded-md p-1.5">
                <label
                  v-for="kb in kbs"
                  :key="kb.id"
                  class="flex items-center gap-1.5 text-[11px]"
                >
                  <input
                    type="checkbox"
                    :checked="((selected.data as any).knowledgeBaseIds || []).includes(kb.id)"
                    @change="toggleKb(kb.id)"
                  />
                  {{ kb.name }}
                </label>
              </div>
              <label class="block text-[11px] text-muted-foreground">Top K</label>
              <input
                type="number"
                class="w-full h-7 px-2 rounded-md border border-border bg-background"
                :value="(selected.data as any).topK || 5"
                min="1"
                max="20"
                @change="updateSelectedData('topK', Number(($event.target as HTMLInputElement).value) || 5)"
              />
            </template>

            <template v-else-if="(selected.data as any).nodeType === 'llm'">
              <label class="block text-[11px] text-muted-foreground">模式</label>
              <select
                class="w-full h-7 px-2 rounded-md border border-border bg-background"
                :value="(selected.data as any).mode || 'fast'"
                @change="updateSelectedData('mode', ($event.target as HTMLSelectElement).value)"
              >
                <option value="fast">fast</option>
                <option value="deep">deep</option>
              </select>
              <label class="block text-[11px] text-muted-foreground">提示词</label>
              <select
                class="w-full h-7 px-2 rounded-md border border-border bg-background"
                :value="(selected.data as any).promptId || ''"
                @change="updateSelectedData('promptId', ($event.target as HTMLSelectElement).value || null)"
              >
                <option value="">（无）</option>
                <option v-for="p in prompts" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
              <label class="block text-[11px] text-muted-foreground">附加系统提示</label>
              <textarea
                class="w-full min-h-[64px] px-2 py-1 rounded-md border border-border bg-background"
                :value="(selected.data as any).systemPrompt || ''"
                @change="updateSelectedData('systemPrompt', ($event.target as HTMLTextAreaElement).value)"
              />
            </template>

            <template v-else-if="(selected.data as any).nodeType === 'agent'">
              <label class="block text-[11px] text-muted-foreground">场景智能体</label>
              <select
                class="w-full h-7 px-2 rounded-md border border-border bg-background"
                :value="(selected.data as any).agentId || ''"
                @change="updateSelectedData('agentId', ($event.target as HTMLSelectElement).value)"
              >
                <option value="">请选择</option>
                <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
            </template>

            <template v-else-if="(selected.data as any).nodeType === 'mcp'">
              <label class="block text-[11px] text-muted-foreground">工具</label>
              <select
                class="w-full h-7 px-2 rounded-md border border-border bg-background"
                :value="(selected.data as any).toolId || ''"
                @change="updateSelectedData('toolId', ($event.target as HTMLSelectElement).value)"
              >
                <option value="">请选择</option>
                <option v-for="t in toolOptions" :key="t.id" :value="t.id">{{ t.label }}</option>
              </select>
              <label class="block text-[11px] text-muted-foreground">
                参数 JSON（可用 {'{{'}input{'}}'} / {'{{'}query{'}}'}）
              </label>
              <textarea
                class="w-full min-h-[72px] px-2 py-1 rounded-md border border-border bg-background font-mono text-[10px]"
                :value="
                  typeof (selected.data as any).arguments === 'string'
                    ? (selected.data as any).arguments
                    : JSON.stringify((selected.data as any).arguments || {}, null, 2)
                "
                @change="onArgsChange(($event.target as HTMLTextAreaElement).value)"
              />
            </template>

            <template v-else>
              <p class="text-[11px] text-muted-foreground">该节点无需额外配置。</p>
            </template>
          </div>
        </div>

        <div class="rounded-md border border-border p-3 flex-1 min-h-0 flex flex-col overflow-hidden">
          <div class="text-xs font-medium mb-2">试跑（草稿）</div>
          <textarea
            v-model="trialInput"
            class="w-full min-h-[56px] text-xs px-2 py-1 rounded-md border border-border bg-background mb-2"
          />
          <button
            type="button"
            class="h-8 px-3 inline-flex items-center justify-center gap-1.5 text-xs rounded-md bg-iron text-background hover:bg-iron/90 disabled:opacity-50 mb-2"
            :disabled="running"
            @click="onTrial"
          >
            <Loader2 v-if="running" class="size-3.5 animate-spin" />
            <Play v-else class="size-3.5" />
            试跑
          </button>
          <div class="text-[10px] text-muted-foreground mb-1">步骤</div>
          <pre class="flex-1 overflow-auto text-[10px] bg-background/60 rounded border border-border p-2 whitespace-pre-wrap">{{ runLog.join('\n') || '—' }}</pre>
          <div class="text-[10px] text-muted-foreground mt-2 mb-1">输出</div>
          <pre class="max-h-28 overflow-auto text-[10px] bg-background/60 rounded border border-border p-2 whitespace-pre-wrap">{{ runOutput || '—' }}</pre>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
:deep(.vue-flow) {
  width: 100%;
  height: 100%;
}
:deep(.vue-flow__node) {
  font-size: 12px;
  border-radius: 6px;
  border-width: 1px;
  padding: 6px 10px;
  min-width: 96px;
  text-align: center;
}
</style>
