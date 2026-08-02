<?php

namespace App\Models\Classes;

use App\Models\User;
use Fokin\Facts\Data\UUID;
use http\Exception\RuntimeException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class UserClass extends Everything
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
            // Create a things record for the user's thing_id before creating the User
            // (the FK constraint users_thing_id_foreign references things.thing_id)
            $userThingId = uuid_create();
            DB::table('things')->insert([
                'thing_id'    => $userThingId,
                'name'        => 'user-' . $this->name,
                'description' => 'User account for ' . $this->name,
                'type'        => UUID::G_THING,
                'owner'       => $userThingId,
                'public'      => false,
                'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
            ]);
            // The account thing (users.thing_id) is the canonical user object —
            // give it the system User class so users can be found via the User
            // class filter in the sidebar.
            $this->setLink([
                'one_thing_id'   => $userThingId,
                'link_type_id'   => UUID::LINK_TO_CLASS,
                'other_thing_id' => UUID::USER,
                'translation'    => "user-{$this->name} is of class User",
            ]);
            $this->user = User::create([
                'name'     => $this->name,
                'email'    => $this->email,
                'password' => $this->password,
                'thing_id' => $userThingId,
            ]);
            return $this;
        });
    }

    public function getUser()
    {
        return $this->user;
    }
}
