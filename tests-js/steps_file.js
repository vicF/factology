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
            this.waitForElement('.add-subclass', 10);
            this.wait(0.5);
            try {
                this.click('.add-subclass');
            } catch (e) {
                console.log('Regular click failed, trying JS click');
                this.executeScript(() => {
                    const btn = document.querySelector('.add-subclass');
                    if (btn) btn.click();
                });
            }
        },

        addObjectTo(nodeName) {
            this.moveCursorTo(`a:has-text("${nodeName}")`);
            this.waitForElement('.add-object', 5);
            this.click('.add-object');
        },

        // ========== Class Creation Methods ==========

        async createClass(name, description) {
            this.waitForElement('input[name="name"]', 10);
            await this.fillFieldWithRetry('input[name="name"]', name);
            await this.fillFieldWithRetry('input[name="description"]', description);
            this.click('Save');
            this.waitForInvisible('.modal', 10);
            this.waitForText(name, 15);
            this.scrollTo(`a:has-text("${name}")`);
        },

        // ========== Delete Actions ==========

        async deleteCurrentObject() {
            this.waitForElement('button:has-text("Delete")', 10);
            this.waitForClickable('button:has-text("Delete")', 10);
            this.click('Delete');
            this.acceptPopup();
        },

        async fillFieldWithRetry(selector, expectedValue, maxRetries = 3) {
            for (let i = 0; i < maxRetries; i++) {
                // Clear and fill
                this.click(selector);
                await this.fillField(selector, expectedValue);
                // Wait a moment for Vue to react
                this.wait(0.2);
                // Read back the value
                const actualValue = await this.grabValueFrom(selector);
                if (actualValue === expectedValue) {
                    return; // success
                }
                console.log(`Retry ${i+1}: expected "${expectedValue}", got "${actualValue}"`);
            }
            throw new Error(`Failed to fill "${expectedValue}" after ${maxRetries} retries`);
        }
    });


};
