// resources/js/stores/ui.js
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { storage, storageSync } from '../utils/storage';

const EDIT_MODE_KEY = 'editMode';

export const useUiStore = defineStore('ui', () => {
    // Seed from sync storage on web (storageSync returns null on native -> default off).
    const editMode = ref(storageSync.get(EDIT_MODE_KEY) === '1');

    function toggleEditMode() {
        editMode.value = !editMode.value;
        // Fire-and-forget async persist (localStorage on web, Capacitor Preferences on native).
        storage.set(EDIT_MODE_KEY, editMode.value ? '1' : '0');
    }

    return { editMode, toggleEditMode };
});
