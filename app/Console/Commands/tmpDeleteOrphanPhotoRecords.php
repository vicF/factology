<?php

namespace App\Console\Commands;

use App\Models\Classes\Media;
use App\Models\Classes\MediaFile;
use Fokin\Facts\Data\UUID;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class tmpDeleteOrphanPhotoRecords extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'command:tmpDeleteOrphanPhotoRecords';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Remove records created by mistake';


    /**
     * Execute the console command.
     *
     * @return mixed
     */
    public function handle()
    {
        $this->info('Processing image records ... ');
        /*
         * SELECT * FROM `links`
LEFT JOIN photo_files on file_thing_id = links.thing_id
WHERE link_type_id = 'd92fd5cd-ca65-41cb-879e-e87c0450fecd' AND id is NULL
         */
        $query = DB::table('links')
            ->select('links.*')
            ->leftJoin('photo_files', 'links.thing_id', 'file_thing_id')
            ->where('link_type_id', UUID::LINK_TO_SOURCE)
            ->whereNull('id');
        $total = $query->count();
        $bar = $this->output->createProgressBar($total);
        $bar->start();
        foreach ($query->cursor() as $row) {
            $MediaFile = MediaFile::createFromId($row->thing_id);
            $MediaFile->delete();
            $bar->advance();
        }
        $bar->finish();
        $this->info("\nDone");
    }
}
