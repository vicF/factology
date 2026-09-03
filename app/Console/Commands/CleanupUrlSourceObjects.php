<?php

namespace App\Console\Commands;

use App\Models\Classes\Everything;
use App\Services\MediaLink\UrlMediaClassifier;
use Fokin\Facts\Data\UUID;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Remove the URL/domain-named source Things that older GEDCOM imports
 * materialised as SOUR records.
 *
 * Such sources are identifiable precisely: the old importer class-linked every
 * source to UUID::EVIDENCE (a link type, not a class) and every imported
 * record carries an IMPORTED_FROM provenance link. Nothing else in the app
 * classes things to EVIDENCE, so the candidate set is tight.
 *
 * Destructive — defaults to a dry run; pass --commit to actually delete.
 */
class CleanupUrlSourceObjects extends Command
{
    protected $signature = 'factology:cleanup-url-sources
                            {--commit : actually delete; without it, only print what would be done}';

    protected $description = 'Remove URL/domain-named source Things created by older GEDCOM imports';

    private const STRUCTURAL_LINK_TYPES = [
        'c217c185-742f-4a9f-8e69-acea2b4f5aea', // LINK_TO_CLASS
        '7e58df61-3f99-4a82-9f0d-555a56abfb69', // IMPORTED_FROM
        '361c19af-c011-4051-9329-49c75d1ca0fb', // LINK_TO_PARENT
    ];

    public function handle(): int
    {
        $commit = (bool) $this->option('commit');
        $candidates = $this->candidates();

        $this->info(sprintf('GEDCOM source candidates (classed to EVIDENCE + IMPORTED_FROM): %d', count($candidates)));

        $deleted = 0;
        $rehomed = 0;

        foreach ($candidates as $thing) {
            $name = (string) $thing->name;
            if (!$this->isJunkName($name)) {
                $this->line(sprintf('  KEEP    %s (%s) — not URL-like', $name, $thing->thing_id));
                continue;
            }

            $referrers = $this->referrers((string) $thing->thing_id);
            $url = $this->normalizeUrl($name);
            if ($referrers !== [] && $url === null) {
                $this->line(sprintf('  KEEP    %s (%s) — referenced but no usable URL', $name, $thing->thing_id));
                continue;
            }

            $action = $referrers === []
                ? 'orphan (no references)'
                : sprintf('re-home URL to %d referencing object(s)', count($referrers));
            $this->line(sprintf('  %s  %s (%s) — %s', $commit ? 'DELETE ' : 'WOULD-DELETE', $name, $thing->thing_id, $action));
            $deleted++;

            if (!$commit) {
                continue;
            }

            foreach ($referrers as $referrerId) {
                $this->addExternalLink($referrerId, (string) $url);
                $rehomed++;
            }
            DB::table('external_links')->where('thing_id', $thing->thing_id)->delete();
            Everything::deleteById($thing->thing_id);
        }

        $this->newLine();
        if ($commit) {
            $this->info(sprintf('Done — deleted %d junk source objects (%d URLs re-homed).', $deleted, $rehomed));
        } else {
            $this->info(sprintf('Dry run — %d junk objects would be deleted. Re-run with --commit to apply.', $deleted));
        }

        return 0;
    }

    /**
     * Things created by the older GEDCOM importers as sources. Both generations
     * of the importer wired the source Thing to the EVIDENCE node
     * (4eff773a…) — the legacy one via an "is inside"-style link to it, the
     * redesigned one by class-linking to it (EVIDENCE is really a link type).
     * Real objects never link TO the EVIDENCE node, so this is a tight set.
     */
    private function candidates(): array
    {
        return DB::table('things as t')
            ->where('t.type', UUID::G_THING)
            ->where('t.deleted', false)
            ->whereExists(function ($q) {
                $q->select(DB::raw(1))
                    ->from('links')
                    ->where('links.deleted', false)
                    ->where(function ($edge) {
                        $edge->whereColumn('links.one_thing_id', 't.thing_id')
                            ->where('links.other_thing_id', UUID::EVIDENCE);
                    })
                    ->orWhere(function ($edge) {
                        $edge->whereColumn('links.other_thing_id', 't.thing_id')
                            ->where('links.one_thing_id', UUID::EVIDENCE);
                    });
            })
            ->orderBy('t.name')
            ->get()
            ->all();
    }

    /**
     * A junk source is one whose name is a bare URL/domain/URL-fragment — the
     * things that should have been external links all along.
     */
    private function isJunkName(string $name): bool
    {
        if (UrlMediaClassifier::looksLikeUrl($name)) {
            return true;
        }
        // Domain-only strings that slipped in without www./http, e.g. "booksite.ru".
        return (bool) preg_match('#^[a-z0-9-]+(\.[a-z0-9-]+)+(/.*)?$#i', trim($name));
    }

    /**
     * Thing ids that reference the junk object via a non-structural link (i.e.
     * real user data pointing at it). The junk object's URL is re-homed onto
     * them before deletion.
     */
    private function referrers(string $thingId): array
    {
        $ids = [];
        $links = DB::table('links')
            ->where('deleted', false)
            ->where(function ($q) use ($thingId) {
                $q->where('one_thing_id', $thingId)
                    ->orWhere('other_thing_id', $thingId);
            })
            ->whereNotIn('link_type_id', self::STRUCTURAL_LINK_TYPES)
            ->get(['one_thing_id', 'other_thing_id']);

        foreach ($links as $link) {
            foreach ([$link->one_thing_id, $link->other_thing_id] as $endpoint) {
                $endpoint = (string) $endpoint;
                // The legacy "source is inside EVIDENCE" wiring is structural —
                // the EVIDENCE node is never a real referrer.
                if ($endpoint === $thingId || $endpoint === UUID::EVIDENCE) {
                    continue;
                }
                if ($this->isLiveThing($endpoint)) {
                    $ids[$endpoint] = true;
                }
            }
        }

        return array_keys($ids);
    }

    private function isLiveThing(string $thingId): bool
    {
        return DB::table('things')->where('thing_id', $thingId)->where('deleted', false)->exists();
    }

    /**
     * Turn the junk name into a usable external-link URL, or null when the name
     * cannot be interpreted as one (e.g. it is a file-ish fragment).
     */
    private function normalizeUrl(string $name): ?string
    {
        $name = trim($name);
        if (preg_match('#^https?://#i', $name)) {
            return $name;
        }
        // Bare domains ("az.lib.ru", "www.JPG") and www.-prefixed fragments.
        if (preg_match('#^www\.#i', $name) || preg_match('#^[a-z0-9-]+(\.[a-z0-9-]+)+(/.*)?$#i', $name)) {
            return 'http://' . $name;
        }
        return null;
    }

    private function addExternalLink(string $thingId, string $url): void
    {
        $exists = DB::table('external_links')
            ->where('thing_id', $thingId)
            ->where('url', $url)
            ->exists();
        if ($exists) {
            return;
        }
        DB::table('external_links')->insert([
            'id'       => (string) \Illuminate\Support\Str::uuid(),
            'thing_id' => $thingId,
            'url'      => $url,
        ]);
    }
}
