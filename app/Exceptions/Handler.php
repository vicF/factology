<?php

namespace App\Exceptions;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Throwable;

class Handler extends ExceptionHandler
{
    /**
     * A list of exception types with their corresponding custom log levels.
     *
     * @var array<class-string<\Throwable>, \Psr\Log\LogLevel::*>
     */
    protected $levels = [
        //
    ];

    /**
     * A list of the exception types that are not reported.
     *
     * @var array<int, class-string<\Throwable>>
     */
    protected $dontReport = [
        //
    ];

    /**
     * A list of the inputs that are never flashed to the session on validation exceptions.
     *
     * @var array<int, string>
     */
    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    /**
     * Register the exception handling callbacks for the application.
     *
     * @return void
     */
    public function register()
    {
        $this->reportable(function (Throwable $e) {
            //
        });
    }

    public function render($request, Throwable $exception)
    {
        // Only handle JSON requests (API)
        if (!$request->wantsJson()) {
            return parent::render($request, $exception);
        }

        // ValidationException must use Laravel's default format for
        // assertJsonValidationErrors() and frontend expectations
        if ($exception instanceof ValidationException) {
            return parent::render($request, $exception);
        }

        $status = $this->getHttpStatusCode($exception);
        $type = $this->classifyError($exception);
        $message = $this->getErrorMessage($exception, $type);

        $payload = [
            'error' => [
                'type'    => $type,
                'message' => $message,
                'code'    => $status,
            ],
        ];

        // Add request_id from middleware if available
        if ($requestId = $request->headers->get('X-Request-Id')) {
            $payload['error']['request_id'] = $requestId;
        }

        // Detailed debug info in dev/testing
        if (config('app.debug')) {
            $payload['error']['exception'] = get_class($exception);
            $payload['error']['file'] = $exception->getFile();
            $payload['error']['line'] = $exception->getLine();
            $trace = array_slice($exception->getTrace(), 0, 10);
            $payload['error']['trace'] = array_map(function ($frame) {
                return ($frame['file'] ?? 'unknown') . ':' . ($frame['line'] ?? '?');
            }, $trace);
        }

        return response()->json($payload, $status);
    }

    protected function classifyError(Throwable $e): string
    {
        return match (true) {
            $e instanceof AuthorizationException,
            $e instanceof HttpException && $e->getStatusCode() === 403 => 'authorization_error',
            $e instanceof AuthenticationException => 'authentication_error',
            $e instanceof ValidationException => 'validation_error',
            $e instanceof NotFoundHttpException,
            $e instanceof ModelNotFoundException => 'not_found',
            $e instanceof HttpResponseException => 'http_error',
            default => 'server_error',
        };
    }

    protected function getHttpStatusCode(Throwable $e): int
    {
        return match (true) {
            $e instanceof HttpException => $e->getStatusCode(),
            $e instanceof AuthenticationException => 401,
            $e instanceof AuthorizationException => 403,
            $e instanceof ValidationException => 422,
            $e instanceof ModelNotFoundException => 404,
            default => 500,
        };
    }

    protected function getErrorMessage(Throwable $e, string $type): string
    {
        if ($e instanceof HttpException) {
            return $e->getMessage() ?: match ($e->getStatusCode()) {
                403 => 'This action is unauthorized.',
                404 => 'Resource not found.',
                429 => 'Too many requests.',
                default => 'An error occurred.',
            };
        }

        if ($e instanceof AuthenticationException) {
            return 'Authentication required. Please log in.';
        }

        if ($e instanceof AuthorizationException) {
            return 'This action is unauthorized.';
        }

        if ($e instanceof ValidationException) {
            return 'The given data was invalid.';
        }

        if ($e instanceof ModelNotFoundException) {
            return 'Resource not found.';
        }

        return $e->getMessage() ?: 'An unexpected error occurred.';
    }
}
