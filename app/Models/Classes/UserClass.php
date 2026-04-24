<?php

namespace App\Models\Classes;

use App\Models\User;
use Fokin\Facts\Data\UUID;
use http\Exception\RuntimeException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class UserClass extends Anything
{
    protected $user;
    public $additionalParams =
        [
            'email',
            'password',
        ];

    public function __construct(array $data = null, $class = null)
    {
        if (empty($data['thing_id'])) {
            if (empty($data['owner'])) {
                $data['thing_id'] = $data['owner'] = uuid_create();
            } else {
                $data['thing_id'] = $data['owner'];
            }
        } else {
            if (!empty($data['owner']) && $data['owner'] != $data['thing_id']) {
                throw new RuntimeException('"owner" should be equal to "thing_id". Or you may specify only one value');
            }
            $data['owner'] = $data['thing_id'];
        }
        parent::__construct($data, $class);

    }

    public function save()
    {
        if (empty($this->thing_id)) {
            $this->thing_id = uuid_create();
        }
        $this->type = UUID::G_THING;
        return DB::transaction(function () {
            parent::save();
            $this->setClass([
                'other_thing_id' => UUID::USER,
            ]);
            $this->user = User::create([
                'name'     => $this->name,
                'email'    => $this->email,
                'password' => $this->password,
                'thing_id' => uuid_create(),
            ]);
            return $this;
        });
    }

    public function getUser()
    {
        return $this->user;
    }
}
