<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\Classes\UserClass;
use App\Models\LegalDocument;
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
            'accepted_terms'        => ['required', 'accepted'],
            'accepted_privacy'      => ['required', 'accepted'],
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

        // Record legal consents
        $countryCode = $request->header('CF-IPCountry') ?? '*';
        $clientIp = $request->ip();
        $userAgent = $request->userAgent();

        $termsDoc = LegalDocument::where('type', 'terms')
            ->where(function ($q) use ($countryCode) {
                $q->where('country', $countryCode)->orWhere('country', '*');
            })
            ->where('locale', app()->getLocale())
            ->orderBy('version', 'desc')
            ->first();

        $privacyDoc = LegalDocument::where('type', 'privacy')
            ->where(function ($q) use ($countryCode) {
                $q->where('country', $countryCode)->orWhere('country', '*');
            })
            ->where('locale', app()->getLocale())
            ->orderBy('version', 'desc')
            ->first();

        $user->legalConsents()->create([
            'document_type' => 'terms',
            'document_version' => $termsDoc ? $termsDoc->version : '1.0.0',
            'country_code' => $countryCode,
            'ip_address' => $clientIp,
            'user_agent' => $userAgent,
            'agreed_at' => now(),
        ]);

        $user->legalConsents()->create([
            'document_type' => 'privacy',
            'document_version' => $privacyDoc ? $privacyDoc->version : '1.0.0',
            'country_code' => $countryCode,
            'ip_address' => $clientIp,
            'user_agent' => $userAgent,
            'agreed_at' => now(),
        ]);

        return response()->json([
            'user'    => $user,
            'token'   => $token,
            'message' => 'Registration successful'
        ], 201);
    }
}
