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
            'link_start'     => $this->link_start ?? null,
            'link_end'       => $this->link_end ?? null,
            'link_start_meta'=> $this->decodeJson($this->link_start_meta ?? null),
            'link_end_meta'  => $this->decodeJson($this->link_end_meta ?? null),
            // name = name of other_thing_id, one_name = name of one_thing_id
            // (both from left joins, so display can name either endpoint).
            'name'           => $this->name ?? null,
            'one_name'       => $this->one_name ?? null,
            'link_name'      => $this->link_name ?? null,     // from link_types.name
            'link_name_translations' => isset($this->link_name_translations)
                ? (is_string($this->link_name_translations)
                    ? (json_decode($this->link_name_translations, true) ?: null)
                    : $this->link_name_translations)
                : null,
        ];
    }

    /**
     * Decode a json/jsonb column (query builder returns these as strings).
     */
    private function decodeJson($value)
    {
        if (is_string($value)) {
            return json_decode($value, true) ?: null;
        }
        return $value;
    }
}
