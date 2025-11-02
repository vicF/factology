<template>
    <div class="linked-object">
        <div class="form-group">
            <label>UUID текущего объекта:</label>
            <input
                type="text"
                v-model="localCurrentObjectUuid"
                readonly
                class="form-control"
            />{{ currentObjectName }}
        </div>
        <div class="form-group">
            <label>UUID связанного объекта</label>
            <input
                type="text"
                v-model="localLinkedObjectUuid"
                class="form-control"
                placeholder="Введите UUID связанного объекта"
            />{{ linkedObjectName }}
        </div>
        <div class="form-group">
            <label>UUID типа связи</label>
            <input
                type="text"
                v-model="localLinkTypeUuid"
                class="form-control"
                placeholder="Введите UUID типа связи"
            />{{ linkTypeName }}
        </div>
        <div class="form-group">
            <label>Комментарий</label>
            <textarea
                v-model="localComment"
                class="form-control"
                placeholder="Введите комментарий"
            ></textarea>
        </div>
        <button class="btn btn-danger" @click="removeSelf">Удалить</button>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useObjectCacheStore } from '@/stores/objectCache.js';

// Props — camelCase
const props = defineProps({
    currentObjectUuid: { type: String, required: true },
    currentObjectName: { type: String, required: false },
    linkedObjectUuid: { type: String, default: '' },
    linkTypeUuid: { type: String, default: '' },
    comment: { type: String, default: '' },
    linkId: { type: [String, Number, null], default: null },
    index: { type: Number, required: true },
});

// Emits
const emit = defineEmits(['update', 'remove']);

// Local reactive state
const localCurrentObjectUuid = ref(props.currentObjectUuid);
const localLinkedObjectUuid = ref(props.linkedObjectUuid);
const localLinkTypeUuid = ref(props.linkTypeUuid);
const localComment = ref(props.comment);

// Pinia store
const store = useObjectCacheStore();

// Computed properties for object names
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

// Fetch names for UUIDs
async function fetchObjectName(uuid) {
    if (!uuid || uuid.trim() === '') return;
    try {
        await store.getObject(uuid);
        console.log(`Fetched name for ${uuid}`);
    } catch (error) {
        console.error(`Failed to fetch object for UUID ${uuid}:`, error);
    }
}

// === ЭМИТ UPDATE ПРИ ЛЮБОМ ИЗМЕНЕНИИ ===
const emitUpdate = () => {
    console.log('LinkedObject.vue - Emitting update:', {
        index: props.index,
        data: {
            currentObjectUuid: localCurrentObjectUuid.value,
            linkedObjectUuid: localLinkedObjectUuid.value,
            linkTypeUuid: localLinkTypeUuid.value,
            comment: localComment.value,
            linkId: props.linkId,
        },
    });

    emit('update', {
        index: props.index,
        data: {
            currentObjectUuid: localCurrentObjectUuid.value,
            linkedObjectUuid: localLinkedObjectUuid.value,
            linkTypeUuid: localLinkTypeUuid.value,
            comment: localComment.value,
            linkId: props.linkId,
        },
    });
};

// === WATCHERS ===
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
    () => localComment.value,
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

// === ON MOUNTED: Загружаем имена при открытии ===
onMounted(() => {
    fetchObjectName(localLinkedObjectUuid.value);
    fetchObjectName(localLinkTypeUuid.value);
    fetchObjectName(props.currentObjectUuid);
});

// Methods
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
</style>
