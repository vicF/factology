<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Auth\LoginController;

Route::get('{any}', function () {
    return view('welcome');
})->where('any', '.*');
Auth::routes();
Route::get('/home', [App\Http\Controllers\HomeController::class, 'index'])->name('home');
Route::post('/login', [LoginController::class, 'login']);
Route::post('/logout', function () {
    Auth::logout();
    return response()->json(['message' => 'Logged out'], 200);
})->middleware('auth:sanctum');
