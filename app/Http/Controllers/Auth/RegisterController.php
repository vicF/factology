<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\Classes\UserClass;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Auth\Events\Registered;
use Tests\Traits\CreatesTestUsers;

class RegisterController extends Controller
{
    /**
     * Create a new controller instance.
     *
     * @return void
     */
    public function __construct()
    {
        // Allow only guests to register
        $this->middleware('guest')->only('register');
    }

    /**
     * Handle a registration request for the application.
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     * @throws \Exception
     */
    public function register(Request $request)
    {
        // Check if registration is enabled via env config
        if (!config('app.registration_enabled', true)) {
            return response()->json([
                'success' => false,
                'message' => 'Registration is currently disabled',
            ], 403);
        }

        Log::debug('Register ...');

        $validated = $request->validate([
            'name'                  => ['required', 'string', 'max:255'],
            'email'                 => ['required', 'string', 'email', 'max:255', 'unique:users'],
            'password'              => ['required', 'string', 'min:8', 'confirmed'],
        ]);


        $UserObject = new UserClass(
            [
                'name'     => $validated['name'],
                'email'    => $validated['email'],
                'password' => Hash::make($validated['password']),
                'thing_id' => uuid_create(),
            ]
        );
        $UserObject->save();

        $user = $UserObject->getUser();
        /*User::create([
            'name'     => $validated['name'],
            'email'    => $validated['email'],
            'password' => Hash::make($validated['password']),
            'thing_id' => uuid_create(),
        ]);*/

        event(new Registered($user));

        // Create Sanctum token (consistent with LoginController)
        $token = $user->createToken(
            name: 'spa-token',
            abilities: ['*'],
            expiresAt: null
        )->plainTextToken;

        Log::info('Registration successful - token issued', [
            'user_id'  => $user->id,
            'token_id' => explode('|', $token)[0] ?? null
        ]);

        return response()->json([
            'user'    => $user,
            'token'   => $token,
            'message' => 'Registration successful'
        ], 201);
    }
}
