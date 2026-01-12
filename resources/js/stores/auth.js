// resources/js/stores/auth.js
import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';
import { useRouter } from 'vue-router';

export const useAuthStore = defineStore('auth', () => {
    let initialUser = null;
    try {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            initialUser = JSON.parse(storedUser);
        }
    } catch (error) {
        console.error('Failed to parse user from localStorage:', error);
        localStorage.removeItem('user'); // Clear invalid data
    }

    const authenticated = ref(localStorage.getItem('authenticated') === 'true');
    const user = ref(initialUser);
    const router = useRouter();

    function login(userData) {
        authenticated.value = true;
        user.value = userData;
        localStorage.setItem('authenticated', 'true');
        localStorage.setItem('user', JSON.stringify(userData));
    }

    async function logout() {
        console.log('AuthStore logout - Starting logout process');
        try {
            authenticated.value = false;
            user.value = null;
            localStorage.removeItem('authenticated');
            localStorage.removeItem('user');

            console.log('AuthStore logout - Sending /logout request');
            await axios.post('/logout');
            console.log('AuthStore logout - /logout request successful');

            // Clear cookies
            document.cookie.split(';').forEach(cookie => {
                const name = cookie.split('=')[0].trim();
                document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
            });
            console.log('AuthStore logout - Cookies cleared');

            // Navigate to /login without redirect query
            console.log('AuthStore logout - Navigating to /login');
            await router.push('/login');
            console.log('AuthStore logout - Navigation to /login successful');
        } catch (error) {
            console.error('AuthStore logout error:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            // Fallback navigation
            window.location.href = '/login';
        }
    }

    // Sync auth state with server (called on app mount or after redirect)
    async function checkAuth() {
        try {
            const response = await axios.get('/api/user', {
                withCredentials: true // Force send cookies
            });
            if (response.data && response.data.id) {
                login(response.data);
            } else {
                logout();
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            if (error.response?.status === 401 || error.response?.status === 419) {
                authenticated.value = false;
                user.value = null;
                localStorage.removeItem('authenticated');
                localStorage.removeItem('user');
            }
        }
    }

    return { authenticated, user, login, logout, checkAuth };
});
