<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <title>Factology</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
    <!-- Fonts -->
    <link href="https://fonts.bunny.net/css2?family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
        @php $viteDevUrl = env('VITE_DEV_SERVER_URL', 'http://localhost:5173') @endphp
        <script type="module" src="{{$viteDevUrl}}/@vite/client"></script>
        <script type="module" src="{{$viteDevUrl}}/resources/js/app.js"></script>
</head>
<body>
<div id="app">
    <router-view></router-view>
</div>
</body>
</html>
