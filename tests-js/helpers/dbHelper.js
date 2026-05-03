// tests-js/helpers/dbHelper.js

const DB_HELPER = {
    // Common database reset method
    async resetDatabase(I, options = {}) {
        const { silent = false, showOutput = false } = options;

        if (!silent) {
            console.log('\n========== DATABASE SETUP ==========');
        }

        try {
            // Check migration status first
            if (!silent) {
                console.log('\n📋 Checking migration status...');
                const statusResponse = await I.sendGetRequest('/api/test/migration-status');
                if (statusResponse.data.success && !silent) {
                    console.log('✅ Migration status OK');
                }
            }

            // Reset database
            if (!silent) {
                console.log('\n🔄 Running database reset...');
            }

            const resetResponse = await I.sendPostRequest('/api/test/reset');

            if (resetResponse.data.success) {
                if (!silent) {
                    console.log('\n✅ Database reset successful!');
                    if (showOutput && resetResponse.data.output) {
                        // Only show summary, not full migration output
                        const lines = resetResponse.data.output.split('\n');
                        const summaryLines = lines.filter(line =>
                            line.includes('DONE') ||
                            line.includes('Seeding') ||
                            line.includes('Dropping')
                        );
                        console.log('\n📊 Migration Summary:');
                        summaryLines.forEach(line => console.log(`  ${line}`));
                    }
                }
            } else {
                console.log('\n❌ Database reset failed:', resetResponse.data.error);
                throw new Error(resetResponse.data.error);
            }

        } catch (err) {
            console.log('\n❌ Error accessing test routes:', err.message);
            console.log('Make sure your test container is running with APP_ENV=testing');
            throw err;
        }

        if (!silent) {
            console.log('\n====================================\n');
        }

        return true;
    },

    // Common login method - FIXED for new UI
    async login(I, user) {
        I.amOnPage('/');

        // Check for Home icon (SVG with title attribute)
        I.seeElement('a[title="Home"]');

        // Click user dropdown button
        I.click('.user-dropdown button');

        // Wait for dropdown to be visible and click login link
        I.waitForElement('.dropdown-menu .dropdown-item[href="/login"]', 5);
        I.click('a.dropdown-item[href="/login"]');

        I.see('Log in');
        I.fillField('Email', user.email);
        I.fillField('Password', user.password);
        I.click('Log in');

        // Wait for user name to appear in the dropdown button
        I.waitForText(user.name, 15, '.user-dropdown button');
    },

    // Common logout method - FIXED for new UI
    async logout(I, userName) {
        // Click user dropdown button
        I.click('.user-dropdown button');

        // Click logout link
        I.waitForElement('.dropdown-menu .dropdown-item:has-text("Logout")', 5);
        I.click('Logout');

        // Wait for login icon to reappear
        I.waitForElement('.user-dropdown button svg', 10);
    },

    // Create test user via API
    async createTestUser(I, userData = null) {
        const defaultUser = {
            name: `Tester-${Date.now()}`,
            email: `tester-${Date.now()}@test.com`,
            password: 'qqqqqqqq'
        };

        const user = userData || defaultUser;
        const response = await I.sendPostRequest('/api/test/create-user', user);

        if (response.status === 201 || (response.data && response.data.success)) {
            return response.data.user || response.data;
        }
        throw new Error(`Failed to create user: ${response.status}`);
    },

    // Delete test user via API
    async deleteTestUser(I, userId) {
        if (userId) {
            await I.sendDeleteRequest(`/api/test/users/${userId}`);
        }
    }
};

module.exports = DB_HELPER;
