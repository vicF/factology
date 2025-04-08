import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAuthStore = defineStore('auth', () => {
    // Safely parse localStorage, default to null if invalid
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
        axios.post('/logout') // Call Laravel logout route
            .catch(() => {});
    }

    return { authenticated, user, login, logout };
});
