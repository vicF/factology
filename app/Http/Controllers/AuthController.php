<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use Illuminate\Support\Facades\Auth;

class AuthController extends Controller
{
    public function __invoke()
    {
        $user = Auth::user();
        if ($user) {
            return new UserResource($user);
        }
        return response()->json(['message' => 'Unauthenticated'], 401);
    }
}
