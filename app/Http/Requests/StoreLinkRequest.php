<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreLinkRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'link_id'         => 'sometimes|string|uuid', // for updates
            'one_thing_id'    => 'required|string|uuid',
            'other_thing_id'  => 'required|string|uuid',
            'link_type_id'    => 'required|string|uuid',
            'translation'     => 'nullable|string|max:255',
            'description'     => 'nullable|string|max:1000',
            'public'          => 'nullable|integer|in:0,1',
        ];
    }

    public function authorize(): bool
    {
        return true;
    }
}
