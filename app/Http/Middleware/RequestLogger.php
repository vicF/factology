<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class RequestLogger
{
    public function handle(Request $request, Closure $next)
    {
        $start = microtime(true);
        $requestId = (string) Str::uuid();

        $request->headers->set('X-Request-Id', $requestId);

        /** @var \Illuminate\Http\Response $response */
        $response = $next($request);

        $duration = (microtime(true) - $start) * 1000;
        $status = $response->getStatusCode();

        $context = [
            'request_id' => $requestId,
            'method'     => $request->method(),
            'url'        => $request->fullUrl(),
            'status'     => $status,
            'duration'   => round($duration, 2),
            'ip'         => $request->ip(),
            'user_agent' => $request->userAgent(),
            'user'       => $request->user()?->email ?? 'guest',
        ];

        Log::channel('json')->info('request', $context);

        $threshold = config('app.slow_request_threshold_ms', 1000);
        if ($duration > $threshold) {
            Log::warning("Slow request: {$duration}ms — {$request->method()} {$request->fullUrl()}", $context);
        }

        if (app()->isLocal() || app()->environment('testing')) {
            $response->headers->set('X-Duration-Ms', (string) round($duration, 2));
            $response->headers->set('X-Request-Id', $requestId);
        }

        return $response;
    }
}
