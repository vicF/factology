<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SearchRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'search'   => 'nullable|string|max:255',
            'type'     => 'nullable|array',
            'type.*'   => 'integer|in:1,2,3,4,5',
            'classes'  => 'nullable|array',
            'classes.*'=> 'string|uuid',
            'tree'     => 'nullable|boolean',
        ];
    }

    public function authorize(): bool
    {
        return true; // public access
    }
}
