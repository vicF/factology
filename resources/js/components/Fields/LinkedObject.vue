<template>
    <div class="linked-object">
        <div class="form-group">
            <label>UUID текущего объекта:</label>
            <input
                type="text"
                v-model="localCurrentObjectUUID"
                readonly
                class="form-control"
            />{{ currentObjectName }}
        </div>
        <div class="form-group">
            <label>UUID связанного объекта</label>
            <input
                type="text"
                v-model="localLinkedObjectUUID"
                class="form-control"
                placeholder="Введите UUID связанного объекта"
            />{{ linkedObjectName }}
        </div>
        <div class="form-group">
            <label>UUID типа связи</label>
            <input
                type="text"
                v-model="localLinkTypeUUID"
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
import { ref, computed, watch } from 'vue';


import { useObjectCacheStore } from '@/stores/objectCache.js'; //

// Props
const props = defineProps({
    currentObjectUUID: { type: String, required: true },
    currentObjectName: { type: String, required: false },
    linkedObjectUUID: { type: String, default: '' },
    linkTypeUUID: { type: String, default: '' },
    comment: { type: String, default: '' },
    index: { type: Number, required: true },
});

// Emits
const emit = defineEmits(['update', 'remove']);

// Local reactive state
const localCurrentObjectUUID = ref(props.currentObjectUUID);
const localLinkedObjectUUID = ref(props.linkedObjectUUID);
const localLinkTypeUUID = ref(props.linkTypeUUID);
const localComment = ref(props.comment);

// Pinia store
const store = useObjectCacheStore();

// Computed properties for object names
const currentObjectName = computed(() => {
    const obj = store.cache.get(props.currentObjectUUID);
    return obj?.name || props.currentObjectName || 'Loading...';
});

const linkedObjectName = computed(() => {
    const obj = store.cache.get(props.linkedObjectUUID);
    return obj?.data?.name || 'Not set';
});

const linkTypeName = computed(() => {
    const obj = store.cache.get(props.linkTypeUUID);
    return obj?.data?.name || 'Not set';
});

// Fetch names for UUIDs when they change
async function fetchObjectName(uuid) {
    if (uuid) {
        try {
            await store.getObject(uuid);
        } catch (error) {
            console.error(`Failed to fetch object for UUID ${uuid}:`, error);
        }
    }
}

// Watch for UUID changes and fetch names
watch(
    () => props.currentObjectUUID,
    (newVal) => {
        localCurrentObjectUUID.value = newVal;
        fetchObjectName(newVal);
    },
    { immediate: true }
);

watch(
    () => localLinkedObjectUUID.value,
    (newVal) => {
        fetchObjectName(newVal);
        emit('update', {
            index: props.index,
            data: {
                currentObjectUUID: localCurrentObjectUUID.value,
                linkedObjectUUID: newVal,
                linkTypeUUID: localLinkTypeUUID.value,
                comment: localComment.value,
            },
        });
    }
);

watch(
    () => localLinkTypeUUID.value,
    (newVal) => {
        fetchObjectName(newVal);
        emit('update', {
            index: props.index,
            data: {
                currentObjectUUID: localCurrentObjectUUID.value,
                linkedObjectUUID: localLinkedObjectUUID.value,
                linkTypeUUID: newVal,
                comment: localComment.value,
            },
        });
    }
);

watch(
    () => localComment.value,
    (newVal) => {
        emit('update', {
            index: props.index,
            data: {
                currentObjectUUID: localCurrentObjectUUID.value,
                linkedObjectUUID: localLinkedObjectUUID.value,
                linkTypeUUID: localLinkTypeUUID.value,
                comment: newVal,
            },
        });
    }
);

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
