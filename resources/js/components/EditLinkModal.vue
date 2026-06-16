<!-- Component to edit one link -->
<template>
    <Teleport to="body">
        <div class="modal fade show" tabindex="-1" style="display: block;" @click.self="close">
            <div class="modal-dialog modal-lg modal-fullscreen-sm-down">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">{{ $t('Edit Link') }}</h5>
                        <button type="button" class="btn-close" @click="close"></button>
                    </div>
                    <div class="modal-body">
                        <LinkedObject
                            :link="editingLink"
                            :currentObject="currentObject"
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
    </Teleport>
</template>

<script setup>
import { ref } from 'vue';
import LinkedObject from './Fields/LinkedObject.vue';

const props = defineProps({
    link: { type: Object, required: true },
    currentObject: { type: Object, required: true }
});

const emit = defineEmits(['close', 'save']);

// Создаем реактивную копию link для редактирования
const editingLink = ref({ ...props.link });

const handleLinkUpdate = (updateData) => {
    // Обновляем editingLink данными из LinkedObject
    editingLink.value = {
        ...editingLink.value,
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
        data: editingLink.value
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
