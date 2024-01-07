<template>
    <div class="container" id="search">
        <div v-if="!loaded" class="row">Loading</div>
        <div v-else class="row">
            <h1>{{ object.name }}</h1>
            <div class="row">
                <div class="col-md-10 col-md-offset-1">
                    <table class="table">
                        <tbody>
                        <tr>
                            <td scope="row" style="font-size: x-small">
                                <a :href="'/object/' + object.thing_id">
                                    <img :src="getThumbUrl(object.thing_id)" />
                                </a>
                            </td>
                            <td>
                                <div v-if="object.start">Start: {{ object.start }}</div>
                                <div v-if="object.end">End: {{ object.end }}</div>
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
                            </td>
                        </tr>
                        <tr v-for="link in object.links" :key="link.link_type_id">
                            <td>
                                <a v-if="link.thing_id !=object.thing_id" :href="'/object/' + link.thing_id">
                                    <img :src="getThumbUrl(link.thing_id)" width="50"/>
                                </a>
                                <a v-if="link.other_thing_id !=object.thing_id" :href="'/object/' + link.other_thing_id">
                                    <img :src="getThumbUrl(link.other_thing_id)" width="50"/>
                                </a>
                                <a :href="'/object/' + link.link_type_id">
                                    <img :src="getThumbUrl(link.link_type_id)" width="50"/>
                                </a>
                            </td>
                            <td>
                                <div v-if="link.name"><a :href="'/object/' + link.thing_id">{{ link.name }}</a></div>
                                <div v-if="link.description">{{ $truncateText(link.description, 300) }}</div>
                                {{ link.translation }}
                            </td>
                        </tr>

                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    name: "search",
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
                } else {
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
