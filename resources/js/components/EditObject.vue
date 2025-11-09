<template>
    <div class="modal fade" :id="modalId" tabindex="-1" :aria-labelledby="modalLabelId" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" :id="modalLabelId">
                        {{ title || (isEditMode ? $t('Edit Object') : $t('Create Object')) }}
                    </h5>
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

                        <!-- КНОПКА "Добавить связь" -->
                        <button type="button" class="btn btn-primary mb-3" @click="addNewLinkedObject">
                            {{ $t('Add Link') }}
                        </button>

                        <!-- ССЫЛКИ — ВСЕГДА ОТОБРАЖАЮТСЯ -->
                        <div v-for="item in linkedObjects" :key="item.id">
                            <LinkedObject
                                :current-object-uuid="formData.thing_id"
                                :current-object-name="formData.name"
                                :linked-object-uuid="item.linkedObjectUuid"
                                :link-type-uuid="item.linkTypeUuid"
                                :comment="item.comment"
                                :link-id="item.linkId"
                                :index="linkedObjects.indexOf(item)"
                                @update="updateItem"
                                @remove="removeItem"
                            />
                        </div>

                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                {{ $t('Close') }}
                            </button>
                            <button type="submit" class="btn btn-primary">
                                {{ isEditMode ? $t('Update') : $t('Save') }}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
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
        object: {type: Object, default: null},
        params: {type: Object, default: () => ({})},
        title: {type: String, default: ''},
        initialLinkedObjects: {type: Array, default: () => []},
        parentObjectId: {type: String, default: null},
        parentLinkType: {type: String, default: '2da45f14-69c6-4d56-9f2f-809fda14abf5'},
    },
    emits: ['close', 'object-created', 'object-updated'],
    setup(props, {emit}) {
        const {t} = useI18n();
        const router = useRouter();
        const isEditMode = computed(() => !!props.object);

        console.log('EditObject.vue - Режим:', isEditMode.value ? 'EDIT' : 'CREATE');
        console.log('EditObject.vue - parentObjectId:', props.parentObjectId);
        console.log('EditObject.vue - initialLinkedObjects (должны быть пустыми при создании):', props.initialLinkedObjects);

        const formData = ref({
            thing_id: isEditMode.value
                ? (props.object.thing_id || props.object.id || uuidv4())
                : uuidv4(),
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

        // ГЛАВНОЕ: linkedObjects формируется ТОЛЬКО по логике
        const linkedObjects = ref([]);

        if (isEditMode.value) {
            // РЕДАКТИРОВАНИЕ — берём только свои ссылки
            linkedObjects.value = props.initialLinkedObjects
                .filter(item => item.link_type_id !== 'c217c185-742f-4a9f-8e69-acea2b4f5aea')
                .map(item => ({
                    id: uuidv4(),
                    currentObjectUuid: formData.value.thing_id,
                    linkedObjectUuid: item.other_thing_id || '',
                    linkTypeUuid: item.link_type_id || '',
                    comment: item.description || '',
                    linkId: item.link_id || null,
                }));
        } else if (props.parentObjectId) {
            // СОЗДАНИЕ — ТОЛЬКО ОДНА СВЯЗЬ С РОДИТЕЛЕМ
            linkedObjects.value = [{
                id: uuidv4(),
                currentObjectUuid: formData.value.thing_id,
                linkedObjectUuid: props.parentObjectId,
                linkTypeUuid: props.parentLinkType,
                comment: '',
                linkId: null,
            }];
        }
        // Если нет parentObjectId — пусто

        console.log('EditObject.vue - linkedObjects после инициализации:', linkedObjects.value);

        const modalId = `editObjectModal-${formData.value.thing_id}`;
        let modalInstance = null;

        onMounted(() => {
            const modalElement = document.getElementById(modalId);
            if (modalElement) {
                modalInstance = new Modal(modalElement);
                modalInstance.show();
                modalElement.addEventListener('hidden.bs.modal', () => emit('close'));
            }
        });

        onUnmounted(() => {
            if (modalInstance) modalInstance.dispose();
        });

        const addNewLinkedObject = () => {
            linkedObjects.value.push({
                id: uuidv4(),
                currentObjectUuid: formData.value.thing_id,
                linkedObjectUuid: '',
                linkTypeUuid: '2da45f14-69c6-4d56-9f2f-809fda14abf5',
                comment: '',
                linkId: null,
            });
        };

        const updateItem = ({index, data}) => {
            linkedObjects.value[index] = {...linkedObjects.value[index], ...data};
        };

        const removeItem = (index) => {
            linkedObjects.value.splice(index, 1);
        };

        const submitForm = async () => {
            try {
                await axios.get('/sanctum/csrf-cookie');

                const linksToAdd = linkedObjects.value
                    .filter(item => !item.linkId && item.linkedObjectUuid?.trim())
                    .map(item => ({
                        one_thing_id: formData.value.thing_id,
                        link_type_id: item.linkTypeUuid,
                        other_thing_id: item.linkedObjectUuid,
                        description: item.comment || '',
                        public: 0,
                    }));

                const payload = {
                    thing_id: formData.value.thing_id,
                    name: formData.value.name,
                    description: formData.value.description,
                    start: formData.value.start || null,
                    end: formData.value.end || null,
                    public: formData.value.public,
                    parent_id: formData.value.parent_id,
                    type: formData.value.type,
                    ...(linksToAdd.length > 0 && {links_to_add: linksToAdd}),
                };

                let response;
                if (isEditMode.value) {
                    response = await axios.put(`/api/v1/object/${formData.value.thing_id}`, payload);
                    emit('object-updated', response.data);
                } else {
                    response = await axios.post(`/api/v1/object/${formData.value.thing_id}`, payload);
                    emit('object-created', response.data);
                    if (props.parentObjectId) {
                        router.push({name: 'object', params: {id: props.parentObjectId}});
                    }
                }

                modalInstance?.hide();
            } catch (error) {
                console.error('Submit error:', error);
                alert(t('Failed') + ': ' + (error.response?.data?.message || error.message));
            }
        };

        return {
            formData,
            linkedObjects,
            modalId,
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
