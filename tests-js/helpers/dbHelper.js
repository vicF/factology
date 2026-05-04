// tests-js/helpers/dbHelper.js

const DB_HELPER = {
    async resetDatabase(I, options = {}) {
        const { silent = false, showOutput = false } = options;

        if (!silent) {
            console.log('\n========== DATABASE SETUP ==========');
        }

        try {
            if (!silent) {
                console.log('\n📋 Checking migration status...');
                const statusResponse = await I.sendGetRequest('/api/test/migration-status');
                if (statusResponse.data.success && !silent) {
                    console.log('✅ Migration status OK');
                }
            }

            if (!silent) {
                console.log('\n🔄 Running database reset...');
            }

            const resetResponse = await I.sendPostRequest('/api/test/reset');

            if (resetResponse.data.success) {
                if (!silent) {
                    console.log('\n✅ Database reset successful!');
                    if (showOutput && resetResponse.data.output) {
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
            throw err;
        }

        if (!silent) {
            console.log('\n====================================\n');
        }

        return true;
    },

    async login(I, user) {
        I.amOnPage('/');
        I.seeElement('[data-testid="home-link"]');
        I.click('[data-testid="user-dropdown-btn"]');
        I.waitForElement('[data-testid="user-dropdown-menu"]', 5);
        I.click('[data-testid="login-link"]');
        I.see('Log in');
        I.fillField('[data-testid="login-email"]', user.email);
        I.fillField('[data-testid="login-password"]', user.password);
        I.click('[data-testid="login-submit-btn"]');
        I.waitForElement('[data-testid="user-dropdown-btn"]', 15);
        I.wait(2);
    },

    async logout(I) {
        I.click('[data-testid="user-dropdown-btn"]');
        I.waitForElement('[data-testid="user-dropdown-menu"]', 5);
        I.click('[data-testid="logout-link"]');
        I.wait(2);
    },

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

    async deleteTestUser(I, userId) {
        if (userId) {
            await I.sendDeleteRequest(`/api/test/users/${userId}`);
        }
    }
};

module.exports = DB_HELPER;
