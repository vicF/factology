<!-- Edit link between two objects -->
<template>
    <div class="linked-object">
        <div class="form-group flex-group">
            <ObjectField
                fieldName="current_object"
                :modelValue="linkManager.currentUuid.value"
                @update:modelValue="linkManager.setCurrent"
                :isEditable="true"
                name="Current Object"
                :type="THING_TYPE"
                required
            />
        </div>

        <div class="form-group flex-group">
            <ObjectField
                fieldName="link_type"
                :modelValue="linkManager.typeUuid.value"
                @update:modelValue="linkManager.setType"
                :isEditable="true"
                name="Link type"
                :type="LINK_TYPE"
                required
                class="flex-field"
            />
            <button class="btn btn-primary flex-button" @click="switchObjects">
                Switch
            </button>
        </div>

        <div class="form-group flex-group">
            <ObjectField
                fieldName="linked_object"
                :modelValue="linkManager.linkedUuid.value"
                @update:modelValue="linkManager.setLinked"
                :isEditable="true"
                name="Linked object"
                :type="THING_TYPE"
                required
                class="flex-field"
            />
            <button class="btn btn-primary flex-button" @click="openCreateObjectModal">
                Create
            </button>
        </div>

        <!-- Поле для ручного ввода (сохраняется на сервер) -->
        <div class="form-group">
            <label class="form-label">
                Description (manual)
                <small class="text-muted ms-2">- saved to server</small>
            </label>
            <textarea
                :value="linkManager.translation.value"
                @input="e => linkManager.setTranslation(e.target.value)"
                class="form-control"
                placeholder="Enter manual description..."
                rows="2"
            ></textarea>
        </div>

        <!-- Автоматически генерируемое описание (только для просмотра) -->
        <div class="form-group" v-if="linkManager.generatedTranslation.value">
            <label class="form-label text-muted">
                Generated preview
                <small class="text-muted ms-2">- auto-generated, not saved</small>
            </label>
            <div class="generated-preview p-2 bg-light rounded border">
                {{ linkManager.generatedTranslation.value }}
            </div>
        </div>

        <!-- Индикатор режима -->
        <div class="d-flex align-items-center gap-2 mb-2">
            <span
                v-if="linkManager.isManuallyEdited.value"
                class="badge bg-warning text-dark"
            >
                ✎ Manual mode
            </span>
            <span
                v-else-if="linkManager.generatedTranslation.value"
                class="badge bg-info text-dark"
            >
                ↻ Auto-generated
            </span>

            <button
                v-if="linkManager.isManuallyEdited.value"
                class="btn btn-sm btn-outline-secondary ms-auto"
                @click="resetToGenerated"
            >
                Reset to generated
            </button>
        </div>

        <div class="d-flex gap-2 mt-3">
            <button class="btn btn-danger" @click="removeSelf">Удалить</button>

            <span
                v-if="linkManager.isValid.value"
                class="badge bg-success ms-auto align-self-center"
            >
                ✓ Ready to link
            </span>
        </div>

        <!-- Отладка (можно убрать) -->
        <div v-if="false" class="debug-info mt-3 small text-muted">
            <pre>{{ JSON.stringify(linkManager.debug, null, 2) }}</pre>
        </div>
    </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import { useObjectCacheStore } from '@/stores/objectCache.js';
import ObjectField from "./ObjectField.vue";
import { LINK_TYPE, THING_TYPE } from "../../constants.js";
import { eventBus } from "../../eventBus.js";
import { useLinkTranslation } from '@/composables/useLinkTranslation.js';

const props = defineProps({
    currentObjectUuid: { type: String, required: true },
    currentObjectName: { type: String, required: false },
    linkedObjectUuid: { type: String, default: '' },
    linkTypeUuid: { type: String, default: '' },
    translation: { type: String, default: '' }, // ручное описание с сервера
    linkId: { type: [String, Number, null], default: null },
    index: { type: Number, required: true },
});

const emit = defineEmits(['update', 'remove']);

const store = useObjectCacheStore();

// Используем композабл для управления переводом
const linkManager = useLinkTranslation({
    initialData: {
        currentObjectUuid: props.currentObjectUuid,
        linkedObjectUuid: props.linkedObjectUuid,
        linkTypeUuid: props.linkTypeUuid,
        translation: props.translation // ручное описание
    }
});

// Имена объектов для отображения
const currentObjectName = ref(props.currentObjectName || '');
const linkedObjectName = ref('');
const linkTypeName = ref('');

// Загрузка имен объектов из кэша
const loadObjectNames = async () => {
    if (linkManager.currentUuid.value) {
        try {
            const obj = await store.getObject(linkManager.currentUuid.value);
            if (obj?.name) currentObjectName.value = obj.name;
        } catch (e) {
            console.warn('Failed to load current object name:', e);
        }
    }

    if (linkManager.linkedUuid.value) {
        try {
            const obj = await store.getObject(linkManager.linkedUuid.value);
            if (obj?.name) linkedObjectName.value = obj.name;
        } catch (e) {
            console.warn('Failed to load linked object name:', e);
        }
    }

    if (linkManager.typeUuid.value) {
        try {
            const obj = await store.getObject(linkManager.typeUuid.value);
            if (obj?.name) linkTypeName.value = obj.name;
        } catch (e) {
            console.warn('Failed to load link type name:', e);
        }
    }
};

// Сброс к автоматически сгенерированному описанию
const resetToGenerated = () => {
    linkManager.resetManualMode();
};

// Открытие модального окна создания объекта
const openCreateObjectModal = () => {
    const requestId = `link-${props.index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const payload = {
        title: `Create new object linked to "${currentObjectName.value || 'current object'}"`,
        params: {
            type: THING_TYPE,
        },
        callback: {
            type: 'link-created',
            requestId: requestId,
            targetComponent: 'linked-object',
            index: props.index,
            linkTypeUuid: linkManager.typeUuid.value,
            comment: linkManager.translation.value // передаем ручное описание
        }
    };
    eventBus.emit('open-create-modal', payload);
};

// Переключение объектов
const switchObjects = () => {
    const temp = linkManager.currentUuid.value;
    linkManager.setCurrent(linkManager.linkedUuid.value);
    linkManager.setLinked(temp);

    console.log('Switched objects:', {
        newCurrent: linkManager.currentUuid.value,
        newLinked: linkManager.linkedUuid.value
    });
};

// Удаление компонента
const removeSelf = () => {
    emit('remove', props.index);
};

// Обработчик создания объекта через модальное окно
const handleLinkCreated = (data) => {
    if (data.requestId && data.requestId.startsWith(`link-${props.index}`)) {
        console.log('Link created, updating linked object:', data);

        linkManager.setLinked(data.newObjectId);

        if (data.linkTypeUuid) {
            linkManager.setType(data.linkTypeUuid);
        }

        if (data.comment !== undefined) {
            linkManager.setTranslation(data.comment);
        }
    }
};

// Следим за изменениями props
watch(() => props.currentObjectUuid, (newVal) => {
    if (newVal !== linkManager.currentUuid.value) {
        linkManager.setCurrent(newVal);
    }
});

watch(() => props.linkTypeUuid, (newVal) => {
    if (newVal !== linkManager.typeUuid.value) {
        linkManager.setType(newVal);
    }
});

watch(() => props.linkedObjectUuid, (newVal) => {
    if (newVal !== linkManager.linkedUuid.value) {
        linkManager.setLinked(newVal);
    }
});

watch(() => props.translation, (newVal) => {
    // Обновляем только если значение отличается и не в ручном режиме
    if (newVal !== linkManager.translation.value && !linkManager.isManuallyEdited.value) {
        linkManager.setTranslation(newVal);
    }
});

// Следим за изменениями в linkManager и эмитим update
watch(
    () => [
        linkManager.currentUuid.value,
        linkManager.linkedUuid.value,
        linkManager.typeUuid.value,
        linkManager.translation.value // только ручное описание
    ],
    () => {
        emit('update', {
            index: props.index,
            data: {
                currentObjectUuid: linkManager.currentUuid.value,
                linkedObjectUuid: linkManager.linkedUuid.value,
                linkTypeUuid: linkManager.typeUuid.value,
                translation: linkManager.translation.value, // только ручное описание
                linkId: props.linkId,
            }
        });

        // Загружаем имена при изменении UUID
        loadObjectNames();
    },
    { deep: true }
);

// Инициализация
onMounted(async () => {
    await loadObjectNames();
    eventBus.on('link-created', handleLinkCreated);
});

onUnmounted(() => {
    eventBus.off('link-created', handleLinkCreated);
});
</script>

<style scoped>
.linked-object {
    border: 1px solid #ddd;
    padding: 15px;
    margin-bottom: 15px;
    border-radius: 4px;
}

.form-group {
    margin-bottom: 15px;
}

.form-label {
    display: block;
    margin-bottom: 5px;
    font-weight: 500;
    font-size: 0.9rem;
}

.form-label small {
    font-weight: normal;
    font-size: 0.8rem;
}

.flex-group {
    display: flex;
    align-items: stretch;
    gap: 8px;
    margin-bottom: 10px;
}

.flex-field {
    flex: 1;
    min-width: 0;
}

.flex-button {
    flex-shrink: 0;
    height: auto;
    padding: 0 15px;
    white-space: nowrap;
    display: flex;
    align-items: center;
    margin: 0;
    border-radius: 4px;
    font-size: 14px;
    line-height: 1;
}

.form-control {
    width: 100%;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: inherit;
}

.form-control:focus {
    border-color: #007bff;
    outline: none;
    box-shadow: 0 0 0 2px rgba(0,123,255,0.25);
}

.generated-preview {
    background-color: #f8f9fa;
    border: 1px solid #dee2e6;
    color: #495057;
    font-size: 0.95rem;
    line-height: 1.5;
    min-height: 38px;
}

.btn-danger {
    background-color: #dc3545;
    color: white;
    border: none;
    padding: 8px 15px;
    border-radius: 4px;
    cursor: pointer;
}

.btn-danger:hover {
    background-color: #c82333;
}

.btn-primary {
    background-color: #007bff;
    color: white;
    border: none;
    padding: 8px 15px;
    border-radius: 4px;
    cursor: pointer;
}

.btn-primary:hover {
    background-color: #0069d9;
}

.btn-outline-secondary {
    background-color: transparent;
    border: 1px solid #6c757d;
    color: #6c757d;
    padding: 4px 8px;
    font-size: 0.8rem;
}

.btn-outline-secondary:hover {
    background-color: #6c757d;
    color: white;
}

.badge {
    padding: 0.4rem 0.6rem;
    font-size: 0.8rem;
    font-weight: 500;
}

.badge.bg-warning {
    background-color: #ffc107;
}

.badge.bg-info {
    background-color: #17a2b8;
}

.text-muted a {
    color: #6c757d;
    text-decoration: underline;
}

.text-muted a:hover {
    color: #495057;
}
</style>
