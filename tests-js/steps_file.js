// tests-js/steps_file.js
module.exports = function() {
    return actor({
        // ========== User Management ==========

        // Create user via API (works with your TestDatabaseController)
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

        // Reliable fill method for Vue inputs - uses pressKey to trigger all events
        async fillFieldSlowly(selector, value, delay = 30) {
            this.click(selector);
            this.pressKey(['Control', 'a']);
            this.pressKey('Backspace');

            for (const char of value) {
                this.pressKey(char);
                this.wait(delay / 1000);
            }
        },

        // ========== Tree/Hierarchy Actions ==========

        // Add child class to a node
        addChildTo(nodeName) {
            this.moveCursorTo(`a:has-text("${nodeName}")`);
            this.waitForElement('.add-subclass', 5);
            this.click('.add-subclass');
        },

        // Add object of a class
        addObjectTo(nodeName) {
            this.moveCursorTo(`a:has-text("${nodeName}")`);
            this.waitForElement('.add-object', 5);
            this.click('.add-object');
        },

        // ========== Class Creation Methods ==========

        // Create a new class with name and description
        async createClass(name, description) {
            this.waitForElement('input[name="name"]', 10);
            await this.fillFieldSlowly('input[name="name"]', name);
            await this.fillFieldSlowly('input[name="description"]', description);
            this.click('Save');
            this.waitForText(name, 15);
        },

        // Create a new class (no text verification)
        async createClassSimple(name, description) {
            this.waitForElement('input[name="name"]', 10);
            await this.fillFieldSlowly('input[name="name"]', name);
            await this.fillFieldSlowly('input[name="description"]', description);
            this.click('Save');
            this.wait(2);
        },

        // ========== Delete Actions ==========

        // Delete current object (assumes on object page)
        async deleteCurrentObject() {
            this.waitForElement('button:has-text("Delete")', 10);
            this.waitForClickable('button:has-text("Delete")', 10);
            this.click('Delete');
            this.acceptPopup();
        }
    });
};
