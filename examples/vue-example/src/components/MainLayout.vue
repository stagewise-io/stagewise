<script setup lang="ts">
import { StagewiseToolbar, type ToolbarConfig } from '@stagewise/toolbar-vue';
import { VuePlugin } from '@stagewise-plugins/vue';
import LogoSection from './LogoSection.vue';
import HelloWorld from './HelloWorld.vue';

const toolbarConfig: ToolbarConfig = {
  plugins: [VuePlugin],
};
</script>

<template>
  <div class="main-layout">
    <StagewiseToolbar :config="toolbarConfig" />
    <main class="content">
      <LogoSection />
      <HelloWorld msg="Welcome to this Demo application!" />
    </main>
  </div>
</template>

<style scoped>
.main-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
}
</style> 