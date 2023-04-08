<template>
    <div class="container" id="search" v-cloak>
        <div class="row">
            <div class="col-2">
                <tree-menu
                    :label="this.classes.label"
                    :nodes="this.classes.nodes"
                    :depth="0"></tree-menu>
                <class-tree></class-tree>
            </div>
            <div class="col">
                <div class="input-group">
                    <input type="text" name="search" class="form-control" v-bind:value="searchText"
                           v-on:input="searchText= $event.target.value">
                    <span class="input-group-btn">
                <button class="btn btn-primary" @click.prevent="getObjects">Find</button>
            </span>
                </div>
                <div class="form-group form-check form-check-inline">
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

                </div>
                <div class="row">
                    <div class="col-md-10 col-md-offset-1">
                        <table class="table">
                            <thead>
                            <tr>
                                <th scope="col">Image</th>
                                <th scope="col">Description</th>
                            </tr>
                            </thead>
                            <tbody>

                            <tr v-for="thing in this.objects" :key="thing.thing_id">
                                <td scope="row" style="font-size: x-small">
                                    <a :href="'/object/'+thing.thing_id"><img :src="this.getThumbUrl(thing.thing_id)"/></a>
                                </td>
                                <td>
                                    <div scope="row" style="font-size: x-small">{{ thing.start }}</div>
                                    <div scope="row" style="font-size: x-small">{{ thing.thing_id }}</div>
                                    <div scope="row" style="font-size: x-small">{{ thing.type }}</div>
                                    <div><a :href="'/object/'+ thing.thing_id">{{ thing.name }}</a></div>
                                    {{ thing.description }}
                                </td>
                                <td>
                                    <div v-for="link in thing.links"
                                         :set="other_id = (link.thing_id == thing.thing_id) ? link.other_thing_id:link.thing_id">
                                        <a
                                            :href="'/object/'+other_id">
                                            <img :src="this.getThumbUrl(other_id)" width="50"/></a>
                                        <a :href="'/object/'+link.link_type_id"><img
                                            :src="this.getThumbUrl(link.link_type_id)"
                                            width="50"/></a>{{ link.translation }}
                                    </div>
                                </td>
                            </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import ClassTree from './ClassTree.vue';
import TreeMenu from './TreeMenu.vue';



export default {
    name: "search",
    props: ['searchText', 'typeThing', 'typeClass'],
    components: {
        ClassTree: ClassTree,
        TreeMenu: TreeMenu
    },
    /*setup: () => ({
      title: ''
    }),*/
    data() {
        return {
            objects: [],
            classes: []
        }
    },
    computed: {
        csrf() {
            //return document.querySelector('meta[name="csrf-token"]').getAttribute('content');
        },
    },
    created: function () {
        this.getObjects();
        this.getClasses();
    },
    methods: {
        getThumbUrl(thing_id) {
            return '/thumbs/' + thing_id.charAt(0) + '/' + thing_id.charAt(1) + '/' + thing_id + '.jpg'
        },
        parseDate(date) {
            return date;
        },
        async getObjects() {
            let type = [];
            if (this.typeThing) {
                type.push(3);
            }
            if (this.typeClass) {
                type.push(2);
            }
            //await axios.get('/sanctum/csrf-cookie');
            await axios.post('/api/v1/object', JSON.stringify({
                "search": this.searchText,
                "type": type
            })).then(response => {
                this.validationErrors = {}
                this.objects = JSON.parse(response.data).things
                for (let i in response.links) {
                    let link = response.links[i];
                    if (this.objects[link.thing_id]) {
                        (this.objects[link.thing_id].links ??= {})[link.other_thing_id] = link;
                    }
                    if (this.objects[link.other_thing_id]) {
                        (this.objects[link.other_thing_id].links ??= {})[link.thing_id] = link;
                    }
                }
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
            this.classes =  {
                label: 'root',
                nodes: [
                    {
                        label: 'item1',
                        nodes: [
                            {
                                label: 'item1.1'
                            },
                            {
                                label: 'item1.2',
                                nodes: [
                                    {
                                        label: 'item1.2.1'
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        label: 'item2'
                    }
                ]
            }

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
