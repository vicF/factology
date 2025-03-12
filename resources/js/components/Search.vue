<template>
    <div class="container" id="search" v-cloak>
        <div v-if="!loaded" class="row">Loading...</div>
        <div v-else class="row">
            <div class="col-2">
                <class-tree></class-tree>
            </div>
            <div class="col">
                <div class="input-group">
                    <input type="text" name="search" class="form-control" v-model="localSearchText"
                           placeholder="Search">
                    <span class="input-group-btn">
                        <button class="btn btn-primary" @click.prevent="getObjects">Find</button>
                    </span>
                </div>
<!--                <div class="form-group form-check form-check-inline">
                    <input type="checkbox" class="form-check-input" id="checkThing" name="type[]"
                           v-bind:value="typeThing" v-on:input="typeThing= $event.target.value"
                           value="G_THING" checked/>
                    <label class="form-check-label" for="checkThing">Things</label>
                    <input type="checkbox" class="form-check-input" id="checkClass" name="type[]"
                           value="G_CLASS" v-bind:value="typeClass" v-on:input="typeClass= $event.target.value"/>
                    <label class="form-check-label" for="checkClass">Classes</label>

                    <input type="checkbox" class="form-check-input" id="checkPublic" name="public" value="1"
                    />
                    <label class="form-check-label" for="checkThing">Public</label>
                    <input type="checkbox" class="form-check-input" id="checkPrivate" name="private"
                           value="1"/>
                    <label class="form-check-label" for="checkClass">Private</label>

                </div>-->
                <div class="row mt-5">
                    <div class="col-md-10 offset-md-1">
                        <div class="row mb-3" v-for="thing in objects" :key="thing.thing_id">
                            <!-- Image Column -->
                            <div class="col-md-2" style="font-size: x-small;">
                                <RouterLink :to="{ name: 'object', params: { uid: thing.thing_id } }">
                                    <img :src="getThumbUrl(thing.thing_id)" />
                                </RouterLink>
                            </div>

                            <!-- Description and Details Column -->
                            <div class="col-md-4" style="font-size: x-small;">
                                <div>
                                    <RouterLink :to="{ name: 'object', params: { uid: thing.thing_id } }">{{ thing.name }}</RouterLink>
                                </div>
                                <div>{{ thing.description }}</div>
                            </div>

                            <!-- Links Column -->
                            <div class="col-md-6">
                                <div v-for="link in thing.links" :key="link.link_type_id">
                                    <RouterLink :to="{ name: 'object', params: { uid: link.link_type_id } }">
                                        <img :src="getThumbUrl(link.link_type_id)" width="10" />
                                    </RouterLink>

                                    <RouterLink :to="{ name: 'object', params: { uid: link.thing_id === thing.thing_id ? link.other_thing_id : link.thing_id } }">
                                        <img :src="getThumbUrl(link.thing_id === thing.thing_id ? link.other_thing_id : link.thing_id)" width="10" />
                                    </RouterLink>
                                    {{ link.translation }}
                                    <RouterLink :to="{ name: 'object', params: { uid: link.thing_id === thing.thing_id ? link.other_thing_id : link.thing_id } }">
                                        {{ link.name }}
                                    </RouterLink>
                                </div>
                            </div>

                            <!-- Horizontal Line After Each Row -->
                            <div class="col-12"><hr></div>
                        </div>
                    </div>
                </div>



            </div>
        </div>
    </div>
</template>

<script>
import ClassTree from './ClassTree.vue';
import TreeMenu from './TreeMenu.vue';
import { useCheckboxStore } from '../stores/checkboxes';
import { ref, reactive, onMounted, watch } from 'vue';
import axios from 'axios';

export default {
    name: "search",
    components: {
        ClassTree,
        TreeMenu
    },
    props: ['searchText', 'typeThing', 'typeClass'],
    setup(props, { emit }) {
        const objects = ref([]);
        const loaded = ref(false);
        const validationErrors = reactive({});
        const processing = ref(false);
        const localSearchText = ref(props.searchText || ''); // Local state for search input

        const getThumbUrl = (thing_id) => {
            return '/thumbs/' + thing_id.charAt(0) + '/' + thing_id.charAt(1) + '/' + thing_id + '.jpg';
        };

        const getObjects = async () => {
            const store = useCheckboxStore();
            let type = [];
            if (props.typeThing) {
                type.push(3);
            }
            if (props.typeClass) {
                type.push(2);
            }

            processing.value = true;
            try {
                const response = await axios.post('/api/v1/object', JSON.stringify({
                    "search": localSearchText.value, // Use local state instead of prop
                    "type": type,
                    classes: store.checkedItems,
                }));

                validationErrors.value = {};
                let data = JSON.parse(response.data);
                objects.value = data.things;
                console.log('Links:', data.links);
            } catch (error) {
                if (error.response && error.response.status === 422) {
                    validationErrors.value = error.response.data.errors;
                } else {
                    validationErrors.value = {};
                    alert(error.response ? error.response.data.message : error.message);
                }
            } finally {
                processing.value = false;
                loaded.value = true;
            }
        };

        // Sync localSearchText with props.searchText if it changes from parent
        watch(() => props.searchText, (newValue) => {
            localSearchText.value = newValue;
        });

        // Emit changes to parent if needed
        watch(localSearchText, (newValue) => {
            emit('update:searchText', newValue);
        });

        onMounted(() => {
            getObjects();
        });

        return {
            objects,
            loaded,
            getThumbUrl,
            getObjects,
            validationErrors,
            processing,
            localSearchText
        };
    }
};
</script>

<style scoped>
</style>
