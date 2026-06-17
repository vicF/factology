# Factology Test Plan — Multi-Platform, Sync & Permissions

## Testing Layers

The project already has:
- **PHP**: PHPUnit with Feature/Unit suites (`php artisan test`)
- **JavaScript**: Vitest (unit), CodeceptJS + Playwright (e2e)
- **Test utilities**: `Tests\Traits\CreatesTestUsers`, test API routes for DB management

---

## 1. Unit Tests — Sync Engine (JavaScript/Vitest)

File: `resources/js/__tests__/sync/`

### 1.1 Local Database Layer (`localDb.test.js`)
```javascript
describe('LocalDB', () => {
  it('inserts an object with LOCAL sync status')
  it('retrieves an object by UUID')
  it('updates an object and increments _localRevision')
  it('soft-deletes an object (marks deleted=true)')
  it('lists all objects with optional type filter')
  it('searches objects by name/description')
  it('rejects invalid UUIDs')
  it('does not overwrite SERVER_ONLY objects without explicit merge')
  it('enqueues change to pendingChanges on write')
})
```

### 1.2 Conflict Resolution (`conflictResolver.test.js`)
```javascript
describe('ConflictResolver', () => {
  it('LWW: picks server revision when server > local')
  it('LWW: picks local revision when local > server')
  it('detects conflict when both revisions incremented')
  it('field-level merge: merges non-overlapping field changes')
  it('manual flag: marks conflict for user resolution')
  it('handles delete vs update conflict')
  it('handles delete vs delete (both deleted — no-op)')
})
```

### 1.3 Sync Engine (`syncEngine.test.js`)
```javascript
describe('SyncEngine', () => {
  it('pushes pending local changes to server API')
  it('pulls server changes and applies to local DB')
  it('merges without conflicts when only one side changed')
  it('detects and flags conflicts for manual resolution')
  it('syncs only records changed since lastSyncTimestamp')
  it('handles empty sync (no changes on either side)')
  it('handles server unreachable gracefully')
  it('retries failed pushes with exponential backoff')
  it('syncs to multiple servers independently')
})
```

### 1.4 Network Monitor (`networkMonitor.test.js`)
```javascript
describe('NetworkMonitor', () => {
  it('detects online status correctly')
  it('detects offline status correctly')
  it('emits connected/disconnected events')
  it('pings API health endpoint')
  it('triggers sync when coming back online')
})
```

---

## 2. Unit Tests — Permissions (PHP/PHPUnit)

File: `tests/Unit/`

### 2.1 Thing Policy (`Policies/ThingPolicyTest.php`)
```php
class ThingPolicyTest extends TestCase
{
    public function test_owner_can_view_own_record()
    public function test_owner_can_update_own_record()
    public function test_owner_can_delete_own_record()
    public function test_non_owner_cannot_view_private_record()
    public function test_non_owner_cannot_update_private_record()
    public function test_anyone_can_view_public_record()
    public function test_non_owner_cannot_update_public_record()
    public function test_group_member_can_view_group_record()
    public function test_non_member_cannot_view_group_record()
    public function test_server_record_only_visible_to_owner()
    public function test_admin_can_view_all_records()
    public function test_admin_can_update_all_records()
}
```

### 2.2 Link Policy (`Policies/LinkPolicyTest.php`)
```php
class LinkPolicyTest extends TestCase
{
    public function test_owner_can_create_link()
    public function test_non_owner_cannot_create_link()
    public function test_owner_can_delete_link()
    public function test_link_visibility_inherits_from_referenced_things()
}
```

### 2.3 Group Management (`GroupServiceTest.php`)
```php
class GroupServiceTest extends TestCase
{
    public function test_create_group()
    public function test_add_member_to_group()
    public function test_remove_member_from_group()
    public function test_set_group_permission_on_thing()
    public function test_revoke_group_permission_on_thing()
    public function test_user_can_list_their_groups()
    public function test_non_member_cannot_see_group_members()
}
```

### 2.4 Sync Service (`SyncServiceTest.php`)
```php
class SyncServiceTest extends TestCase
{
    public function test_pull_returns_changes_since_timestamp()
    public function test_pull_respects_visibility_rules()
    public function test_pull_does_not_return_private_records_of_other_users()
    public function test_pull_returns_public_records()
    public function test_pull_returns_group_records_for_group_members()
    public function test_push_accepts_new_records()
    public function test_push_accepts_updated_records()
    public function test_push_detects_conflict_when_server_newer()
    public function test_push_rejects_records_user_cant_write()
    public function test_push_returns_list_of_conflicts()
    public function test_resolve_conflict_applies_local_version()
    public function test_resolve_conflict_applies_server_version()
    public function test_resolve_conflict_applies_merged_version()
}
```

---

## 3. Feature/Integration Tests — API Endpoints (PHP/PHPUnit)

File: `tests/Feature/`

### 3.1 Sync API (`SyncApiTest.php`)
```php
class SyncApiTest extends TestCase
{
    // Authentication
    public function test_pull_requires_authentication()
    public function test_push_requires_authentication()

    // Pull
    public function test_pull_returns_empty_on_first_sync()
    public function test_pull_returns_changed_records_since_timestamp()
    public function test_pull_filters_by_table()
    public function test_pull_respects_record_visibility()

    // Push
    public function test_push_creates_new_object()
    public function test_push_updates_existing_object()
    public function test_push_handles_batch_of_changes()
    public function test_push_detects_conflicts()
    public function test_push_rejects_unauthorized_changes()

    // Conflict resolution
    public function test_resolve_conflict_accepts_local()
    public function test_resolve_conflict_accepts_server()
}
```

### 3.2 Permissions API (`PermissionApiTest.php`)
```php
class PermissionApiTest extends TestCase
{
    public function test_private_object_not_returned_in_list_for_other_users()
    public function test_public_object_returned_in_list_for_all()
    public function test_group_object_only_returned_for_group_members()
    public function test_user_cannot_get_private_object_of_another_user()
    public function test_user_cannot_update_object_they_dont_own()
    public function test_user_cannot_delete_object_they_dont_own()
    public function test_owner_can_set_visibility_level()
    public function test_owner_can_share_with_group()
    public function test_owner_can_revoke_group_access()
}
```

### 3.3 Group API (`GroupApiTest.php`)
```php
class GroupApiTest extends TestCase
{
    public function test_create_group()
    public function test_add_member_to_group()
    public function test_remove_member_from_group()
    public function test_list_user_groups()
    public function test_set_thing_permission_for_group()
    public function test_revoke_thing_permission_for_group()
    public function test_non_member_cannot_modify_group()
}
```

### 3.4 Server Registry API (`ServerApiTest.php`)
```php
class ServerApiTest extends TestCase
{
    public function test_register_server()
    public function test_list_registered_servers()
    public function test_remove_server()
    public function test_sync_specifies_target_server()
}
```

### 3.5 Existing API Regression (`ApiRegressionTest.php`)
```php
class ApiRegressionTest extends TestCase
{
    // Re-run all existing ApiTest cases to ensure nothing broke:
    public function test_list_objects_still_works()
    public function test_get_object_still_works()
    public function test_create_modify_delete_still_works()
    public function test_unauthorized_access_still_blocked()
    // ... all of the current ApiTest cases
}
```

---

## 4. E2E Tests — Offline/Online Scenarios (CodeceptJS + Playwright)

File: `tests-js/e2e/`

### 4.1 Offline-First Workflow (`offline_workflow_test.js`)
```javascript
Feature('Offline-first workflow')

Scenario('Create object while offline, sync when online', ({ I }) => {
  I.amOnPage('/')
  I.login() // helper
  I.goOffline() // helper: intercept network
  I.click('Add Object')
  I.fillField('name', 'Offline Created Object')
  I.click('Save')
  I.see('Saved locally')
  I.goOnline() // helper: restore network
  I.click('Sync now')
  I.waitForText('Synced')
})

Scenario('Edit object while offline, resolves without conflict', ({ I }) => {
  I.amOnPage('/')
  I.login()
  I.goOffline()
  I.click('.object-card:first-child')
  I.fillField('description', 'Edited offline')
  I.click('Save')
  I.goOnline()
  I.click('Sync now')
  I.see('Synced')
})

Scenario('Conflict detection when both sides modified', ({ I }) => {
  // Setup: create object on server, sync to client
  // Go offline, edit on client
  // Meanwhile, edit the same object on server (via API)
  // Go online, sync → conflict detected
  I.see('Conflict')
  I.click('Resolve')
  I.see('Keep local version')
  I.see('Accept server version')
})

Scenario('Private objects never appear in sync push', ({ I }) => {
  I.amOnPage('/')
  I.login()
  I.createObject({ visibility: 'private', name: 'Top Secret' })
  I.click('Sync now')
  // Verify via API call that the object is not on the server
  // ...assertions
})
```

### 4.2 Multi-Server Sync (`multi_server_test.js`)
```javascript
Feature('Multi-server sync')

Scenario('Sync with multiple servers independently', ({ I }) => {
  I.amOnPage('/')
  I.login()
  I.addServer({ name: 'Server A', url: 'http://server-a/api/v1' })
  I.addServer({ name: 'Server B', url: 'http://server-b/api/v1' })
  I.createObject({ visibility: 'server', serverId: 'server-a', name: 'On Server A' })
  I.click('Sync now')
  // Verify object only appears on Server A via API check
})

Scenario('Public object syncs to all servers', ({ I }) => {
  I.createObject({ visibility: 'public', name: 'Public Thing' })
  I.click('Sync now')
  // Verify object appears on all servers
})
```

### 4.3 Permissions E2E (`permissions_test.js`)
```javascript
Feature('Permissions in UI')

Scenario('Cannot see private objects of another user', ({ I }) => {
  // User A creates private object
  I.loginAs('userA')
  I.createObject({ visibility: 'private', name: 'User A Secret' })
  I.logout()

  // User B logs in — should NOT see it
  I.loginAs('userB')
  I.dontSee('User A Secret')
})

Scenario('Can share with group and members can view', ({ I }) => {
  I.loginAs('owner')
  I.createGroup('Test Group')
  I.addMemberToGroup('Test Group', 'member1')
  I.createObject({ visibility: 'group', groupId: 'Test Group', name: 'Group Thing' })

  I.loginAs('member1')
  I.see('Group Thing')
})

Scenario('Group member cannot edit shared object', ({ I }) => {
  // Member can view but edit button should be disabled/absent
  I.loginAs('member1')
  I.click('Group Thing')
  I.dontSeeElement('.edit-button')
})
```

### 4.4 Platform-Specific E2E
```javascript
// These may need separate configurations for Electron/Capacitor

Feature('Platform-specific behavior')

Scenario('Electron: saves to local file system', ...)
Scenario('Capacitor Android: uses native preferences', ...)
Scenario('Web SPA: falls back to IndexedDB', ...)
Scenario('Desktop: files stored in app data directory', ...)
```

---

## 5. Performance/Stress Tests

### 5.1 Sync with Large Dataset (`SyncLoadTest.php`)
```php
class SyncLoadTest extends TestCase
{
    public function test_pull_1000_objects()
    public function test_push_1000_objects()
    public function test_conflict_resolution_on_100_objects()
    public function test_sync_does_not_timeout_on_large_batches()
    public function test_indexeddb_performance_with_10k_records() // JS test
}
```

### 5.2 Concurrent Access (`ConcurrencyTest.php`)
```php
class ConcurrencyTest extends TestCase
{
    public function test_two_clients_pushing_simultaneously()
    public function test_push_while_pull_in_progress()
    public function test_rapid_sync_cycles_do_not_corrupt_data()
}
```

---

## 6. Test Data Management Strategy

### Test Helpers to Create:

**PHP** (`tests/Support/`):
- `CreatesSyncData.php` — trait to seed test data for sync scenarios
- `SetsUpPermissions.php` — trait to create users with specific permissions
- `SimulatesServer.php` — mock server API responses

**JavaScript** (`tests-js/helpers/`):
- `localDb_helper.js` — populate/clear local DB for tests
- `sync_helper.js` — mock API responses for sync operations
- `network_helper.js` — simulate online/offline states
- `auth_helper.js` — login/logout in e2e tests

### Database Fixtures/Seeders:
- `database/seeders/TestPermissionSeeder.php` — users with various permission levels
- `database/seeders/TestSyncSeeder.php` — records at different sync states
- `database/seeders/TestGroupSeeder.php` — groups with members and shared objects

---

## 7. CI/CD Integration

Add to CI pipeline (GitHub Actions or similar):

```yaml
test:
  - php artisan test --testsuite=Unit        # Backend unit tests
  - php artisan test --testsuite=Feature      # Backend integration tests
  - vitest run --config vitest.config.js      # Frontend unit tests
  - cd tests-js && npx codeceptjs run         # E2E tests (needs Playwright browsers)
  - npm run test:php                          # All PHP tests
```

---

## 8. Implementation Order (Tests)

1. **Write sync unit tests FIRST** (JS — local DB, conflict resolver) → helps nail down the API before implementation
2. **Write permission unit tests** (PHP — policies) → validates access control design
3. **Write sync integration tests** (PHP — sync API endpoints)
4. **Write permission integration tests** (PHP — permission API endpoints)
5. **Write E2E tests** (CodeceptJS — offline/online, permissions)
6. **Regression tests** — ensure existing API behavior unchanged
7. **Performance tests** — validate with realistic data volumes
8. **Platform-specific smoke tests** — quick checks on Electron, Android, iOS
