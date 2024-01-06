<template>
    <div className="container">
        <div className="row">
            <div className="col-12">
                <div className="card shadow-sm">
                    <div className="card-header">
                        <h3>Dashboard</h3>
                    </div>
                    <div className="card-body">
                        <p className="mb-0">You are logged in as <b>{{ user.email || 'guest' }}</b></p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import {computed} from 'vue';
import {useStore} from 'vuex';

export default {
    name: "dashboard",
    setup() {
        const store = useStore();

        // Replace the 'computed' property with a computed ref
        const user = computed(() => store.state.auth.user);

        return {
            user
        };
    },
}
</script>
