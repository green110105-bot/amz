<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import DefaultLayout from './layouts/DefaultLayout.vue';

const route = useRoute();
const isPublic = computed(() => route.meta?.public);
</script>

<template>
  <router-view v-if="isPublic" />
  <DefaultLayout v-else />
</template>
