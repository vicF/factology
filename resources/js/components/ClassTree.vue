<template>
    Classes:
    <ul>
        <li v-for="thing in this.classes" >{{thing.name}}</li>
    </ul>
    {{ this.classes }}
</template>

<script>
export default {
    name: "ClassTree",
    data() {
        return {
            classes: []
        }
    },
    created: function () {
        this.getClasses();
    },
    methods: {
        async getClasses() {
            await axios.post('/api/v1/object', JSON.stringify({
                "type": [2]
            })).then(response => {
                // console.log(response.data);
                this.validationErrors = {}
                this.classes = JSON.parse(response.data).things
                // console.log(this.classes);
            }).catch(({response}) => {
                if (response.status === 422) {
                    this.validationErrors = response.data.errors
                } else {
                    this.validationErrors = {}
                    alert(response.data.message)
                }
            }).finally(() => {
                this.processing = false
            })
        }
    }
}
</script>

<style scoped>

</style>
