<?php

namespace App\Console\Commands;

use App\Models\Classes\Anything;
use App\Models\Classes\Media;
use App\Models\Classes\MediaFile;
use Fokin\Facts\Data\UUID;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Jenssegers\ImageHash\ImageHash;
use Jenssegers\ImageHash\Implementations\DifferenceHash;

class tmpGeneratePhotoHashes extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'command:tmpGeneratePhotoHashes';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Generate hashes for all photos';


    /**
     * Execute the console command.
     *
     * @return mixed
     */
    public function handle()
    {
        $this->info('Processing image records ... ');
        $total = DB::table('photo_media')
            //->join('links', 'photo_media.thing_id', 'links.thing_id')
            ->count();
        $bar = $this->output->createProgressBar($total);
        $bar->start();
        $res = DB::table('photo_media')
            ->whereNull('phash')
            ->cursor();

        $hasher = new ImageHash(new DifferenceHash());

        foreach ($res as $row) {

            $extension = pathinfo($row->filename, PATHINFO_EXTENSION);
            switch (strtolower($extension)) {

                case 'jpg':
                case 'jpeg':
                case 'png':
                case 'tiff':
                case 'tif':
                case 'gif':
                case 'bmp':
                case 'mpo':
                case '':  // Some photos with empty extension
                    //$this->info($row->filename."\n");
                    $thumbPath = Anything::getThumbPathById($row->thing_id, false);
                    if (is_file($thumbPath)) {
                        $hash = $hasher->hash($thumbPath);
                        //echo $hash->toHex() . "\n";
                        DB::table('photo_media')
                            ->where('thing_id', $row->thing_id)
                            ->update(['phash' => $hash->toHex()]);
                    }
                    $bar->advance();
                    break;

                default:
                    $bar->advance();
                    continue 2;

            }


        }

        $bar->finish();
        $this->info("\nDone");
    }
}
