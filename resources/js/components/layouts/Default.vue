<template>
    <div>
        <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
            <div class="container-fluid">
                <span style="color:white">{{ user ? user.name : 'guest' }}</span>
                <button class="navbar-toggler" type="button" data-bs-toggle="collapse"
                        data-bs-target="#navbarNavDropdown" aria-controls="navbarNavDropdown" aria-expanded="false"
                        aria-label="Toggle navigation">
                    <span class="navbar-toggler-icon"></span>
                </button>
                <div class="collapse navbar-collapse" id="navbarNavDropdown">
                    <ul class="navbar-nav me-auto">
                        <li class="nav-item">
                            <router-link :to="{name:'dashboard'}" class="nav-link">Home <span
                                class="sr-only">(current)</span></router-link>
                        </li>
                    </ul>
                    {{ user ? user.name : '' }}
                    <div class="d-flex">
                        <ul v-if="authenticated" class="navbar-nav">
                            <li class="nav-item dropdown">
                                <a class="nav-link dropdown-toggle" href="#" id="navbarDropdownMenuLink" role="button"
                                   data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                                    {{ user ? user.name : 'User' }}
                                </a>
                                <div class="dropdown-menu dropdown-menu-end" aria-labelledby="navbarDropdownMenuLink">
                                    <a v-if="user" class="dropdown-item" href="javascript:void(0)" @click="logout">Logout</a>

                                </div>
                            </li>
                        </ul>
                        <ul v-else class="navbar-nav me-auto">
                            <li class="nav-item">
                                <router-link class="nav-link" to="/login">Login</router-link>
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
import {mapActions} from 'vuex'

export default {
    name: "default-layout",
    /*data(){
        return {
            user:this.$store.state.auth.user
        }
    },*/
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
                this.signOut()
                this.$store.state.auth.user = null
                this.$router.push({name: "/"})
            })
        }
    }
}
</script>
