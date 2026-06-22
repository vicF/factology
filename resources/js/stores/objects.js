import { defineStore } from 'pinia'
import axios from 'axios'
import {CLASS_TYPE, LINK_TYPE, SOMETHING} from "../constants.js"
import { eventBus } from "../eventBus.js"

export const useObjectsStore = defineStore('objects', {
    state: () => ({
        rootNodes: [],        // array of top-level nodes (Something, link, system, ...)
        objects: [],
        loading: false,
        searchText: '',
        processing: false,
        validationErrors: {}
    }),

    getters: {},

    actions: {
        async loadClassTree(thing_id, levels) {
            this.loading = true
            try {
                const response = await axios.post('/object', JSON.stringify({
                    tree: true,
                    search: this.searchText,
                    type: [CLASS_TYPE, LINK_TYPE]
                }))
                this.validationErrors = {}
                console.log('response', response.data.things)

                // The API returns an array of top-level things.
                // We want all of them as root nodes.
                this.rootNodes = response.data.things || []
                console.log('rootNodes', this.rootNodes)
            } catch (error) {
                console.log('catch', error)
                if (error.response?.status === 422) {
                    // handle validation errors
                } else if (error.response?.status === 401) {
                    // Silent fail — Axios interceptor handles redirect to login
                    console.log('Tree load blocked: authentication required');
                } else {
                    this.validationErrors = {}
                    console.error('Error loading class tree:', error.response?.data?.message || error.message)
                    alert(error.response?.data?.message || 'Error loading class tree')
                }
            } finally {
                this.loading = false
                this.processing = false
            }
        },

        // Helper: find a node by id across all roots
        findNodeById(id, nodes = this.rootNodes) {
            for (const node of nodes) {
                if (node.id === id) return node
                if (node.nodes && node.nodes.length) {
                    const found = this.findNodeById(id, node.nodes)
                    if (found) return found
                }
            }
            return null
        },

        // Add a new class – parentId = null adds to root level
        addClassToTree(classId, className, parentId = null) {
            console.log('Adding class:', { classId, className, parentId })
            const newNode = { id: classId, name: className, nodes: [] }
            const newRoots = JSON.parse(JSON.stringify(this.rootNodes))

            if (!parentId) {
                // Add as new root
                newRoots.push(newNode)
            } else {
                // Find parent and add as child
                const addToParent = (nodes) => {
                    for (const node of nodes) {
                        if (node.id === parentId) {
                            if (!node.nodes) node.nodes = []
                            node.nodes.push(newNode)
                            return true
                        }
                        if (node.nodes && addToParent(node.nodes)) return true
                    }
                    return false
                }
                const found = addToParent(newRoots)
                if (!found) {
                    console.warn('Parent not found, adding as root')
                    newRoots.push(newNode)
                }
            }

            this.rootNodes = newRoots
            eventBus.emit('tree-updated', this.rootNodes)
            eventBus.emit('trigger-search')
        },

        updateClassInTree(classId, newClassName) {
            const updateNode = (nodes) => {
                for (const node of nodes) {
                    if (node.id === classId) {
                        node.name = newClassName
                        return true
                    }
                    if (node.nodes && updateNode(node.nodes)) return true
                }
                return false
            }
            const newRoots = JSON.parse(JSON.stringify(this.rootNodes))
            const updated = updateNode(newRoots)
            if (updated) {
                this.rootNodes = newRoots
                eventBus.emit('tree-updated', this.rootNodes)
                eventBus.emit('trigger-search')
            } else {
                console.warn('Class not found:', classId)
            }
        },

        moveClassInTree(classId, newParentId) {
            let movedNode = null
            const findAndRemove = (nodes) => {
                for (let i = 0; i < nodes.length; i++) {
                    if (nodes[i].id === classId) {
                        movedNode = nodes[i]
                        nodes.splice(i, 1)
                        return true
                    }
                    if (nodes[i].nodes && findAndRemove(nodes[i].nodes)) return true
                }
                return false
            }

            const newRoots = JSON.parse(JSON.stringify(this.rootNodes))
            let removed = false
            for (let i = 0; i < newRoots.length; i++) {
                if (newRoots[i].id === classId) {
                    movedNode = newRoots[i]
                    newRoots.splice(i, 1)
                    removed = true
                    break
                }
                if (newRoots[i].nodes && findAndRemove(newRoots[i].nodes)) {
                    removed = true
                    break
                }
            }

            if (removed && movedNode) {
                if (!newParentId) {
                    // Move to root level
                    newRoots.push(movedNode)
                } else {
                    const addToParent = (nodes) => {
                        for (const node of nodes) {
                            if (node.id === newParentId) {
                                if (!node.nodes) node.nodes = []
                                node.nodes.push(movedNode)
                                return true
                            }
                            if (node.nodes && addToParent(node.nodes)) return true
                        }
                        return false
                    }
                    const found = addToParent(newRoots)
                    if (!found) {
                        console.warn('New parent not found, moving to root')
                        newRoots.push(movedNode)
                    }
                }
                this.rootNodes = newRoots
                eventBus.emit('tree-updated', this.rootNodes)
                eventBus.emit('trigger-search')
            }
        },

        removeClassFromTree(classId) {
            const findAndRemove = (nodes) => {
                for (let i = 0; i < nodes.length; i++) {
                    if (nodes[i].id === classId) {
                        nodes.splice(i, 1)
                        return true
                    }
                    if (nodes[i].nodes && findAndRemove(nodes[i].nodes)) return true
                }
                return false
            }
            const newRoots = JSON.parse(JSON.stringify(this.rootNodes))
            let removed = false
            for (let i = 0; i < newRoots.length; i++) {
                if (newRoots[i].id === classId) {
                    newRoots.splice(i, 1)
                    removed = true
                    break
                }
                if (newRoots[i].nodes && findAndRemove(newRoots[i].nodes)) {
                    removed = true
                    break
                }
            }
            if (removed) {
                this.rootNodes = newRoots
                eventBus.emit('tree-updated', this.rootNodes)
                eventBus.emit('trigger-search')
            }
        }
    }
})
