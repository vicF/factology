// store/auth.js
import { defineStore } from 'pinia';

export const useAuthStore = defineStore('auth', {
    state: () => ({
        showLoginDialog: false
    }),
    actions: {
        setShowLogin(show) {
            this.showLoginDialog = show;
        }
    }
});
