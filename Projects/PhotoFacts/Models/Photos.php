<?php
/**
 * facts
 * User: fokin
 * Created: 2019-08-30
 */

namespace Fokin\PhotoFacts\Models;


use App\Eloquent\PhotoFile;
use App\Eloquent\Link;
use App\Eloquent\PhotoMedia;
use App\Eloquent\Thing;
use App\Models\Classes\Media;
use App\Models\Classes\MediaFile;
use App\Models\Classes\Anything;
use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;


class Photos
{
    public const DEFAULT_PAGE_SIZE = 400;

    protected $sourcePhotosQuery;
    protected $objects;


    public function __construct()
    {

    }

    protected static function _getMediaQuery($page = null, $size = null, $year = null, $month = null)
    {
        if ($size === null) {
            $size = self::DEFAULT_PAGE_SIZE;
        }

        $query = DB::table('photo_media');

        if ($month !== null && $year !== null) {
            $query->where('event_date', 'LIKE', $year . str_pad($month, 2, '0', STR_PAD_LEFT) . '________');
        } else
            if ($year !== null) {
                //$query->whereBetween('event_date', [Anything::dateToDb($year.'-01-01'), Anything::dateToDb($year.'-12-31')]);
                $query->where('event_date', 'LIKE', $year . '__________');
                //$query->where(DB::Raw('year(event_date)'), $year);
            }
        if ($page !== null) {
            $query->orderBy('event_date')
                ->skip($page * $size);
        }
        $query->limit($size)
            ->join('things', 'photo_media.thing_id', 'things.thing_id')
            ->auth();

        return $query;

        return DB::table(static function ($query) use ($page, $size, $year, $month) {
            $query = $query->from('photo_media');
            if ($month !== null && $year !== null) {
                $query->where('event_date', 'LIKE', $year . str_pad($month, 2, '0', STR_PAD_LEFT) . '________');
            } else
                if ($year !== null) {
                    //$query->whereBetween('event_date', [Anything::dateToDb($year.'-01-01'), Anything::dateToDb($year.'-12-31')]);
                    $query->where('event_date', 'LIKE', $year . '__________');
                    //$query->where(DB::Raw('year(event_date)'), $year);
                }
            if ($page !== null) {
                $query->orderBy('event_date')
                    ->skip($page * $size);
            }
            $query->limit($size);

        }, 'photo_media')
            ->join('things', 'photo_media.thing_id', 'things.thing_id')
            ->auth();
        //->where(Link::TYPE, UUID::LINK_TO_CLASS)
        //->where(Link::TARGET, UUID::ORIGINAL_FILE)
        ;
    }

    public function count()
    {
        return DB::table('photo_media')
            ->join('things', 'photo_media.thing_id', 'things.thing_id')
            ->auth()->count();
        //return self::_getMediaQuery()->count();
    }

    public function selectYears()
    {
        return DB::table('photo_media')
            ->select([DB::raw('year(event_date) as year')])
            ->orderBy('year')
            ->distinct()
            ->join('things', 'photo_media.thing_id', 'things.thing_id')
            ->auth()
            ->pluck('year')
            ->toArray();
    }

    public function selectMonths($year = null)
    {
        if (empty($year)) {
            return [];
        }
        return DB::table('photo_media')
            ->select([DB::raw('month(event_date) as month')])
            ->where('event_date', 'LIKE', $year . '__________')
            ->orderBy('month')
            ->distinct()
            ->join('things', 'photo_media.thing_id', 'things.thing_id')
            ->auth()
            ->pluck('month')
            ->toArray();
    }

    public static function selectMedia($page = 0, $year = null, $month = 1)
    {
        //DB::statement('SET sort_buffer_size = 1024 * 1024 * 4 ');
        // @TODO can be rewritten using "with(" for defined relationships (https://blog.pusher.com/advanced-laravel-eloquent-usage/)
        $query = self::_getMediaQuery((int)$page, null, $year, $month);

        /*if ($mediaId !== null) {
            $query->where('photo_media.thing_id', $mediaId);
        } else {*/
        $query->orderBy('photo_media.event_date')
            //->skip($page * self::DEFAULT_PAGE_SIZE)
            //->limit(self::DEFAULT_PAGE_SIZE)
        ;
        $query->leftJoin('links', static function ($join) {
            $join->on('photo_media.thing_id', 'links.thing_id');
            $join->on('links.link_type_id', '=', DB::raw("'" . UUID::EVIDENCE . "'"));
        })
            ->leftJoin('things AS events', 'links.other_thing_id', 'events.thing_id')
            ->selectRaw('photo_media.* , things.start as start, things.start_variety, events.name as event_name, events.description as event_description, events.start as event_start, events.end as event_end, events.thing_id as event_thing_id')
            ->orderBy('events.name')
            ->orderBy('things.description');
        //}


        $ObjectData =
            $query->get()
                ->keyBy(Thing::ID);
        $ids = $ObjectData->pluck(Thing::ID);
        $ObjectData = $ObjectData->toArray();
        foreach ($ObjectData as &$row) {
            //$row->event_date = Anything::dateFromDb($row->event_date, 'Europe/Moscow');
            $row->start_date = Anything::dateFromDb($row->start);
        }

        $copiesData = DB::table('photo_files')
            ->whereIn('photo_files.media_thing_id', $ids)
            //->where(Link::TYPE, UUID::LINK_TO_SOURCE)
            //->leftJoin('things', Thing::_ID, Link::_THING_ID)
            //->leftJoin('photo_files', PhotoFile::_ID, Link::_THING_ID)
            //->leftJoin('links', 'photo_files.folder_id', 'links.thing_id')
            ->leftJoin('links', static function ($join) {
                $join->on('links.thing_id', 'photo_files.folder_id');
                $join->on('links.link_type_id', '=', DB::raw("'922cca80-a0ba-4a5e-8344-769f083f0e72'"));

            })
            ->leftJoin('things', 'things.thing_id', 'links.other_thing_id')
            ->select('photo_files.*', 'links.other_thing_id as otid', 'things.name AS storage_name')
            ->get();
        foreach ($copiesData as $file) {
            $id = $file->{'media_thing_id'};
            $ObjectData[$id]->files[] = $file;
        }
        return $ObjectData;
    }

    /**
     * @param $data
     * @return array[]
     */
    public static function scanPhotos($data)
    {
        $files = $data['files'];

        $result = [];
        foreach ($files as $file) {
            $result[] = self::addPhoto($file);
        }

        return [
            'result' => $result,
        ];
    }

    /**
     * @param $data
     * @return array[]
     */
    public static function checkPhotos($data)
    {
        $files = $data['files'];

        $result = [];
        foreach ($files as $file) {
            $res = self::checkPhoto($file);
            $res['crc'] = $file['crc'];
            $res['size'] = $file['size'];
            $result[] = $res;
        }

        return [
            'result' => $result,
        ];
    }

    public static function markDeleted($session, $folder_id)
    {
        Log::info('Marking deleted files');
        DB::table('photo_files')
            ->where('folder_id', $folder_id)
            ->where('last_seen', '!=', $session)
            ->update(['deleted' => true]);
        DB::statement('
            UPDATE photo_media 
                SET deleted=1 
                WHERE thing_id 
                IN (
                    SELECT thing_id 
                    FROM (
                        SELECT m.thing_id 
                        FROM `photo_media` as m 
                        LEFT JOIN photo_files on m.thing_id = photo_files.media_thing_id 
                            AND photo_files.deleted = 0 
                        WHERE photo_files.id IS NULL) as t)');
    }

    /**
     * @param array $exif
     * @return array
     */
    public static function clearExif($exif)
    {
        if (!is_array($exif)) {
            return $exif;
        }
        $res = [];
        foreach ($exif as $tag => $value) {
            if ((!is_string($value) || strlen($value) < 100) && strpos($tag, 'UndefinedTag') !== 0) {
                $res[$tag] = $value;
            }
        }
        return $res;
    }

    public static function addPhoto($file)
    {
        return DB::transaction(static function () use ($file) {
            static $folderId;
            static $folderName;
            $tmpUpdatePHash = true;  // Indicates that new phash sent from client should be set to best matching file
            Log::debug('Adding photo: ' . print_r($file, 1));
            $log = [];
            $file['filename'] = $file['name'];
            /*if ($file['name'] == 'seravin.jpg') { // This file causes seg fault
                echo '';
            }*/
            $eventDate = Anything::dateToDb($file['event_date']['date'], $file['event_date']['timezone']);
            $file['event_date'] = $file['start'] = $eventDate;
            if (!empty($file['exif_date'])) {
                $file['exif_date'] = Anything::dateToDb($file['exif_date']['date'], $file['exif_date']['timezone']);
            }
            $file['file_date'] = Anything::dateToDb($file['file_date']['date'], $file['file_date']['timezone']);
            $file['exif'] = self::clearExif($file['exif']);
            if (empty($file['description'])) {
                if (@$folderId != $file['folder_id']) {
                    $Folder = Anything::CreateFromId($file['folder_id']);
                    $folderName = $Folder->name;
                }
                [$mime1] = @explode('/', $file['mime']);
                if (empty($mime1)) {
                    $mime1 = 'File';
                }
                $file['description'] = ucfirst($mime1) . ' in folder "' . $folderName . '/' . $file['path'] . '"';
            }
            $type = MediaFile::getMimeTypeClassId($file['mime']);
            if (is_countable(@$file['exif']['GPSLatitude']) && is_countable(@$file['exif']['GPSLongitude'])) {
                $file['latitude'] = Photos::getGps(@$file['exif']['GPSLatitude'], @$file['exif']['GPSLongitudeRef']);
                $file['longitude'] = Photos::getGps(@$file['exif']['GPSLongitude'], @$file['exif']['GPSLatitudeRef']);
            } else {
                $file['latitude'] = null;
                $file['longitude'] = null;
            }
            // Next is for debugging
            /*$filesWithSameName = DB::table('photo_files')
                ->select('photo_files.*', 'photo_media.exif', 'photo_media.filename as source_filename',
                    'photo_media.latitude', 'photo_media.longitude', 'photo_media.exif_date', 'things.start', 'things.name', 'photo_media.phash')
                ->join('photo_media', 'photo_files.media_thing_id', 'photo_media.thing_id')
                ->join('things', 'photo_media.thing_id', 'things.thing_id')
                ->where('photo_files.filename', $file['name'])
                ->where('folder_id', $file['folder_id'])
                ->get()->toArray()

                //->where('photo_media.sha256', $sha256)//->where('deleted', 0)
            ;

            $filesWithSameCrc = DB::table('photo_files')
                ->select('photo_files.*', 'photo_media.exif', 'photo_media.filename as source_filename',
                    'photo_media.latitude', 'photo_media.longitude', 'photo_media.exif_date', 'things.start', 'things.name', 'photo_media.phash')
                ->join('photo_media', 'photo_files.media_thing_id', 'photo_media.thing_id')
                ->join('things', 'photo_media.thing_id', 'things.thing_id')
                ->where('photo_files.size', $file['size'])
                ->where('photo_files.crc', $file['crc'])
                ->where('folder_id', $file['folder_id'])
                ->get()->toArray();
                //->where('photo_media.sha256', $sha256)//->where('deleted', 0)
            ;*/

            // Check if this file is already known to the system
            $filesFound = MediaFile::findMatchingFilesByPath($file);  // Use folder_id, path and name. This identifies placement of file
            //$filesFound = MediaFile::findByParameters($file['size'], $file['sha256'], $file['folder_id'], $file['path']);
            if (count($filesFound) > 1) {
                // Delete extra files records
                $filesToDelete = array_slice($filesFound, 1);
                $filesFound = [$filesFound[0]];
                foreach ($filesToDelete as $fileToDelete) {
                    MediaFile::deleteById($fileToDelete->file_thing_id);
                }
            }
            if (count($filesFound) === 1) {
                // System already knows about this file. No much action needed
                $fileThingId = $filesFound[0]->file_thing_id;
                MediaFile::seenFile($filesFound[0]->id);
                $mediaThingId = $filesFound[0]->media_thing_id;
                /*if (!empty($file['exif']) && empty($filesFound[0]->exif)) {
                    // This is the case when exif was not added in older version. @TODO this is temporary
                    DB::table('photo_files')->where('id', $filesFound[0]->id)->update(
                        ['exif' => json_encode($file['exif'])]
                    );
                }*/

            } else if (count($filesFound) > 1) {
                // This is unexpected. Duplicate file may have been added by mistake.
                throw new \RuntimeException('More than one matching file for given folder. Params: ' . print_r($file, 1) . ' Results:' . print_r($filesFound, 1));
            } else {
                // No matching file. Need to add record
                // But first check if matching Media exists.
                // Lets search for other matching files and get media link from them
                $otherFilesFound = MediaFile::findByParameters($file['size'], $file['crc']);
                // We can additionally verify by EXIF if it exists
                // Let's find the best match, even though most probably all files match the same source media
                if (count($otherFilesFound) > 0) {
                    foreach ($otherFilesFound as &$testedFile) {
                        $testedFile->rating = 0;
                        // Test by EXIF
                        if (!empty($testedFile->exif) && !empty($file['exif'])) {
                            $fileExif = json_encode($file['exif'], JSON_UNESCAPED_UNICODE);
                            // Copies of photos should have the same exifs even if photo was modified
                            if (strlen($testedFile->exif) > 60 && strlen($fileExif) > 60) {  // @TODO not sure if this test is worth. The idea is that short exif data may be autogenerated from file creation date. But I later changed code
                                // This is more accurate case
                                if ($testedFile->exif === $fileExif) {
                                    $testedFile->rating += 5; // This is the best evidence that files are the same
                                } else {
                                    similar_text($testedFile->exif, $fileExif, $similarity);
                                    {
                                        if ($similarity > 95) {
                                            $testedFile->rating += 4; // Still good match
                                        } elseif ($similarity > 90) {
                                            $testedFile->rating += 3;
                                        } elseif ($similarity > 85) {
                                            $testedFile->rating += 2;
                                        } elseif ($similarity > 80) {
                                            $testedFile['rating'] += 1;
                                        } elseif ($similarity > 75) {
                                            // No rating change
                                        } elseif ($similarity < 75) {
                                            $testedFile->rating -= 4; // Still possible that exif was edited
                                        }
                                    }

                                }
                            } else if ($testedFile->exif === $fileExif) {
                                $testedFile->rating++; // So rating change is small
                            }
                        }

                        // Test by file name
                        if ($testedFile->filename === $file['filename'] || @$testedFile->name === $file['filename']) {
                            $testedFile->rating += 2;
                        }

                        // Test by date
                        if ($testedFile->start === $eventDate || $testedFile->exif_date === $eventDate) {
                            $testedFile->rating += 2;
                        }
                        // Test by GPS
                        if (null !== $testedFile->latitude && null !== $testedFile->longitude && $testedFile->latitude === $file['latitude'] && $testedFile->longitude === $file['longitude']) {
                            $testedFile->rating++; // Different photos may be taken in the same place
                        }


                    }

                    // Find file with best rating
                    usort($otherFilesFound, static function ($item1, $item2) {
                        return $item1->rating <=> $item2->rating;
                    });
                    // We hope that best matching file has link to appropriate media
                    if ($otherFilesFound[0]->rating >= 1) {
                        $mediaThingId = $otherFilesFound[0]->media_thing_id;
                    }
                } else {
                    // Try to find media records. @TODO this is probably temporary for media records that don't have a single file copy
                    $mediaFilesFound = Media::findByParameters($file['size'], $file['crc']);  /// @TODO Why this is so slow???
                    if (count($mediaFilesFound) > 0) {
                        foreach ($mediaFilesFound as &$testedFile) {

                            if (!property_exists($testedFile, 'rating')) {
                                $testedFile->rating = 0;
                            }

                            // Test by file name
                            if ($testedFile->filename === $file['filename'] || @$testedFile->name === $file['filename']) {
                                $testedFile->rating += 2;
                            }

                            // Test by date
                            if ($testedFile->exif_date === $eventDate) {
                                $testedFile->rating += 2;
                            }
                            // Test by GPS
                            if (null !== $testedFile->latitude && null !== $testedFile->longitude && $testedFile->latitude === $file['latitude'] && $testedFile->longitude === $file['longitude']) {
                                $testedFile->rating += 1; // Different photos may be taken in the same place
                            }
                        }
                        // Find media file with best rating
                        usort($mediaFilesFound, static function ($item1, $item2) {
                            return $item1->rating <=> $item2->rating;
                        });
                        // We hope that best matching file has link to appropriate media
                        if ($mediaFilesFound[0]->rating >= 1) {
                            $bestMediaFileFound = $mediaFilesFound[0];
                            $mediaThingId = $mediaFilesFound[0]->thing_id;
                        }
                    }
                }
                // This file is not registered in the database
                // It may be completely new file or a copy of known file


            }
            if (empty($mediaThingId)) {
                // No matching files. Seems we have completely new media
                // Have to create media record
                $Media = Media::CreateFromData($file);
                $Media->class_id = $type;
                //$Media->latitude = $file['latitude'];
                //$Media->longitude = $file['longitude'];
                //$Media->source_id = $mediaThingId;
                $Media->createWithLinks();
                $mediaThingId = $Media->thing_id;
            } else {

                $Media = Media::createFromId($mediaThingId);
                //if ($Media->start > $file['start']) {  // We take the oldest date. If another copy is older, older date is closer to real
                $Media->start = $file['event_date']; // @TODO This is temporary to fix wrong values!!!
                $Media->save(); // @TODO This is temporary to fix wrong values!!!
                //}
                $update = [
                    'latitude'   => @$file['latitude'],
                    'longitude'  => @$file['longitude'],
                    'event_date' => $file['event_date'],
                ];
                if ($file['exif_date'] !== null) {
                    $update['exif_date'] = $file['exif_date'];
                } else {
                    $update['exif_date'] = $file['file_date'];
                }
                if (!empty($file['exif'])) {
                    $update['exif'] = $file['exif'];
                }
                if (!empty($file['sha256']) && empty($Media->sha256)) {
                    $update['sha256'] = $file['sha256'];
                }
                if ($tmpUpdatePHash) {
                    $update['phash'] = $file['phash'];
                }
                DB::table('photo_media')->where('thing_id', $mediaThingId)->update($update); // This is additional update for new fields
                /*if (!empty($file['exif']) && empty($Media->exif)) {
                    // This is the case when exif was not added in older version. @TODO this is temporary

                    DB::table('photo_media')->where('thing_id', $mediaThingId)->update(
                        [
                            'exif'      => json_encode($file['exif'], JSON_UNESCAPED_UNICODE),
                            'latitude'  => @$file['latitude'],
                            'longitude' => @$file['longitude'],
                        ]
                    );
                } else {
                    DB::table('photo_media')->where('thing_id', $mediaThingId)->update(
                        [
                            'exif' => null,
                        ]
                    );
                }*/
            }
            if (empty($fileThingId)) {
                // Now we have media id and have to create new file record and link it to media
                $MediaFile = MediaFile::CreateFromData($file);
                $MediaFile->source_id = $mediaThingId;
                $MediaFile->source_name = $Media->name; // This is critical as inside transaction this name yet can not be read from the database
                $MediaFile->createWithLinks();
                $fileThingId = $MediaFile->thing_id;
            } else {
                // temporary update
                DB::table('photo_files')
                    ->where('file_thing_id', $fileThingId)
                    ->update(['ctime' => $file['ctime']]);
            }

            $mediaThumbPath = Media::getThumbPathById($mediaThingId, false);  // Path for media
            $thumbRequired = !is_file($mediaThumbPath);  // Media thumb should be file, not link
            //$thumbRequired = true; // @TODO This is temporary to regenerate all thumbs for the case of crc wrong matches conflicts !!!
            if (!$thumbRequired) {
                // If there is existing file for media we may symlink other file thumb to it
                ($MediaFile ?? MediaFile::CreateFromId($fileThingId))->symlinkToThumb($mediaThingId);
            } else {
                // link to temporary thumbs
                ($Media ?? Media::CreateFromId($fileThingId))->symlinkToThumb($type); // Link to class thumb
                ($MediaFile ?? MediaFile::CreateFromId($fileThingId))->symlinkToThumb($mediaThingId);  // Link file to media
            }
            return [
                'log'                => $log,
                'thumbnail_required' => $thumbRequired,
                'path'               => $file['path'],
                'name'               => $file['name'],
                'thing_id'           => $fileThingId,
            ];
        });
    }

    public static function checkPhoto($file)
    {
        static $folderId;
        static $folderName;
        $log = [];
        $file['filename'] = $file['name'];
        $dateTime = Anything::dateToDb($file['date']['date'], $file['date']['timezone']);
        $file['start'] = $dateTime;

        [$mime1] = @explode('/', $file['mime']);
        if (empty($mime1)) {
            $mime1 = 'File';
        }

        $type = MediaFile::getMimeTypeClassId($file['mime']);
        if (is_countable(@$file['exif']['GPSLatitude']) && is_countable(@$file['exif']['GPSLongitude'])) {
            $file['latitude'] = Photos::getGps(@$file['exif']['GPSLatitude'], @$file['exif']['GPSLongitudeRef']);
            $file['longitude'] = Photos::getGps(@$file['exif']['GPSLongitude'], @$file['exif']['GPSLatitudeRef']);
        }
        // Check if this file is already known to the system @todo Add search by name and by exact date (File could have been rotated or edited)
        $mediaFilesFound = MediaFile::findSimilarByParameters($file['size'], $file['crc'], $file['name']);
        if (!empty($file['phash'])) {
            $similarFiles = MediaFile::findByPhash($file['phash']);
        }
        /*if (count($mediaFilesFound) >= 1) {
            // System already knows about this file. No much action needed
            $fileThingId = $mediaFilesFound[0]->file_thing_id;
            
            $mediaThingId = $mediaFilesFound[0]->thing_id;
        } else {
            // No matching file. Need to add record
            // But first check if matching Media exists.
            // Lets search for other matching files and get media link from them
            $otherFilesFound = MediaFile::findByParameters($file['size'], $file['crc']);
            // We can additionally verify by EXIF if it exists
            // Let's find the best match, even though most probably all files match the same source media
            if (count($otherFilesFound) > 0) {
                foreach ($otherFilesFound as &$testedFile) {
                    $testedFile->rating = 0;
                    // Test by EXIF
                    if (!empty($testedFile->exif) && !empty($file['exif'])) {
                        // Copies of photos should have the same exifs even if photo was modified
                        if (strlen($testedFile->exif) > 60 && strlen(json_encode($file['exif'])) > 60) {  // @TODO not sure if this test is worth. The idea is that short exif data may be autogenerated from file creation date. But I later changed code
                            // This is more accurate case
                            if ($testedFile->exif === $file['exif']) {
                                $testedFile->rating += 5; // This is the best evidence that files are the same
                            } else {
                                similar_text($testedFile->exif, $file['exif'], $similarity);
                                {
                                    if ($similarity > 95) {
                                        $testedFile->rating += 4; // Still good match
                                    } elseif ($similarity > 90) {
                                        $testedFile->rating += 3;
                                    } elseif ($similarity > 85) {
                                        $testedFile->rating += 2;
                                    } elseif ($similarity > 80) {
                                        $testedFile['rating'] += 1;
                                    } elseif ($similarity > 75) {
                                        // No rating change
                                    } elseif ($similarity < 75) {
                                        $testedFile->rating -= 4; // Still possible that exif was edited
                                    }
                                }

                            }
                        } else if ($testedFile->exif === $file['exif']) {
                            $testedFile->rating++; // So rating change is small
                        }
                    }

                    // Test by file name
                    if ($testedFile->filename === $file['filename'] || $testedFile->name === $file['filename']) {
                        $testedFile->rating += 2;
                    }

                    // Test by date
                    if ($testedFile->start === $dateTime || $testedFile->exif_date === $dateTime) {
                        $testedFile->rating += 2;
                    }
                    // Test by GPS
                    if (null !== $testedFile->latitude && null !== $testedFile->longitude && $testedFile->latitude === $file['latitude'] && $testedFile->longitude === $file['longitude']) {
                        $testedFile->rating++; // Different photos may be taken in the same place
                    }


                }

                // Find file with best rating
                usort($otherFilesFound, static function ($item1, $item2) {
                    return $item1->rating <=> $item2->rating;
                });
                // We hope that best matching file has link to appropriate media
                if ($otherFilesFound[0]->rating >= 1) {
                    $mediaThingId = $otherFilesFound[0]->thing_id;
                }
            } else {
                // Try to find media records. @TODO this is probably temporary for media records that don't have a single file copy
                $mediaFilesFound = Media::findByParameters($file['size'], $file['crc']);
                if (count($mediaFilesFound) > 0) {
                    foreach ($mediaFilesFound as &$testedFile) {

                        if (!property_exists($testedFile, 'rating')) {
                            $testedFile->rating = 0;
                        }

                        // Test by file name
                        if ($testedFile->filename === $file['filename'] || $testedFile->name === $file['filename']) {
                            $testedFile->rating += 2;
                        }

                        // Test by date
                        if ($testedFile->exif_date === $dateTime) {
                            $testedFile->rating += 2;
                        }
                        // Test by GPS
                        if (null !== $testedFile['latitude'] && null !== $testedFile['longitude'] && $testedFile['latitude'] === $file['latitude'] && $testedFile['longitude'] === $file['longitude']) {
                            $testedFile['rating'] += 1; // Different photos may be taken in the same place
                        }
                    }
                    // Find media file with best rating
                    usort($mediaFilesFound, static function ($item1, $item2) {
                        return $item1->rating <=> $item2->rating;
                    });
                    // We hope that best matching file has link to appropriate media
                    if ($mediaFilesFound[0]->rating >= 1) {
                        $bestMediaFileFound = $mediaFilesFound[0];
                        $mediaThingId = $mediaFilesFound[0]->thing_id;
                    }
                }
            }
            // This file is not registered in the database
            // It may be completely new file or a copy of known file


        }*/


        //$mediaThumbPath = Media::getThumbPathById($mediaThingId, false);  // Path for media

        return [
            'log'     => $log,
            'path'    => $file['path'],
            'name'    => $file['name'],
            'phash'   => @$file['phash'],
            'crc'     => $file['crc'],
            'files'   => $mediaFilesFound,
            'similar' => @$similarFiles,
        ];

    }


    public static function getGps($exifCoord, $hemi)
    {
        $degrees = count($exifCoord) > 0 ? self::gps2Num($exifCoord[0]) : 0;
        $minutes = count($exifCoord) > 1 ? self::gps2Num($exifCoord[1]) : 0;
        $seconds = count($exifCoord) > 2 ? self::gps2Num($exifCoord[2]) : 0;

        $flip = ($hemi === 'W' or $hemi === 'S') ? -1 : 1;
        return $flip * ($degrees + $minutes / 60 + $seconds / 3600);

    }

    public static function gps2Num($coordPart)
    {

        $parts = explode('/', $coordPart);

        if (count($parts) <= 0)
            return 0;

        if (count($parts) === 1) {
            return $parts[0];
        }

        return (float)$parts[0] / (float)$parts[1];
    }
}