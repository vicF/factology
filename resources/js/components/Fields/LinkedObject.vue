<!-- Edit link between two objects -->
<template>
    <div class="linked-object">
        <div class="form-group flex-group">
            <ObjectField
                fieldName="one_thing"
                v-model="oneUuid"
                :isEditable="true"
                name="First object"
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
            <button
                class="btn btn-primary flex-button"
                @click="swapObjects"
                :disabled="!oneUuid || !otherUuid"
            >
                Swap
            </button>
        </div>

        <div class="form-group flex-group">
            <ObjectField
                fieldName="other_thing"
                v-model="otherUuid"
                :isEditable="true"
                name="Second object"
                :type="THING_TYPE"
                required
                class="flex-field"
            />
            <button class="btn btn-primary flex-button" @click="openCreateObjectModal">
                Create
            </button>
        </div>

        <!-- Поле для ручного описания -->
        <div class="form-group">
            <textarea
                v-model="description"
                class="form-control"
                placeholder="Enter description..."
                rows="2"
            ></textarea>
        </div>

        <!-- Автоматически сгенерированное описание через компонент LinkDescription -->
        <div class="form-group" v-if="oneUuid && otherUuid && typeUuid">
            <div class="generated-preview p-2 bg-light rounded border">
                <small class="text-muted d-block mb-1">
                    <i class="bi bi-magic me-1"></i>
                    Auto-generated preview:
                </small>
                <LinkDescription
                    :link="linkForGeneration"
                    :object="currentObjectForPreview"
                    size="medium"
                />
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
import LinkDescription from './../LinkDescription.vue';  // Импортируем компонент
import { LINK_TYPE, THING_TYPE } from "../../constants.js";
import { eventBus } from "../../eventBus.js";

const props = defineProps({
    // Может быть полный объект ссылки
    link: { type: Object, default: null },
    // Или отдельные значения
    oneUuid: { type: String, default: '' },
    otherUuid: { type: String, default: '' },
    typeUuid: { type: String, default: '' },
    description: { type: String, default: '' },
    linkId: { type: [String, Number, null], default: null },
    index: { type: Number, required: true },
});

const emit = defineEmits(['update', 'remove']);

const store = useObjectCacheStore();

// Локальные состояния
const oneUuid = ref(props.oneUuid || props.link?.one_thing_id || '');
const otherUuid = ref(props.otherUuid || props.link?.other_thing_id || '');
const typeUuid = ref(props.typeUuid || props.link?.link_type_id || '');
const description = ref(props.description || props.link?.translation || '');

// Создаем объект link для компонента LinkDescription
const linkForGeneration = computed(() => ({
    one_thing_id: oneUuid.value,
    other_thing_id: otherUuid.value,
    link_type_id: typeUuid.value,
    name: otherObjectName.value || 'Object',
    link_name: typeName.value || 'Link'
}));

// Создаем объект currentObject для компонента LinkDescription
const currentObjectForPreview = computed(() => ({
    thing_id: oneUuid.value,
    name: oneObjectName.value || 'Current Object'
}));

// Имена объектов для отображения
const oneObjectName = ref('');
const otherObjectName = ref('');
const typeName = ref('');

// Загрузка имен объектов из кэша
const loadObjectNames = async () => {
    if (oneUuid.value) {
        try {
            const obj = await store.getObject(oneUuid.value);
            if (obj?.name) oneObjectName.value = obj.name;
        } catch (e) {}
    }
    if (otherUuid.value) {
        try {
            const obj = await store.getObject(otherUuid.value);
            if (obj?.name) otherObjectName.value = obj.name;
        } catch (e) {}
    }
    if (typeUuid.value) {
        try {
            const obj = await store.getObject(typeUuid.value);
            if (obj?.name) typeName.value = obj.name;
        } catch (e) {}
    }
};

// Открытие модального окна создания объекта
const openCreateObjectModal = () => {
    const requestId = `link-${props.index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const payload = {
        title: 'Create new object',
        params: { type: THING_TYPE },
        callback: {
            type: 'link-created',
            requestId: requestId,
            targetComponent: 'linked-object',
            index: props.index,
            linkTypeUuid: typeUuid.value,
            comment: description.value
        }
    };
    eventBus.emit('open-create-modal', payload);
};

// Переключение объектов
const swapObjects = () => {
    const temp = oneUuid.value;
    oneUuid.value = otherUuid.value;
    otherUuid.value = temp;
};

// Удаление компонента
const removeSelf = () => {
    emit('remove', props.index);
};

// Обработчик создания объекта через модальное окно
const handleLinkCreated = (data) => {
    if (data.requestId && data.requestId.startsWith(`link-${props.index}`)) {
        // Если otherUuid пустой, заполняем его
        if (!otherUuid.value) {
            otherUuid.value = data.newObjectId;
        }
        if (data.linkTypeUuid) typeUuid.value = data.linkTypeUuid;
        if (data.comment !== undefined) description.value = data.comment;
    }
};

// Следим за изменениями и эмитим update
watch(
    [oneUuid, otherUuid, typeUuid, description],
    () => {
        emit('update', {
            index: props.index,
            data: {
                one_thing_id: oneUuid.value,
                other_thing_id: otherUuid.value,
                link_type_id: typeUuid.value,
                translation: description.value,
                link_id: props.linkId,
            }
        });
        loadObjectNames();
    },
    { deep: true }
);

// Инициализация
onMounted(() => {
    console.log('LinkedObject mounted with:', {
        oneUuid: oneUuid.value,
        otherUuid: otherUuid.value,
        typeUuid: typeUuid.value,
        description: description.value
    });
    loadObjectNames();
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
    padding: 8px;
    border-radius: 4px;
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
