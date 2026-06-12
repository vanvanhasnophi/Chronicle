<template>
  <div class="fieldset">
    <legend v-if="title" class="fieldset-title">{{ title }}</legend>
    <SchemaField
      v-for="key in childKeys"
      :key="key"
      :field-key="key"
      :field-schema="childSchema[key]"
      :model-value="getNested(key)"
      @update:model-value="(v: any) => setNested(key, v)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SchemaField from '../SchemaField.vue'
import { resolveLocale } from '../../../utils/resolveLocale'

const props = defineProps<{
  modelValue: Record<string, any>
  schema: Record<string, any>
}>()

const title = computed(() => resolveLocale(props.schema.title, ''))

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any>]
}>()

const childSchema = computed(() => props.schema.properties || {})

const childKeys = computed(() => {
  return Object.keys(childSchema.value).sort((a, b) => {
    return (childSchema.value[a]['x-order'] || 99) - (childSchema.value[b]['x-order'] || 99)
  })
})

function getNested(key: string) {
  return props.modelValue?.[key] ?? childSchema.value[key]?.default
}

function setNested(key: string, val: any) {
  emit('update:modelValue', { ...props.modelValue, [key]: val })
}
</script>

<style scoped>
.fieldset {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-radius: 8px;
  background: var(--component-bg-secondary, rgba(128, 128, 128, 0.04));
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.15));
}

.fieldset-title {
  padding: 0;
  margin: 0 0 0.25rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--component-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
</style>
