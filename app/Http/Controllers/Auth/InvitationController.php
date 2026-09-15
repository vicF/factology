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
 * Admin-managed invitations for key-based registration.
 *
 * An admin creates an invitation with an optional pre-assigned UUID
 * (thing_id) and/or a specific Ed25519 public key. The invitation token
 * is shared out-of-band (email, messenger, etc.). The recipient claims
 * it by proving possession of their private key.
 */
class InvitationController extends Controller
{
    private const CHALLENGE_TTL = 300;
    private const CACHE_CLAIM_PREFIX = 'invitation_claim_';

    // ────────────────────────────────────────────────────────────────────────
    //  Admin: create an invitation
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Create a new invitation.
     *
     * @bodyParam note string|null Admin's internal note about the invitee.
     * @bodyParam public_key string|null If set, only this Ed25519 key can claim.
     * @bodyParam thing_id string|null Pre-assigned UUID for the new account.
     * @bodyParam expires_in_days int How many days the invitation is valid (default 30).
     */
    public function create(Request $request)
    {
        if (!$request->user()->is_admin) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $request->validate([
            'note'             => ['nullable', 'string', 'max:1000'],
            'public_key'       => ['nullable', 'string'],
            'thing_id'         => ['nullable', 'string', 'uuid'],
            'expires_in_days'  => ['nullable', 'integer', 'min:1', 'max:365'],
        ]);

        $token = Str::random(48);
        $expiresInDays = $request->input('expires_in_days', 30);

        $invitation = \App\Models\Invitation::create([
            'creator_id' => $request->user()->id,
            'token'      => $token,
            'public_key' => $request->input('public_key'),
            'thing_id'   => $request->input('thing_id'),
            'note'       => $request->input('note'),
            'expires_at' => now()->addDays($expiresInDays),
        ]);

        return response()->json([
            'data' => [
                'token'      => $invitation->token,
                'url'        => url('/invite/' . $invitation->token),
                'expires_at' => $invitation->expires_at->toISOString(),
                'thing_id'   => $invitation->thing_id,
                'note'       => $invitation->note,
            ],
        ], 201);
    }

    // ────────────────────────────────────────────────────────────────────────
    //  Public: claim an invitation
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Initiate the claim flow: validate the invitation is valid and issue
     * a challenge for the public key the claimant wants to bind.
     *
     * The client sends its public key. If the invitation has a public_key
     * constraint, it must match. The server responds with a challenge.
     */
    public function claimChallenge(Request $request)
    {
        $data = $request->validate([
            'token'      => ['required', 'string'],
            'public_key' => ['required', 'string'],
        ]);

        $invitation = \App\Models\Invitation::where('token', $data['token'])->first();
        if (!$invitation || $invitation->claimed_at) {
            throw ValidationException::withMessages([
                'token' => ['Invitation is invalid or has already been claimed.'],
            ]);
        }

        if ($invitation->expires_at->isPast()) {
            throw ValidationException::withMessages([
                'token' => ['Invitation has expired.'],
            ]);
        }

        // Validate the public key format
        if (IdentityKeys::decodePublicKey($data['public_key']) === null) {
            throw ValidationException::withMessages([
                'public_key' => ['Invalid Ed25519 public key.'],
            ]);
        }

        // If the invitation is bound to a specific key, enforce it
        if ($invitation->public_key && $invitation->public_key !== $data['public_key']) {
            throw ValidationException::withMessages([
                'public_key' => ['This invitation is bound to a different identity key.'],
            ]);
        }

        $alreadyBound = User::where('identity_public_key', $data['public_key'])->exists();
        if ($alreadyBound) {
            throw ValidationException::withMessages([
                'public_key' => ['This identity key is already registered.'],
            ]);
        }

        $challenge = IdentityKeys::makeChallenge();
        Cache::put(
            self::CACHE_CLAIM_PREFIX . hash('sha256', $challenge),
            [
                'invitation_id' => $invitation->id,
                'public_key'    => $data['public_key'],
            ],
            self::CHALLENGE_TTL,
        );

        return response()->json([
            'challenge'  => $challenge,
            'expires_in' => self::CHALLENGE_TTL,
            'thing_id'   => $invitation->thing_id,
        ]);
    }

    /**
     * Complete the invitation claim: verify the signature, create the user,
     * mark the invitation as claimed.
     */
    public function completeClaim(Request $request)
    {
        $data = $request->validate([
            'token'      => ['required', 'string'],
            'public_key' => ['required', 'string'],
            'challenge'  => ['required', 'string'],
            'signature'  => ['required', 'string'],
            'name'       => ['nullable', 'string', 'max:255'],
        ]);

        $cacheKey = self::CACHE_CLAIM_PREFIX . hash('sha256', $data['challenge']);
        $stored = Cache::get($cacheKey);

        if (!$stored || $stored['public_key'] !== $data['public_key']) {
            throw ValidationException::withMessages([
                'challenge' => ['Challenge is invalid or has expired.'],
            ]);
        }

        $invitation = \App\Models\Invitation::find($stored['invitation_id']);
        if (!$invitation || $invitation->claimed_at) {
            Cache::forget($cacheKey);
            throw ValidationException::withMessages([
                'token' => ['Invitation is no longer valid.'],
            ]);
        }

        if (!IdentityKeys::verifySignature($data['challenge'], $data['public_key'], $data['signature'])) {
            Cache::forget($cacheKey);
            throw ValidationException::withMessages([
                'signature' => ['Signature verification failed.'],
            ]);
        }

        Cache::forget($cacheKey);

        // Resolve the thing_id: use the invitation's pre-assigned UUID if set,
        // otherwise generate a fresh one.
        $thingId = $invitation->thing_id ?? (string) Str::uuid();

        $user = User::create([
            'name'                => $data['name'] ?? ('user_' . Str::random(8)),
            'thing_id'            => $thingId,
            'identity_public_key' => $data['public_key'],
            'email'               => null,
            'password'            => null,
        ]);

        $invitation->update(['claimed_at' => now()]);

        $token = $user->createToken('spa-token')->plainTextToken;

        return response()->json([
            'user'    => $user,
            'token'   => $token,
            'message' => 'Invitation claimed successfully',
        ], 201);
    }

    // ────────────────────────────────────────────────────────────────────────
    //  Admin: list / view invitations
    // ────────────────────────────────────────────────────────────────────────

    public function index(Request $request)
    {
        if (!$request->user()->is_admin) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $invitations = \App\Models\Invitation::query()
            ->where('creator_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'data' => $invitations->map(fn ($i) => [
                'id'         => $i->id,
                'token'      => $i->token,
                'thing_id'   => $i->thing_id,
                'note'       => $i->note,
                'expires_at' => $i->expires_at->toISOString(),
                'claimed_at' => $i->claimed_at?->toISOString(),
                'created_at' => $i->created_at->toISOString(),
            ]),
        ]);
    }
}