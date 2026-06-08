$now = Get-Date -Format "yyyy_MM_dd"
$dbUser = if ($env:DB_USERNAME) { $env:DB_USERNAME } else { "dbuser" }
$dbName = if ($env:DB_DATABASE) { $env:DB_DATABASE } else { "factology" }
$backupFile = "factology_$now.sql"

Write-Host "Creating PostgreSQL backup: $backupFile" -ForegroundColor Cyan

# --encoding=UTF8 is critical: without it pg_dump can produce UTF-16 on Windows hosts
docker exec factology-postgres sh -c `
    "pg_dump -U $dbUser -d $dbName --encoding=UTF8 --no-owner --no-acl" `
    | Out-File -FilePath $backupFile -Encoding utf8NoBom

if ($LASTEXITCODE -eq 0) {
    Write-Host "Backup created: $backupFile" -ForegroundColor Green
} else {
    Write-Host "Backup failed (exit code: $LASTEXITCODE)" -ForegroundColor Red
    exit 1
}
