<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SearchRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'search'     => 'nullable|string|max:255',
            'type'       => 'nullable|array',
            'type.*'     => 'integer|in:1,2,3,4,5',
            'classes'    => 'nullable|array',
            'classes.*'  => 'string|uuid',
            'tree'       => 'nullable|boolean',
            'sort_by'    => 'nullable|string|in:updated,created,start,name',
            'sort_order' => 'nullable|string|in:asc,desc',
            'visibility' => 'nullable|string|in:all,public,private,group',
            'date_from'  => 'nullable|string|regex:/^-?\d*$/',
            'date_to'    => 'nullable|string|regex:/^-?\d*$/',
            'owner'      => 'nullable|string|max:255',
            'server'     => 'nullable|string|max:255',
            'filter_type' => 'nullable|string|in:owner,server',
        ];
    }

    public function authorize(): bool
    {
        return true; // public access
    }
}
