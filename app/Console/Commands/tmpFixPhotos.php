<?php

namespace App\Console\Commands;

use App\Models\Classes\Media;
use App\Models\Classes\MediaFile;
use Fokin\Facts\Data\UUID;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class tmpFixPhotos extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'command:tmpFixPhotos';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Fix already added photos to link them to media';


    /**
     * Execute the console command.
     *
     * @return mixed
     */
    public function handle()
    {
        $this->info('Processing image records ... ');
        $total = DB::table('photo_files')->count();
        $bar = $this->output->createProgressBar($total);
        $bar->start();
        $res = DB::table('photo_files')
            ->leftJoin('photo_media', 'photo_media.thing_id', 'photo_files.media_thing_id')
            ->cursor();

        foreach ($res as $row) {
            $extension = pathinfo($row->filename, PATHINFO_EXTENSION);
            switch (strtolower($extension)) {
                case 'mpeg':
                case 'avi':
                case 'mp4':
                case 'mov':
                case 'wmv':
                case 'm4v':
                case '3gp':
                case 'flv':
                case 'mpg':
                case 'mod':
                case 'mkv':

                    $class = UUID::VIDEO;
                    break;
                case 'jpg':
                case 'jpeg':
                case 'png':
                case 'tiff':
                case 'tif':
                case 'gif':
                case 'bmp':
                case 'mpo':
                case '':  // Some photos with empty extension
                    $class = UUID::PHOTO;
                    break;
                case 'tmp':
                    continue 2;
                case 'dthumb':
                    $class = null;
                    break;
                default:
                    continue 2;
                    throw new \RuntimeException('Unexpected extension ' . $extension . "\n" . print_r($row, 1));
            }
            $Media = Media::createFromId($row->thing_id);
            // Check if file object exists
            if (empty($row->file_thing_id)) {
                // Create file object
                if ($extension === 'dthumb') { // Added by mistake
                    Media::deleteById($row->thing_id);
                    $bar->advance();
                    continue;
                }

                $MediaFile = (new MediaFile())
                    ->name($row->filename)
                    ->description('File "' . $row->filename . '" in folder "' . $row->path . '"')
                    ->start($row->exif_date)
                    ->source_id($row->thing_id)
                    ->folder_id($row->folder_id)
                    ->createWithLinks();

            } else {
                //
                try {
                    $MediaFile = MediaFile::createFromId($row->file_thing_id);
                } catch (\RuntimeException $e) {
                    if ($e->getCode() === 404) {
                        // May be file was deleted
                        throw new \RuntimeException('No thing id ' . $row->file_thing_id);
                    }
                }
            }
            $MediaFile->fix();
            $Media->fix($class);
            $bar->advance();
        }

        $bar->finish();
        $this->info("\nDone");
    }
}
