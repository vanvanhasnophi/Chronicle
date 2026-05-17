<template>
	<label :class="['check-row', { 'check-row--disabled': disabled }]">
		<span class="check-row__copy">
			<strong>{{ title }}</strong>
			<small v-if="hint">{{ hint }}</small>
		</span>
		<slot name="suffix">
			<div v-if="disabled" class="check-row__disabled-note">{{ disabledText }}</div>
			<input
				v-else
				:checked="modelValue"
				type="checkbox"
				@change="onChange"
			/>
		</slot>
	</label>
</template>

<script setup lang="ts">
type Props = {
	title: string
	hint?: string
	modelValue?: boolean
	disabled?: boolean
	disabledText?: string
}

const props = withDefaults(defineProps<Props>(), {
	modelValue: false,
	disabled: false,
	disabledText: '',
})

const emit = defineEmits<{
	'update:modelValue': [value: boolean]
}>()

function onChange(event: Event) {
	const target = event.target as HTMLInputElement | null
	emit('update:modelValue', Boolean(target?.checked))
}
</script>

<style scoped>
.check-row {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	gap: 1rem;
	padding: 0.9rem 1rem;
	border-radius: 10px;
	background: var(--component-bg);
	border: 1px solid var(--border-color-blur);
}

.check-row input {
	width: 18px;
	height: 18px;
	accent-color: var(--accent);
	flex: 0 0 auto;
}

.check-row__copy {
	display: flex;
	flex-direction: column;
	gap: 0.2rem;
}

.check-row__copy strong {
	font-size: 0.98rem;
}

.check-row__copy small {
	color: var(--component-text-secondary);
	line-height: 1.4;
}

.check-row--disabled {
	opacity: 0.6;
	pointer-events: none;
}

.check-row__disabled-note {
	color: var(--component-text-secondary);
	font-size: 0.9rem;
}

@media (max-width: 400px) {
	.check-row {
		grid-template-columns: 1fr;
		align-items: start;
	}

	.check-row input {
		justify-self: start;
	}
}
</style>