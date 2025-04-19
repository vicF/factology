import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';

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

    function login(userData) {
        authenticated.value = true;
        user.value = userData;
        localStorage.setItem('authenticated', 'true');
        localStorage.setItem('user', JSON.stringify(userData));
    }

    function logout() {
        authenticated.value = false;
        user.value = null;
        localStorage.removeItem('authenticated');
        localStorage.removeItem('user');
        axios.post('/logout')
            .then(() => {
                document.cookie.split(';').forEach(cookie => {
                    const name = cookie.split('=')[0].trim();
                    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
                });
            })
            .catch(error => {
                console.error('Logout error:', error);
            });
    }

    return { authenticated, user, login, logout };
});
