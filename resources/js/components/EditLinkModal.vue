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
                        :currentObjectUuid="currentObjectUuid"
                        :currentObjectName="currentObjectName"
                        :linkedObjectUuid="linkData.linkedObjectUuid"
                        :linkTypeUuid="linkData.linkTypeUuid"
                        :comment="linkData.comment"
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
    currentObjectUuid: {
        type: String,
        required: true
    },
    currentObjectName: {
        type: String,
        default: ''
    }
});

const emit = defineEmits(['close', 'save']);

const linkData = ref(null);

onMounted(() => {
    // Преобразуем данные ссылки в формат, понятный LinkedObject
    linkData.value = {
        linkedObjectUuid: props.link.thing_id,
        linkTypeUuid: props.link.link_type_id,
        comment: props.link.description || '',
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
            link_id: props.link.link_id,
            thing_id: linkData.value.linkedObjectUuid,
            link_type_id: linkData.value.linkTypeUuid,
            description: linkData.value.comment,
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
