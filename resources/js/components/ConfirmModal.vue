<template>
    <div class="modal fade" tabindex="-1" data-bs-backdrop="static" ref="modalRef">
        <div class="modal-dialog modal-dialog-centered modal-sm">
            <div class="modal-content">
                <div class="modal-header" :class="headerClass">
                    <h5 class="modal-title">{{ title }}</h5>
                    <button type="button" class="btn-close btn-close-white" @click="cancel"></button>
                </div>
                <div class="modal-body">
                    <p class="mb-0">{{ message }}</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" @click="cancel">{{ cancelText }}</button>
                    <button type="button" :class="confirmButtonClass" @click="confirm">{{ confirmText }}</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue';

const props = defineProps({
    title: { type: String, default: 'Confirm' },
    message: { type: String, default: '' },
    confirmText: { type: String, default: 'Confirm' },
    cancelText: { type: String, default: 'Cancel' },
    variant: { type: String, default: 'primary' },
    show: { type: Boolean, default: false },
});

const emit = defineEmits(['confirm', 'cancel']);

const modalRef = ref(null);
let bsModal = null;

const headerClass = computed(() => {
    if (props.variant === 'danger') return 'bg-danger text-white';
    if (props.variant === 'success') return 'bg-success text-white';
    return 'bg-primary text-white';
});

const confirmButtonClass = computed(() => {
    if (props.variant === 'danger') return 'btn btn-danger';
    if (props.variant === 'success') return 'btn btn-success';
    return 'btn btn-primary';
});

watch(() => props.show, async (val) => {
    if (val) {
        await nextTick();
        const Modal = (await import('bootstrap/js/dist/modal')).default;
        bsModal = new Modal(modalRef.value);
        bsModal.show();
    }
});

function confirm() {
    if (bsModal) {
        bsModal.hide();
        bsModal = null;
    }
    emit('confirm');
}

function cancel() {
    if (bsModal) {
        bsModal.hide();
        bsModal = null;
    }
    emit('cancel');
}
</script>
