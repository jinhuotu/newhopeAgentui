<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Bot, ChevronRight, X } from 'lucide-vue-next'
import { NAV_GROUPS, filterNavGroups, type NavGroup, type NavItem } from '@/config/nav'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { useMobileMenuStore } from '@/stores/mobile-menu'
import { useTabsStore } from '@/stores/tabs'

const STORAGE_KEY = 'newhope:sidebar:expanded'

const route = useRoute()
const auth = useAuthStore()
const tabs = useTabsStore()
const mobileMenu = useMobileMenuStore()

const navGroups = computed(() =>
  filterNavGroups(NAV_GROUPS, auth.isAdmin, auth.menus),
)

const expanded = ref<Record<string, boolean>>({})
const inited = ref(false)
const navRef = ref<HTMLElement | null>(null)
const savedScroll = ref(0)

function loadExpanded(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, boolean>
  } catch {
    return {}
  }
}

function allItems(g: NavGroup): NavItem[] {
  return g.items ? [...g.items] : (g.children || []).flatMap((c) => c.items)
}

function isItemActive(item: NavItem, pathname: string) {
  return item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
}

function isGroupActive(g: NavGroup) {
  return allItems(g).some((it) => isItemActive(it, route.path))
}

function defaultExpandedMap(): Record<string, boolean> {
  const map: Record<string, boolean> = {}
  navGroups.value.forEach((g) => {
    if (isGroupActive(g)) map[g.title] = true
  })
  return map
}

function toggle(title: string) {
  expanded.value = { ...expanded.value, [title]: !expanded.value[title] }
}

function onOpen(href: string, label: string) {
  tabs.openTab(href, label)
}

function onMobileOpen(href: string, label: string) {
  tabs.openTab(href, label)
  mobileMenu.close()
}

function handleScroll() {
  if (navRef.value) savedScroll.value = navRef.value.scrollTop
}

function childrenMaxHeight(g: NavGroup) {
  const flat = allItems(g)
  const hasChildren = !!g.children?.length
  return `${flat.length * 40 + (hasChildren ? g.children!.length * 24 : 0) + 40}px`
}

onMounted(() => {
  expanded.value = { ...defaultExpandedMap(), ...loadExpanded() }
  inited.value = true
})

watch(
  expanded,
  (val) => {
    if (!inited.value) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
    } catch {
      /* ignore */
    }
  },
  { deep: true },
)

watch(
  () => route.path,
  async () => {
    await nextTick()
    if (navRef.value) navRef.value.scrollTop = savedScroll.value
  },
)

// 移动端打开时展开当前组
const mobileExpanded = ref<Record<string, boolean>>({})
watch(
  () => [mobileMenu.open, route.path, navGroups.value] as const,
  ([open]) => {
    if (!open) return
    const map: Record<string, boolean> = {}
    navGroups.value.forEach((g) => {
      if (isGroupActive(g)) map[g.title] = true
    })
    mobileExpanded.value = map
  },
)

function toggleMobile(title: string) {
  mobileExpanded.value = {
    ...mobileExpanded.value,
    [title]: !mobileExpanded.value[title],
  }
}
</script>

<template>
  <!-- Desktop -->
  <aside
    class="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex"
  >
    <div class="flex h-14 items-center gap-2 border-b border-sidebar-border px-5">
      <div
        class="inline-flex size-8 items-center justify-center rounded-md bg-gradient-to-br from-iron to-coolant text-white"
      >
        <Bot class="size-4" />
      </div>
      <div class="leading-tight">
        <div class="text-[14px] font-semibold tracking-wide">新希望智能体</div>
        <div class="font-mono text-[10px] tracking-[0.18em] text-muted-foreground">
          AGENT · v0.1
        </div>
      </div>
    </div>

    <nav
      ref="navRef"
      class="sidebar-nav flex-1 space-y-1 overflow-y-auto px-3 py-4"
      @scroll="handleScroll"
    >
      <div v-for="group in navGroups" :key="group.title" class="nav-group">
        <button
          type="button"
          :class="
            cn(
              'group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors',
              isGroupActive(group)
                ? 'text-iron/90'
                : 'text-foreground/80 hover:bg-sidebar-accent hover:text-foreground',
            )
          "
          @click="toggle(group.title)"
        >
          <component
            :is="group.icon"
            :class="
              cn(
                'size-4 shrink-0 transition-colors',
                isGroupActive(group)
                  ? 'text-iron'
                  : 'text-muted-foreground group-hover:text-foreground',
              )
            "
          />
          <span class="flex-1 text-left font-medium tracking-wide">{{ group.title }}</span>
          <ChevronRight
            :class="
              cn(
                'size-3.5 text-muted-foreground transition-transform duration-200',
                expanded[group.title] && 'rotate-90',
              )
            "
          />
        </button>

        <div
          :class="
            cn(
              'nav-children overflow-hidden transition-[max-height,opacity] duration-200 ease-out',
              expanded[group.title] ? 'opacity-100' : 'max-h-0 opacity-0',
            )
          "
          :style="{
            maxHeight: expanded[group.title] ? childrenMaxHeight(group) : '0px',
          }"
        >
          <div
            v-if="group.items"
            class="mt-1 mb-1 ml-3 space-y-0.5 border-l border-sidebar-border/60 pb-1 pl-2"
          >
            <RouterLink
              v-for="item in group.items"
              :key="item.href"
              :to="item.href"
              :class="
                cn(
                  'group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors',
                  isItemActive(item, route.path)
                    ? 'border-l-2 border-iron bg-iron/10 pl-2 text-iron'
                    : 'text-foreground/70 hover:bg-sidebar-accent hover:text-foreground',
                )
              "
              @click="onOpen(item.href, item.label)"
            >
              <component
                :is="item.icon"
                :class="
                  cn(
                    'size-3.5 shrink-0',
                    isItemActive(item, route.path)
                      ? 'text-iron'
                      : 'text-muted-foreground group-hover:text-foreground',
                  )
                "
              />
              <span class="truncate">{{ item.label }}</span>
            </RouterLink>
          </div>

          <div
            v-else
            class="mt-1 mb-1 ml-3 space-y-1.5 border-l border-sidebar-border/60 pb-1 pl-2"
          >
            <div v-for="child in group.children" :key="child.key">
              <div
                class="px-2 py-1 text-[10px] tracking-[0.14em] text-muted-foreground/80 uppercase"
              >
                {{ child.label }}
              </div>
              <div class="space-y-0.5">
                <RouterLink
                  v-for="item in child.items"
                  :key="item.href"
                  :to="item.href"
                  :class="
                    cn(
                      'group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors',
                      isItemActive(item, route.path)
                        ? 'border-l-2 border-iron bg-iron/10 pl-2 text-iron'
                        : 'text-foreground/70 hover:bg-sidebar-accent hover:text-foreground',
                    )
                  "
                  @click="onOpen(item.href, item.label)"
                >
                  <component
                    :is="item.icon"
                    :class="
                      cn(
                        'size-3.5 shrink-0',
                        isItemActive(item, route.path)
                          ? 'text-iron'
                          : 'text-muted-foreground group-hover:text-foreground',
                      )
                    "
                  />
                  <span class="truncate">{{ item.label }}</span>
                </RouterLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>

    <div class="border-t border-sidebar-border p-3">
      <div class="panel-elevated rounded-md p-3">
        <div class="flex items-center gap-2 text-xs">
          <Bot class="size-3.5 text-iron" />
          <span class="text-muted-foreground">智能体交互系统</span>
        </div>
        <div class="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          对话 · 知识库 · MCP · 工作流
        </div>
      </div>
    </div>
  </aside>

  <!-- Mobile overlay -->
  <div
    :class="
      cn(
        'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 lg:hidden',
        mobileMenu.open
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none opacity-0',
      )
    "
    aria-hidden="true"
    @click="mobileMenu.close()"
  />

  <!-- Mobile drawer -->
  <aside
    :class="
      cn(
        'fixed top-0 left-0 z-50 flex h-full w-[280px] max-w-[82vw] flex-col border-r border-sidebar-border bg-sidebar shadow-2xl transition-transform duration-200 ease-out lg:hidden',
        mobileMenu.open ? 'translate-x-0' : '-translate-x-full',
      )
    "
  >
    <div class="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
      <div
        class="inline-flex size-8 items-center justify-center rounded-md bg-gradient-to-br from-iron to-coolant text-white"
      >
        <Bot class="size-4" />
      </div>
      <div class="flex-1 leading-tight">
        <div class="text-[14px] font-semibold tracking-wide">新希望智能体</div>
        <div class="font-mono text-[10px] tracking-[0.18em] text-muted-foreground">
          AGENT · v0.1
        </div>
      </div>
      <button
        type="button"
        class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
        aria-label="关闭菜单"
        @click="mobileMenu.close()"
      >
        <X class="size-4" />
      </button>
    </div>

    <nav class="sidebar-nav flex-1 space-y-1 overflow-y-auto px-3 py-4">
      <div v-for="group in navGroups" :key="`m-${group.title}`" class="nav-group">
        <button
          type="button"
          :class="
            cn(
              'group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors',
              isGroupActive(group)
                ? 'text-iron/90'
                : 'text-foreground/80 hover:bg-sidebar-accent hover:text-foreground',
            )
          "
          @click="toggleMobile(group.title)"
        >
          <component
            :is="group.icon"
            :class="
              cn(
                'size-4 shrink-0 transition-colors',
                isGroupActive(group)
                  ? 'text-iron'
                  : 'text-muted-foreground group-hover:text-foreground',
              )
            "
          />
          <span class="flex-1 text-left font-medium tracking-wide">{{ group.title }}</span>
          <ChevronRight
            :class="
              cn(
                'size-3.5 text-muted-foreground transition-transform duration-200',
                mobileExpanded[group.title] && 'rotate-90',
              )
            "
          />
        </button>

        <div
          :class="
            cn(
              'nav-children overflow-hidden transition-[max-height,opacity] duration-200 ease-out',
              mobileExpanded[group.title] ? 'opacity-100' : 'max-h-0 opacity-0',
            )
          "
          :style="{
            maxHeight: mobileExpanded[group.title] ? childrenMaxHeight(group) : '0px',
          }"
        >
          <div
            v-if="group.items"
            class="mt-1 mb-1 ml-3 space-y-0.5 border-l border-sidebar-border/60 pb-1 pl-2"
          >
            <RouterLink
              v-for="item in group.items"
              :key="item.href"
              :to="item.href"
              :class="
                cn(
                  'group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors',
                  isItemActive(item, route.path)
                    ? 'border-l-2 border-iron bg-iron/10 pl-2 text-iron'
                    : 'text-foreground/70 hover:bg-sidebar-accent hover:text-foreground',
                )
              "
              @click="onMobileOpen(item.href, item.label)"
            >
              <component
                :is="item.icon"
                :class="
                  cn(
                    'size-3.5 shrink-0',
                    isItemActive(item, route.path)
                      ? 'text-iron'
                      : 'text-muted-foreground group-hover:text-foreground',
                  )
                "
              />
              <span class="truncate">{{ item.label }}</span>
            </RouterLink>
          </div>

          <div
            v-else
            class="mt-1 mb-1 ml-3 space-y-1.5 border-l border-sidebar-border/60 pb-1 pl-2"
          >
            <div v-for="child in group.children" :key="child.key">
              <div
                class="px-2 py-1 text-[10px] tracking-[0.14em] text-muted-foreground/80 uppercase"
              >
                {{ child.label }}
              </div>
              <div class="space-y-0.5">
                <RouterLink
                  v-for="item in child.items"
                  :key="item.href"
                  :to="item.href"
                  :class="
                    cn(
                      'group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors',
                      isItemActive(item, route.path)
                        ? 'border-l-2 border-iron bg-iron/10 pl-2 text-iron'
                        : 'text-foreground/70 hover:bg-sidebar-accent hover:text-foreground',
                    )
                  "
                  @click="onMobileOpen(item.href, item.label)"
                >
                  <component
                    :is="item.icon"
                    :class="
                      cn(
                        'size-3.5 shrink-0',
                        isItemActive(item, route.path)
                          ? 'text-iron'
                          : 'text-muted-foreground group-hover:text-foreground',
                      )
                    "
                  />
                  <span class="truncate">{{ item.label }}</span>
                </RouterLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>

    <div class="border-t border-sidebar-border p-3">
      <div class="panel-elevated rounded-md p-3">
        <div class="flex items-center gap-2 text-xs">
          <Bot class="size-3.5 text-iron" />
          <span class="text-muted-foreground">智能体交互系统</span>
        </div>
        <div class="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          对话 · 知识库 · MCP · 工作流
        </div>
      </div>
    </div>
  </aside>
</template>
