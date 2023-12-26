<?php

namespace App\Providers;

use Illuminate\Support\Facades\Auth;
use Illuminate\Support\ServiceProvider;
use Illuminate\Database\Query\Builder;

class QueryBuilderMacroServiceProvider extends ServiceProvider
{
    /**
     * Register services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap services.
     */
    public function boot(): void
    {
        Builder::macro('auth', function ($table = 'things') {
            // Next is for logged in and anonymous
            $this->where(static function ($query) use ($table) {
                $query->where($table . '.public', 1)  // Public for all
                ->orWhereNull($table . '.public');  // Just in case public is null treated as 1
                if (Auth::check() && $table == 'things') {  // This is nested into auth subset of OR conditions
                    $query->orWhere('things.owner', Auth::user()->thing_id)  // Owner has access
                    ->orWhere('a.read', 1);  // Group members that have read access
                }
            });
            if (Auth::check()) {
                if ($table == 'things') {
                    $this//->select('things.*')
                    ->leftJoin('things_access AS a', function ($join) {   // Joining groups
                        $join->on('a.accessed_thing_id', 'things.thing_id')
                            ->whereIn('a.group_id', ['fdcdfe03-9e7e-4d36-ba19-4c9e95bd9c9f']) // user groups
                        ;
                    });

                }
            }

            return $this;
        });
    }
}
