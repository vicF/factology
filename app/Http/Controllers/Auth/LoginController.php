<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\TransientToken;

class LoginController extends Controller
{
    /**
     * Create a new controller instance.
     *
     * @return void
     */
    public function __construct()
    {
        $this->middleware('auth:sanctum')->only(['logout', 'user']);
    }

    /**
     * Handle a login request to the application.
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     * @throws \Illuminate\Validation\ValidationException
     */
    public function login(Request $request)
    {
        \Log::info('Login attempt', [
            'input' => $request->except('password'),
            'headers' => $request->headers->all()
        ]);

        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required'],
        ]);

        if (Auth::attempt($credentials)) {
            $user = Auth::user();

            $token = $user->createToken(
                name: 'spa-token',
                abilities: ['*'],
                expiresAt: null
            )->plainTextToken;

            \Log::info('Login successful - token issued', [
                'user_id' => $user->id,
                'token_id' => explode('|', $token)[0] ?? null
            ]);

            return response()->json([
                'user' => $user,
                'token' => $token,
                'message' => 'Login successful'
            ], 200);
        }

        \Log::warning('Login failed: Invalid credentials', ['email' => $request->email]);
        throw ValidationException::withMessages([
            'email' => ['The provided credentials do not match our records.'],
        ]);
    }

    /**
     * Log the user out of the application.
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function logout(Request $request)
    {
        $user = $request->user();

        if ($user) {
            $currentToken = $user->currentAccessToken();

            if ($currentToken) {
                $currentToken->delete();
                Log::info('Token revoked on logout', [
                    'user_id' => $user->id,
                    'token_id' => $currentToken->id ?? 'unknown'
                ]);
            } else {
                Log::warning('No current access token found during logout', [
                    'user_id' => $user->id
                ]);
            }
        }

        return response()->json([
            'message' => 'Logged out'
        ], 200);
    }

    /**
     * Get the authenticated user.
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function user(Request $request)
    {
        $user = Auth::user();
        if ($user) {
            \Log::info('User fetched', ['user_id' => $user->id]);
            return response()->json($user);
        }
        \Log::warning('User fetch failed: Unauthenticated');
        return response()->json(['message' => 'Unauthenticated'], 401);
    }
}
