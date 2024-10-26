<template>
    <div class="container" id="search">
        <div v-if="!loaded" class="row">Loading...</div>
        <div v-else class="row">
            <div class="col-2">
                <class-tree></class-tree>
            </div>
            <div class="col">
                <h1>{{ object.name }}</h1>
                <div class="col-md-10 col-md-offset-1">
                    <div class="row rounded border p-3 rounded-4">
                        <div class="col-md-2" style="font-size: x-small">
                            <RouterLink :to="{ name: 'object', params: { uid: object.thing_id } }">
                                <img :src="getThumbUrl(object.thing_id)" class="img-fluid"/>
                            </RouterLink>
                        </div>
                        <div class="col-md-10">
                            <div v-if="object.start">
                                {{
                                    object.class?.thing_id == '4c8ee41a-9912-4dff-8b44-7779a66e4fcf' ? 'Birth' : 'Start'
                                }}:
                                {{ $dateFromDb(object.start) }}
                            </div>
                            <div v-if="object.end">End: {{ $dateFromDb(object.end) }}</div>
                            <div v-if="object.class?.name">Class:
                                <RouterLink :to="{ name: 'object', params: { uid: object.class?.thing_id } }">
                                    {{ object.class?.name }}
                                    <template v-if="object.class?.description">({{
                                            object.class.description
                                        }})
                                    </template>
                                </RouterLink>
                            </div>
                            <div v-if="object.description">{{ object.description }}</div>
                            <div v-if="object.record_created">Record created: {{ object.record_created }}</div>
                            <div v-if="object.record_updated">Record updated: {{ object.record_updated }}</div>
                            <div>Access: {{ object.public == 1 ? 'Public' : 'Private' }}</div>
                            <!--<pre style="font-size: x-small">{{ object }}</pre>-->
                            {{ object.description }}
                            <div v-if="true || isGenealogyVisible">
                                Genealogy {{ genealogy }}
                                <div class="family-tree">
                                    <div v-for="parent in genealogy.parents" class="parents">
                                        <div class="person">{{ parent }}</div>
                                    </div>
                                    <div v-for="child in genealogy.children" class="children">
                                        <div class="person">{{ child }}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- Going through links -->
                    {{ object.links }}
                    <template v-for="link in object.links">
                        <div v-if="processLink(link)" :key="link.link_type_id" class="row p-3">
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
                                    <RouterLink :to="{ name: 'object', params: { uid: link.thing_id } }">{{
                                            link.name
                                        }}
                                    </RouterLink>
                                </div>
                                <div v-if="link.start">Start: {{ $dateFromDb(link.start) }}</div>
                                <div v-if="link.end">End: {{ $dateFromDb(link.end) }}</div>
                                <div v-if="link.link_start">Link start: {{ $dateFromDb(link.link_start) }}</div>
                                <div v-if="link.link_end">Link end: {{ $dateFromDb(link.link_end) }}</div>
                                <div v-if="link.description">{{ $truncateText(link.description, 300) }}</div>
                                {{ link.translation }}
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </div>
    </div>
</template>


<script>
import {ref, onMounted, watch} from 'vue';
import axios from 'axios';
import ClassTree from "./ClassTree.vue";
import {useRouter, useRoute} from 'vue-router';
import {computed} from 'vue';
import {UUID} from '@/data/uuid';

export default {
    name: "search",
    components: {ClassTree},
    props: ["searchText", "typeThing", "typeClass"],
    setup(props) {
        const router = useRouter();
        const route = useRoute();
        const object = ref({});
        const loaded = ref(false);
        const validationErrors = ref({});
        const processing = ref(false);

        const getThumbUrl = (thing_id) => {
            return `/thumbs/${thing_id.charAt(0)}/${thing_id.charAt(1)}/${thing_id}.jpg`;
        };

        const parseDate = (date) => {
            return date;
        };

        const getObject = async () => {
            try {
                const response = await axios.get(`/api/v1/object/${route.params.uid}`);
                console.log('route.params',route.params);
                console.log('response', response);
                validationErrors.value = {};
                object.value = response; //processLinks(response.data.data);
                loaded.value = true;
            } catch (error) {
                const response = error.response;
                if (response && response.status === 422) {
                    validationErrors.value = response.data.errors;
                } else if (response && response.status === 401) {
                    router.push({name: 'login'});
                } else {
                    validationErrors.value = {};
                    alert(response ? response.data.message : "Error fetching object");
                }
            } finally {
                processing.value = false;
            }
        };

        const processLinks = (object) => {
            let links = object.links;
            console.log('Links count:', links.count);
            for (const i in links) {
                let link = links[1];
                if (link.link_type_id === UUID.PARENT) {
                    console.log('link.link_type_id === UUID.PARENT');
                    if (link.one_thing_id === object.thing_id) {
                        object.genealogy.parents.push(link);
                        console.log('parent');
                    } else {
                        object.genealogy.children.push(link);
                        console.log('child');
                    }
                    continue;
                } else {
                    console.log('link.link_type_id !== UUID.PARENT');
                }
                object.links.push(link);
            }
            return object;
        }

        onMounted(() => {
            getObject();
        });

        watch(() => route.params.uid, (newParam, oldParam) => {
            if (newParam !== oldParam) {
                getObject();
                // getClasses();
            }
        });

        const genealogy = ref({
            parents: [],
            children: [],
        });

        const isGenealogyVisible = computed(() => {
            // Check if any property in genealogy has a value
            return Object.values(genealogy.value).some(v => v !== null);
        });

        const processLink = (link) => {
            console.log('link:', link);
            // genealogy.value.children.push(link);
            // geneaology
            if (link.link_type_id === UUID.PARENT) {
                console.log('link.link_type_id === UUID.PARENT');
                if (link.one_thing_id === object.thing_id) {
                    genealogy.value.parents.push(link);
                    console.log('parent');
                } else {
                    genealogy.value.children.push(link);
                    console.log('child');
                }
                return false;
            } else {
                console.log('link.link_type_id !== UUID.PARENT');
            }
            return true;
        };

        return {
            object,
            loaded,
            validationErrors,
            processing,
            getThumbUrl,
            parseDate,
            genealogy,
            isGenealogyVisible,
            processLink,
        };
    },
};
</script>


<style scoped>
</style>
