<script setup lang="ts">
defineProps<{
  url: string
  fileType?: string
  height?: number | string
  fallbackHint?: string
}>()
</script>

<template>
  <div
    class="flex items-center justify-center rounded-md border border-dashed border-hairline bg-bg-base/40 px-4 text-center text-[12px] text-muted-foreground"
    :style="{ height: typeof height === 'number' ? `${height}px` : height || '240px' }"
  >
    <div>
      <div>当前后端不提供三维图纸预览。</div>
      <div v-if="fallbackHint" class="mt-1">{{ fallbackHint }}</div>
      <div v-if="fileType" class="mt-1 font-mono text-[10px]">{{ fileType.toUpperCase() }}</div>
      <div v-if="url" class="mt-2 font-mono text-[10px] break-all">{{ url }}</div>
    </div>
  </div>
</template>
