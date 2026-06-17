<?php

namespace App\Eloquent\Scopes;

use Fokin\Facts\Data\UUID;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;
use Illuminate\Support\Facades\Auth;

class AuthScope implements Scope
{
    public function apply(Builder $builder, Model $model)
    {
        $table = $model->getTable();

        $builder->where(static function ($query) use ($table) {
            // Public records are visible to everyone
            $query->where($table . '.public', 1)
                ->orWhereNull($table . '.public');

            if (Auth::check()) {
                $userThingId = Auth::user()->thing_id;

                // Owner has access
                $query->orWhere($table . '.owner', $userThingId);

                // Group-based access via links
                $query->orWhereIn($table . '.thing_id', function ($sub) use ($userThingId) {
                    $sub->select('gl.one_thing_id')
                        ->from('links as gl')
                        ->join('links as ug', 'ug.other_thing_id', '=', 'gl.other_thing_id')
                        ->where('gl.link_type_id', UUID::GROUP_READ_ACCESS)
                        ->where('ug.link_type_id', UUID::BELONGS_TO_USER_GROUP)
                        ->where('ug.one_thing_id', $userThingId);
                });
            }
        });
    }
}
