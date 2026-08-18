import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import type { Component } from 'vue'
import { canAccessPath, flattenNavItems } from '@/config/nav'
import { useAuthStore } from '@/stores/auth'
import { useMobileMenuStore } from '@/stores/mobile-menu'
import { useTabsStore } from '@/stores/tabs'

const LoginView = () => import('@/views/LoginView.vue')
const AppShell = () => import('@/layouts/AppShell.vue')

const MIGRATED_VIEWS: Record<string, () => Promise<{ default: Component }>> = {
  '/': () => import('@/views/OverviewView.vue'),
  '/ai-chat': () => import('@/views/AiChatView.vue'),
  '/scene-agents': () => import('@/views/SceneAgentsView.vue'),
  '/workflows': () => import('@/views/WorkflowsView.vue'),
  '/model-manage': () => import('@/views/ModelManageView.vue'),
  '/prompt-manage': () => import('@/views/PromptManageView.vue'),
  '/mcp-manage': () => import('@/views/McpManageView.vue'),
  '/knowledge': () => import('@/views/KnowledgeListView.vue'),
  '/users': () => import('@/views/UsersView.vue'),
  '/logs': () => import('@/views/AuditLogsView.vue'),
  '/settings': () => import('@/views/SettingsView.vue'),
}

function buildFeatureRoutes(): RouteRecordRaw[] {
  const items = flattenNavItems()
  const seen = new Set<string>()
  const routes: RouteRecordRaw[] = []

  for (const item of items) {
    if (seen.has(item.href)) continue
    seen.add(item.href)
    const path = item.href === '/' ? '' : item.href.replace(/^\//, '')
    const component = MIGRATED_VIEWS[item.href]
    routes.push({
      path,
      name: item.href === '/' ? 'overview' : item.href.slice(1).replace(/\//g, '-'),
      component,
      meta: { title: item.label, adminOnly: Boolean(item.adminOnly) },
    })
  }

  routes.push(
    {
      path: 'knowledge/:baseId',
      name: 'knowledge-detail',
      component: () => import('@/views/KnowledgeDetailView.vue'),
      meta: { title: '知识库详情' },
    },
    {
      path: 'workflows/:id',
      name: 'workflow-editor',
      component: () => import('@/views/WorkflowEditorView.vue'),
      meta: { title: '工作流编辑', adminOnly: true },
    },
  )

  return routes
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { public: true, title: '登录' },
    },
    {
      path: '/',
      component: AppShell,
      children: buildFeatureRoutes(),
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (auth.loading) {
    await auth.bootstrap()
  }

  const isPublic = Boolean(to.meta.public)
  if (!auth.user && !isPublic) {
    return {
      path: '/login',
      query: { next: to.fullPath },
    }
  }
  if (auth.user && isPublic) {
    return { path: '/' }
  }
  if (auth.user && !isPublic) {
    if (to.meta.adminOnly && !auth.isAdmin) {
      return { path: '/' }
    }
    const ok = canAccessPath(to.path, auth.isAdmin, auth.menus)
    if (!ok) {
      return { path: '/' }
    }
  }
  return true
})

router.afterEach((to) => {
  const title = (to.meta.title as string | undefined) || '微泰智能体'
  document.title = `${title} · 微泰智能体`

  useMobileMenuStore().close()

  if (to.path !== '/login') {
    const tabs = useTabsStore()
    const label = (to.meta.title as string | undefined) || undefined
    tabs.ensureTab(to.path, label)
  }
})

export default router
