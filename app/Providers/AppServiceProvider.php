<?php

namespace App\Providers;

use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\ServiceProvider;


class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     *
     * @return void
     */
    public function register()
    {
        //
    }

    /**
     * Bootstrap any application services.
     *
     * @return void
     */
    public function boot(): void
    {
        Blade::directive('thumb', static function ($varName) {
            return "<?PHP echo \App\Models\Classes\Anything::getThumbPathById($varName); ?>";
        });

        Blade::directive('start', static function ($varName) {
            return "<?PHP echo \App\Models\Classes\Anything::echoDateWithVariety($varName); ?>";
        });

        Blade::directive('end', static function ($varName) {
            return "<?PHP echo \App\Models\Classes\Anything::echoDateWithVariety($varName, 'end'); ?>";
        });

        Blade::directive('edit', static function ($varName) {
            return '<?PHP
            if (Auth::check()) {
            echo \'<a href="/object/\'.' . $varName . '.\'" target="_blank">📝</a>\';
              }
             ?>';
        });

        DB::listen(function ($query) {
            if (env('LOG_QUERIES') == 'yes') {
                if (!str_contains($query->sql, 'telescope_')) {
                    logger()->info('Query executed', [
                        'sql'      => $query->sql,
                        'bindings' => $query->bindings,
                        'time'     => $query->time,
                    ]);
                }
            }
        });
    }
}
