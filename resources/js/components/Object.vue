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
                                <img :src="getThumbUrl(object.thing_id)" class="img-fluid" />
                            </RouterLink>
                        </div>
                        <div class="col-md-10">
                            <div v-if="object.start">Start: {{ $dateFromDb(object.start) }}</div>
                            <div v-if="object.end">End: {{ $dateFromDb(object.end) }}</div>
                            <div v-if="object.class?.name">Class: {{ object.class.name }}
                                <template v-if="object.class?.description">({{ object.class.description }})
                                </template>
                            </div>
                            <div v-if="object.description">{{ object.description }}</div>
                            <div v-if="object.record_created">Record created: {{ object.record_created }}</div>
                            <div v-if="object.record_updated">Record updated: {{ object.record_updated }}</div>
                            <div>Access: {{ object.public == 1 ? 'Public' : 'Private' }}</div>
                            <!--<pre style="font-size: x-small">{{ object }}</pre>-->
                            {{ object.description }}

                        </div>
                    </div>
                    <div v-for="link in object.links" :key="link.link_type_id" class="row  p-3">
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
import ClassTree from "./ClassTree.vue";

export default {
    name: "search",
    components: {ClassTree},
    props: ["searchText", "typeThing", "typeClass"],
    data() {
        return {
            object: {},
            classes: [],
            loaded: false,
            validationErrors: {},
            processing: false,
        };
    },
    computed: {
        csrf() {
            //return document.querySelector('meta[name="csrf-token"]').getAttribute('content');
        },
    },
    watch: {
        '$route.params.uid': function(newParam, oldParam) {
            if (newParam !== oldParam) {
                // Reload data when route parameters change
                this.getObject();
                this.getClasses();
            }
        },
    },
    created() {
        this.getObject();
        this.getClasses();
    },
    methods: {
        getThumbUrl(thing_id) {
            return `/thumbs/${thing_id.charAt(0)}/${thing_id.charAt(1)}/${thing_id}.jpg`;
        },
        parseDate(date) {
            return date;
        },
        async getObject() {
            try {
                const response = await axios.get(`/api/v1/object/${this.$route.params.uid}`);
                this.validationErrors = {};
                this.object = response.data.data;
                this.loaded = true;
            } catch ({ response }) {
                if (response && response.status === 422) {
                    this.validationErrors = response.data.errors;
                }
                else if (response && response.status === 401) {
                    this.$router.push({ name: 'login' });
                }
                else {
                    this.validationErrors = {};
                    alert(response ? response.data.message : "Error fetching object");
                }
            } finally {
                this.processing = false;
            }
        },
        async getClasses() {
            /*
            try {
              const response = await axios.post('/api/v1/object', JSON.stringify({
                "search": this.searchText,
                "type": [2]
              }));
              this.validationErrors = {};
              this.classes = JSON.parse(response.data).classes;
            } catch ({ response }) {
              if (response && response.status === 422) {
                this.validationErrors = response.data.errors;
              } else {
                this.validationErrors = {};
                alert(response ? response.data.message : "Error fetching classes");
              }
            } finally {
              this.processing = false;
            }
            */
        },
    },
};
</script>

<style scoped>
</style>
