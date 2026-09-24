<template>
    <div class="about-page container mt-3" data-testid="about-page">
        <SharedAbout
            :currentSection="currentSection"
            :identityLabel="identityLabel"
            :identityId="identityId"
            :internalInfo="internalInfo"
            :identityExtra="identityExtra"
        />
    </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';
import SharedAbout from '@factology/engine/components/About.vue';

defineOptions({ name: 'About' });

const { t } = useI18n();

const route = useRoute();
const authStore = useAuthStore();

const currentSection = computed(() => route.path);
const identityLabel = computed(() => authStore.authenticated);
const identityId = computed(() => authStore.user?.thing_id || '');

const identityExtra = computed(() => {
    if (!authStore.authenticated) return [];
    return [
        { label: t('Admin'), value: authStore.user?.is_admin ? t('Yes') : t('No') },
    ];
});

const internalInfo = ref('');

onMounted(async () => {
    let treeInfo = '';
    let checkedInfo = '';
    try {
        const { useTreeState } = await import('@/composables/useTreeState');
        const ts = useTreeState();
        treeInfo = 'treeState: ' + JSON.stringify(ts._debugState());
    } catch (_) { treeInfo = 'treeState: (error)'; }
    try {
        const { useSearchStore } = await import('@/stores/search');
        const ss = useSearchStore();
        checkedInfo = `checkedItems: ${ss.checkedItems.length} userInit: ${ss.checkedUserInitiated}`;
    } catch (_) { checkedInfo = 'searchStore: (error)'; }

    internalInfo.value = [treeInfo, checkedInfo].join('\n');
});
</script>

<style scoped>
</style>