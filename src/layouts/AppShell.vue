<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from '@/components/layout/Sidebar.vue'
import Topbar from '@/components/layout/Topbar.vue'
import TabBar from '@/components/layout/TabBar.vue'
import { useAuthStore } from '@/stores/auth'
import { cn } from '@/lib/utils'

const IMMERSIVE_PATHS = ['/ai-chat']

const route = useRoute()
const auth = useAuthStore()
const mainRef = ref<HTMLElement | null>(null)

const immersive = computed(() =>
  IMMERSIVE_PATHS.some((p) => route.path === p || route.path.startsWith(`${p}/`)),
)

/** 主内容区自带 overflow 滚动，路由切换时需手动回顶 */
watch(
  () => route.fullPath,
  async () => {
    await nextTick()
    mainRef.value?.scrollTo({ top: 0, left: 0 })
  },
)
</script>

<template>
  <div
    v-if="auth.loading || !auth.user"
    class="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground"
  >
    {{ auth.loading ? '正在校验登录状态…' : '正在跳转登录…' }}
  </div>

  <div
    v-else
    class="flex h-screen overflow-hidden bg-background text-foreground"
  >
    <Sidebar />
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <Topbar />
      <TabBar />
      <main
        ref="mainRef"
        :class="
          cn(
            'min-h-0 flex-1',
            immersive
              ? 'flex flex-col overflow-hidden'
              : 'overflow-y-auto overscroll-contain',
          )
        "
      >
        <div
          :class="
            cn(
              'mx-auto w-full max-w-[1600px]',
              immersive
                ? 'flex min-h-0 flex-1 flex-col p-3 sm:p-4 lg:p-5'
                : 'p-3 sm:p-4 lg:p-6',
            )
          "
        >
          <RouterView />
        </div>
      </main>
    </div>
  </div>
</template>
