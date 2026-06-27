<script setup lang="ts">
import tocController from '../utils/tocController';
import CornerButton from './CornerButton.vue';

const bttAction = [
  { id: 'btt', icon: 'arrow-up', label: '回到顶部', onClick: () => tocController.backToTop() },
];
</script>

<template>
  <CornerButton :actions="bttAction" side="right" />
</template>
