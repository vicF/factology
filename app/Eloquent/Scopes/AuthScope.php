<?php
/**
 * factology
 * User: fokin
 * Created: 15/12/2020
 */

namespace App\Eloquent\Scopes;


use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;
use Illuminate\Support\Facades\Auth;

class AuthScope implements Scope
{
    /**
     * Apply the scope to a given Eloquent query builder.
     *
     * @param  \Illuminate\Database\Eloquent\Builder  $builder
     * @param  \Illuminate\Database\Eloquent\Model  $model
     * @return void
     */
    public function apply(Builder $builder, Model $model)
    {
        $table = $model->getTable();
        if (!Auth::check()) {
            $builder->where(static function ($query) use ( $builder, $table) {
                $builder->where($table . '.public', 1)
                    ->orWhereNull($table . '.public');
            });
        }
    }
}