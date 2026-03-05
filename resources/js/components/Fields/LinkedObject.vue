<!-- Edit link between two objects -->
<template>
    <div class="linked-object">
        <div class="form-group flex-group">
        <ObjectField
            fieldName="current_object"
            v-model="localCurrentObjectUuid"
            :isEditable="true"
            name="Current Object"
            :type="THING_TYPE"
            required
        />
        </div>
        <div class="form-group flex-group">
            <ObjectField
                fieldName="link_type"
                v-model="localLinkTypeUuid"
                :isEditable="true"
                name="Link type"
                :type="LINK_TYPE"
                required
                class="flex-field"
            />
            <button class="btn btn-primary flex-button" @click="switchObjects">Switch</button>
        </div>

        <div class="form-group flex-group">
            <ObjectField
                fieldName="linked_object"
                v-model="localLinkedObjectUuid"
                :isEditable="true"
                name="Linked object"
                :type="THING_TYPE"
                required
                class="flex-field"
            />
            <button class="btn btn-primary flex-button" @click="openCreateObjectModal">Create</button>
        </div>

        <div class="form-group">
            <!--            <label>Комментарий</label>-->
            <textarea
                v-model="translation"
                class="form-control"
                placeholder="Пояснение"
            ></textarea>
        </div>

        <button class="btn btn-danger" @click="removeSelf">Удалить</button>
    </div>
</template>

<script setup>
import {ref, computed, watch, onMounted, onUnmounted} from 'vue';
import {useObjectCacheStore} from '@/stores/objectCache.js';
import ObjectField from "./ObjectField.vue";
import {CLASS_TYPE, LINK_TYPE, THING_TYPE} from "../../constants.js";
import {eventBus} from "../../eventBus.js";

const props = defineProps({
    currentObjectUuid: {type: String, required: true},
    currentObjectName: {type: String, required: false},
    linkedObjectUuid: {type: String, default: ''},
    linkTypeUuid: {type: String, default: ''},
    translation: {type: String, default: ''},
    linkId: {type: [String, Number, null], default: null},
    index: {type: Number, required: true},
});

const emit = defineEmits(['update', 'remove']);

const localCurrentObjectUuid = ref(props.currentObjectUuid);
const localLinkedObjectUuid = ref(props.linkedObjectUuid);
const localLinkTypeUuid = ref(props.linkTypeUuid);
const translation = ref(props.translation);

const store = useObjectCacheStore();

const currentObjectName = computed(() => {
    const obj = store.cache.get(props.currentObjectUuid);
    return obj?.name || props.currentObjectName || 'Loading...';
});

const linkedObjectName = computed(() => {
    const obj = store.cache.get(localLinkedObjectUuid.value);
    return obj?.data?.name || props.linkedObjectName || 'Not set';
});

const linkTypeName = computed(() => {
    const obj = store.cache.get(localLinkTypeUuid.value);
    return obj?.data?.name || 'Not set';
});

async function fetchObjectName(uuid) {
    if (!uuid || uuid.trim() === '') return;
    try {
        await store.getObject(uuid);
        console.log(`Fetched name for ${uuid}`);
    } catch (error) {
        console.error(`Failed to fetch object for UUID ${uuid}:`, error);
    }
}

const openCreateObjectModal = () => {
    const requestId = `link-${props.index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const payload = {
        title: `Create new object linked to "${currentObjectName.value || 'current object'}"`,
        params: {
            type: 3, // THING_TYPE
        },
        callback: {
            type: 'link-created',
            requestId: requestId,
            targetComponent: 'linked-object',
            index: props.index,
            linkTypeUuid: localLinkTypeUuid.value,
            comment: translation.value
        }
    };
    eventBus.emit('open-create-modal', payload);
};

const emitUpdate = () => {
    console.log('LinkedObject.vue - Emitting update:', {
        index: props.index,
        data: {
            currentObjectUuid: localCurrentObjectUuid.value,
            linkedObjectUuid: localLinkedObjectUuid.value,
            linkTypeUuid: localLinkTypeUuid.value,
            translation: translation.value,
            linkId: props.linkId,
        },
    });

    emit('update', {
        index: props.index,
        data: {
            currentObjectUuid: localCurrentObjectUuid.value,
            linkedObjectUuid: localLinkedObjectUuid.value,
            linkTypeUuid: localLinkTypeUuid.value,
            translation: translation.value,
            linkId: props.linkId,
        },
    });
};

const switchObjects = () => {
    // Swap the values
    const temp = localCurrentObjectUuid.value;
    localCurrentObjectUuid.value = localLinkedObjectUuid.value;
    localLinkedObjectUuid.value = temp;

    // Immediately emit the update with swapped values
    //emitUpdate();

    console.log('Switched objects:', {
        newCurrent: localCurrentObjectUuid.value,
        newLinked: localLinkedObjectUuid.value
    });
};

watch(
    () => props.currentObjectUuid,
    (newVal) => {
        localCurrentObjectUuid.value = newVal;
        fetchObjectName(newVal);
    },
    {immediate: true}
);

watch(
    () => props.linkTypeUuid,
    (newVal) => {
        localLinkTypeUuid.value = newVal;
        fetchObjectName(newVal);
    },
    {immediate: true}
);

watch(
    () => props.linkedObjectUuid,
    (newVal) => {
        localLinkedObjectUuid.value = newVal;
        fetchObjectName(newVal);
    },
    {immediate: true}
);

watch(
    () => localLinkedObjectUuid.value,
    (newVal) => {
        fetchObjectName(newVal);
        emitUpdate();
    }
);

watch(
    () => localLinkTypeUuid.value,
    (newVal) => {
        fetchObjectName(newVal);
        emitUpdate();
    }
);

watch(
    () => translation.value,
    () => {
        emitUpdate();
    }
);

watch(
    () => props.linkId,
    () => {
        emitUpdate();
    }
);

onMounted(() => {
    fetchObjectName(localLinkedObjectUuid.value);
    fetchObjectName(localLinkTypeUuid.value);
    fetchObjectName(props.currentObjectUuid);
    eventBus.on('link-created', handleLinkCreated);
});

onUnmounted(() => {
    // Clean up listener
    eventBus.off('link-created', handleLinkCreated);
});

const handleLinkCreated = (data) => {
    // Check if this callback is for this specific component instance
    // You might want to store the requestId when opening the modal
    if (data.requestId && data.requestId.startsWith(`link-${props.index}`)) {
        console.log('Link created, updating linked object:', data);

        // Update the linked object UUID with the newly created object
        localLinkedObjectUuid.value = data.newObjectId;

        // Optionally update link type and comment if they were provided
        if (data.linkTypeUuid) {
            localLinkTypeUuid.value = data.linkTypeUuid;
        }

        if (data.comment !== undefined) {
            translation.value = data.comment;
        }

        // The emitUpdate will be triggered by the watchers
    }
};

function removeSelf() {
    emit('remove', props.index);
}
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

/* Стили для групп с кнопкой справа */
.flex-group {
    display: flex;
    align-items: stretch; /* Растягиваем элементы по высоте */
    gap: 8px; /* Отступ между полем и кнопкой */
    margin-bottom: 10px;
}

.flex-field {
    flex: 1; /* Поле занимает всё доступное пространство */
    min-width: 0; /* Предотвращает переполнение */
}

.flex-button {
    flex-shrink: 0; /* Кнопка не сжимается */
    height: auto; /* Высота автоматически */
    padding: 0 15px; /* Горизонтальные отступы, вертикальные - 0 */
    white-space: nowrap; /* Текст кнопки не переносится */
    display: flex;
    align-items: center; /* Центрируем текст по вертикали */
    margin: 0; /* Убираем внешние отступы */
    border-radius: 4px;
    font-size: 14px;
    line-height: 1; /* Убираем лишнюю высоту строки */
}

/* Альтернативный вариант - если нужна точная высота как у поля ввода */
.flex-button-fixed {
    flex-shrink: 0;
    height: 38px; /* Стандартная высота Bootstrap input */
    padding: 0 15px;
    white-space: nowrap;
    display: flex;
    align-items: center;
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
</style>
