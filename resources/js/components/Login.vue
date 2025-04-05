<template>
    <div class="container d-flex justify-content-center align-items-start min-vh-100 py-4">
        <div class="col-12 col-md-6">
            <div class="card shadow-sm">
                <div class="card-body">
                    <h1 class="text-center">Login</h1>
                    <hr/>
                    <form @submit.prevent="login" class="row">
                        <div class="col-12" v-if="Object.keys(validationErrors).length > 0">
                            <div class="alert alert-danger">
                                <ul class="mb-0">
                                    <li v-for="(value, key) in validationErrors" :key="key">{{ value[0] }}</li>
                                </ul>
                            </div>
                        </div>
                        <div class="form-group col-12">
                            <label for="email" class="font-weight-bold">Email</label>
                            <input type="text" v-model="auth.email" name="email" id="email" class="form-control">
                        </div>
                        <div class="form-group col-12 my-2">
                            <label for="password" class="font-weight-bold">Password</label>
                            <input type="password" v-model="auth.password" name="password" id="password" class="form-control">
                        </div>
                        <div class="col-12 mb-2">
                            <button type="submit" :disabled="processing" class="btn btn-primary btn-block">
                                {{ processing ? "Please wait" : "Login" }}
                            </button>
                        </div>
                        <div class="col-12 text-center">
                            <label>Don't have an account? <router-link :to="{name:'register'}">Register Now!</router-link></label>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { useAuthStore } from '../stores/auth';

export default {
    name: "login",
    setup() {
        const router = useRouter();
        const authStore = useAuthStore();
        const auth = reactive({
            email: "",
            password: ""
        });
        const validationErrors = ref({});
        const processing = ref(false);

        const login = async () => {
            processing.value = true;
            try {
                await axios.get('/sanctum/csrf-cookie');
                const response = await axios.post('/login', auth);
                const user = response.data.user;
                authStore.login(user);
                console.log('Login successful, user:', user);
                console.log('Cookies after login:', document.cookie);
                router.push({ name: 'dashboard' });
            } catch (error) {
                if (error.response?.status === 422) {
                    validationErrors.value = error.response.data.errors;
                } else {
                    validationErrors.value = {};
                    alert(error.response?.data?.message || 'Login failed');
                }
            } finally {
                processing.value = false;
            }
        };

        return {
            auth, // Return the reactive object directly
            validationErrors,
            processing,
            login
        };
    }
};
</script>

<style scoped>
/* Ensure the container doesn’t shrink below content */
.min-vh-100 {
    min-height: 100vh;
}

/* Optional: Limit card width for better readability */
.card {
    max-width: 400px; /* Adjust as needed */
    width: 100%;
}

/* Ensure the form is visible on small screens */
@media (max-height: 600px) {
    .align-items-start {
        align-items: flex-start !important; /* Override center on small heights */
    }
    .py-4 {
        padding-top: 1rem !important; /* Reduce padding on small screens */
    }
}
</style>
