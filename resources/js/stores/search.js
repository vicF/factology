import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSearchStore = defineStore('search', () => {
    const searchQuery = ref('');
    const checkedItems = ref([]);
    const typeThing = ref(false);
    const typeClass = ref(false);

    function setSearchQuery(query) {
        searchQuery.value = query;
    }

    function toggleItem(id) {
        const index = checkedItems.value.indexOf(id);
        if (index === -1) {
            checkedItems.value.push(id);
        } else {
            checkedItems.value.splice(index, 1);
        }
    }

    function setTypeThing(value) {
        typeThing.value = value;
    }

    function setTypeClass(value) {
        typeClass.value = value;
    }

    return { searchQuery, checkedItems, typeThing, typeClass, setSearchQuery, toggleItem, setTypeThing, setTypeClass };
});
