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

        <div class="form-group">
            <textarea
                :value="linkManager.translation.value"
                @input="e => linkManager.setTranslation(e.target.value)"
                class="form-control"
                placeholder="Translation (auto-generated or manual input)"
            ></textarea>
            <small
                v-if="linkManager.isManuallyEdited.value"
                class="text-muted d-block mt-1"
            >
                ✎ Manual mode - auto-update paused.
                <a href="#" @click.prevent="resetAutoTranslation">Reset to auto</a>
            </small>
        </div>

        <div class="d-flex gap-2">
            <button class="btn btn-danger" @click="removeSelf">Удалить</button>

            <span
                v-if="linkManager.isValid.value"
                class="badge bg-success ms-auto align-self-center"
            >
                ✓ Ready to link
            </span>
        </div>
    </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
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
    translation: { type: String, default: '' },
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
        translation: props.translation
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

// Сброс к автоматическому переводу
const resetAutoTranslation = () => {
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
            comment: linkManager.translation.value
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
        linkManager.translation.value
    ],
    () => {
        emit('update', {
            index: props.index,
            data: {
                currentObjectUuid: linkManager.currentUuid.value,
                linkedObjectUuid: linkManager.linkedUuid.value,
                linkTypeUuid: linkManager.typeUuid.value,
                translation: linkManager.translation.value,
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
    margin-bottom: 10px;
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

.badge {
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
}

.text-muted a {
    color: #6c757d;
    text-decoration: underline;
}

.text-muted a:hover {
    color: #495057;
}
</style>
