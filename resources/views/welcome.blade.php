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
        #app-loader-detail {
            font-size: 12px;
            color: #999;
            max-width: 420px;
            text-align: center;
            line-height: 1.4;
        }
        #app-loader-detail.warn {
            color: #e67e22;
        }
        #app-loader-detail.error {
            color: #c0392b;
        }
    </style>
</head>
<body>
<div id="app">
    <div id="app-loader">
        <div class="app-loader-spinner"></div>
        <div id="app-loader-status">Loading application assets from Vite…</div>
        <div id="app-loader-detail" style="display:none"></div>
    </div>
</div>
<script>
(function() {
    var statusEl = document.getElementById('app-loader-status');
    var detailEl = document.getElementById('app-loader-detail');
    var viteOk = false;
    var apiOk = false;

    function setStatus(msg, detail, level) {
        if (statusEl) statusEl.textContent = msg;
        if (detailEl) {
            detailEl.textContent = detail || '';
            detailEl.style.display = detail ? '' : 'none';
            detailEl.className = level ? level : '';
        }
    }

    function checkVite() {
        var t0 = Date.now();
        return fetch('http://localhost:5173/@@vite/client', { mode: 'no-cors' })
            .then(function () {
                viteOk = true;
                setStatus('Vite is responding (' + (Date.now() - t0) + 'ms). Loading modules…');
            })
            .catch(function () {
                viteOk = false;
            });
    }

    function checkApi() {
        var controller = new AbortController();
        var t0 = Date.now();
        var timeout = setTimeout(function () { controller.abort(); }, 5000);
        return fetch('/api/v1/settings/public', { method: 'HEAD', signal: controller.signal })
            .then(function () {
                clearTimeout(timeout);
                apiOk = true;
                setStatus('Backend connected (' + (Date.now() - t0) + 'ms). Starting application…');
            })
            .catch(function () {
                clearTimeout(timeout);
                apiOk = false;
            });
    }

    // Phase 1 (3s): Check if Vite dev server is reachable
    setTimeout(function () {
        checkVite().then(function () {
            if (!viteOk) {
                setStatus(
                    'Waiting for Vite dev server…',
                    'Vite is not responding on port 5173. It may be starting up or has crashed. Check: docker logs factology-node',
                    'warn'
                );
            }
        });
    }, 3000);

    // Phase 2 (8s): If Vite is up, check backend API
    setTimeout(function () {
        if (viteOk) {
            setStatus('Assets served. Connecting to backend…');
            checkApi().then(function () {
                if (!apiOk) {
                    setStatus(
                        'Backend API not responding',
                        'Vite is running but the Laravel backend is unreachable. Check: docker logs factology',
                        'warn'
                    );
                }
            });
        } else {
            // Re-check Vite (maybe it started between phase 1 and now)
            checkVite().then(function () {
                if (viteOk) {
                    setStatus('Vite is responding. Loading modules…');
                } else {
                    setStatus(
                        'Vite dev server is not responding',
                        'The node container may have crashed. Run: docker restart factology-node',
                        'warn'
                    );
                }
            });
        }
    }, 8000);

    // Phase 3 (20s): Everything should be loaded by now
    setTimeout(function () {
        if (!viteOk) {
            setStatus(
                'Vite is not responding',
                'Vite dev server is unreachable after 20s. Check browser console for connection errors. Run: docker logs factology-node',
                'error'
            );
        } else if (!apiOk) {
            setStatus(
                'Backend is not responding',
                'Vite is running but the API is unreachable after 20s. Check: docker logs factology',
                'error'
            );
        }
    }, 20000);
})();
</script>
</html>
