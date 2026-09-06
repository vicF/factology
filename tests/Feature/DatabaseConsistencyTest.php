<?php

namespace Tests\Feature;

use App\Services\DatabaseConsistencyChecker;
use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use Tests\Traits\CreatesTestUsers;
use Tests\Traits\SafeRefreshDatabase;

class DatabaseConsistencyTest extends TestCase
{
    use SafeRefreshDatabase;
    use CreatesTestUsers;

    private function serverUuid(): ?string
    {
        return DB::table('settings')->where('key', 'server_uuid')->value('value');
    }

    private function insertThing(string $id, string $name, int $type, array $extra = []): void
    {
        DB::table('things')->insert(array_merge([
            'thing_id'    => $id,
            'name'        => $name,
            'type'        => $type,
            'public'      => 1,
            'deleted'     => 0,
            'server_uuid' => $this->serverUuid(),
        ], $extra));
    }

    private function insertLink(string $one, string $linkType, string $other, array $extra = []): void
    {
        DB::table('links')->insert(array_merge([
            'link_uuid'      => (string) \Illuminate\Support\Str::uuid(),
            'one_thing_id'   => $one,
            'link_type_id'   => $linkType,
            'other_thing_id' => $other,
            'deleted'        => 0,
        ], $extra));
    }

    /**
     * Drop the links FK constraints so dangling rows can be inserted.
     * Tests run inside a transaction, so the DDL is rolled back with the test.
     */
    private function dropLinksForeignKeys(): void
    {
        foreach (['links_link_type_id_foreign', 'links_other_thing_id_foreign', 'links_thing_id_foreign'] as $constraint) {
            DB::statement("ALTER TABLE links DROP CONSTRAINT {$constraint}");
        }
    }

    private function checkReport(): array
    {
        return (new DatabaseConsistencyChecker())->check();
    }

    /**
     * Create a thing record for a user and assign it, so users.thing_id FK
     * constraint is satisfied.
     */
    private function createUserThing(\App\Models\User $user): string
    {
        $thingId = uuid_create();
        $this->insertThing($thingId, 'thing-' . $user->name, UUID::G_THING, [
            'owner'   => $thingId,
            'public'  => 0,
        ]);
        $user->thing_id = $thingId;
        $user->save();
        return $thingId;
    }

    private function issueIds(string $check): array
    {
        return array_column($this->checkReport()['issues'][$check], 'thing_id');
    }

    /** @test */
    public function finds_links_to_missing_objects()
    {
        $a = uuid_create();
        $b = uuid_create();
        $this->insertThing($a, 'Endpoint A', UUID::G_THING);
        $this->insertThing($b, 'Endpoint B', UUID::G_THING);

        // The links table has FK constraints; simulate a legacy/hand-edited DB
        // by dropping the constraints (rolled back with the test transaction).
        $this->dropLinksForeignKeys();
        $this->insertLink(uuid_create(), UUID::PRESENT, $b);  // missing one_thing_id
        $this->insertLink($a, uuid_create(), $b);             // missing link_type_id
        $this->insertLink($a, UUID::PRESENT, uuid_create());  // missing other_thing_id

        $issues = $this->checkReport()['issues']['links_to_missing_objects'];
        $missingFields = array_map(fn ($i) => implode(',', $i['missing']), $issues);

        $this->assertContains('one_thing_id', $missingFields);
        $this->assertContains('link_type_id', $missingFields);
        $this->assertContains('other_thing_id', $missingFields);
    }

    /** @test */
    public function finds_self_referencing_links()
    {
        $a = uuid_create();
        $this->insertThing($a, 'Narcissus', UUID::G_THING);
        $this->insertLink($a, UUID::PRESENT, $a);

        $issues = $this->checkReport()['issues']['self_referencing_links'];
        $this->assertCount(1, $issues);
        $this->assertSame($a, $issues[0]['one_thing_id']);
        $this->assertSame($a, $issues[0]['other_thing_id']);
    }

    /** @test */
    public function finds_objects_without_classes()
    {
        $without = uuid_create();
        $with = uuid_create();
        $this->insertThing($without, 'Orphan object', UUID::G_THING);
        $this->insertThing($with, 'Classed object', UUID::G_THING);
        $this->insertLink($with, UUID::LINK_TO_CLASS, UUID::USER);

        $ids = $this->issueIds('objects_without_classes');
        $this->assertContains($without, $ids);
        $this->assertNotContains($with, $ids);
    }

    /** @test */
    public function finds_classes_without_parent()
    {
        $detached = uuid_create();
        $attached = uuid_create();
        $this->insertThing($detached, 'Detached class', UUID::G_CLASS);
        $this->insertThing($attached, 'Attached class', UUID::G_CLASS);
        $this->insertLink(UUID::SOMETHING, UUID::LINK_TO_PARENT, $attached);

        $ids = $this->issueIds('classes_without_parent');
        $this->assertContains($detached, $ids);
        $this->assertNotContains($attached, $ids);
    }

    /** @test */
    public function finds_link_types_not_below_the_link_parent()
    {
        $misplaced = uuid_create();   // no parent at all
        $underLink = uuid_create();   // under the Link root — fine
        $underSystem = uuid_create(); // under System — allowed exception
        $this->insertThing($misplaced, 'Misplaced link type', UUID::G_LINK);
        $this->insertThing($underLink, 'Proper link type', UUID::G_LINK);
        $this->insertThing($underSystem, 'System link type', UUID::G_LINK);
        $this->insertLink(UUID::LINK, UUID::LINK_TO_PARENT, $underLink);
        $this->insertLink(UUID::SYSTEM, UUID::LINK_TO_PARENT, $underSystem);

        $ids = $this->issueIds('links_not_below_link_parent');
        $this->assertContains($misplaced, $ids);
        $this->assertNotContains($underLink, $ids);
        $this->assertNotContains($underSystem, $ids);
    }

    /** @test */
    public function flags_class_links_pointing_to_non_class_objects()
    {
        $object = uuid_create();   // a G_THING object used as a "class"
        $class = uuid_create();    // a proper class
        $thing = uuid_create();    // an object that needs a class
        $this->insertThing($object, 'A village', UUID::G_THING);
        $this->insertThing($class, 'Person', UUID::G_CLASS);
        $this->insertThing($thing, 'An event', UUID::G_THING);
        // The event is "of class A village" — wrong target.
        $this->insertLink($thing, UUID::LINK_TO_CLASS, $object);
        // Control: an object correctly linked to a real class.
        $this->insertLink($thing, UUID::LINK_TO_CLASS, $class);

        $issues = $this->checkReport()['issues']['class_links_to_non_classes'];
        $targets = array_column($issues, 'other_thing_id');
        $this->assertContains($object, $targets);
        $this->assertNotContains($class, $targets);
        $this->assertSame('target is not a class', $issues[0]['problem']);
    }

    /** @test */
    public function flags_class_links_pointing_to_deleted_classes()
    {
        $deletedClass = uuid_create();
        $thing = uuid_create();
        $this->insertThing($deletedClass, 'Gone class', UUID::G_CLASS, ['deleted' => 1]);
        $this->insertThing($thing, 'An object', UUID::G_THING);
        $this->insertLink($thing, UUID::LINK_TO_CLASS, $deletedClass);

        $issues = $this->checkReport()['issues']['class_links_to_non_classes'];
        $this->assertCount(1, $issues);
        $this->assertSame('target class is deleted', $issues[0]['problem']);
    }

    /** @test */
    public function accepts_models_as_class_targets()
    {
        // Models (G_MODEL) are class-tree leaves under a class; an object may
        // point its "class" link at a model rather than at a class proper.
        $model = uuid_create();
        $thing = uuid_create();
        $this->insertThing($model, 'Opel Zafira B', UUID::G_MODEL);
        $this->insertThing($thing, 'Our Opel', UUID::G_THING);
        $this->insertLink($thing, UUID::LINK_TO_CLASS, $model);

        $issues = $this->checkReport()['issues']['class_links_to_non_classes'];
        $targets = array_column($issues, 'other_thing_id');
        $this->assertNotContains($model, $targets);
    }

    /** @test */
    public function flags_class_links_pointing_to_deleted_models()
    {
        $deletedModel = uuid_create();
        $thing = uuid_create();
        $this->insertThing($deletedModel, 'Gone model', UUID::G_MODEL, ['deleted' => 1]);
        $this->insertThing($thing, 'An object', UUID::G_THING);
        $this->insertLink($thing, UUID::LINK_TO_CLASS, $deletedModel);

        $issues = $this->checkReport()['issues']['class_links_to_non_classes'];
        $this->assertCount(1, $issues);
        $this->assertSame('target class is deleted', $issues[0]['problem']);
    }

    /** @test */
    public function reports_a_link_type_under_a_class_as_misplaced()
    {
        $parentClass = uuid_create();
        $linkType = uuid_create();
        $this->insertThing($parentClass, 'Person', UUID::G_CLASS);
        $this->insertThing($linkType, 'Weird link', UUID::G_LINK);
        // A link type hanging under a class is "in another place".
        $this->insertLink($parentClass, UUID::LINK_TO_PARENT, $linkType);

        $ids = $this->issueIds('links_not_below_link_parent');
        $this->assertContains($linkType, $ids);
    }

    /** @test */
    public function ignores_soft_deleted_rows()
    {
        $deletedThing = uuid_create();
        $deletedClass = uuid_create();
        $this->insertThing($deletedThing, 'Deleted object', UUID::G_THING, ['deleted' => 1]);
        $this->insertThing($deletedClass, 'Deleted class', UUID::G_CLASS, ['deleted' => 1]);

        // Deleted link pointing to a missing object.
        $this->dropLinksForeignKeys();
        $this->insertLink(uuid_create(), UUID::PRESENT, uuid_create(), ['deleted' => 1]);

        $report = $this->checkReport();
        $this->assertNotContains($deletedThing, array_column($report['issues']['objects_without_classes'], 'thing_id'));
        $this->assertNotContains($deletedClass, array_column($report['issues']['classes_without_parent'], 'thing_id'));
        $this->assertEmpty($report['issues']['links_to_missing_objects']);
    }

    /** @test */
    public function admin_can_run_consistency_check_via_api()
    {
        $admin = $this->createTestUser()->getUser();
        $admin->is_admin = true;
        $admin->save();
        Sanctum::actingAs($admin, ['*']);

        $this->postJson('/api/v1/tools/consistency-check')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['result' => ['clean', 'summary', 'issues']]);
    }

    /** @test */
    public function non_admin_can_run_consistency_check_scoped_to_their_own_objects()
    {
        $user = $this->createTestUser()->getUser();
        $this->createUserThing($user);
        Sanctum::actingAs($user, ['*']);

        // An orphan owned by the user — should be reported.
        $mine = uuid_create();
        $this->insertThing($mine, 'My orphan', UUID::G_THING, ['owner' => $user->thing_id, 'public' => 0]);
        // Someone else's orphan — must stay hidden from this user.
        $theirs = uuid_create();
        $this->insertThing($theirs, 'Their orphan', UUID::G_THING, ['owner' => uuid_create(), 'public' => 0]);

        $response = $this->postJson('/api/v1/tools/consistency-check')
            ->assertOk()
            ->assertJsonPath('success', true);

        $ids = array_column($response->json('result.issues.objects_without_classes'), 'thing_id');
        $this->assertContains($mine, $ids);
        $this->assertNotContains($theirs, $ids);
    }

    /** @test */
    public function non_admin_can_delete_their_own_selected_objects()
    {
        $user = $this->createTestUser()->getUser();
        $this->createUserThing($user);
        Sanctum::actingAs($user, ['*']);

        $mine = uuid_create();
        $this->insertThing($mine, 'My orphan', UUID::G_THING, ['owner' => $user->thing_id]);

        $this->postJson('/api/v1/tools/consistency-delete', ['ids' => [$mine]])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('deleted', 1);

        $this->assertDatabaseMissing('things', ['thing_id' => $mine]);
    }

    /** @test */
    public function non_admin_cannot_delete_objects_they_do_not_own()
    {
        $user = $this->createTestUser()->getUser();
        $this->createUserThing($user);
        Sanctum::actingAs($user, ['*']);

        $theirs = uuid_create();
        $this->insertThing($theirs, 'Their orphan', UUID::G_THING, ['owner' => uuid_create()]);

        $this->postJson('/api/v1/tools/consistency-delete', ['ids' => [$theirs]])
            ->assertOk()
            ->assertJsonPath('deleted', 0);

        $this->assertDatabaseHas('things', ['thing_id' => $theirs]);
    }

    /** @test */
    public function admin_can_delete_any_selected_object()
    {
        $admin = $this->createTestUser()->getUser();
        $admin->is_admin = true;
        $admin->save();
        Sanctum::actingAs($admin, ['*']);

        // A private object owned by someone else — the delete must not be
        // silently swallowed by the read-visibility scope (regression: an
        // admin's hard delete used to no-op on private, non-owned objects).
        $any = uuid_create();
        $this->insertThing($any, "Someone else's", UUID::G_THING, ['owner' => uuid_create(), 'public' => 0]);

        $this->postJson('/api/v1/tools/consistency-delete', ['ids' => [$any]])
            ->assertOk()
            ->assertJsonPath('deleted', 1)
            ->assertJsonPath('failed', []);

        $this->assertDatabaseMissing('things', ['thing_id' => $any]);
    }

    /** @test */
    public function non_admin_can_delete_their_own_private_object()
    {
        $user = $this->createTestUser()->getUser();
        $this->createUserThing($user);
        Sanctum::actingAs($user, ['*']);

        $mine = uuid_create();
        $this->insertThing($mine, 'My private orphan', UUID::G_THING, [
            'owner'   => $user->thing_id,
            'public'  => 0,
        ]);

        $this->postJson('/api/v1/tools/consistency-delete', ['ids' => [$mine]])
            ->assertOk()
            ->assertJsonPath('deleted', 1);

        $this->assertDatabaseMissing('things', ['thing_id' => $mine]);
    }

    /** @test */
    public function import_response_includes_consistency_report()
    {
        $admin = $this->createTestUser()->getUser();
        $admin->is_admin = true;
        $admin->save();
        Sanctum::actingAs($admin, ['*']);

        $this->postJson('/api/v1/import', [
            'data' => ['things' => [], 'links' => []],
        ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['result' => ['consistency' => ['clean', 'summary', 'issues']]]);
    }
}
