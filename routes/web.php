<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Auth\LoginController;

Route::get('{any}', function () {
    return view('welcome');
})->where('any', '.*');
Auth::routes();
Route::get('/home', [App\Http\Controllers\HomeController::class, 'index'])->name('home');
Route::post('/login', [LoginController::class, 'login']);
Route::post('/logout', function (Request $request) {
    try {
        Auth::guard('web')->logout(); // Explicitly use 'web' guard
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        return response()->json(['message' => 'Logged out'], 200);
    } catch (\Exception $e) {
        // If session is already gone, just return success
        return response()->json(['message' => 'Logged out'], 200);
    }
})->name('logout');
