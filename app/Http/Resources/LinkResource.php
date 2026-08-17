<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class LinkResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'link_id'        => $this->link_id ?? null,
            'one_thing_id'   => $this->one_thing_id ?? null,
            'other_thing_id' => $this->other_thing_id ?? null,
            'link_type_id'   => $this->link_type_id ?? null,
            'translation'    => $this->translation ?? null,
            'description'    => $this->description ?? null,   // <-- safe fallback
            'public'         => isset($this->public) ? (bool) $this->public : null,
            'name'           => $this->name ?? null,          // from things.name
            'link_name'      => $this->link_name ?? null,     // from link_types.name
            'link_name_translations' => isset($this->link_name_translations)
                ? (is_string($this->link_name_translations)
                    ? (json_decode($this->link_name_translations, true) ?: null)
                    : $this->link_name_translations)
                : null,
        ];
    }
}
