<template>
    <div class="container" id="search">
        <div v-if="!loaded" class="row">Loading...</div>
        <div v-else class="row">
            <div class="col">
                <h1>
                    <TextField
                        fieldName="name"
                        v-model="object.name"
                        :isEditable="isEditing"
                    />
                    <button class="btn btn-outline-primary" @click="openCreateModal('Class')">Class</button>
                    <button @click="toggleEditMode" class="btn btn-primary">
                        {{ isEditing ? t("Cancel") : t("Edit") }}
                    </button>
                </h1>
                <button v-if="isEditing" @click="saveChanges" class="btn btn-success">{{ t('Save') }}</button>
                <div class="col-md-10 col-md-offset-1">
                    <div class="row rounded border p-3 rounded-4">
                        <div class="col-md-2" style="font-size: x-small">
                            <RouterLink :to="{ name: 'object', params: { uid: object.thing_id } }">
                                <img :src="getThumbUrl(object.thing_id)" class="img-fluid" />
                                <template v-if="isEditing">upload</template>
                            </RouterLink>
                        </div>
                        <div class="col-md-10">
                            <DateField
                                fieldName="start"
                                v-model="object.start"
                                :isEditable="isEditing"
                                :label="tc('Start', object.class?.thing_id)"
                            />
                            <DateField
                                fieldName="end"
                                v-model="object.end"
                                :isEditable="isEditing"
                                :label="tc('End', object.class?.thing_id)"
                            />
                            <TextField
                                fieldName="description"
                                v-model="object.description"
                                :isEditable="isEditing"
                                :label="tc('Description', object.class?.thing_id)"
                            />
                            <div v-if="object.record_created">{{ $t('Record created') }}: {{ object.record_created }}</div>
                            <div v-if="object.record_updated">{{ $t('Record updated') }}: {{ object.record_updated }}</div>
                            <RadioGroupField
                                fieldName="visibility"
                                v-model="object.public"
                                :options="{ 0: t('Private'), 1: t('Public') }"
                                :isEditable="isEditing"
                                :label="t('Access')"
                            />
                            <!-- <pre style="font-size: x-small">{{ object }}</pre> -->
                            {{ object.description }}

                        </div>
                    </div>
                    <!-- Going through links -->
                    <div v-for="link in object.links" :key="link.link_type_id" class="row p-3">
                        <div class="col-md-2">
                            <RouterLink :to="{ name: 'object', params: { uid: link.thing_id } }">
                                <img :src="getThumbUrl(link.thing_id)" width="50"/>
                            </RouterLink>
                            <RouterLink :to="{ name: 'object', params: { uid: link.link_type_id } }">
                                <img :src="getThumbUrl(link.link_type_id)" width="50"/>
                            </RouterLink>
                        </div>
                        <div class="col-md-10">
                            <div v-if="link.name">
                                <RouterLink :to="{ name: 'object', params: { uid: link.thing_id } }">{{ link.name }}</RouterLink>
                            </div>
                            <div v-if="link.start">Start: {{ $dateFromDb(link.start) }}</div>
                            <div v-if="link.end">End: {{ $dateFromDb(link.end) }}</div>
                            <div v-if="link.link_start">Link start: {{ $dateFromDb(link.link_start) }}</div>
                            <div v-if="link.link_end">Link end: {{ $dateFromDb(link.link_end) }}</div>
                            <TextField
                                fieldName="description"
                                v-model="link.description"
                                :isEditable="isEditing"
                                :label="tc('Description', object.class?.thing_id)"
                            />
                            <div v-if="link.description">{{ $truncateText(link.description, 300) }}</div>
                            {{ link.translation }}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { ref, onMounted, watch } from 'vue';
import axios from 'axios';
import ClassTree from "./ClassTree.vue";
import { useRouter, useRoute } from 'vue-router';
import { reactive } from 'vue';
import { computed } from 'vue';
import TextField from "./Fields/TextField.vue";
import DateField from "./Fields/DateField.vue";
import { useI18n } from 'vue-i18n';
import RadioGroupField from "./Fields/RadioGroupField.vue";
import { eventBus } from '../eventBus'; // Import the event bus

export default {
    name: "search",
    components: { RadioGroupField, DateField, TextField, ClassTree },
    props: ["searchText", "typeThing", "typeClass"],
    setup(props) {
        const router = useRouter();
        const route = useRoute();
        const object = ref({});
        const loaded = ref(false);
        const isEditing = ref(false); // Edit mode state
        const originalObject = ref({}); // Backup for cancel
        const validationErrors = ref({});
        const processing = ref(false);
        const { t, tc } = useI18n();

        const getThumbUrl = (thing_id) => {
            return `/thumbs/${thing_id.charAt(0)}/${thing_id.charAt(1)}/${thing_id}.jpg`;
        };

        const getObject = async () => {
            try {
                const response = await axios.get(`/api/v1/object/${route.params.uid}`);
                object.value = response.data.data;
                originalObject.value = JSON.parse(JSON.stringify(response.data.data)); // Create a backup
                loaded.value = true;
            } catch (error) {
                handleApiError(error);
            }
        };

        const toggleEditMode = () => {
            if (isEditing.value) {
                object.value = JSON.parse(JSON.stringify(originalObject.value)); // Revert changes
            }
            isEditing.value = !isEditing.value;
        };

        const saveChanges = async () => {
            try {
                const response = await axios.put(`/api/v1/object/${route.params.uid}`, object.value);
                originalObject.value = JSON.parse(JSON.stringify(object.value)); // Update backup
                isEditing.value = false;
                alert("Changes saved successfully.");
            } catch (error) {
                handleApiError(error);
            }
        };

        const handleApiError = (error) => {
            const response = error.response;
            if (response?.status === 422) {
                validationErrors.value = response.data.errors;
            } else if (response?.data?.message) {
                alert(response.data.message); // Only show alert if there's a specific message
            }
            // Let interceptor handle 401/419
        };

        const openCreateModal = (type) => {
            eventBus.emit('open-create-modal', type); // Emit event to open modal
        };

        onMounted(() => {
            getObject();
        });

        watch(() => route.params.uid, (newParam, oldParam) => {
            if (newParam !== oldParam) {
                getObject();
            }
        });

        return {
            object,
            loaded,
            isEditing,
            toggleEditMode,
            saveChanges,
            getThumbUrl,
            t,
            tc,
            openCreateModal
        };
    },
};

</script>


<style scoped>
</style>
