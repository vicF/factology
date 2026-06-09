param(
    [Parameter(Mandatory=$true)]
    [string]$file
)
$dbUser = if ($env:DB_USERNAME) { $env:DB_USERNAME } else { "dbuser" }
$dbName = if ($env:DB_DATABASE) { $env:DB_DATABASE } else { "factology" }

Write-Host "Restoring $file to PostgreSQL..." -ForegroundColor Cyan

# Step 1: Drop all existing tables to ensure clean restore
$dropSql = @'
DO $$ DECLARE r RECORD; BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP EXECUTE 'DROP TABLE IF EXISTS "' || r.tablename || '" CASCADE'; END LOOP; END $$;
'@
$dropSql | docker exec -i factology-postgres psql -U $dbUser -d $dbName -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to drop tables" -ForegroundColor Red
    exit 1
}

# Step 2: Restore from dump — read directly from the /dumps volume mount,
# bypassing PowerShell's pipeline encoding entirely.
$restoreFile = "/dumps/$file"
docker exec factology-postgres psql -U $dbUser -d $dbName -v ON_ERROR_STOP=1 -f $restoreFile
if ($LASTEXITCODE -ne 0) {
    Write-Host "Restore failed (exit code: $LASTEXITCODE)" -ForegroundColor Red
    exit 1
}

# Step 3: Quick Cyrillic integrity check (guards against missing things table)
# NOTE: keep ASCII-only in string literals; PowerShell on Windows may not read UTF-8 without BOM
$cyrillicCheck = @"
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'things')
    THEN (SELECT count(*)::text FROM things WHERE octet_length(description) <> char_length(description))
  ELSE 'SKIP'
END AS cyrillic_rows;
"@
$result = $cyrillicCheck | docker exec -i factology-postgres psql -U $dbUser -d $dbName -t -A 2>&1
$result = $result -replace '\s', ''
if ($result -eq 'SKIP') {
    Write-Host "Restore complete (skipped Cyrillic check - no 'things' table)." -ForegroundColor Green
} elseif ([int]$result -gt 0) {
    Write-Host "Restore complete. Cyrillic integrity OK ($result rows with multi-byte chars)." -ForegroundColor Green
} else {
    Write-Host "WARNING: No multi-byte characters found in descriptions - Cyrillic may be corrupted!" -ForegroundColor Yellow
}
