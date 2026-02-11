<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import axios from 'axios';
import { useI18n } from 'vue-i18n';

const router = useRouter();
const authStore = useAuthStore();
const { t } = useI18n();

const user = ref({
    name: '',
    email: '',
    password: '',
    password_confirmation: ''
});
const validationErrors = ref({});
const processing = ref(false);

const register = async () => {
    processing.value = true;
    validationErrors.value = {};

    try {
        console.log('Starting registration process');

        const response = await axios.post('/register', user.value);

        console.log('Registration response:', response.data);

        const authenticatedUser = response.data.user || response.data || {
            name: user.value.name,
            email: user.value.email
        };

        authStore.login(authenticatedUser);

        console.log('User logged in locally:', authenticatedUser.name);

        if (response.data.token) {
            localStorage.setItem('auth_token', response.data.token);
            axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
        }

        console.log('Redirecting to home');
        await router.push('/');

    } catch (error) {
        console.error('Registration failed:', error);

        if (error.response?.status === 422) {
            validationErrors.value = error.response.data.errors || {};
        } else {
            alert(error.response?.data?.message || 'An error occurred during registration.');
        }
    } finally {
        processing.value = false;
    }
};

defineOptions({
    name: 'register'
});
</script>
