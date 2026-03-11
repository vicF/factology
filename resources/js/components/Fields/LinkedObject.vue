<!-- Edit link between two objects -->
<template>
    <div class="linked-object">
        <div class="form-group flex-group">
            <ObjectField
                fieldName="one_thing"
                v-model="link.one_thing_id"
                :isEditable="true"
                name="First object"
                :type="THING_TYPE"
                required
            />
        </div>

        <div class="form-group flex-group">
            <ObjectField
                fieldName="link_type"
                v-model="link.link_type_id"
                :isEditable="true"
                name="Link type"
                :type="LINK_TYPE"
                required
                class="flex-field"
            />
            <button
                class="btn btn-primary flex-button"
                @click="swapObjects"
                :disabled="!link.one_thing_id || !link.other_thing_id"
            >
                Swap
            </button>
        </div>

        <div class="form-group flex-group">
            <ObjectField
                fieldName="other_thing"
                v-model="link.other_thing_id"
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
                v-model="link.translation"
                class="form-control"
                placeholder="Enter description..."
                rows="2"
            ></textarea>
        </div>

        <!-- Автоматически сгенерированное описание -->
        <div class="form-group" v-if="link.one_thing_id && link.other_thing_id && link.link_type_id">
            <div class="generated-preview p-2 bg-light rounded border">
                <small class="text-muted d-block mb-1">
                    <i class="bi bi-magic me-1"></i>
                    Auto-generated preview:
                </small>
                <LinkDescription
                    :link="link"
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
import LinkDescription from './../LinkDescription.vue';
import { LINK_TYPE, THING_TYPE } from "../../constants.js";
import { eventBus } from "../../eventBus.js";

const props = defineProps({
    link: { type: Object, required: true },
    index: { type: Number, required: true },
});

const emit = defineEmits(['update', 'remove']);

const store = useObjectCacheStore();

// Используем сам переданный link напрямую
const link = computed({
    get: () => props.link,
    set: (newValue) => {
        // Можно добавить логику если нужно
        console.log('Link updated:', newValue);
    }
});

// Объект для предпросмотра (текущий объект - первый)
const currentObjectForPreview = computed(() => ({
    thing_id: link.value.one_thing_id,
    name: oneObjectName.value || 'Object'
}));

// Имена объектов для отображения
const oneObjectName = ref('');
const otherObjectName = ref('');
const typeName = ref('');

// Загрузка имен объектов из кэша
const loadObjectNames = async () => {
    if (link.value.one_thing_id) {
        try {
            const obj = await store.getObject(link.value.one_thing_id);
            if (obj?.name) oneObjectName.value = obj.name;
        } catch (e) {}
    }
    if (link.value.other_thing_id) {
        try {
            const obj = await store.getObject(link.value.other_thing_id);
            if (obj?.name) otherObjectName.value = obj.name;
        } catch (e) {}
    }
    if (link.value.link_type_id) {
        try {
            const obj = await store.getObject(link.value.link_type_id);
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
            linkTypeUuid: link.value.link_type_id,
            comment: link.value.translation
        }
    };
    eventBus.emit('open-create-modal', payload);
};

// Переключение объектов
const swapObjects = () => {
    const temp = link.value.one_thing_id;
    link.value.one_thing_id = link.value.other_thing_id;
    link.value.other_thing_id = temp;

    // Явно вызываем обновление
    emit('update', {
        index: props.index,
        data: { ...link.value }
    });
};

// Удаление компонента
const removeSelf = () => {
    emit('remove', props.index);
};

// Обработчик создания объекта через модальное окно
const handleLinkCreated = (data) => {
    if (data.requestId && data.requestId.startsWith(`link-${props.index}`)) {
        if (!link.value.other_thing_id) {
            link.value.other_thing_id = data.newObjectId;
        }
        if (data.linkTypeUuid) link.value.link_type_id = data.linkTypeUuid;
        if (data.comment !== undefined) link.value.translation = data.comment;

        // Явно вызываем обновление
        emit('update', {
            index: props.index,
            data: { ...link.value }
        });
    }
};

// Следим за изменениями и эмитим update
watch(
    () => link.value,
    () => {
        emit('update', {
            index: props.index,
            data: { ...link.value }
        });
        loadObjectNames();
    },
    { deep: true, immediate: true }
);

// Инициализация
onMounted(() => {
    console.log('LinkedObject mounted with link:', link.value);
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
