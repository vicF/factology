import { defineStore } from 'pinia';

export const useCheckboxStore = defineStore('checkboxes', {
    state: () => ({
        checkedItems: [],
    }),
    actions: {
        toggleItem(itemId) {
            const index = this.checkedItems.indexOf(itemId);
            if (index === -1) {
                this.checkedItems.push(itemId);
            } else {
                this.checkedItems.splice(index, 1);
            }
        },
    },
});
