import {defineStore} from 'pinia'
import axios from 'axios';
import { SOMETHING } from "../constants.js";
import { eventBus } from "../eventBus.js"; // Add this import

// @TODO this is in fact classes tree store. Need to rename or maybe merge with objectCache somehow
export const useObjectsStore = defineStore('objects', {
    state: () => ({
        classes: {
            id: '939cd822-9e23-450c-8c5e-c23f67cca792',
            name: 'Anything',
            nodes: []
        },
        objects: [],
        loading: false,
        searchText: '',
        processing: false,
        validationErrors: {}
    }),

    getters: {
        // doubleCount: (state) => state.count * 2,
    },

    actions: {
        increment() {
            this.count++
        },

        async loadClassTree(thing_id, levels) {
            this.loading = true
            await axios.post('/object', JSON.stringify({
                "tree": true,
                "search": this.searchText,
                "type": [2]
            })).then(response => {
                this.validationErrors = {}
                console.log('response', response.data.things);

                for (let i in response.data.things) {
                    if(response.data.things[i].id == SOMETHING) {
                        // First root node
                        this.classes = response.data.things[i];
                    } else {
                        if (!this.classes.nodes) {
                            this.classes.nodes = [];
                        }
                        this.classes.nodes.push(response.data.things[i]);
                    }
                }
                if (response.data.things && response.data.things[0]) {
                    this.classes.name = response.data.things[0].name
                }
                console.log('this.classes', this.classes)
            }).catch(response => {
                console.log('catch', response)
                if (response.status === 422) {
                    // this.validationErrors = response.data.errors
                } else {
                    this.validationErrors = {}
                    alert(response.data?.message || 'Error loading class tree')
                }
            }).finally(() => {
                this.loading = false
                this.processing = false
            })
        },

        // Add a new class to the tree without reloading
        addClassToTree(classId, className, parentId = null) {
            console.log('Adding class to tree:', { classId, className, parentId });

            const newClassNode = {
                id: classId,
                name: className,
                nodes: []
            };

            // Helper function to find parent recursively
            const findParentAndAdd = (nodes) => {
                if (!nodes) return false;

                for (let i = 0; i < nodes.length; i++) {
                    if (nodes[i].id === parentId) {
                        if (!nodes[i].nodes) {
                            nodes[i].nodes = [];
                        }
                        nodes[i].nodes.push(newClassNode);
                        return true;
                    }
                    if (nodes[i].nodes && nodes[i].nodes.length > 0) {
                        if (findParentAndAdd(nodes[i].nodes)) {
                            return true;
                        }
                    }
                }
                return false;
            };

            // Create a copy to trigger reactivity
            const newClasses = JSON.parse(JSON.stringify(this.classes));

            if (!parentId || parentId === this.classes.id) {
                // Add to root level
                if (!newClasses.nodes) {
                    newClasses.nodes = [];
                }
                newClasses.nodes.push(newClassNode);
            } else {
                // Find parent and add as child
                const found = findParentAndAdd(newClasses.nodes);
                if (!found) {
                    // If parent not found, add to root as fallback
                    if (!newClasses.nodes) {
                        newClasses.nodes = [];
                    }
                    newClasses.nodes.push(newClassNode);
                    console.warn('Parent not found, added to root');
                }
            }

            // Trigger reactivity by assigning new object
            this.classes = newClasses;
            console.log('Class added successfully', this.classes);
            eventBus.emit('tree-updated', this.classes);
            eventBus.emit('trigger-search');
        },

        // Update an existing class in the tree
        updateClassInTree(classId, newClassName) {
            console.log('Updating class in tree:', { classId, newClassName });

            const findAndUpdate = (nodes) => {
                if (!nodes) return false;

                for (let i = 0; i < nodes.length; i++) {
                    if (nodes[i].id === classId) {
                        nodes[i].name = newClassName;
                        return true;
                    }
                    if (nodes[i].nodes && nodes[i].nodes.length > 0) {
                        if (findAndUpdate(nodes[i].nodes)) {
                            return true;
                        }
                    }
                }
                return false;
            };

            // Create a copy to trigger reactivity
            const newClasses = JSON.parse(JSON.stringify(this.classes));
            let updated = false;

            // Check if it's the root node
            if (newClasses.id === classId) {
                newClasses.name = newClassName;
                updated = true;
            } else {
                updated = findAndUpdate(newClasses.nodes);
            }

            if (updated) {
                this.classes = newClasses;
                console.log('Class updated successfully');
                eventBus.emit('tree-updated', this.classes);
                eventBus.emit('trigger-search');
            } else {
                console.warn('Class not found with id:', classId);
            }
        },

        // Move a class to a new parent
        moveClassInTree(classId, newParentId) {
            console.log('Moving class in tree:', { classId, newParentId });

            // First, find and remove the class from its current location
            let movedNode = null;

            const findAndRemove = (nodes) => {
                if (!nodes) return false;

                for (let i = 0; i < nodes.length; i++) {
                    if (nodes[i].id === classId) {
                        movedNode = nodes[i];
                        nodes.splice(i, 1);
                        return true;
                    }
                    if (nodes[i].nodes && findAndRemove(nodes[i].nodes)) {
                        return true;
                    }
                }
                return false;
            };

            const newClasses = JSON.parse(JSON.stringify(this.classes));
            let removed = false;

            if (newClasses.id === classId) {
                console.warn('Cannot move root node');
                return;
            }

            removed = findAndRemove(newClasses.nodes);

            if (removed && movedNode) {
                // Now add it to the new parent
                if (!newParentId || newParentId === newClasses.id) {
                    // Add to root
                    if (!newClasses.nodes) {
                        newClasses.nodes = [];
                    }
                    newClasses.nodes.push(movedNode);
                } else {
                    // Find parent and add
                    const findParentAndAdd = (nodes) => {
                        if (!nodes) return false;

                        for (let i = 0; i < nodes.length; i++) {
                            if (nodes[i].id === newParentId) {
                                if (!nodes[i].nodes) {
                                    nodes[i].nodes = [];
                                }
                                nodes[i].nodes.push(movedNode);
                                return true;
                            }
                            if (nodes[i].nodes && findParentAndAdd(nodes[i].nodes)) {
                                return true;
                            }
                        }
                        return false;
                    };

                    const found = findParentAndAdd(newClasses.nodes);
                    if (!found) {
                        // Add to root as fallback
                        if (!newClasses.nodes) {
                            newClasses.nodes = [];
                        }
                        newClasses.nodes.push(movedNode);
                        console.warn('New parent not found, added to root');
                    }
                }

                this.classes = newClasses;
                console.log('Class moved successfully');
                eventBus.emit('tree-updated', this.classes);
                eventBus.emit('trigger-search');
            }
        },

        // Remove a class from the tree (optional)
        removeClassFromTree(classId) {
            console.log('Removing class from tree:', classId);

            const findAndRemove = (nodes) => {
                if (!nodes) return false;

                for (let i = 0; i < nodes.length; i++) {
                    if (nodes[i].id === classId) {
                        nodes.splice(i, 1);
                        return true;
                    }
                    if (nodes[i].nodes && nodes[i].nodes.length > 0) {
                        if (findAndRemove(nodes[i].nodes)) {
                            return true;
                        }
                    }
                }
                return false;
            };

            const newClasses = JSON.parse(JSON.stringify(this.classes));
            let removed = false;

            // Check if it's the root node (should not remove root)
            if (newClasses.id === classId) {
                console.warn('Cannot remove root node');
                return;
            }

            removed = findAndRemove(newClasses.nodes);

            if (removed) {
                this.classes = newClasses;
                console.log('Class removed successfully');
                eventBus.emit('tree-updated', this.classes);
                eventBus.emit('trigger-search');
            }
        },
    },
});
