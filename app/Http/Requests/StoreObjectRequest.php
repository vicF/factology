<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreObjectRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            // UUID of the main object – required for both create and update
            'thing_id' => ['required', 'string', 'uuid'],

            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:1000'],
            'start' => ['nullable', 'string', 'regex:/^\d*$/'],
            'end' => [
                'nullable',
                'string',
                'regex:/^\d*$/',
                function ($attribute, $value, $fail) {
                    if ($this->start && $value < $this->start) {
                        $fail('The end date must be after the start date.');
                    }
                },
            ],
            'public' => ['required', 'integer', Rule::in([0, 1])],
            'parent_id' => ['nullable', 'string', 'uuid'],
            'type' => ['required', 'integer', 'min:1', 'max:5'],

            // Optional class relationship data
            'class' => ['sometimes', 'array'],
            'class.one_thing_id' => ['required_with:class', 'string', 'uuid'],
            'class.link_type_id' => ['required_with:class', 'string', 'uuid'],
            'class.other_thing_id' => ['required_with:class', 'string', 'uuid'],
            'class.description' => ['nullable', 'string', 'max:1000'],
            'class.public' => ['nullable', 'integer', Rule::in([0, 1])],

            // Additional links (if any)
            'links' => ['nullable', 'array'],
            'links_to_add' => ['nullable', 'array'],
            'links_to_update' => ['nullable', 'array'],
        ];
    }

    public function authorize(): bool
    {
        return true; // Adjust if you need authentication
    }
}
