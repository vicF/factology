$now = Get-Date -Format "yyyy_MM_dd"
$dbUser = if ($env:DB_USERNAME) { $env:DB_USERNAME } else { "dbuser" }
$dbName = if ($env:DB_DATABASE) { $env:DB_DATABASE } else { "factology" }
$backupFile = "factology_$now.sql"

Write-Host "Creating PostgreSQL backup: $backupFile" -ForegroundColor Cyan

# Write directly inside the container via the /dumps volume mount (mapped to ./database/Dumps).
# This avoids PowerShell's pipeline encoding issues that can mangle Cyrillic.
docker exec factology-postgres pg_dump -U $dbUser -d $dbName --encoding=UTF8 --no-owner --no-acl -f /dumps/$backupFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "Backup created: $backupFile" -ForegroundColor Green
} else {
    Write-Host "Backup failed (exit code: $LASTEXITCODE)" -ForegroundColor Red
    exit 1
}
