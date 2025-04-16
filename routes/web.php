<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Http\Request; // Correct Request class
use Illuminate\Support\Facades\Auth;
use App\Http\Controllers\Auth\LoginController;

Route::post('/logout', function (Request $request) {
    try {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        return response()->json(['message' => 'Logged out'], 200);
    } catch (\Exception $e) {
        // Log the exception for debugging (optional)
        \Log::error('Logout error: ' . $e->getMessage());
        return response()->json(['message' => 'Logged out'], 200);
    }
})->name('logout');

// Other routes
Route::get('{any}', function () {
    return view('welcome');
})->where('any', '.*');
Auth::routes();
Route::get('/home', [App\Http\Controllers\HomeController::class, 'index'])->name('home');
Route::post('/login', [LoginController::class, 'login']);
