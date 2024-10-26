import {defineStore} from 'pinia'

// You can name the return value of `defineStore()` anything you want,
// but it's best to use the name of the store and surround it with `use`
// and `Store` (e.g. `useUserStore`, `useCartStore`, `useProductStore`)
// the first argument is a unique id of the store across your application
export const useObjectsStore = defineStore('objects', {
    state: () => ({
        classes: {
            id: '939cd822-9e23-450c-8c5e-c23f67cca792',
            name: 'Anything',
            nodes: [
                {
                    name: 'item1',
                    nodes: [
                        {
                            name: 'item1.1'
                        },
                        {
                            name: 'item1.2',
                            nodes: [
                                {
                                    name: 'item1.2.1'
                                }
                            ]
                        }
                    ]
                },
                {
                    name: 'item2'
                }
            ]
        },
        objects:[

        ],

        loading: false,
    }),
    getters: {

        //doubleCount: (state) => state.count * 2,
    },
    actions: {

        increment() {
            this.count++
        },
        async loadClassTree(thing_id, levels) {
            this.loading = true
            await axios.post('/api/v1/object', JSON.stringify({
                "tree": true,
                "search": this.searchText,
                "type": [2]
            })).then(response => {
                this.validationErrors = {}
                console.log('response', response.data.things);
                //this.classes = response.data.things
                for (let i in response.data.things) {
                    if(response.data.things[i].id == '3e15244c-a9e1-4a91-a0ca-1c65722a64df') {
                        // First root node
                        this.classes = response.data.things[i];
                        //this.classes.nodes = [];
                    } else {
                        this.classes.nodes.push(response.data.things[i]);
                    }

                }
                this.classes.name = response.data.things[0].name
                console.log('this.classes', this.classes)

            }).catch(response => {
                console.log('catch', response)
                if (response.status === 422) {
                    //this.validationErrors = response.data.errors
                } else {
                    this.validationErrors = {}
                    alert(response)
                    //alert(response.data.message)
                }
            }).finally(() => {
                this.loading = false
                this.processing = false
            })
        },
    },
})
