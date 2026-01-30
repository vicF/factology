<!-- resources/js/components/Register.vue -->
<template>
    <div class="container my-5">
        <div class="row justify-content-center">
            <div class="col-12 col-md-8 col-lg-6 col-xl-5">
                <div class="card shadow-sm">
                    <div class="card-body p-4 p-md-5">
                        <h1 class="text-center mb-4">Register</h1>
                        <hr class="mb-4"/>
                        <form action="javascript:void(0)" @submit.prevent="register" class="row" method="post">
                            <div class="col-12" v-if="Object.keys(validationErrors).length > 0">
                                <div class="alert alert-danger">
                                    <ul class="mb-0">
                                        <li v-for="(value, key) in validationErrors" :key="key">{{ value[0] }}</li>
                                    </ul>
                                </div>
                            </div>
                            <div class="form-group col-12 mb-3">
                                <label for="name" class="font-weight-bold">Name</label>
                                <input type="text" name="name" v-model="user.name" id="name" placeholder="Enter name" class="form-control" autocomplete="name">
                            </div>
                            <div class="form-group col-12 mb-3">
                                <label for="email" class="font-weight-bold">Email</label>
                                <input type="email" name="email" v-model="user.email" id="email" placeholder="Enter Email" class="form-control" autocomplete="email">
                            </div>
                            <div class="form-group col-12 mb-3">
                                <label for="password" class="font-weight-bold">Password</label>
                                <input type="password" name="password" v-model="user.password" id="password" placeholder="Enter Password" class="form-control" autocomplete="new-password">
                            </div>
                            <div class="form-group col-12 mb-4">
                                <label for="password_confirmation" class="font-weight-bold">Confirm Password</label>
                                <input type="password" name="password_confirmation" v-model="user.password_confirmation" id="password_confirmation" placeholder="Enter Password" class="form-control" autocomplete="new-password">
                            </div>
                            <div class="col-12 mb-3">
                                <button type="submit" :disabled="processing" class="btn btn-primary btn-block w-100">
                                    {{ processing ? "Please wait" : "Register" }}
                                </button>
                            </div>
                            <div class="col-12 text-center">
                                <label>Already have an account? <router-link :to="{name:'login'}">Login Now!</router-link></label>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { reactive, toRefs } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import axios from 'axios';

export default {
    name: 'register',
    setup() {
        const router = useRouter();
        const authStore = useAuthStore();

        const state = reactive({
            user: {
                name: '',
                email: '',
                password: '',
                password_confirmation: ''
            },
            validationErrors: {},
            processing: false
        });

        const register = async () => {
            state.processing = true;
            state.validationErrors = {};

            try {
                console.log('Starting registration process');

                // Register the user — no CSRF cookie needed for token-based flow
                const response = await axios.post('/register', state.user);

                console.log('Registration response:', response.data);

                // Extract authenticated user from Laravel response
                const authenticatedUser = response.data.user || response.data || { name: state.user.name, email: state.user.email };

                // Update Pinia auth store
                authStore.login(authenticatedUser);

                console.log('User logged in locally:', authenticatedUser.name);

                // If backend returns token, store it and set Authorization header
                if (response.data.token) {
                    localStorage.setItem('token', response.data.token);
                    axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
                }

                // Redirect to home
                console.log('Redirecting to home');
                await router.push('/');

            } catch (error) {
                console.error('Registration failed:', error);

                if (error.response?.status === 422) {
                    state.validationErrors = error.response.data.errors || {};
                } else {
                    alert(error.response?.data?.message || 'An error occurred during registration.');
                }
            } finally {
                state.processing = false;
            }
        };

        return {
            ...toRefs(state),
            register
        };
    }
};
</script>
