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
                    <!-- Left Section -->
                    <ul class="navbar-nav flex-shrink-0 me-3">
                        <li class="nav-item">
                            <router-link :to="{name:'dashboard'}" class="nav-link">Home <span
                                class="sr-only">(current)</span></router-link>
                        </li>
                    </ul>

                    <!-- Middle Section (Search) -->
                    <form class="d-flex flex-grow-1 mx-3" @submit.prevent="handleSearch">
                        <input class="form-control me-2" type="search" placeholder="Search"
                               v-model="searchQuery" aria-label="Search">
                        <button class="btn btn-outline-success flex-shrink-0" type="submit">Search</button>
                    </form>

                    <!-- Right Section -->
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
            <router-view></router-view>
        </main>
    </div>
</template>

<script>
import { mapActions } from 'vuex';
import LanguageSwitcher from "../LanguageSwitcher.vue";
import { useRouter } from 'vue-router';

export default {
    name: "default-layout",
    components: { LanguageSwitcher },
    data() {
        return {
            searchQuery: ''
        };
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
            await axios.post('/logout').then(({data}) => {
                this.signOut();
                this.$store.state.auth.user = null;
                this.$router.push({ name: "/" });
            });
        },
        handleSearch() {
            if (this.searchQuery.trim()) {
                // Navigate to search route with query param
                this.$router.push({
                    name: '',
                    query: { q: this.searchQuery }
                });
            }
        }
    },
    setup() {
        const router = useRouter();
        return { router };
    }
};
</script>
