<template>
    <div class="container h-100">
        <div class="row h-100 align-items-center">
            <div class="col-12 col-md-6 offset-md-3">
                <div class="card shadow sm">
                    <div class="card-body">
                        <h1 class="text-center">Register</h1>
                        <hr/>
                        <form action="javascript:void(0)" @submit="register" class="row" method="post">
                            <div class="col-12" v-if="Object.keys(validationErrors).length > 0">
                                <div class="alert alert-danger">
                                    <ul class="mb-0">
                                        <li v-for="(value, key) in validationErrors" :key="key">{{ value[0] }}</li>
                                    </ul>
                                </div>
                            </div>
                            <div class="form-group col-12">
                                <label for="name" class="font-weight-bold">Name</label>
                                <input type="text" name="name" v-model="user.name" id="name" placeholder="Enter name" class="form-control">
                            </div>
                            <div class="form-group col-12 my-2">
                                <label for="email" class="font-weight-bold">Email</label>
                                <input type="text" name="email" v-model="user.email" id="email" placeholder="Enter Email" class="form-control">
                            </div>
                            <div class="form-group col-12">
                                <label for="password" class="font-weight-bold">Password</label>
                                <input type="password" name="password" v-model="user.password" id="password" placeholder="Enter Password" class="form-control">
                            </div>
                            <div class="form-group col-12 my-2">
                                <label for="password_confirmation" class="font-weight-bold">Confirm Password</label>
                                <input type="password" name="password_confirmation" v-model="user.password_confirmation" id="password_confirmation" placeholder="Enter Password" class="form-control">
                            </div>
                            <div class="col-12 mb-2">
                                <button type="submit" :disabled="processing" class="btn btn-primary btn-block">
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
            try {
                await axios.get('/sanctum/csrf-cookie');
                const response = await axios.post('/register', state.user);
                state.validationErrors = {};
                authStore.login(response.data.user || {name: state.user.name, email: state.user.email});
                router.push({name: 'dashboard'});
            } catch ({response}) {
                if (response && response.status === 422) {
                    state.validationErrors = response.data.errors;
                } else {
                    state.validationErrors = {};
                    alert(response ? response.data.message : 'Error during registration');
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
