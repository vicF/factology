// tests-js/steps_file.js
module.exports = function() {
    return actor({
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
        }
    });
};

module.exports = function() {
    return actor({
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

        // Create a new class with name and description
        async createClass(name, description) {
            this.waitForElement('input[name="name"]', 10);
            this.fillField('input[name="name"]', name);
            this.fillField('input[name="description"]', description);
            this.click('Save');
            this.waitForText(name, 15);
        },

        async createClassSimple(name, description) {
            this.waitForElement('input[name="name"]', 10);
            this.fillField('input[name="name"]', name);
            this.fillField('input[name="description"]', description);
            this.click('Save');
            this.wait(2); // Wait for save to complete
        }
    });


};
