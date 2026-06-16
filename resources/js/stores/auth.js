// resources/js/stores/auth.js
import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';
import { useRouter } from 'vue-router';
import { storage, storageSync } from '../utils/storage';

export const useAuthStore = defineStore('auth', () => {
    let initialUser = null;
    let initialToken = null;

    try {
        const storedUser = storageSync.get('user');
        if (storedUser) {
            initialUser = JSON.parse(storedUser);
        }

        const storedToken = storageSync.get('auth_token');
        if (storedToken) {
            initialToken = storedToken;
        }
    } catch (error) {
        console.error('Failed to parse stored auth data:', error);
        storageSync.remove('user');
        storageSync.remove('auth_token');
    }

    const authenticated = ref(!!initialToken);
    const user = ref(initialUser);
    const token = ref(initialToken);
    const router = useRouter();

    // Helper to set auth state after successful login
    async function setAuth(userData, authToken) {
        authenticated.value = true;
        user.value = userData;
        token.value = authToken;

        await storage.set('user', JSON.stringify(userData));
        await storage.set('auth_token', authToken);

        // Set global Axios header for all future requests
        axios.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
    }

    async function login(userData, authToken) {
        await setAuth(userData, authToken);
    }

    async function logout() {
        console.log('AuthStore logout - Starting logout process');
        try {
            // Optional: revoke token on backend
            if (token.value) {
                console.log('AuthStore logout - Sending /logout request with token');
                await axios.post('/logout', {}, {
                    headers: {
                        Authorization: `Bearer ${token.value}`
                    }
                });
                console.log('AuthStore logout - /logout request successful');
            }

            // Clear local state
            authenticated.value = false;
            user.value = null;
            token.value = null;

            await storage.remove('user');
            await storage.remove('auth_token');

            console.log('AuthStore logout - Storage cleared');

            // Clear global header
            delete axios.defaults.headers.common['Authorization'];

            // Navigate to /login
            console.log('AuthStore logout - Navigating to /login');
            await router.push('/');
            console.log('AuthStore logout - Navigation to /login successful');
        } catch (error) {
            console.error('AuthStore logout error:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            // Fallback: clear everything and redirect anyway
            authenticated.value = false;
            user.value = null;
            token.value = null;
            await storage.remove('user');
            await storage.remove('auth_token');
            delete axios.defaults.headers.common['Authorization'];
            await router.push('/');
        }
    }

    // Sync auth state with server (called on app mount)
    async function checkAuth() {
        console.log('Starting initial auth check...');

        if (!token.value) {
            console.log('No token found - treating as guest');
            authenticated.value = false;
            user.value = null;
            return;
        }

        try {
            const response = await axios.get('/user', {
                headers: {
                    Authorization: `Bearer ${token.value}`
                }
            });

            console.log('Auth check response:', response.data);

            if (response.data && response.data.id) {
                // Update user data (token remains the same)
                await setAuth(response.data, token.value);
                console.log('User authenticated from server:', response.data.name);
            } else {
                console.log('Invalid user data - logging out');
                await logout();
            }
        } catch (error) {
            console.error('Auth check failed:', error.response?.status, error.message);

            if (error.response?.status === 401) {
                console.log('Token invalid or expired - logging out');
                await logout();
            } else {
                // Other errors → keep local state for now (optimistic)
                console.log('Non-auth error during check - keeping local state');
            }
        }
    }

    // Restore auth from storage on app start (async for Capacitor compat)
    async function restoreAuth() {
        const storedToken = await storage.get('auth_token');
        const storedUser = await storage.get('user');

        if (storedToken) {
            token.value = storedToken;
            axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
        }

        if (storedUser) {
            try {
                user.value = JSON.parse(storedUser);
                authenticated.value = true;
            } catch (e) {
                console.error('Failed to restore user:', e);
                await storage.remove('user');
            }
        }
    }

    return { authenticated, user, token, login, logout, checkAuth, restoreAuth };
});
