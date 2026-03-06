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
            <div class="d-flex align-items-center justify-content-between mb-1">
                <label class="form-label mb-0">
                    Description
                    <small class="text-muted ms-2">(manual, saved to server)</small>
                </label>

                <!-- Кнопка сброса к автоматическому появляется только в ручном режиме -->
                <button
                    v-if="linkManager.isManuallyEdited.value"
                    class="btn btn-sm btn-link text-decoration-none p-0"
                    @click="resetToGenerated"
                    title="Reset to auto-generated text"
                >
                    <i class="bi bi-arrow-repeat me-1"></i>
                    Reset to generated
                </button>
            </div>

            <textarea
                :value="linkManager.translation.value"
                @input="e => linkManager.setTranslation(e.target.value)"
                class="form-control"
                :placeholder="generatedPlaceholder"
                rows="2"
            ></textarea>

            <!-- Подсказка, что показывается в данный момент -->
            <small class="text-muted d-block mt-1">
                <i class="bi bi-info-circle me-1"></i>
                <span v-if="linkManager.isManuallyEdited.value">
                    Using manual description.
                    <a href="#" @click.prevent="resetToGenerated">Switch to auto-generated</a>
                </span>
                <span v-else>
                    Auto-generated from selected objects.
                    <a href="#" @click.prevent="startManualEdit">Edit manually</a>
                </span>
            </small>
        </div>

        <!-- Предпросмотр автоматической генерации (только если есть ручной режим) -->
        <div class="form-group" v-if="linkManager.isManuallyEdited.value && linkManager.generatedTranslation.value">
            <div class="generated-preview p-2 bg-light rounded border">
                <small class="text-muted d-block mb-1">
                    <i class="bi bi-magic me-1"></i>
                    Auto-generated preview:
                </small>
                {{ linkManager.generatedTranslation.value }}
            </div>
        </div>

        <div class="d-flex gap-2 mt-3">
            <button class="btn btn-danger" @click="removeSelf">Удалить</button>
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

// Плейсхолдер для textarea
const generatedPlaceholder = computed(() => {
    if (!linkManager.currentUuid.value || !linkManager.linkedUuid.value) {
        return 'Select both objects to see auto-generated description...';
    }
    return linkManager.generatedTranslation.value || 'Auto-generated description...';
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
    linkManager.resetToGenerated();
};

// Начать ручное редактирование
const startManualEdit = () => {
    // Копируем сгенерированный текст в ручное поле
    linkManager.startManualEdit();
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
    font-size: 0.9rem;
    line-height: 1.5;
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

.btn-link {
    color: #007bff;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
}

.btn-link:hover {
    text-decoration: underline !important;
    color: #0056b3;
}

.text-muted a {
    color: #6c757d;
    text-decoration: underline;
    cursor: pointer;
}

.text-muted a:hover {
    color: #495057;
}

.bi {
    font-size: 0.9rem;
}
</style>
