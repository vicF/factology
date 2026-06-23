<?php

namespace App\Providers;

use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\ServiceProvider;
use Illuminate\Database\Query\Builder;

class QueryBuilderMacroServiceProvider extends ServiceProvider
{
    public function register(): void {}

    public function boot(): void
    {
        Builder::macro('auth', function ($table = 'things') {
            $this->where(static function ($query) use ($table) {
                // Public records are visible to everyone
                $query->where($table . '.public', 1)
                    ->orWhereNull($table . '.public');

                if (Auth::check()) {
                    $userThingId = Auth::user()->thing_id;

                    if ($table === 'things') {
                        // Owner has access
                        $query->orWhere('things.owner', $userThingId);

                        // Group-based access: a thing with GROUP_READ_ACCESS link to a group
                        // is visible to users who BELONGS_TO_USER_GROUP to that same group
                        $query->orWhereIn('things.thing_id', function ($sub) use ($userThingId) {
                            $sub->select('gl.one_thing_id')
                                ->from('links as gl')
                                ->join('links as ug', 'ug.other_thing_id', '=', 'gl.other_thing_id')
                                ->where('gl.link_type_id', UUID::GROUP_READ_ACCESS)
                                ->where('ug.link_type_id', UUID::BELONGS_TO_USER_GROUP)
                                ->where('ug.one_thing_id', $userThingId);
                        });
                    }
                }
            });

            return $this;
        });
    }
}
