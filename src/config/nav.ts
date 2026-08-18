import type { Component } from 'vue'
import {
  LayoutDashboard,
  Sparkles,
  Users,
  History,
  Settings,
  LibraryBig,
  BotMessageSquare,
  Workflow,
  Boxes,
  Plug,
  BookOpenText,
} from 'lucide-vue-next'

export type NavItem = {
  href: string
  label: string
  icon: Component
  adminOnly?: boolean
  requireMenu?: boolean
}

export type NavChild = {
  key: string
  label: string
  items: NavItem[]
}

export type NavGroup = {
  title: string
  icon: Component
  items?: NavItem[]
  children?: NavChild[]
}

function canSeeNavItem(
  it: NavItem,
  admin: boolean,
  menus: string[] | null | undefined,
): boolean {
  if (it.adminOnly && !admin) return false
  if (admin) return true
  if (!menus || menus.length === 0) return true
  return menus.includes(it.href)
}

export function filterNavGroups(
  groups: NavGroup[],
  admin: boolean,
  menus?: string[] | null,
): NavGroup[] {
  return groups
    .map((g) => ({
      ...g,
      items: g.items?.filter((it) => canSeeNavItem(it, admin, menus)),
      children: g.children?.map((c) => ({
        ...c,
        items: c.items.filter((it) => canSeeNavItem(it, admin, menus)),
      })),
    }))
    .filter(
      (g) =>
        (g.items && g.items.length > 0) ||
        (g.children && g.children.some((c) => c.items.length > 0)),
    )
}

export function isAdminOnlyPath(path: string): boolean {
  return flattenNavItems().some((it) => it.href === path && Boolean(it.adminOnly))
}

export function canAccessPath(
  path: string,
  admin: boolean,
  menus?: string[] | null,
): boolean {
  if (admin) return true
  const adminParent = flattenNavItems().find(
    (it) =>
      Boolean(it.adminOnly) &&
      (path === it.href || (it.href !== '/' && path.startsWith(`${it.href}/`))),
  )
  if (adminParent) return false

  const exact = flattenNavItems().find((it) => it.href === path)
  if (exact) return canSeeNavItem(exact, admin, menus)
  if (!menus || menus.length === 0) return true
  return menus.some((m) => m !== '/' && (path === m || path.startsWith(`${m}/`)))
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: '工作台',
    icon: LayoutDashboard,
    items: [{ href: '/', label: '总览', icon: LayoutDashboard }],
  },
  {
    title: 'AI 智控',
    icon: BotMessageSquare,
    items: [
      { href: '/ai-chat', label: 'AI 智能问答', icon: BotMessageSquare },
      { href: '/knowledge', label: '知识库', icon: LibraryBig },
      { href: '/scene-agents', label: '场景智能体', icon: Sparkles, adminOnly: true },
      { href: '/workflows', label: '工作流', icon: Workflow, adminOnly: true },
      { href: '/model-manage', label: '模型管理', icon: Boxes, adminOnly: true },
      { href: '/prompt-manage', label: '提示词管理', icon: BookOpenText, adminOnly: true },
      { href: '/mcp-manage', label: '工具管理', icon: Plug, adminOnly: true },
    ],
  },
  {
    title: '运营',
    icon: Settings,
    items: [
      { href: '/users', label: '用户与权限', icon: Users, adminOnly: true },
      { href: '/logs', label: '操作与登录日志', icon: History, adminOnly: true },
      { href: '/settings', label: '系统设置', icon: Settings },
    ],
  },
]

export function flattenNavItems(groups: NavGroup[] = NAV_GROUPS): NavItem[] {
  return groups.flatMap((g) =>
    g.items ? [...g.items] : (g.children || []).flatMap((c) => c.items),
  )
}
