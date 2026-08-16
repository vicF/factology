<?php

namespace App\Http\Requests;

use Fokin\Facts\Data\Era;
use Fokin\Facts\Data\FlexibleDate;
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
            'start' => ['nullable', 'string', 'regex:/^-?\d*$/'],
            'end' => [
                'nullable',
                'string',
                'regex:/^-?\d*$/',
                function ($attribute, $value, $fail) {
                    if ($this->start !== null && $this->start !== '' && bccomp($value, $this->start) < 0) {
                        $fail('The end date must be after the start date.');
                    }
                },
            ],

            'start_meta' => ['nullable', 'array'],
            'start_meta.qualifier' => ['nullable', Rule::in(FlexibleDate::QUALIFIERS)],
            'start_meta.era' => ['nullable', Rule::in(Era::keys())],
            'start_meta.precision' => ['nullable', Rule::in(FlexibleDate::PRECISIONS)],
            'start_meta.alternatives' => ['nullable', 'array'],
            'start_meta.alternatives.*' => ['string', 'regex:/^-?\d*$/'],
            'start_meta.comment' => ['nullable', 'string', 'max:500'],

            'end_meta' => ['nullable', 'array'],
            'end_meta.qualifier' => ['nullable', Rule::in(FlexibleDate::QUALIFIERS)],
            'end_meta.era' => ['nullable', Rule::in(Era::keys())],
            'end_meta.precision' => ['nullable', Rule::in(FlexibleDate::PRECISIONS)],
            'end_meta.alternatives' => ['nullable', 'array'],
            'end_meta.alternatives.*' => ['string', 'regex:/^-?\d*$/'],
            'end_meta.comment' => ['nullable', 'string', 'max:500'],
            'public' => ['required', 'integer', Rule::in([0, 1])],
            'parent_id' => ['nullable', 'string', 'uuid'],
            'type' => ['required', 'integer', 'min:1', 'max:6'],

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
