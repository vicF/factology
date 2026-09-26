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

        // The class tree is rendered only on non-object routes (Default.vue hides
        // it on /object/* in favour of ObjectViewSidebar), and nodes below level 1
        // start collapsed (COLLAPSE_FROM_DEPTH in composables/useTreeState.js).
        // Every tree interaction therefore has to open the dashboard and unfold
        // the branches first.
        async openClassTree() {
            this.amOnPage('/');
            this.waitForInvisible('.spinner-border', 20);
            this.waitForElement('[data-testid="desktop-view"], [data-testid="mobile-view"]', 20);
            this.waitForElement('.tree-node', 25);
            await this.expandClassTree();
        },

        // Click every collapsed toggle until the tree stops growing.
        async expandClassTree() {
            for (let pass = 0; pass < 8; pass++) {
                const collapsed = await this.executeScript(() => {
                    let clicks = 0;
                    for (const toggle of document.querySelectorAll('.tree-node > .toggle')) {
                        if (toggle.textContent.trim() === '+') {
                            toggle.click();
                            clicks++;
                        }
                    }
                    return clicks;
                });
                await this.wait(0.3);
                if (!collapsed) return;
            }
        },

        // Unfold until a node with this exact name is in the DOM.
        async ensureTreeNode(nodeName) {
            for (let pass = 0; pass < 8; pass++) {
                const present = await this.executeScript((name) => {
                    for (const link of document.querySelectorAll('.tree-node .node-name a')) {
                        if (link.textContent.trim() === name) return true;
                    }
                    return false;
                }, nodeName);
                if (present) return;
                await this.expandClassTree();
            }
            throw new Error(`Tree node "${nodeName}" never appeared in the class tree`);
        },

        // Fire the click handler of `actionSelector` on the node named `nodeName`.
        // dispatchEvent (not a real click) because the action icons sit in a
        // `visibility: hidden` container that only shows on hover in edit mode.
        async clickTreeNodeAction(nodeName, actionSelector) {
            const clicked = await this.executeScript(({name, sel}) => {
                for (const node of document.querySelectorAll('.tree-node')) {
                    const link = node.querySelector('.node-name a');
                    if (link && link.textContent.trim() === name) {
                        const btn = node.querySelector(sel);
                        if (btn) {
                            btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                            return true;
                        }
                    }
                }
                return false;
            }, {name: nodeName, sel: actionSelector});
            if (!clicked) {
                throw new Error(`Could not click "${actionSelector}" on tree node "${nodeName}"`);
            }
        },

        // Follow a tree row's link → the class detail page.
        async openTreeNode(nodeName) {
            await this.ensureTreeNode(nodeName);
            await this.clickTreeNodeAction(nodeName, '.node-name a');
            this.waitForElement('.object-header', 30);
        },

        // Names of every ancestor row of a tree node (nearest first).
        async grabTreeNodeAncestors(nodeName) {
            return await this.executeScript((name) => {
                const target = [...document.querySelectorAll('.tree-node')]
                    .find(nd => nd.querySelector('.node-name a')?.textContent.trim() === name);
                if (!target) return null;
                const ancestors = [];
                // TreeMenu structure: .tree-menu > .tree-node + .children > .tree-menu > ...
                // The ancestor .tree-node is NOT a DOM parent of nested nodes — it is a
                // sibling of the .children div. Walk up from target's wrapper .tree-menu,
                // and at each .tree-menu level check for its direct .tree-node child.
                // Skip the first .tree-menu (target's own wrapper) to avoid including target.
                let el = target.parentElement?.parentElement; // skip .tree-menu wrapper
                while (el) {
                    const treeNode = el.querySelector(':scope > .tree-node');
                    if (treeNode) {
                        const link = treeNode.querySelector('.node-name a');
                        if (link) ancestors.push(link.textContent.trim());
                    }
                    el = el.parentElement;
                }
                return ancestors;
            }, nodeName);
        },

        // Find the tree node, expand as needed, and click the action button in
        // one atomic executeScript to avoid Vue re-renders between the search
        // for the node and the click.
        async treeFindAndClick(nodeName, actionSelector) {
            for (let pass = 0; pass < 8; pass++) {
                const result = await this.executeScript(({name, sel}) => {
                    for (const node of document.querySelectorAll('.tree-node')) {
                        const link = node.querySelector('.node-name a');
                        if (link && link.textContent.trim() === name) {
                            const btn = node.querySelector(sel);
                            if (btn) {
                                btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                                return 'clicked';
                            }
                            return 'no-btn';
                        }
                    }
                    return 'no-node';
                }, {name: nodeName, sel: actionSelector});
                if (result === 'clicked') return true;
                if (result.startsWith('no-btn')) throw new Error(`Found "${nodeName}" in tree but no "${actionSelector}": ${result}`);
                if (result.startsWith('no-node')) {
                    this.say(`treeFindAndClick pass ${pass}: no matching node — links in tree: ${result.slice(14)}`);
                }

                // Not visible yet — expand collapsed branches and retry
                const collapsed = await this.executeScript(() => {
                    let clicks = 0;
                    for (const toggle of document.querySelectorAll('.tree-node > .toggle')) {
                        if (toggle.textContent.trim() === '+') { toggle.click(); clicks++; }
                    }
                    return clicks;
                });
                await this.wait(0.3);
                if (!collapsed) {
                    // No more toggles to click — node doesn't exist in the tree
                    throw new Error(`Tree node "${nodeName}" not found and no collapsed branches remain to expand`);
                }
            }
            throw new Error(`Tree node "${nodeName}" not found after 8 expansion passes`);
        },

        async addChildTo(nodeName) {
            await this.treeFindAndClick(nodeName, '.add-subclass');
            this.waitForElement('.modal', 10);
        },

        async addObjectTo(nodeName) {
            await this.treeFindAndClick(nodeName, '.add-object');
            this.waitForElement('.modal', 10);
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

        // ========== Modal helpers ==========

        // Click Save/Update in a modal and wait for it to close.
        // Bootstrap's modal-backdrop sometimes survives the modal closing
        // on slow connections; force-remove if still present.
        async clickModalFooterAndWait(text = 'Save') {
            this.click(locate('.modal-footer button').withText(text));
            this.waitForInvisible('.modal', 15);
            await this.executeScript(() => {
                const bd = document.querySelector('.modal-backdrop');
                if (bd) bd.remove();
            });
        },

        // Follow a related-item link on the current object page by its visible
        // text. Uses a native anchor click so Vue Router handles it client-side
        // (these objects may not be reachable by a cold URL load).
        async hasRelatedLink(name) {
            try {
                await this.waitForInvisible('.spinner-border', 20);
            } catch (e) { /* no spinner present */ }
            this.wait(2);
            return await this.executeScript((text) =>
                Array.from(document.querySelectorAll('a[href*="/object/"]'))
                    .some(a => a.textContent.trim() === text), name);
        },

        async clickRelatedLink(name) {
            // The related-objects panel loads asynchronously; wait for the
            // spinner to clear before looking for the link.
            try {
                await this.waitForInvisible('.spinner-border', 20);
            } catch (e) { /* no spinner present */ }
            this.wait(2);
            const clicked = await this.executeScript((text) => {
                for (const a of document.querySelectorAll('a[href*="/object/"]')) {
                    if (a.textContent.trim() === text) {
                        a.click();
                        return true;
                    }
                }
                return false;
            }, name);
            if (!clicked) {
                const found = await this.executeScript(() =>
                    Array.from(document.querySelectorAll('a[href*="/object/"]'))
                        .map(a => a.textContent.trim().substring(0, 40)).join(' ; '));
                throw new Error(`Related link "${name}" not found on the object page. Links: ${found}`);
            }
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
