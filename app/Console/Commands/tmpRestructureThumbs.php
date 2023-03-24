<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class tmpRestructureThumbs extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'command:tmpRestructureThumbs';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Change thumbs folder structure to subfolders to reduce number of files in folder';

    /**
     * Create a new command instance.
     *
     * @return void
     */
    public function __construct()
    {
        parent::__construct();
    }

    /**
     * Execute the console command.
     *
     * @return mixed
     */
    public function handle()
    {
        $this->info('scanning files ... ');
        $dir = 'public/thumbs/';
        $files = glob($dir.'???????????????????*.jpg');
        $bar = $this->output->createProgressBar(count($files));
        $bar->start();
        foreach($files as $path){
            $file = basename($path);
            //$this->info($file);
            $first = substr($file, 0, 1);
            $second = substr($file, 1,1);
            /** @noinspection MkdirRaceConditionInspection */
            @mkdir("{$dir}{$first}/{$second}", 0775, true);
            rename($path, "{$dir}{$first}/{$second}/{$file}");
            $bar->advance();
        }
        $bar->finish();
        $this->info('Done');
    }
}
