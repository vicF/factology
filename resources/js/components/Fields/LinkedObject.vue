<!-- Edit link between two objects -->
<template>
    <div class="linked-object">
        <div class="form-group flex-group">
            <ObjectField
                fieldName="current_object"
                v-model="currentUuid"
                :isEditable="true"
                name="Current Object"
                :type="THING_TYPE"
                required
            />
        </div>

        <div class="form-group flex-group">
            <ObjectField
                fieldName="link_type"
                v-model="typeUuid"
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
                v-model="linkedUuid"
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
            </div>

            <textarea
                v-model="manualTranslation"
                class="form-control"
                placeholder="Enter manual description..."
                rows="2"
            ></textarea>
        </div>

        <!-- Автоматически сгенерированное описание используя link и currentObject -->
        <div class="form-group" v-if="generatedDescription">
            <div class="link-description mt-1 text-muted">
                <small>{{ generatedDescription }}</small>
            </div>
        </div>

        <div class="d-flex gap-2 mt-3">
            <button class="btn btn-danger" @click="removeSelf">Удалить</button>
        </div>
    </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import { useObjectCacheStore } from '@/stores/objectCache.js';
import ObjectField from "./ObjectField.vue";
import { LINK_TYPE, THING_TYPE } from "../../constants.js";
import { eventBus } from "../../eventBus.js";
import { generateLinkDescription } from '@/composables/useLinkTranslation.js';

const props = defineProps({
    // Текущий объект (из Object.vue)
    currentObject: { type: Object, required: true },

    // Данные ссылки которую редактируем
    link: { type: Object, required: true },

    // Отдельные поля для обратной совместимости
    currentObjectUuid: { type: String, required: true },
    linkedObjectUuid: { type: String, default: '' },
    linkTypeUuid: { type: String, default: '' },
    translation: { type: String, default: '' },
    linkId: { type: [String, Number, null], default: null },
    index: { type: Number, required: true },
});

const emit = defineEmits(['update', 'remove']);

const store = useObjectCacheStore();

// Локальные состояния
const currentUuid = ref(props.currentObjectUuid);
const linkedUuid = ref(props.linkedObjectUuid);
const typeUuid = ref(props.linkTypeUuid);
const manualTranslation = ref(props.translation);

// Используем переданный link для генерации описания
const linkForGeneration = computed(() => {
    // Берем переданный link как основу
    const baseLink = props.link || {};

    // Обновляем UUID из локальных состояний (на случай если они изменились)
    return {
        ...baseLink,
        thing_id: currentUuid.value,
        other_thing_id: linkedUuid.value,
        link_type_id: typeUuid.value,
        name: baseLink.name || linkedObjectName.value || 'Linked Object',
        link_name: baseLink.link_name || linkTypeName.value || 'Link'
    };
});

// Автоматически сгенерированное описание используя link и currentObject
const generatedDescription = computed(() => {
    if (!currentUuid.value || !linkedUuid.value) return '';
    return generateLinkDescription(linkForGeneration.value, props.currentObject);
});

// Имена объектов для отображения
const currentObjectName = ref(props.currentObject?.name || '');
const linkedObjectName = ref('');
const linkTypeName = ref('');

// Загрузка имен объектов из кэша
const loadObjectNames = async () => {
    if (currentUuid.value) {
        try {
            const obj = await store.getObject(currentUuid.value);
            if (obj?.name) currentObjectName.value = obj.name;
        } catch (e) {
            console.warn('Failed to load current object name:', e);
        }
    }

    if (linkedUuid.value) {
        try {
            const obj = await store.getObject(linkedUuid.value);
            if (obj?.name) linkedObjectName.value = obj.name;
        } catch (e) {
            console.warn('Failed to load linked object name:', e);
        }
    }

    if (typeUuid.value) {
        try {
            const obj = await store.getObject(typeUuid.value);
            if (obj?.name) linkTypeName.value = obj.name;
        } catch (e) {
            console.warn('Failed to load link type name:', e);
        }
    }
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
            linkTypeUuid: typeUuid.value,
            comment: manualTranslation.value
        }
    };
    eventBus.emit('open-create-modal', payload);
};

// Переключение объектов
const switchObjects = () => {
    const temp = currentUuid.value;
    currentUuid.value = linkedUuid.value;
    linkedUuid.value = temp;

    console.log('Switched objects:', {
        newCurrent: currentUuid.value,
        newLinked: linkedUuid.value
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
        linkedUuid.value = data.newObjectId;

        if (data.linkTypeUuid) {
            typeUuid.value = data.linkTypeUuid;
        }

        if (data.comment !== undefined) {
            manualTranslation.value = data.comment;
        }
    }
};

// Следим за изменениями и эмитим update
watch(
    [currentUuid, linkedUuid, typeUuid, manualTranslation],
    () => {
        emit('update', {
            index: props.index,
            data: {
                currentObjectUuid: currentUuid.value,
                linkedObjectUuid: linkedUuid.value,
                linkTypeUuid: typeUuid.value,
                translation: manualTranslation.value,
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
    console.log('LinkedObject mounted with link:', props.link);
    console.log('LinkedObject mounted with currentObject:', props.currentObject);
    await loadObjectNames();
    eventBus.on('link-created', handleLinkCreated);
});

onUnmounted(() => {
    console.log('LinkedObject unmounted');
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

.link-description {
    background-color: #f8f9fa;
    border: 1px solid #dee2e6;
    color: #495057;
    font-size: 0.9rem;
    line-height: 1.5;
    padding: 8px;
    border-radius: 4px;
    font-style: italic;
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

.bi {
    font-size: 0.9rem;
}
</style>
