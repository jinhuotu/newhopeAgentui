<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bot, Loader2, Lock, UserRound } from 'lucide-vue-next'
import { ApiError } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const username = ref('admin')
const password = ref('Admin@123456')
const submitting = ref(false)
const error = ref('')

async function onSubmit() {
  error.value = ''
  submitting.value = true
  try {
    await auth.login(username.value.trim(), password.value)
    const next = typeof route.query.next === 'string' ? route.query.next : '/'
    await router.replace(next.startsWith('/') ? next : '/')
  } catch (err) {
    if (err instanceof ApiError) {
      error.value =
        err.message === 'invalid username or password'
          ? '用户名或密码错误'
          : err.message
    } else if (err instanceof TypeError) {
      error.value = '无法连接后端，请确认 newhopeAgent API 已启动（默认 :8200）'
    } else {
      error.value = '登录失败，请稍后重试'
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div
    v-if="auth.loading || auth.user"
    class="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground"
  >
    {{ auth.loading ? '正在校验登录状态…' : '正在进入系统…' }}
  </div>

  <div
    v-else
    class="relative min-h-screen overflow-hidden bg-background text-foreground"
  >
    <div
      class="pointer-events-none absolute inset-0"
      :style="{
        background:
          'radial-gradient(ellipse 80% 55% at 15% 10%, rgba(37,99,235,0.14), transparent 55%), radial-gradient(ellipse 70% 50% at 90% 80%, rgba(14,165,233,0.1), transparent 50%), linear-gradient(165deg, #f8fbff 0%, #eef4ff 48%, #f5f8fc 100%)',
      }"
    />
    <div
      class="pointer-events-none absolute inset-0 opacity-[0.35]"
      :style="{
        backgroundImage:
          'linear-gradient(rgba(37,99,235,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,0.08) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }"
    />

    <div
      class="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-10"
    >
      <div
        class="grid w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-card/95 shadow-[0_20px_60px_rgba(37,99,235,0.12)] backdrop-blur md:grid-cols-[1.1fr_0.9fr]"
      >
        <section
          class="relative hidden flex-col justify-between border-r border-border p-8 md:flex lg:p-10"
        >
          <div>
            <div
              class="mb-8 inline-flex size-12 items-center justify-center rounded-lg bg-gradient-to-br from-molybdenum to-coolant text-background"
            >
              <Bot class="size-6" />
            </div>
            <h1 class="text-3xl font-semibold tracking-wide">新希望智能体</h1>
            <p class="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              智能体交互系统 · 登录后进入问答、知识库、MCP 工具与工作流。
            </p>
          </div>
          <!-- <div class="space-y-2 text-xs text-muted-foreground">
            <div>后端：FastAPI · JWT Access / Refresh</div>
            <div>默认管理员：中机六院管理员</div>
          </div> -->
        </section>

        <section class="p-6 sm:p-8 lg:p-10">
          <div class="mb-6 md:hidden">
            <div
              class="mb-3 inline-flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-molybdenum to-coolant text-background"
            >
              <Bot class="size-5" />
            </div>
            <h1 class="text-xl font-semibold">新希望智能体</h1>
          </div>

          <h2 class="text-lg font-medium">账号登录</h2>
          <p class="mt-1 text-xs text-muted-foreground">使用管理员账号进入系统</p>

          <form class="mt-6 space-y-4" @submit.prevent="onSubmit">
            <label class="block space-y-1.5">
              <span class="text-xs text-muted-foreground">用户名</span>
              <div class="relative">
                <UserRound
                  class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  v-model="username"
                  autocomplete="username"
                  class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-iron/60 focus:ring-1 focus:ring-iron/30"
                  placeholder="admin"
                  required
                />
              </div>
            </label>

            <label class="block space-y-1.5">
              <span class="text-xs text-muted-foreground">密码</span>
              <div class="relative">
                <Lock
                  class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  v-model="password"
                  type="password"
                  autocomplete="current-password"
                  class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-iron/60 focus:ring-1 focus:ring-iron/30"
                  placeholder="••••••••"
                  required
                />
              </div>
            </label>

            <div
              v-if="error"
              class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {{ error }}
            </div>

            <button
              type="submit"
              :disabled="submitting || auth.loading"
              class="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-molybdenum to-coolant text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Loader2 v-if="submitting" class="size-4 animate-spin" />
              {{ submitting ? '登录中…' : '登录' }}
            </button>
          </form>

          <!-- <p class="mt-5 text-[11px] leading-relaxed text-muted-foreground">
            开发默认账号
            <span class="text-foreground/80">admin</span> /
            <span class="text-foreground/80"> Admin@123456</span>
            ，显示名：中机六院管理员
          </p> -->
        </section>
      </div>
    </div>
  </div>
</template>
