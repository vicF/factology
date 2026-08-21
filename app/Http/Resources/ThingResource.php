<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class ThingResource extends JsonResource
{
    public function toArray($request)
    {
        $out = [
            'thing_id'                => $this->thing_id,
            'name'                    => $this->name,
            'name_translations'       => $this->decodeJson($this->name_translations ?? null),
            'type'                    => $this->type,
            'description'             => $this->description,
            'description_translations'=> $this->decodeJson($this->description_translations ?? null),
            'start'                   => $this->start,
            'end'                     => $this->end,
            'start_meta'              => $this->decodeJson($this->start_meta ?? null),
            'end_meta'                => $this->decodeJson($this->end_meta ?? null),
            'record_created'          => $this->record_created,
            'record_updated'          => $this->record_updated,
            'public'                  => (bool) $this->public,
            'deleted'                 => (bool) $this->deleted,
            'data'                    => $this->decodeJson($this->data ?? null),
        ];
        // Only emitted when the search resolver attached per-thing links.
        if (isset($this->links)) {
            $out['links'] = $this->links;
        }
        // Taxonomy base category for link-type results (grouping in the picker).
        if (isset($this->category_id)) {
            $out['category_id']           = $this->category_id;
            $out['category_name']         = $this->category_name;
            $out['category_translations'] = $this->decodeJson($this->category_translations ?? null);
        }
        return $out;
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
