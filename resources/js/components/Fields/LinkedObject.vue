<template>
    <div class="linked-object">
        <div class="form-group">
            <label>UUID текущего объекта</label>
            <input
                type="text"
                v-model="localCurrentObjectUUID"
                readonly
                class="form-control"
            />
        </div>
        <div class="form-group">
            <label>UUID связанного объекта</label>
            <input
                type="text"
                v-model="localLinkedObjectUUID"
                class="form-control"
                placeholder="Введите UUID связанного объекта"
            />
        </div>
        <div class="form-group">
            <label>UUID типа связи</label>
            <input
                type="text"
                v-model="localLinkTypeUUID"
                class="form-control"
                placeholder="Введите UUID типа связи"
            />
        </div>
        <div class="form-group">
            <label>Комментарий</label>
            <textarea
                v-model="localComment"
                class="form-control"
                placeholder="Введите комментарий"
            ></textarea>
        </div>
        <button class="btn btn-danger" @click="removeSelf">Удалить</button>
    </div>
</template>

<script>
export default {
    name: 'LinkedObject',
    props: {
        currentObjectUUID: {
            type: String,
            required: true,
        },
        linkedObjectUUID: {
            type: String,
            default: '',
        },
        linkTypeUUID: {
            type: String,
            default: '',
        },
        comment: {
            type: String,
            default: '',
        },
        index: {
            type: Number,
            required: true,
        },
    },
    data() {
        return {
            localCurrentObjectUUID: this.currentObjectUUID,
            localLinkedObjectUUID: this.linkedObjectUUID,
            localLinkTypeUUID: this.linkTypeUUID,
            localComment: this.comment,
        };
    },
    watch: {
        localLinkedObjectUUID(newVal) {
            this.$emit('update', {
                index: this.index,
                data: {
                    currentObjectUUID: this.localCurrentObjectUUID,
                    linkedObjectUUID: newVal,
                    linkTypeUUID: this.localLinkTypeUUID,
                    comment: this.localComment,
                },
            });
        },
        localLinkTypeUUID(newVal) {
            this.$emit('update', {
                index: this.index,
                data: {
                    currentObjectUUID: this.localCurrentObjectUUID,
                    linkedObjectUUID: this.localLinkedObjectUUID,
                    linkTypeUUID: newVal,
                    comment: this.localComment,
                },
            });
        },
        localComment(newVal) {
            this.$emit('update', {
                index: this.index,
                data: {
                    currentObjectUUID: this.localCurrentObjectUUID,
                    linkedObjectUUID: this.localLinkedObjectUUID,
                    linkTypeUUID: this.localLinkTypeUUID,
                    comment: newVal,
                },
            });
        },
    },
    methods: {
        removeSelf() {
            this.$emit('remove', this.index);
        },
    },
};
</script>

<style scoped>
.linked-object {
    border: 1px solid #ddd;
    padding: 15px;
    margin-bottom: 15px;
    border-radius: 4px;
}
.form-group {
    margin-bottom: 10px;
}
.form-control {
    width: 100%;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
}
.btn-danger {
    background-color: #dc3545;
    color: white;
    border: none;
    padding: 8px 15px;
    border-radius: 4px;
    cursor: pointer;
}
.btn-danger:hover {
    background-color: #c82333;
}
</style>
