<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ImportRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'file'           => 'nullable|file|mimes:json|max:256000', // 250MB max
            'conflict_mode'  => 'nullable|string|in:latest_wins,keep_existing,overwrite',
        ];
    }

    public function authorize(): bool
    {
        return true; // Admin check is done in the controller
    }
}
