// tests-js/steps_file.js
module.exports = function() {
    return actor({
        // ========== User Management ==========

        async createUserViaAPI(userData = null) {
            const defaultUser = {
                name: `APIUser-${Date.now()}`,
                email: `api-${Date.now()}@test.com`,
                password: 'password123'
            };

            const user = userData || defaultUser;

            const response = await this.sendPostRequest('/api/test/create-user', user);
            if (response.status === 201 || (response.data && response.data.success)) {
                return response.data.user || response.data;
            }
            throw new Error(`Failed to create user: ${response.status}`);
        },

        // ========== Custom Fill Method ==========

        // Reliable fill method for Vue components
        async fillFieldReliable(selector, value) {
            // Standard CodeceptJS fillField - this should work with Vue
            await this.waitForElement(selector, 10);
            await this.fillField(selector, value);

            // Trigger blur to ensure Vue's v-model updates
            await this.executeScript((sel) => {
                const input = document.querySelector(sel);
                if (input) {
                    input.dispatchEvent(new Event('blur', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, selector);

            await this.wait(0.2);
        },

        // ========== Tree/Hierarchy Actions ==========

        addChildTo(nodeName) {
            this.moveCursorTo(`a:has-text("${nodeName}")`);
            this.waitForElement('.add-subclass', 5);
            this.click('.add-subclass');
        },

        addObjectTo(nodeName) {
            this.moveCursorTo(`a:has-text("${nodeName}")`);
            this.waitForElement('.add-object', 5);
            this.click('.add-object');
        },

        // ========== Class Creation Methods ==========

        async createClass(name, description) {
            this.waitForElement('input[name="name"]', 10);
            await this.fillFieldReliable('input[name="name"]', name);
            await this.fillFieldReliable('input[name="description"]', description);

            // Add a small delay before clicking save
            this.wait(0.5);
            this.click('Save');

            // Wait for save to complete and verify
            this.wait(2);

            // Try to find the created object
            try {
                this.waitForText(name, 15);
            } catch (err) {
                // If not found, maybe it's truncated - try clicking on it anyway
                console.log(`Text "${name}" not found, trying to click on it...`);
                this.click(name);
                this.waitForText(description, 10);
                this.click('Something');
                this.waitForText(name, 15);
            }
        },

        async createClassSimple(name, description) {
            this.waitForElement('input[name="name"]', 10);
            await this.fillFieldReliable('input[name="name"]', name);
            await this.fillFieldReliable('input[name="description"]', description);
            this.wait(0.5);
            this.click('Save');
            this.wait(2);
        },

        // ========== Delete Actions ==========

        async deleteCurrentObject() {
            this.waitForElement('button:has-text("Delete")', 10);
            this.waitForClickable('button:has-text("Delete")', 10);
            this.click('Delete');
            this.acceptPopup();
        }
    });
};
