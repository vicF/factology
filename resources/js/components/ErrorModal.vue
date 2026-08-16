<template>
    <div class="modal fade" tabindex="-1" data-bs-backdrop="static" ref="modalRef">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content border-danger">
                <div class="modal-header bg-danger text-white">
                    <h5 class="modal-title">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" class="me-2" viewBox="0 0 16 16">
                            <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
                        </svg>
                        {{ title }}
                    </h5>
                    <button type="button" class="btn-close btn-close-white" @click="close"></button>
                </div>
                <div class="modal-body">
                    <p class="mb-2">{{ message }}</p>
                    <div v-if="details" class="mt-2">
                        <button
                            class="btn btn-sm btn-outline-secondary"
                            @click="showDetails = !showDetails"
                        >
                            {{ showDetails ? $t('Hide technical details') : $t('Show technical details') }}
                        </button>
                        <pre v-if="showDetails" class="mt-2 p-2 bg-light border rounded" style="font-size: 12px; max-height: 300px; overflow: auto; white-space: pre-wrap; word-break: break-all;">{{ details }}</pre>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" @click="close">{{ $t('Close') }}</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, nextTick, watch } from 'vue';

const props = defineProps({
    title: { type: String, default: 'Error' },
    message: { type: String, default: '' },
    details: { type: String, default: '' },
    show: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);

const modalRef = ref(null);
const showDetails = ref(false);
let bsModal = null;

watch(() => props.show, async (val) => {
    if (val) {
        showDetails.value = false;
        await nextTick();
        const Modal = (await import('bootstrap/js/dist/modal')).default;
        bsModal = new Modal(modalRef.value);
        bsModal.show();
    }
});

function close() {
    if (bsModal) {
        bsModal.hide();
        bsModal = null;
    }
    emit('close');
}
</script>
