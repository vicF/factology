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


// steps_file.js
module.exports = function() {
    return actor({
        // Hover over a node and click its add child button
        async addChildTo(nodeName) {
            this.moveCursorTo(`a:has-text("${nodeName}")`);
            this.waitForElement('.add-subclass', 5);
            this.click('.add-subclass');
        },

        // Hover over a node and click its add object button (📦)
        async addObjectTo(nodeName) {
            this.moveCursorTo(`a:has-text("${nodeName}")`);
            this.waitForElement('.add-object', 5);
            this.click('.add-object');
        }
    });
};
