<template>
    <div class="object-image-editor d-flex gap-3 align-items-start border rounded p-2 mb-3 bg-light">
        <!-- Current image preview -->
        <div class="flex-shrink-0 image-preview">
            <template v-if="!previewError">
                <img :src="previewSrc" alt="" @error="previewError = true" class="rounded preview-img" />
            </template>
            <div v-else class="placeholder rounded" v-html="identiconSvg"></div>
        </div>

        <div class="flex-grow-1">
            <div class="d-flex align-items-center gap-2 mb-1">
                <label class="form-label small mb-0 text-muted">{{ $t('Image') }}</label>
                <select v-model="size" class="form-select form-select-sm w-auto" :title="$t('Storage size')">
                    <option v-for="(profile, key) in IMAGE_VARIANTS" :key="key" :value="key">
                        {{ sizeLabel(key) }}
                    </option>
                </select>
            </div>

            <div v-if="errorMessage" class="text-danger small mb-1">{{ errorMessage }}</div>

            <div v-if="!showUrlRow" class="d-flex flex-wrap gap-2">
                <button type="button" class="btn btn-sm btn-outline-primary" @click="triggerFilePicker" :disabled="busy">
                    <i class="bi bi-upload me-1"></i>{{ $t('Upload') }}
                </button>
                <button type="button" class="btn btn-sm btn-outline-secondary" @click="showUrlRow = true">
                    {{ $t('From URL') }}
                </button>
                <button
                    v-if="hasImage && editable"
                    type="button"
                    class="btn btn-sm btn-outline-danger"
                    @click="removeImage"
                    :disabled="busy"
                >
                    {{ $t('Remove') }}
                </button>
                <input
                    ref="fileInput"
                    type="file"
                    accept="image/*"
                    class="d-none"
                    @change="onFilePicked"
                />
            </div>

            <div v-else class="d-flex gap-2">
                <input
                    v-model="urlDraft"
                    type="url"
                    class="form-control form-control-sm"
                    :placeholder="$t('https://example.com/image.jpg')"
                    @keyup.enter="importFromUrl"
                />
                <button type="button" class="btn btn-sm btn-primary" @click="importFromUrl" :disabled="busy">
                    {{ $t('Import') }}
                </button>
                <button type="button" class="btn btn-sm btn-outline-secondary" @click="showUrlRow = false">
                    {{ $t('Cancel') }}
                </button>
            </div>

            <div class="small text-muted mt-1">
                {{ $t('The image is optimized to save space; bigger sizes store higher quality.') }}
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import * as jdenticon from 'jdenticon'
import { IMAGE_VARIANTS } from '../utils/imageEditing'
import {
    thumbUrl,
    thumbRevision,
    getObjectThumbStatus,
    setObjectThumb,
    removeObjectThumb,
} from '../utils/objectImages'

const props = defineProps({
    thingId: { type: String, required: true },
    editable: { type: Boolean, default: true },
})

const emit = defineEmits(['updated'])

const { t } = useI18n()

const hasImage = ref(false)
const busy = ref(false)
const errorMessage = ref('')
const showUrlRow = ref(false)
const urlDraft = ref('')
const size = ref('small')
const fileInput = ref(null)
const previewError = ref(false)

const identiconSvg = jdenticon.toSvg(props.thingId, 100)

// Re-computes when an upload/remove bumps thumbRevision, so a replaced image
// for the same UUID is re-fetched (cache-busting query) immediately.
const previewSrc = computed(() => {
    const url = thumbUrl(props.thingId)
    if (!url) return ''
    const rev = thumbRevision.value
    return rev ? `${url}${url.includes('?') ? '&' : '?'}v=${rev}` : url
})

const sizeLabel = (key) => {
    const labels = { small: t('Small'), medium: t('Medium'), original: t('Original') }
    return labels[key] || key
}

async function refreshStatus() {
    try {
        const status = await getObjectThumbStatus(props.thingId)
        hasImage.value = !!status.custom
        previewError.value = false // (re)attempt <img> — class fallback icons should still show
    } catch (e) {
        hasImage.value = false
    }
}

const triggerFilePicker = () => fileInput.value?.click()

async function onFilePicked(event) {
    const file = event.target.files?.[0]
    event.target.value = '' // allow picking the same file again
    if (!file) return
    await saveImage({ file })
}

async function importFromUrl() {
    const url = urlDraft.value.trim()
    if (!url) return
    await saveImage({ url })
    urlDraft.value = ''
    showUrlRow.value = false
}

async function saveImage(source) {
    busy.value = true
    errorMessage.value = ''
    try {
        await setObjectThumb({ thingId: props.thingId, size: size.value, ...source })
        hasImage.value = true
        previewError.value = false
        emit('updated')
    } catch (e) {
        errorMessage.value = e?.response?.data?.message || e?.message || t('Could not save the image.')
    } finally {
        busy.value = false
    }
}

async function removeImage() {
    busy.value = true
    errorMessage.value = ''
    try {
        await removeObjectThumb(props.thingId)
        hasImage.value = false
        previewError.value = false // retry the <img>: a class fallback may still appear
        emit('updated')
    } catch (e) {
        errorMessage.value = e?.response?.data?.message || e?.message || t('Could not remove the image.')
    } finally {
        busy.value = false
    }
}

onMounted(() => {
    refreshStatus()
})
</script>

<style scoped>
.image-preview {
    width: 72px;
    height: 72px;
    overflow: hidden;
}
.preview-img {
    width: 72px;
    height: 72px;
    object-fit: cover;
    display: block;
}
.placeholder {
    width: 72px;
    height: 72px;
    background: #f8f9fa;
    display: flex;
    align-items: center;
    justify-content: center;
}
.placeholder :deep(svg) {
    width: 100%;
    height: 100%;
}
</style>
