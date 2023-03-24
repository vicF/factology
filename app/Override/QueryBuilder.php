<?php
/**
 * factology
 * User: fokin
 * Created: 23/06/2020
 */

namespace App\Override;


use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\Auth;

class QueryBuilder extends \Illuminate\Database\Query\Builder
{

    public function auth($table = 'things'): QueryBuilder
    {
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


        /*if (!Auth::check()) {
            $this->where(static function ($query) use ($table) {
                $query->where($table . '.public', 1)
                    ->orWhereNull($table . '.public');
            });
        } else {
            if ($table == 'things') {
                $this//->select('things.*')
                    ->leftJoin('links AS al', function ($join) {
                    $join->on('al.thing_id', 'things.thing_id')
                        ->where('al.link_type_id', UUID::GROUP_READ_ACCESS)
                        ->whereIn('al.other_thing_id', function ($query) {
                            $query->select('thing_id')
                                ->from('links')
                                ->where('other_thing_id', Auth::user()->thing_id) //'40b075d8-8e08-4753-88ca-8a07d5a55765')
                                ->where('link_type_id', UUID::BELONGS_TO_USER_GROUP);
                        });
                });
                $this->where(static function ($query) use ($table) {
                    /*$query->where($table . '.public', 1)
                        ->orWhereNull($table . '.public');*/
        /*$query->where($table . '.public', 1)
            ->orWhere('things.owner', Auth::user()->thing_id)
            //->orWhereNotNull('allowed')
           // ->orWhere($table . '.public', 1)
        ;;
    });
}
}*/
        return $this;
    }


}