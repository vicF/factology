<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class ThingResource extends JsonResource
{
    public function toArray($request)
    {
        return [
            'thing_id'        => $this->thing_id,
            'name'            => $this->name,
            'type'            => $this->type,
            'description'     => $this->description,
            'start'           => $this->start,
            'end'             => $this->end,
            'record_created'  => $this->record_created,
            'record_updated'  => $this->record_updated,
            'public'          => (bool) $this->public,
            'deleted'         => (bool) $this->deleted,
            'data'            => $this->data,
        ];
    }
}
