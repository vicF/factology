<template>
    <div class="container" id="search">
        <div v-if="!loaded" class="row">Loading...</div>
        <div v-else class="row">
            <div class="col-2">
                <class-tree></class-tree>
            </div>
            <div class="col">
                <h1>
                    <template v-if="isEditing">
                        <input v-model="object.name" class="form-control" />
                    </template>
                    <template v-else>
                        {{ object.name }}
                    </template>
                </h1>
                <button @click="toggleEditMode" class="btn btn-primary">
                    {{ isEditing ? "Cancel" : "Edit" }}
                </button>
                <button v-if="isEditing" @click="saveChanges" class="btn btn-success">Save</button>

                <div class="col-md-10 col-md-offset-1">
                    <div class="row rounded border p-3 rounded-4">
                        <div class="col-md-2" style="font-size: x-small">
                            <RouterLink :to="{ name: 'object', params: { uid: object.thing_id } }">
                                <img :src="getThumbUrl(object.thing_id)" class="img-fluid" />
                            </RouterLink>
                        </div>
                        <div class="col-md-10">
                            <div v-if="object.start">
                                {{ object.class?.thing_id=='4c8ee41a-9912-4dff-8b44-7779a66e4fcf'? 'Birth':'Start'}}:
                                <template v-if="isEditing">
                                    <input type="date" v-model="object.start" class="form-control" />
                                </template>
                                <template v-else>
                                    {{ $dateFromDb(object.start) }}
                                </template>
                            </div>
                            <div v-if="object.end">
                                End:
                                <template v-if="isEditing">
                                    <input type="date" v-model="object.end" class="form-control" />
                                </template>
                                <template v-else>
                                    {{ $dateFromDb(object.end) }}
                                </template>
                            </div>
                            <div v-if="object.description">
                                <template v-if="isEditing">
                                    <textarea v-model="object.description" class="form-control"></textarea>
                                </template>
                                <template v-else>
                                    {{ object.description }}
                                </template>
                            </div>
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

export default {
    name: "search",
    components: { ClassTree },
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
            if (response && response.status === 422) {
                validationErrors.value = response.data.errors;
            } else if (response && response.status === 401) {
                router.push({ name: 'login' });
            } else {
                alert(response ? response.data.message : "An error occurred.");
            }
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
        };
    },
};

</script>


<style scoped>
</style>
