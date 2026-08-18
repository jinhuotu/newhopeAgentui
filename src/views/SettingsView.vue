<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  CircleCheck,
  Database,
  Moon,
  Server,
  Shield,
  Sun,
  UserRound,
} from 'lucide-vue-next'
import { Panel, PageHeader, Tag } from '@/components/ui-kit'
import { ApiError } from '@/lib/api'
import { fetchHealth } from '@/lib/health-api'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'

const auth = useAuthStore()
const theme = useThemeStore()

const healthOk = ref<boolean | null>(null)
const healthMsg = ref('')

const displayName = computed(
  () => auth.user?.display_name || auth.user?.username || '未登录',
)

const roleText = computed(() => {
  if (auth.user?.is_superuser) return '超级管理员'
  const roles = auth.user?.roles || []
  return roles.length ? roles.join(' / ') : '普通用户'
})

onMounted(async () => {
  try {
    const data = await fetchHealth()
    healthOk.value = data.status === 'up'
    healthMsg.value = data.service || 'weitai-api'
  } catch (err) {
    healthOk.value = false
    healthMsg.value = err instanceof ApiError ? err.message : '无法连接后端'
  }
})
</script>

<template>
  <PageHeader
    title="系统设置"
    description="主题、账号信息与后端连通性。平台暂无独立设置接口，此处仅展示当前运行状态。"
  >
    <template #badges>
      <Tag tone="molybdenum">weitaiAgent v0.1.0</Tag>
    </template>
  </PageHeader>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
    <Panel title="外观" subtitle="仅保存在本机浏览器">
      <div class="p-4 space-y-3">
        <p class="text-[12px] text-muted-foreground leading-relaxed">
          浅色 / 深色主题会写入 localStorage，刷新后保持。
        </p>
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] hover:bg-accent"
          @click="theme.toggle()"
        >
          <Sun v-if="theme.isDark" class="size-3.5" />
          <Moon v-else class="size-3.5" />
          切换为{{ theme.label }}主题
        </button>
      </div>
    </Panel>

    <Panel title="当前账号" subtitle="来自 /api/v1/auth/me">
      <ul class="divide-y divide-border">
        <li class="px-4 py-3 flex items-center gap-3">
          <UserRound class="size-4 text-muted-foreground" />
          <div>
            <div class="text-sm">{{ displayName }}</div>
            <div class="text-[11px] text-muted-foreground mt-0.5">{{ auth.user?.username }}</div>
          </div>
        </li>
        <li class="px-4 py-3 flex items-center gap-3">
          <Shield class="size-4 text-muted-foreground" />
          <div>
            <div class="text-sm">{{ roleText }}</div>
            <div class="text-[11px] text-muted-foreground mt-0.5">
              {{ auth.user?.email || '未填写邮箱' }}
            </div>
          </div>
        </li>
      </ul>
    </Panel>

    <Panel title="后端服务" subtitle="GET /api/v1/health">
      <div class="p-4 space-y-3">
        <div class="flex items-center gap-2 text-sm">
          <CircleCheck v-if="healthOk" class="size-4 text-patina" />
          <Server v-else class="size-4 text-sulfur" />
          <span>{{ healthOk === null ? '检测中…' : healthOk ? '服务在线' : '服务异常' }}</span>
        </div>
        <div class="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5">
          <Database class="size-3.5" />
          {{ healthMsg || '—' }}
        </div>
        <p class="text-[11px] text-muted-foreground leading-relaxed">
          开发环境默认通过 Vite 代理访问 <span class="font-mono">127.0.0.1:8100</span>。
          需要直连时设置 <span class="font-mono">VITE_API_BASE_URL</span>。
        </p>
      </div>
    </Panel>
  </div>
</template>
