<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UploadRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'uploaded_file'   => 'required|array',
            'uploaded_file.*' => 'required|file|max:20480', // max 20MB per file
        ];
    }

    public function authorize(): bool
    {
        return true;
    }
}
