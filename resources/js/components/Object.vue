<template>
    <div class="container" id="search">
        <div v-if="!this.loaded" class="row">Loading</div>
        <div v-else class="row">
            <h1>{{ this.object.name }}</h1>
            <div class="row">
                <div class="col-md-10 col-md-offset-1">
                    <table class="table">
                        <tbody>

                        <tr >
                            <td scope="row" style="font-size: x-small">
                                <a :href="'/object/'+this.object.thing_id"><img :src="this.getThumbUrl(this.object.thing_id)"/></a>
                            </td>
                            <td>
                                <div scope="row" style="font-size: x-small">{{ this.object.start }}</div>
                                <div scope="row" style="font-size: x-small">{{ this.object.type }}</div>
                                <div>{{ this.object}}</div>
                                {{ this.object.description }}
                            </td>
<!--                            <td>
                                <div v-for="link in thing.links"
                                     :set="other_id = (link.thing_id == thing.thing_id) ? link.other_thing_id:link.thing_id">
                                    <a
                                        :href="'/object/'+other_id">
                                        <img :src="this.getThumbUrl(other_id)" width="50"/></a>
                                    <a :href="'/object/'+link.link_type_id"><img
                                        :src="this.getThumbUrl(link.link_type_id)"
                                        width="50"/></a>{{ link.translation }}
                                </div>
                            </td>-->
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
    props: ['searchText', 'typeThing', 'typeClass'],
     data() {
        return {
            object: [],
            classes: [],
            loaded: false
        }
    },
    computed: {
        csrf() {
            //return document.querySelector('meta[name="csrf-token"]').getAttribute('content');
        },
    },
    created: function () {
        this.getObject();
        this.getClasses();
    },
    methods: {
        getThumbUrl(thing_id) {
            return '/thumbs/' + thing_id.charAt(0) + '/' + thing_id.charAt(1) + '/' + thing_id + '.jpg'
        },
        parseDate(date) {
            return date;
        },
        async getObject() {
            let type = [];
            console.log('getObject')
            await axios.get('/api/v1/object/' + this.$route.params.uid).then(response => {
                this.validationErrors = {}
                this.object = response.data.data
                this.loaded = true
            }).catch(({response}) => {
                if (response.status === 422) {
                    this.validationErrors = response.data.errors
                } else {
                    this.validationErrors = {}
                    alert(response.data.message)
                }
            }).finally(() => {
                this.processing = false;
            })

        },
        async getClasses() {
            /*await axios.post('/api/v1/object', JSON.stringify({
                "search": this.searchText,
                "type": [2]
            })).then(response => {
                this.validationErrors = {}
                this.classes = JSON.parse(response.data).classes

            }).catch(({response}) => {
                if (response.status === 422) {
                    this.validationErrors = response.data.errors
                } else {
                    this.validationErrors = {}
                    alert(response.data.message)
                }
            }).finally(() => {
                this.processing = false
            })*/

        }
    }
}
</script>

<style scoped>

</style>
