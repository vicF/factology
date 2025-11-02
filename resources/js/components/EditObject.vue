<template>
    <div class="modal fade" :id="modalId" tabindex="-1" :aria-labelledby="modalLabelId" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" :id="modalLabelId">{{ title || (isEditMode ? $t('Edit Object') : $t('Create Object')) }}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <form @submit.prevent="submitForm">
                        <div class="mb-3" v-if="formData.type === 2">
                            <TextField
                                fieldName="parent_id"
                                v-model="formData.parent_id"
                                :isEditable="true"
                                :label="$t('Parent')"
                                required
                            />
                        </div>
                        <div class="mb-3" v-if="formData.type === 3">
                            <ObjectField
                                fieldName="class_id"
                                v-model="formData.class_id"
                                :isEditable="true"
                                :label="$t('Class')"
                                :name="formData.class_name"
                                required
                            />
                        </div>
                        <div class="mb-3">
                            <TextField
                                fieldName="name"
                                v-model="formData.name"
                                :isEditable="true"
                                :label="$t('Name')"
                                required
                            />
                        </div>
                        <div class="mb-3">
                            <TextField
                                fieldName="description"
                                v-model="formData.description"
                                :isEditable="true"
                                :label="$t('Description')"
                            />
                        </div>
                        <div class="mb-3">
                            <DateField
                                fieldName="start"
                                v-model="formData.start"
                                :isEditable="true"
                                :label="$t('Start')"
                            />
                        </div>
                        <div class="mb-3">
                            <DateField
                                fieldName="end"
                                v-model="formData.end"
                                :isEditable="true"
                                :label="$t('End')"
                            />
                        </div>
                        <div class="mb-3">
                            <RadioGroupField
                                fieldName="visibility"
                                v-model="formData.public"
                                :options="{ 0: $t('Private'), 1: $t('Public') }"
                                :isEditable="true"
                                :label="$t('Access')"
                            />
                        </div>
                        <button type="button" class="btn btn-primary" @click="addNewLinkedObject">
                            {{ $t('Add Link') }}
                        </button>
                        <div v-for="(item, index) in linkedObjects" :key="index">
                            <LinkedObject
                                :current-object-u-u-i-d="formData.thing_id"
                                :current-object-name="formData.name"
                                :linked-object-u-u-i-d="item.linkedObjectUuid"
                                :link-type-u-u-i-d="item.linkTypeUuid"
                                :comment="item.comment"
                                :link-id="item.linkId"
                                :index="index"
                                @update="updateItem"
                                @remove="removeItem"
                            />
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">{{ $t('Close') }}</button>
                            <button type="submit" class="btn btn-primary">{{ isEditMode ? $t('Update') : $t('Save') }}</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import { Modal } from 'bootstrap';
import { v4 as uuidv4 } from 'uuid';
import { useI18n } from 'vue-i18n';
import TextField from './Fields/TextField.vue';
import ObjectField from './Fields/ObjectField.vue';
import DateField from './Fields/DateField.vue';
import RadioGroupField from './Fields/RadioGroupField.vue';
import LinkedObject from './Fields/LinkedObject.vue';

export default {
    name: 'EditObject',
    components: { LinkedObject, ObjectField, TextField, DateField, RadioGroupField },
    props: {
        object: { type: Object, default: null },
        params: { type: Object, default: () => ({}) },
        title: { type: String, default: '' },
        initialLinkedObjects: {
            type: Array,
            default: () => [],
        },
    },
    emits: ['close', 'object-created', 'object-updated'],
    setup(props, { emit }) {
        const { t } = useI18n();
        const route = useRoute();
        const isEditMode = computed(() => !!props.object);

        console.log('EditObject.vue - Props:', { object: props.object, params: props.params, title: props.title });

        const formData = ref({
            thing_id: isEditMode.value ? (props.object.thing_id || props.object.id || uuidv4()) : uuidv4(),
            name: isEditMode.value ? props.object.name || '' : '',
            description: isEditMode.value ? props.object.description || '' : '',
            start: isEditMode.value ? props.object.start || '' : '',
            end: isEditMode.value ? props.object.end || '' : '',
            public: isEditMode.value ? props.object.public || 0 : 0,
            parent_id: props.params.parentId || null,
            class_id: props.params.classId || null,
            class_name: props.params.className || null,
            type: props.params.type || 3,
            link_id: props.object?.class?.link_id || null,
        });

        const linkedObjects = ref([]);
        const initialLinkIds = new Set();
        const originalLinks = new Map();

        // === MODAL ===
        const modalId = `editObjectModal-${formData.value.thing_id}`;
        const modalLabelId = `editObjectModalLabel-${formData.value.thing_id}`;
        let modalInstance = null;

        onMounted(() => {
            console.log('EditObject.vue - Initial Linked Objects:', props.initialLinkedObjects);

            // 1. Сохраняем оригинальные значения и ID
            props.initialLinkedObjects.forEach(item => {
                if (item.link_id) {
                    initialLinkIds.add(item.link_id);
                    originalLinks.set(item.link_id, {
                        linkedObjectUuid: item.other_thing_id || '',
                        linkTypeUuid: item.link_type_id || '',
                        comment: item.description || '',
                    });
                }
            });

            // 2. Инициализируем редактируемые ссылки
            linkedObjects.value = props.initialLinkedObjects
                .filter((item) => item.link_type_id !== 'c217c185-742f-4a9f-8e69-acea2b4f5aea')
                .map((item) => ({
                    currentObjectUuid: formData.value.thing_id,
                    linkedObjectUuid: item.other_thing_id || '',
                    linkTypeUuid: item.link_type_id || '',
                    comment: item.description || '',
                    linkId: item.link_id || null,
                }));

            console.log('EditObject.vue - linkedObjects after init:', linkedObjects.value);

            const modalElement = document.getElementById(modalId);
            if (modalElement) {
                modalInstance = new Modal(modalElement);
                modalInstance.show();
                modalElement.addEventListener('hidden.bs.modal', () => {
                    console.log('EditObject.vue - Modal hidden → emit close');
                    emit('close');
                });
            } else {
                console.error('EditObject.vue - Modal element not found:', modalId);
            }
        });

        onUnmounted(() => {
            const modalElement = document.getElementById(modalId);
            if (modalElement) {
                modalElement.removeEventListener('hidden.bs.modal', () => {});
            }
        });

        // === LINKS ===
        const addNewLinkedObject = () => {
            const newLink = {
                currentObjectUuid: formData.value.thing_id,
                linkedObjectUuid: '',
                linkTypeUuid: '2da45f14-69c6-4d56-9f2f-809fda14abf5',
                comment: '',
                linkId: null,
            };
            linkedObjects.value.push(newLink);
            console.log('EditObject.vue - Added new link:', newLink);
        };

        const updateItem = ({ index, data }) => {
            console.log('EditObject.vue - Update link at index', index, data);
            linkedObjects.value[index] = {
                ...linkedObjects.value[index],
                ...data,
            };
            console.log('EditObject.vue - Updated linkedObjects[index]:', linkedObjects.value[index]);
        };

        const removeItem = (index) => {
            const removed = linkedObjects.value[index];
            if (removed.linkId) {
                initialLinkIds.delete(removed.linkId);
            }
            linkedObjects.value.splice(index, 1);
            console.log('EditObject.vue - Removed link:', removed);
        };

        // === SUBMIT ===
        const submitForm = async () => {
            try {
                await axios.get('/sanctum/csrf-cookie');

                const linksToAdd = [];
                const linksToUpdate = [];
                const linksToDelete = [];

                console.log('EditObject.vue - SUBMIT linkedObjects:', linkedObjects.value);

                // 1. Новые ссылки
                linkedObjects.value.forEach(item => {
                    if (item.linkId === null && item.linkedObjectUuid?.trim()) {
                        linksToAdd.push({
                            one_thing_id: formData.value.thing_id,
                            link_type_id: item.linkTypeUuid,
                            other_thing_id: item.linkedObjectUuid,
                            description: item.comment || '',
                            public: 0,
                            link_start: null,
                            link_end: null,
                            link_start_variety: null,
                            link_end_variety: null,
                        });
                    }
                });

                // 2. Изменённые ссылки
                linkedObjects.value.forEach(item => {
                    if (item.linkId !== null) {
                        const orig = originalLinks.get(item.linkId);
                        if (!orig) return;

                        const changed =
                            item.linkedObjectUuid !== orig.linkedObjectUuid ||
                            item.linkTypeUuid !== orig.linkTypeUuid ||
                            item.comment !== orig.comment;

                        if (changed) {
                            linksToUpdate.push({
                                link_id: item.linkId,
                                link_type_id: item.linkTypeUuid,
                                other_thing_id: item.linkedObjectUuid,
                                description: item.comment || '',
                            });
                            console.log('EditObject.vue - Link to UPDATE:', { link_id: item.linkId, changed });
                        }
                    }
                });

                // 3. Удалённые ссылки
                const currentLinkIds = new Set(linkedObjects.value.map(i => i.linkId).filter(Boolean));
                linksToDelete.push(...Array.from(initialLinkIds).filter(id => !currentLinkIds.has(id)));

                console.log('EditObject.vue - Links to ADD:', linksToAdd.length);
                console.log('EditObject.vue - Links to UPDATE:', linksToUpdate.length);
                console.log('EditObject.vue - Links to DELETE:', linksToDelete.length);

                const payload = {
                    thing_id: formData.value.thing_id,
                    name: formData.value.name,
                    description: formData.value.description,
                    start_date: formData.value.start || null,
                    end_date: formData.value.end || null,
                    public: formData.value.public,
                    parent_id: formData.value.parent_id,
                    type: formData.value.type,
                };

                const originalClassId = props.object?.class?.thing_id;
                const classChanged = formData.value.class_id !== originalClassId;

                if (classChanged && formData.value.class_id) {
                    payload.class = {
                        one_thing_id: formData.value.thing_id,
                        link_type_id: 'c217c185-742f-4a9f-8e69-acea2b4f5aea',
                        other_thing_id: formData.value.class_id,
                        description: '',
                        link_id: formData.value.link_id || undefined,
                        public: 1,
                        link_start: null,
                        link_end: null,
                        link_start_variety: null,
                        link_end_variety: null,
                    };
                }

                if (linksToAdd.length > 0) payload.links_to_add = linksToAdd;
                if (linksToUpdate.length > 0) payload.links_to_update = linksToUpdate;
                if (linksToDelete.length > 0) payload.links_to_delete = linksToDelete;

                console.log('EditObject.vue - FINAL PAYLOAD:', JSON.stringify(payload, null, 2));

                let response;
                if (isEditMode.value) {
                    response = await axios.put(`/api/v1/object/${formData.value.thing_id}`, payload);
                    console.log('EditObject.vue - Object updated:', response.data);
                    emit('object-updated', response.data);
                } else {
                    response = await axios.post(`/api/v1/object/${formData.value.thing_id}`, payload);
                    console.log('EditObject.vue - Object created:', response.data);
                    emit('object-created', response.data);
                }
            } catch (error) {
                console.error('EditObject.vue - Submit error:', error.response?.data || error);
                alert(t('Failed') + ': ' + (error.response?.data?.message || error.message));
            }
        };

        return {
            formData,
            linkedObjects,
            modalId,
            modalLabelId,
            submitForm,
            isEditMode,
            addNewLinkedObject,
            updateItem,
            removeItem,
            t,
        };
    }
};
</script>

<style scoped>
.modal-dialog {
    max-width: 800px;
}

.btn-primary {
    background-color: #007bff;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
    margin: 10px 0;
}

.btn-primary:hover {
    background-color: #0056b3;
}

.btn-secondary {
    background-color: #6c757d;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
}

.btn-secondary:hover {
    background-color: #5a6268;
}
</style>
