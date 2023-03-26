<?php
/**
 * facts
 * User: fokin
 * Created: 2019-08-30
 */

namespace Fokin\PhotoFacts\Controllers;


use App\Eloquent\Link;
use App\Models\Classes\Media;
use App\Models\Classes\Anything;
use Fokin\Facts\Data\UUID;
use Fokin\PhotoFacts\Models\Photos;
use Illuminate\Support\Facades\DB;


class PhotoController
{
    public function index()
    {
        $Photos = new Photos();
        return view('photos', [
            'photos' => $Photos::selectMedia(@$_REQUEST['page'], @$_REQUEST['year'], @$_REQUEST['month']),
            'total'  => $Photos->count(),
            'years'  => $Photos->selectYears(),
            'months' => $Photos->selectMonths(@$_REQUEST['year']),
        ]);
    }

    public function save()
    {
        foreach ($_POST['event'] as $event) {
            if (!empty($event['photo']) && count(@$event['photo']) > 0) {
                if (!empty($event['name'])) {
                    // Create new event and assign photos to it
                    $event['type'] = UUID::G_THING;
                    $event['start'] = Anything::dateToDb($event['start']);
                    $event['end'] = Anything::dateToDb($event['end']);
                    $EventObject = new Anything($event);
                    $EventObject->save();
                    $EventObject->setClass($event['class']);
                    $EventObject->symlinkToThumb($event['photo'][0]);
                    foreach ($event['photo'] as $photoId) {
                        // Link photo to event
                        $link = new Link();
                        $link->thing_id = $photoId;
                        $link->link_type_id = UUID::EVIDENCE;
                        $link->other_thing_id = $EventObject->thing_id;
                        $link->translation = 'На фото: ' . $event['name'];
                        $link->save();
                    }
                } elseif (!empty($event['assign_to'])) {
                    // Assign photos to existing event
                    $existingEvent = Anything::CreateFromId($event['assign_to']);
                    //$event['start'] = $event['start'] ?: $existingEvent->start;
                    /** @noinspection NestedTernaryOperatorInspection */
                    //$event['end'] = ($event['end'] ?: $existingEvent->end) ?: $existingEvent->start;
                    foreach ($event['photo'] as $photoId) {
                        $photo = Media::createFromId($photoId);
                        if (!empty($event['fixdates'])) {
                            // if (!empty($event['start'])) {
                            $photo->start = $existingEvent->start;
                            //}
                            //if (!empty($event['end'])) {
                            $photo->end = $existingEvent->end;
                            //}
                            $photo->save();
                        }
                        /** @noinspection IsEmptyFunctionUsageInspection */
                        //if (!empty($existingEvent)) {
                        $photo->setLink(UUID::EVIDENCE, $event['assign_to'], 'Photo of ' . $existingEvent->name);
                        //}
                    }
                }
            }
        }
        return $this->index();
    }

    public function duplicates()
    {
        $res = DB::select(DB::raw('SELECT * 
                            FROM photo_media
       INNER JOIN (SELECT phash
                   FROM   photo_media
                LEFT JOIN things on photo_media.thing_id = things.thing_id
                   WHERE phash != 0x00000000000000000000000000000000 
                        AND media_deleted = 0
                        AND things.deleted = 0
                   GROUP  BY phash
                   HAVING COUNT(photo_media.thing_id) > 1) dup
               ON photo_media.phash = dup.phash limit 500 '));
        $total_phash_dupes = DB::select(DB::raw('SELECT count(*) as c
                            FROM photo_media
       INNER JOIN (SELECT phash
                   FROM   photo_media
                    LEFT JOIN things on photo_media.thing_id = things.thing_id
                   WHERE phash != 0x00000000000000000000000000000000
                        AND media_deleted = 0
                        AND things.deleted = 0
                   GROUP  BY phash
                   HAVING COUNT(photo_media.thing_id) > 1) dup
               ON photo_media.phash = dup.phash '))[0]->c;
        // Group by phash
        $phash_dups = [];
        foreach ($res as $photo) {
            $phash_dups[$photo->phash][] = $photo;
        }
        return view('photos/duplicates', [
            'phash_dups'        => $phash_dups,
            'total_phash_dupes' => $total_phash_dupes,
        ]);
    }


    public function nameDuplicates()
    {
        $res = DB::select(DB::raw('select * from photo_media where name in (
    select file_name from table
    group by email having count(*) > 1
) limit 500 '));
        $total_phash_dupes = DB::select(DB::raw('SELECT count(*) as c
                            FROM photo_media
       INNER JOIN (SELECT phash
                   FROM   photo_media
                    LEFT JOIN things on photo_media.thing_id = things.thing_id
                   WHERE phash != 0x00000000000000000000000000000000
                        AND media_deleted = 0
                        AND things.deleted = 0
                   GROUP  BY phash
                   HAVING COUNT(photo_media.thing_id) > 1) dup
               ON photo_media.phash = dup.phash '))[0]->c;
        // Group by phash
        $phash_dups = [];
        foreach ($res as $photo) {
            $phash_dups[$photo->phash][] = $photo;
        }
        return view('photos/duplicates', [
            'phash_dups'        => $phash_dups,
            'total_phash_dupes' => $total_phash_dupes,
        ]);
    }
}