<template>
    <div>
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
        <main class="mt-3">
            <div class="container">
                <div class="row">
                    <!-- Left Column: ClassTree -->
                    <div class="col-2">
                        <class-tree></class-tree>
                    </div>
                    <!-- Right Column: Search Results via RouterView -->
                    <div class="col-10">
                        <router-view></router-view>
                    </div>
                </div>
            </div>
        </main>
    </div>
</template>

<script>
import { mapActions } from 'vuex';
import LanguageSwitcher from "../LanguageSwitcher.vue";
import ClassTree from "..//ClassTree.vue"; // Adjust path as needed
import { useRouter, useRoute } from 'vue-router';
import { ref, watch } from 'vue';

export default {
    name: "default-layout",
    components: { LanguageSwitcher, ClassTree },
    setup() {
        const router = useRouter();
        const route = useRoute();
        const searchQuery = ref(route.query.q || '');

        watch(() => route.query.q, (newQuery) => {
            searchQuery.value = newQuery || '';
        });

        return { router, route, searchQuery };
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
        }
    }
};
</script>
