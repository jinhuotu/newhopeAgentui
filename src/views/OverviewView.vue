<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  BotMessageSquare,
  Boxes,
  LibraryBig,
  Plug,
  Sparkles,
  Workflow,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-vue-next'
import { PageHeader, Panel, KpiCard, Tag } from '@/components/ui-kit'
import { ApiError } from '@/lib/api'
import { fetchModelRuntime, type ModelConfigItem } from '@/lib/models-api'
import { listChatSessions } from '@/lib/ai-chat-api'
import { listKnowledgeBases } from '@/lib/knowledge-api'
import { listAgentOptions } from '@/lib/agents-api'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const loading = ref(true)
const error = ref('')
const status = ref<Awaited<ReturnType<typeof fetchModelRuntime>> | null>(null)
const sessionCount = ref(0)
const kbCount = ref(0)
const agentCount = ref(0)

const shortcuts = [
  { href: '/ai-chat', label: '智能问答', desc: '多会话对话、知识库与工具调用', icon: BotMessageSquare },
  { href: '/knowledge', label: '知识库', desc: '文档入库、检索与预览', icon: LibraryBig },
  { href: '/scene-agents', label: '场景智能体', desc: '绑定提示词、知识库与 MCP 工具', icon: Sparkles, admin: true },
  { href: '/workflows', label: '工作流', desc: '编排知识检索 / LLM / 智能体', icon: Workflow, admin: true },
  { href: '/model-manage', label: '模型管理', desc: '配置快速 / 深度 / Embedding', icon: Boxes, admin: true },
  { href: '/mcp-manage', label: '工具管理', desc: '接入 MCP 服务并探测健康', icon: Plug, admin: true },
]

function modelName(item: ModelConfigItem | null | undefined) {
  if (!item) return '未绑定'
  return item.name || item.modelName || '已配置'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [st, sessions, bases, agents] = await Promise.all([
      fetchModelRuntime(),
      listChatSessions().catch(() => []),
      listKnowledgeBases().catch(() => []),
      listAgentOptions().catch(() => []),
    ])
    status.value = st
    sessionCount.value = sessions.length
    kbCount.value = bases.length
    agentCount.value = agents.length
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载总览失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <PageHeader title="工作台总览" description="查看模型运行状态，并进入智能体相关功能。">
    <template #badges>
      <Tag v-if="status?.llm_configured" tone="patina">LLM 已就绪</Tag>
      <Tag v-else tone="sulfur">LLM 未配置</Tag>
      <Tag v-if="status?.embedding_configured" tone="patina">Embedding 已就绪</Tag>
      <Tag v-else tone="sulfur">Embedding 未配置</Tag>
    </template>
  </PageHeader>

  <div v-if="loading" class="flex items-center gap-2 text-sm text-muted-foreground py-10">
    <Loader2 class="size-4 animate-spin" />
    正在加载运行状态…
  </div>

  <div
    v-else-if="error"
    class="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
  >
    {{ error }}
  </div>

  <template v-else>
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
      <KpiCard label="我的会话" :value="sessionCount" hint="当前账号" tone="iron" />
      <KpiCard label="知识库" :value="kbCount" hint="可检索库数量" tone="coolant" />
      <KpiCard label="可用智能体" :value="agentCount" hint="已启用" tone="molybdenum" />
      <KpiCard
        label="模型绑定"
        :value="status?.llm_configured ? '就绪' : '待配置'"
        :hint="status?.embedding_configured ? '含 Embedding' : '请先配置 Embedding'"
        :tone="status?.llm_configured ? 'patina' : 'sulfur'"
      />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
      <Panel title="模型运行时" subtitle="来自 /api/v1/ai/status">
        <ul class="divide-y divide-border">
          <li class="px-4 py-3 flex items-center justify-between">
            <div>
              <div class="text-sm">快速模式 LLM</div>
              <div class="text-[11px] text-muted-foreground mt-0.5 font-mono">
                {{ modelName(status?.llm_fast) }}
              </div>
            </div>
            <CheckCircle2 v-if="status?.llm_fast" class="size-4 text-patina" />
            <AlertTriangle v-else class="size-4 text-sulfur" />
          </li>
          <li class="px-4 py-3 flex items-center justify-between">
            <div>
              <div class="text-sm">深度模式 LLM</div>
              <div class="text-[11px] text-muted-foreground mt-0.5 font-mono">
                {{ modelName(status?.llm_deep) }}
              </div>
            </div>
            <CheckCircle2 v-if="status?.llm_deep" class="size-4 text-patina" />
            <AlertTriangle v-else class="size-4 text-sulfur" />
          </li>
          <li class="px-4 py-3 flex items-center justify-between">
            <div>
              <div class="text-sm">Embedding</div>
              <div class="text-[11px] text-muted-foreground mt-0.5 font-mono">
                {{ modelName(status?.embedding) }}
              </div>
            </div>
            <CheckCircle2 v-if="status?.embedding" class="size-4 text-patina" />
            <AlertTriangle v-else class="size-4 text-sulfur" />
          </li>
        </ul>
        <div v-if="!status?.llm_configured" class="px-4 py-3 text-[12px] text-muted-foreground">
          对话前请先到「模型管理」配置 LLM；知识检索还需要 Embedding。
          <button
            v-if="auth.isAdmin"
            type="button"
            class="ml-2 text-iron hover:underline"
            @click="router.push('/model-manage')"
          >
            去配置
          </button>
        </div>
      </Panel>

      <Panel title="快捷入口" subtitle="仅展示当前账号可访问的功能">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
          <button
            v-for="it in shortcuts.filter((s) => !s.admin || auth.isAdmin)"
            :key="it.href"
            type="button"
            class="rounded-lg border border-hairline bg-bg-elevated/40 p-3 text-left hover:border-iron/40 hover:bg-iron/5 transition-colors"
            @click="router.push(it.href)"
          >
            <component :is="it.icon" class="size-4 text-iron mb-2" />
            <div class="text-[13px] font-medium">{{ it.label }}</div>
            <div class="text-[11px] text-muted-foreground mt-1 leading-relaxed">{{ it.desc }}</div>
          </button>
        </div>
      </Panel>
    </div>
  </template>
</template>
