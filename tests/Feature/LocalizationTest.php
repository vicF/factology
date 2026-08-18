<?php

namespace Tests\Feature;

use App\Models\User;
use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use Tests\Traits\CreatesTestUsers;
use Tests\Traits\SafeRefreshDatabase;

class LocalizationTest extends TestCase
{
    use CreatesTestUsers;
    use SafeRefreshDatabase;

    /**
     * Create a things record for a user's thing_id (FK requirement).
     */
    private function createUserThing(User $user): string
    {
        $thingId = uuid_create();
        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');
        DB::table('things')->insert([
            'thing_id'    => $thingId,
            'name'        => 'thing-' . $user->name,
            'description' => 'Things record for user ' . $user->email,
            'type'        => 3,
            'owner'       => $thingId,
            'public'      => false,
            'server_uuid' => $serverUuid,
        ]);
        return $thingId;
    }

    /**
     * Create an object as the given user, return the decoded POST response.
     */
    private function createObject(User $user, array $overrides = []): array
    {
        if (!isset($user->thing_id) || !$user->thing_id) {
            $user->thing_id = $this->createUserThing($user);
            $user->save();
        }
        Sanctum::actingAs($user, ['*']);

        $uuid = uuid_create();
        $data = array_merge([
            'thing_id'    => $uuid,
            'name'        => 'Object ' . $uuid,
            'type'        => UUID::G_THING,
            'description' => 'Description ' . $uuid,
            'start'       => date('Ymd', strtotime('-1 day')),
            'end'         => date('Ymd'),
            'public'      => 1,
        ], $overrides);

        $response = $this->postJson('/api/v1/object/' . $uuid, $data);
        $response->assertStatus(200);
        return $response->json();
    }

    public function testTranslationsRoundTrip(): void
    {
        $user = $this->createTestUser()->getUser();
        $json = $this->createObject($user, [
            'name'                    => 'остров',
            'name_translations'       => ['lang' => 'ru', 'en' => 'island'],
            'description'             => 'небольшой остров',
            'description_translations'=> ['lang' => 'ru', 'en' => 'a small island'],
            'data'                    => ['properties' => [
                'prop-1' => ['en' => 'Jonny', 'ru' => 'Ваня'],
                'prop-2' => ['value' => 70, 'unit' => 'kg'],
            ]],
        ]);

        $thingId = $json['data']['thing_id'];
        $this->assertNotEmpty($thingId);

        // DB columns
        $row = DB::table('things')->where('thing_id', $thingId)->first();
        $this->assertNotNull($row);
        $this->assertEquals(['lang' => 'ru', 'en' => 'island'], json_decode($row->name_translations, true));
        $this->assertEquals(['lang' => 'ru', 'en' => 'a small island'], json_decode($row->description_translations, true));
        $this->assertEquals(['properties' => ['prop-1' => ['en' => 'Jonny', 'ru' => 'Ваня'], 'prop-2' => ['value' => 70, 'unit' => 'kg']]], json_decode($row->data, true));

        // GET returns decoded columns
        $get = $this->actingAs($user, 'sanctum')->getJson('/api/v1/object/' . $thingId);
        $get->assertStatus(200);
        $this->assertEquals('остров', $get->json('data.name'));
        $this->assertEquals(['lang' => 'ru', 'en' => 'island'], $get->json('data.name_translations'));
        $this->assertEquals(['lang' => 'ru', 'en' => 'a small island'], $get->json('data.description_translations'));
        $this->assertEquals(['en' => 'Jonny', 'ru' => 'Ваня'], $get->json('data.data.properties.prop-1'));
    }

    public function testLegacyArrayPropertiesAreNormalizedToAnObjectOnRead(): void
    {
        // Objects created before the properties-map format stored
        // `data.properties` as a JSON list. The API must surface it as an
        // object (thing_id => value) so the edit form can attach values by id
        // (writing string keys onto an array would be dropped in serialization).
        $user = $this->createTestUser()->getUser();
        if (!isset($user->thing_id) || !$user->thing_id) {
            $user->thing_id = $this->createUserThing($user);
            $user->save();
        }
        Sanctum::actingAs($user, ['*']);

        $thingId = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $thingId,
            'name'        => 'Legacy Dacha',
            'type'        => UUID::G_THING,
            'data'        => '{"properties":[]}',
            'owner'       => $user->thing_id,
            'public'      => 1,
            'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
        ]);

        $get = $this->getJson('/api/v1/object/' . $thingId);
        $get->assertStatus(200);
        $this->assertSame([], $get->json('data.data.properties'));
        // Geo extraction stays harmless for the legacy value.
        $this->assertSame([], $get->json('data.geo'));
    }

    public function testUpsertPreservesTranslationsWhenOmitted(): void
    {
        $user = $this->createTestUser()->getUser();
        $json = $this->createObject($user, [
            'name'              => 'остров',
            'name_translations' => ['lang' => 'ru', 'en' => 'island'],
        ]);
        $thingId = $json['data']['thing_id'];

        // Update WITHOUT translation fields — they must not be wiped
        $update = [
            'thing_id' => $thingId,
            'name'     => 'новое имя',
            'type'     => UUID::G_THING,
            'public'   => 1,
        ];
        $res = $this->actingAs($user, 'sanctum')->putJson('/api/v1/object/' . $thingId, $update);
        $res->assertStatus(200);

        $row = DB::table('things')->where('thing_id', $thingId)->first();
        $this->assertEquals(['lang' => 'ru', 'en' => 'island'], json_decode($row->name_translations, true));
        $this->assertEquals('новое имя', $row->name);
    }

    public function testUpsertUpdatesTranslationsWhenProvided(): void
    {
        $user = $this->createTestUser()->getUser();
        $json = $this->createObject($user, [
            'name'              => 'остров',
            'name_translations' => ['lang' => 'ru', 'en' => 'island'],
        ]);
        $thingId = $json['data']['thing_id'];

        $update = [
            'thing_id'          => $thingId,
            'name'              => 'остров',
            'name_translations' => ['lang' => 'ru', 'en' => 'island', 'de' => 'Insel'],
            'type'              => UUID::G_THING,
            'public'            => 1,
        ];
        $res = $this->actingAs($user, 'sanctum')->putJson('/api/v1/object/' . $thingId, $update);
        $res->assertStatus(200);

        $row = DB::table('things')->where('thing_id', $thingId)->first();
        $this->assertEquals(['lang' => 'ru', 'en' => 'island', 'de' => 'Insel'], json_decode($row->name_translations, true));
    }

    public function testSearchMatchesTranslationValues(): void
    {
        $user = $this->createTestUser()->getUser();
        $this->createObject($user, [
            'name'              => 'остров',
            'name_translations' => ['lang' => 'ru', 'en' => 'island'],
        ]);

        // A term that exists ONLY as an English translation must still match
        $res = $this->actingAs($user, 'sanctum')->postJson('/api/v1/object', ['search' => 'island']);
        $res->assertStatus(200);
        $names = collect($res->json('things'))->pluck('name');
        $this->assertTrue($names->contains('остров'), 'Expected "остров" to match search for "island"');
    }

    public function testSearchDoesNotMatchLangMetadataKey(): void
    {
        $user = $this->createTestUser()->getUser();
        $this->createObject($user, [
            'name'              => 'остров',
            'name_translations' => ['lang' => 'ru', 'en' => 'island'],
        ]);

        // "ru" appears only as the lang metadata VALUE — the key is skipped, and
        // the plain name doesn't contain "ru", so the object must NOT match.
        $res = $this->actingAs($user, 'sanctum')->postJson('/api/v1/object', ['search' => 'ru']);
        $res->assertStatus(200);
        $names = collect($res->json('things'))->pluck('name');
        $this->assertFalse($names->contains('остров'), 'The lang metadata key/value must not be searchable');
    }

    public function testBackwardCompatibleWithoutTranslations(): void
    {
        $user = $this->createTestUser()->getUser();
        $json = $this->createObject($user, [
            'name' => 'Plain Name',
        ]);

        $thingId = $json['data']['thing_id'];
        $row = DB::table('things')->where('thing_id', $thingId)->first();
        $this->assertNull($row->name_translations);
        $this->assertNull($row->description_translations);
        $this->assertEquals('Plain Name', $row->name);
    }

    public function testSeederCreatesLocalizationSystemObjects(): void
    {
        $this->assertDatabaseHas('things', ['thing_id' => UUID::PROPERTY_CLASS, 'type' => UUID::G_CLASS]);
        $this->assertDatabaseHas('things', ['thing_id' => UUID::LANGUAGE_CLASS, 'type' => UUID::G_CLASS]);
        $this->assertDatabaseHas('things', ['thing_id' => UUID::PROPERTY_APPLIES_TO, 'type' => UUID::G_LINK]);
        $this->assertDatabaseHas('things', ['thing_id' => UUID::LANG_EN]);
        $this->assertDatabaseHas('things', ['thing_id' => UUID::LANG_RU]);

        $en = DB::table('things')->where('thing_id', UUID::LANG_EN)->first();
        $this->assertEquals(['lang_code' => 'en'], json_decode($en->data, true));
    }
}
