<template>
    <div class="container" id="search" v-cloak>
        <div v-if="!this.loaded" class="row">Loading</div>
        <div v-else class="row">
            <div class="col-2">
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

                                        <a :href="'/object/'+link.link_type_id"><img
                                            :src="this.getThumbUrl(link.link_type_id)"
                                            width="10"/></a><a
                                        :href="'/object/'+other_id">
                                        <img :src="this.getThumbUrl(other_id)" width="10"/></a>{{ link.translation }} <a
                                        :href="'/object/'+other_id">{{link.name}}</a>
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
import { useCheckboxStore } from '../stores/checkboxes';

export default {
    name: "search",
    props: ['searchText', 'typeThing', 'typeClass'],
    components: {
        ClassTree: ClassTree,
        TreeMenu: TreeMenu
    },
    data() {
        return {
            objects: [],
            classes: [],
            loaded: false,
        }
    },
    computed: {
        csrf() {
            //return document.querySelector('meta[name="csrf-token"]').getAttribute('content');
        },
    },
    created: function () {
        this.getObjects();
    },
    methods: {
        getThumbUrl(thing_id) {
            return '/thumbs/' + thing_id.charAt(0) + '/' + thing_id.charAt(1) + '/' + thing_id + '.jpg'
        },
        parseDate(date) {
            return date;
        },
        async getObjects() {
            const store = useCheckboxStore();
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
                "type": type,
                classes: store.checkedItems,
            })).then(response => {
                this.validationErrors = {}
                let data = JSON.parse(response.data);
                this.objects = data.things
                console.log('Links:', data.links);
                for (let i in data.links) {
                    let link = data.links[i];
                    console.log('Link:', link);
                    if (this.objects[link.thing_id]) {
                        (this.objects[link.thing_id].links ??= {})[link.other_thing_id] = link;
                    }
                    if (this.objects[link.other_thing_id]) {
                        (this.objects[link.other_thing_id].links ??= {})[link.thing_id] = link;
                    }
                }
                console.log('Objects:', this.objects);
            }).catch(response => {
                if (response.status === 422) {
                    this.validationErrors = response.data.errors
                } else {
                    this.validationErrors = {}
                    alert(response.data.message)
                }
            }).finally(() => {
                this.processing = false;
                this.loaded = true;
            })
        }

    }
}
</script>

<style scoped>

</style>
