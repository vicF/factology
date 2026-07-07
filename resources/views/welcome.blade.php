<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <title>Factology</title>
    @vite(['resources/js/app.js'])
    <style>
        #app-loader {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 16px;
            min-height: 100vh;
            color: #6c757d;
            font-family: system-ui, sans-serif;
            font-size: 14px;
        }
        .app-loader-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #e0e0e0;
            border-top-color: #3498db;
            border-radius: 50%;
            animation: app-loader-spin 0.8s linear infinite;
        }
        @keyframes app-loader-spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
<div id="app">
    <div id="app-loader">
        <div class="app-loader-spinner"></div>
        <div>Loading Factology…</div>
    </div>
</div>
</body>
</html>
