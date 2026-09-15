<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\IdentityKeys;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Sign in (or bind an identity key) using a Factology identity file.
 *
 * The client owns an Ed25519 keypair stored in a passphrase-protected identity
 * file. To log in it proves possession by signing a fresh, single-use server
 * challenge. The public key is bound to an account beforehand (see bind()).
 */
class IdentityController extends Controller
{
    private const CHALLENGE_TTL = 300; // seconds
    private const CACHE_LOGIN_PREFIX   = 'identity_login_';
    private const CACHE_BIND_PREFIX    = 'identity_bind_';
    private const CACHE_REGISTER_PREFIX = 'identity_register_';

    /**
     * Issue a challenge for signing in with an already-registered identity key.
     */
    public function challenge(Request $request)
    {
        $publicKey = $this->validatedPublicKey($request);

        $user = User::where('identity_public_key', $publicKey)->first();
        if (!$user) {
            throw ValidationException::withMessages([
                'public_key' => ['This identity is not registered to an account on this server.'],
            ]);
        }

        $challenge = IdentityKeys::makeChallenge();
        Cache::put(self::CACHE_LOGIN_PREFIX . hash('sha256', $challenge), $user->id, self::CHALLENGE_TTL);

        return response()->json([
            'challenge'  => $challenge,
            'expires_in' => self::CHALLENGE_TTL,
        ]);
    }

    /**
     * Complete an identity-file login: verify the signature and issue a
     * Sanctum token (same shape as the password login response).
     */
    public function login(Request $request)
    {
        $data = $request->validate([
            'public_key' => ['required', 'string'],
            'challenge'  => ['required', 'string'],
            'signature'  => ['required', 'string'],
        ]);

        $user = User::where('identity_public_key', $data['public_key'])->first();
        if (!$user) {
            throw ValidationException::withMessages([
                'public_key' => ['This identity is not registered to an account on this server.'],
            ]);
        }

        $cacheKey = self::CACHE_LOGIN_PREFIX . hash('sha256', $data['challenge']);
        $cachedUserId = Cache::get($cacheKey);
        if ($cachedUserId === null || (int) $cachedUserId !== (int) $user->id) {
            throw ValidationException::withMessages([
                'challenge' => ['Challenge is invalid or has expired.'],
            ]);
        }

        if (!IdentityKeys::verifySignature($data['challenge'], $user->identity_public_key, $data['signature'])) {
            Cache::forget($cacheKey); // a failed attempt consumes the challenge
            throw ValidationException::withMessages([
                'signature' => ['Signature verification failed.'],
            ]);
        }

        Cache::forget($cacheKey); // single-use challenge

        $token = $user->createToken('spa-token')->plainTextToken;

        return response()->json([
            'user'    => $user,
            'token'   => $token,
            'message' => 'Login successful',
        ]);
    }

    /**
     * Issue a challenge to prove possession of a NEW identity key before it is
     * bound to the authenticated account.
     */
    public function bindChallenge(Request $request)
    {
        $publicKey = $this->validatedPublicKey($request);
        $user = $request->user();

        $alreadyRegistered = User::query()
            ->where('identity_public_key', $publicKey)
            ->whereKeyNot($user->getKey())
            ->exists();
        if ($alreadyRegistered) {
            throw ValidationException::withMessages([
                'public_key' => ['This identity key is already registered to another account.'],
            ]);
        }

        $challenge = IdentityKeys::makeChallenge();
        Cache::put(self::CACHE_BIND_PREFIX . hash('sha256', $challenge), [
            'user_id'    => $user->id,
            'public_key' => $publicKey,
        ], self::CHALLENGE_TTL);

        return response()->json([
            'challenge'  => $challenge,
            'expires_in' => self::CHALLENGE_TTL,
        ]);
    }

    /**
     * Bind a verified identity key to the authenticated account.
     */
    public function bind(Request $request)
    {
        $data = $request->validate([
            'public_key' => ['required', 'string'],
            'challenge'  => ['required', 'string'],
            'signature'  => ['required', 'string'],
        ]);

        $user = $request->user();
        $cacheKey = self::CACHE_BIND_PREFIX . hash('sha256', $data['challenge']);
        $stored = Cache::get($cacheKey);

        if (!$stored
            || (int) $stored['user_id'] !== (int) $user->id
            || $stored['public_key'] !== $data['public_key']) {
            throw ValidationException::withMessages([
                'challenge' => ['Challenge is invalid or has expired.'],
            ]);
        }

        if (!IdentityKeys::verifySignature($data['challenge'], $data['public_key'], $data['signature'])) {
            Cache::forget($cacheKey);
            throw ValidationException::withMessages([
                'signature' => ['Signature verification failed.'],
            ]);
        }

        Cache::forget($cacheKey);

        $user->identity_public_key = $data['public_key'];
        $user->save();

        return response()->json([
            'message'              => 'Identity registered',
            'identity_public_key'  => $user->identity_public_key,
        ]);
    }

    // ────────────────────────────────────────────────────────────────────────
    //  Key-based registration (anonymous, no personal data)
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Initiate registration with only a public key — no name, email, or
     * password. Registration must be enabled in the app config.
     *
     * Issues a challenge that the client must sign to prove possession of the
     * private key. On success the server creates a user bound to this key.
     */
    public function initiateRegistration(Request $request)
    {
        if (!config('app.registration_enabled', true)) {
            return response()->json([
                'message' => 'Registration is currently disabled',
            ], 403);
        }

        $publicKey = $this->validatedPublicKey($request);

        $alreadyBound = User::where('identity_public_key', $publicKey)->exists();
        if ($alreadyBound) {
            throw ValidationException::withMessages([
                'public_key' => ['This identity key is already registered to an account.'],
            ]);
        }

        $challenge = IdentityKeys::makeChallenge();
        Cache::put(
            self::CACHE_REGISTER_PREFIX . hash('sha256', $challenge),
            ['public_key' => $publicKey],
            self::CHALLENGE_TTL,
        );

        return response()->json([
            'challenge'  => $challenge,
            'expires_in' => self::CHALLENGE_TTL,
        ]);
    }

    /**
     * Complete registration: verify the signature and create the user account.
     *
     * The client sends the signed challenge along with an optional display name.
     * A new user is created with only a thing_id (UUID), the public key, and
     * the name if provided — no email, no password, no legal consent stored.
     */
    public function completeRegistration(Request $request)
    {
        if (!config('app.registration_enabled', true)) {
            return response()->json([
                'message' => 'Registration is currently disabled',
            ], 403);
        }

        $data = $request->validate([
            'public_key' => ['required', 'string'],
            'challenge'  => ['required', 'string'],
            'signature'  => ['required', 'string'],
            'name'       => ['nullable', 'string', 'max:255'],
            'thing_id'   => ['nullable', 'string', 'max:36'],
        ]);

        $cacheKey = self::CACHE_REGISTER_PREFIX . hash('sha256', $data['challenge']);
        $stored = Cache::get($cacheKey);

        if (!$stored || $stored['public_key'] !== $data['public_key']) {
            throw ValidationException::withMessages([
                'challenge' => ['Challenge is invalid or has expired.'],
            ]);
        }

        if (!IdentityKeys::verifySignature($data['challenge'], $data['public_key'], $data['signature'])) {
            Cache::forget($cacheKey);
            throw ValidationException::withMessages([
                'signature' => ['Signature verification failed.'],
            ]);
        }

        Cache::forget($cacheKey);

        $user = User::create([
            'name'                => $data['name'] ?? ('user_' . Str::random(8)),
            'thing_id'            => $data['thing_id'] ?? \Illuminate\Support\Str::uuid(),
            'identity_public_key' => $data['public_key'],
            'email'               => null,
            'password'            => null,
        ]);

        $token = $user->createToken('spa-token')->plainTextToken;

        return response()->json([
            'user'    => $user,
            'token'   => $token,
            'message' => 'Registration successful',
        ], 201);
    }

    /**
     * Validate that public_key is a well-formed base64url Ed25519 key and
     * return it in its canonical (submitted) form.
     */
    private function validatedPublicKey(Request $request): string
    {
        $request->validate(['public_key' => ['required', 'string']]);
        $publicKey = $request->input('public_key');

        if (IdentityKeys::decodePublicKey($publicKey) === null) {
            throw ValidationException::withMessages([
                'public_key' => ['Invalid Ed25519 public key.'],
            ]);
        }
        return $publicKey;
    }
}
