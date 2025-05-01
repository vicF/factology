<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Http\Controllers\Auth\LoginController;

Route::post('/login', [LoginController::class, 'login'])->name('login')->middleware('web');
Route::post('/logout', [LoginController::class, 'logout'])->name('logout')->middleware('web');
Route::get('/user', [LoginController::class, 'user'])->name('user')->middleware('auth:sanctum');

// SPA route, exclude static assets
Route::get('{any}', function () {
    return view('welcome');
})->where('any', '^(?!build|js|css|images|fonts|storage|api|sanctum).*')->name('spa');

// Remove Auth::routes() to avoid conflicts
// Route::get('/home', [App\Http\Controllers\HomeController::class, 'index'])->name('home');
