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
                                <div style="font-size: x-small">{{ object.start }}</div>
                                <div style="font-size: x-small">{{ object.type }}</div>
                                <div>{{ object }}</div>
                                {{ object.description }}
                            </td>
                            <!--
                            <td>
                              <div v-for="link in object.links" :key="link.link_type_id">
                                <a :href="'/object/' + link.other_thing_id">
                                  <img :src="getThumbUrl(link.other_thing_id)" width="50" />
                                </a>
                                <a :href="'/object/' + link.link_type_id">
                                  <img :src="getThumbUrl(link.link_type_id)" width="50" />
                                </a>
                                {{ link.translation }}
                              </div>
                            </td>
                            -->
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
