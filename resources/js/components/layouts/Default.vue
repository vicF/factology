<template>
    <div>
        <!-- Main Navbar -->
        <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
            <div class="container-fluid">
                <span style="color:white" class="me-3">{{ authenticated ? user.name : 'guest' }}</span>
                <button class="navbar-toggler" type="button" data-bs-toggle="collapse"
                        data-bs-target="#navbarNavDropdown" aria-controls="navbarNavDropdown" aria-expanded="false"
                        aria-label="Toggle navigation">
                    <span class="navbar-toggler-icon"></span>
                </button>
                <div class="collapse navbar-collapse d-flex justify-content-between" id="navbarNavDropdown">
                    <ul class="navbar-nav flex-shrink-0 me-3">
                        <li class="nav-item">
                            <router-link :to="{name:'dashboard'}" class="nav-link">Home <span class="sr-only">(current)</span></router-link>
                        </li>
                    </ul>
                    <form class="d-flex flex-grow-1 mx-3" @submit.prevent="handleSearch">
                        <input class="form-control me-2" type="search" placeholder="Search"
                               v-model="searchQuery" aria-label="Search">
                        <button class="btn btn-outline-success flex-shrink-0" type="submit">Search</button>
                    </form>
                    <div class="d-flex flex-shrink-0">
                        <LanguageSwitcher />
                        <ul class="navbar-nav ms-3">
                            <li class="nav-item dropdown">
                                <a class="nav-link dropdown-toggle" href="#" id="navbarDropdownMenuLink"
                                   role="button" data-bs-toggle="dropdown" aria-haspopup="true"
                                   aria-expanded="false">
                                    {{ authenticated ? user.name : 'User' }}
                                </a>
                                <div class="dropdown-menu dropdown-menu-end"
                                     aria-labelledby="navbarDropdownMenuLink">
                                    <template v-if="authenticated">
                                        <a class="dropdown-item" href="javascript:void(0)" @click="logout">Logout</a>
                                    </template>
                                    <template v-else>
                                        <router-link class="dropdown-item" to="/login">Login</router-link>
                                        <router-link class="dropdown-item" to="/register">Register</router-link>
                                    </template>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </nav>

        <!-- Secondary Navbar for Create Links -->
        <nav class="navbar navbar-light bg-light">
            <div class="container-fluid">
                <div class="d-flex gap-2">
                    <button class="btn btn-outline-primary" @click="openCreateModal('Class')">Class</button>
                    <button class="btn btn-outline-primary" @click="openCreateModal('Person')">Person</button>
                    <button class="btn btn-outline-primary" @click="openCreateModal('Event')">Event</button>
                    <button class="btn btn-outline-primary" @click="openCreateModal('Something')">Something</button>
                </div>
            </div>
        </nav>

        <!-- Main Content -->
        <main class="mt-3">
            <div class="container ps-5"> <!-- Small left padding instead of ps-0 -->
                <div class="row">
                    <div class="col-3 ps-0">
                        <class-tree></class-tree>
                    </div>
                    <div class="col-9">
                        <router-view></router-view>
                    </div>
                </div>
            </div>
        </main>

        <!-- Modal Component -->
        <create-object-modal v-if="showModal" :type="selectedType" @close="closeModal" @object-created="handleObjectCreated" />
    </div>
</template>

<script>
import { mapActions } from 'vuex';
import LanguageSwitcher from "../LanguageSwitcher.vue";
import ClassTree from "../ClassTree.vue";
import CreateObjectModal from "../CreateObjectModal.vue";
import { useRouter, useRoute } from 'vue-router';
import { ref, watch, onMounted } from 'vue';
import { eventBus } from '../../eventBus.js';

export default {
    name: "default-layout",
    components: { LanguageSwitcher, ClassTree, CreateObjectModal },
    setup() {
        const router = useRouter();
        const route = useRoute();
        const searchQuery = ref(route.query.q || '');
        const showModal = ref(false);
        const selectedType = ref('');

        onMounted(() => {
            eventBus.on('open-create-modal', (type) => {
                selectedType.value = type;
                showModal.value = true;
            });
        });

        watch(() => route.query.q, (newQuery) => {
            searchQuery.value = newQuery || '';
        });

        return { router, route, searchQuery, showModal, selectedType };
    },
    computed: {
        user: function () {
            return this.$store.state.auth.user;
        },
        authenticated: function () {
            return this.$store.state.auth.authenticated;
        }
    },
    methods: {
        ...mapActions({
            signOut: "auth/logout"
        }),
        async logout() {
            await axios.post('/logout').then(() => {
                this.signOut();
                this.$store.state.auth.user = null;
                this.$router.push({ name: "dashboard" });
            });
        },
        async handleSearch() {
            if (this.searchQuery.trim()) {
                try {
                    await this.$router.push({
                        path: '/',
                        query: { q: this.searchQuery }
                    });
                } catch (error) {
                    console.error('Navigation error:', error);
                }
            }
        },
        openCreateModal(type) {
            this.selectedType = type;
            this.showModal = true;
        },
        closeModal() {
            this.showModal = false;
            this.selectedType = '';
        },
        handleObjectCreated(object) {
            console.log('Object created:', object);
            this.$router.push({ path: '/', query: { q: this.searchQuery } });
        }
    }
};
</script>

<style scoped>
.navbar-light .btn {
    margin-right: 0.5rem;
}

.container {
    max-width: 100%; /* Optional: Full width */
}
</style>
