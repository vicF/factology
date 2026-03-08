<!-- Component to edit one link -->
<template>
    <div class="modal fade show" tabindex="-1" style="display: block;" @click.self="close">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">{{ $t('Edit Link') }}</h5>
                    <button type="button" class="btn-close" @click="close"></button>
                </div>
                <div class="modal-body">
                    <LinkedObject
                        v-if="linkData"
                        :currentObject="currentObject"
                        :link="props.link"
                        :currentObjectUuid="linkData.currentObjectUuid"
                        :linkedObjectUuid="linkData.linkedObjectUuid"
                        :linkTypeUuid="linkData.linkTypeUuid"
                        :translation="linkData.translation"
                        :linkId="linkData.linkId"
                        :index="0"
                        @update="handleLinkUpdate"
                        @remove="handleLinkRemove"
                    />
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" @click="close">
                        {{ $t('Cancel') }}
                    </button>
                    <button type="button" class="btn btn-primary" @click="save">
                        {{ $t('Save') }}
                    </button>
                </div>
            </div>
        </div>
    </div>
    <div class="modal-backdrop fade show"></div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import LinkedObject from './Fields/LinkedObject.vue';

const props = defineProps({
    link: {
        type: Object,
        required: true
    },
    currentObject: {
        type: Object,
        required: true
    }
});

const emit = defineEmits(['close', 'save']);

const linkData = ref(null);

onMounted(() => {
    // Преобразуем данные ссылки в формат, понятный LinkedObject
    linkData.value = {
        currentObjectUuid: props.link.one_thing_id,
        linkedObjectUuid: props.link.other_thing_id,
        linkTypeUuid: props.link.link_type_id,
        translation: props.link.translation || '',
        linkId: props.link.link_id
    };
});

const handleLinkUpdate = (updateData) => {
    // Сохраняем обновленные данные
    linkData.value = {
        ...linkData.value,
        ...updateData.data
    };
};

const handleLinkRemove = () => {
    if (confirm('Are you sure you want to delete this link?')) {
        emit('save', { delete: true, linkId: props.link.link_id });
    }
};

const save = () => {
    emit('save', {
        delete: false,
        data: {
            link_id: linkData.value.linkId,
            one_thing_id: linkData.value.currentObjectUuid,
            other_thing_id: linkData.value.linkedObjectUuid,
            link_type_id: linkData.value.linkTypeUuid,
            translation: linkData.value.translation,
            // Сохраняем оригинальные даты, если они есть
            start: props.link.start,
            end: props.link.end,
            link_start: props.link.link_start,
            link_end: props.link.link_end
        }
    });
};

const close = () => {
    emit('close');
};
</script>

<style scoped>
.modal {
    background-color: rgba(0, 0, 0, 0.5);
}
</style>
