<script setup lang="ts">
import { cn } from '@/lib/utils'

withDefaults(
  defineProps<{
    title?: string
    subtitle?: string
    /** Extra classes on the root section (also accept native `class` via fallthrough if undeclared) */
    className?: string
    flush?: boolean
  }>(),
  {
    flush: false,
  },
)
</script>

<template>
  <section :class="cn('rounded-lg panel-surface overflow-hidden flex flex-col', className)">
    <header
      v-if="title || $slots.action || $slots.title"
      class="flex items-center justify-between px-4 lg:px-5 py-3 border-b border-border"
    >
      <div class="min-w-0">
        <h3
          v-if="title || $slots.title"
          class="text-sm font-medium tracking-wide truncate flex items-center gap-2"
        >
          <span class="inline-block w-1 h-3 bg-iron rounded-sm" />
          <slot name="title">{{ title }}</slot>
        </h3>
        <div
          v-if="subtitle || $slots.subtitle"
          class="text-[11px] text-muted-foreground mt-0.5 pl-3"
        >
          <slot name="subtitle">{{ subtitle }}</slot>
        </div>
      </div>
      <div v-if="$slots.action" class="ml-2 shrink-0">
        <slot name="action" />
      </div>
    </header>
    <div :class="cn('min-w-0', flush ? '' : 'p-4 lg:p-5')">
      <slot />
    </div>
  </section>
</template>
