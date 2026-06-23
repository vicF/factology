<?php
/**
 * One-time migration script: copies data from MySQL container to PostgreSQL
 */

$mysqlHost = 'factology-mysql-tmp';
$mysqlUser = 'root';
$mysqlPass = 'root';
$mysqlDb = 'factology';
$pgsqlDsn = 'pgsql:host=factology-postgres;port=5432;dbname=factology';
$pgsqlUser = 'dbuser';
$pgsqlPass = 'securerootpassword';

// Connect to MySQL (buffered)
try {
    $mysql = new PDO("mysql:host=$mysqlHost;dbname=$mysqlDb;charset=utf8mb4", $mysqlUser, $mysqlPass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
    echo "Connected to MySQL\n";
} catch (PDOException $e) {
    die("MySQL connection failed: " . $e->getMessage() . "\n");
}

// Connect to PostgreSQL
try {
    $pgsql = new PDO($pgsqlDsn, $pgsqlUser, $pgsqlPass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
    echo "Connected to PostgreSQL\n";
} catch (PDOException $e) {
    die("PostgreSQL connection failed: " . $e->getMessage() . "\n");
}

// Truncate tables in reverse dependency order
$tablesReverse = [
    'telescope_entries_tags', 'telescope_monitoring', 'telescope_entries',
    'oauth_refresh_tokens', 'oauth_auth_codes', 'oauth_access_tokens',
    'oauth_personal_access_clients', 'oauth_clients',
    'personal_access_tokens', 'password_resets', 'failed_jobs',
    'history', 'favorites', 'links',
    'external_links', 'users', 'classes', 'photo_files', 'photo_media',
    'photo_places', 'things', 'general_types',
];

foreach ($tablesReverse as $table) {
    $pgsql->exec("TRUNCATE TABLE \"$table\" CASCADE");
    echo "Truncated $table\n";
}

// Tables to migrate (ordered by FK dependencies)
$tablesOrdered = [
    'general_types',
    'things', 'photo_media', 'photo_places', 'photo_files',
    'classes', 'users', 'external_links', 'links',
    'favorites', 'history',
    'failed_jobs', 'password_resets', 'personal_access_tokens',
    'oauth_clients', 'oauth_personal_access_clients', 'oauth_access_tokens',
    'oauth_auth_codes', 'oauth_refresh_tokens',
    'telescope_entries', 'telescope_entries_tags', 'telescope_monitoring',
];

// Column name mappings for renamed columns (MySQL -> PostgreSQL)
$columnMaps = [
    'links' => ['thing_id' => 'one_thing_id'],
];

// Columns to exclude from MySQL (exist in MySQL but not in PostgreSQL)
$excludeCols = [
    'links' => ['deleted'],
];

foreach ($tablesOrdered as $table) {
    echo "\nMigrating $table... ";

    $countStmt = $mysql->query("SELECT COUNT(*) FROM `$table`");
    $count = (int) $countStmt->fetchColumn();
    echo "$count rows\n";

    if ($count === 0) {
        continue;
    }

    // Get column metadata from MySQL
    $colStmt = $mysql->query("SHOW COLUMNS FROM `$table`");
    $allColumns = [];
    $mysqlTypes = [];
    while ($col = $colStmt->fetch(PDO::FETCH_ASSOC)) {
        $allColumns[] = $col['Field'];
        $mysqlTypes[$col['Field']] = $col['Type'];
    }
    $colStmt->closeCursor();

    // Build export columns (MySQL names) and import columns (PostgreSQL names)
    $exportCols = [];
    $importCols = [];
    foreach ($allColumns as $col) {
        // Skip excluded columns
        if (isset($excludeCols[$table]) && in_array($col, $excludeCols[$table])) {
            continue;
        }
        $exportCols[] = "`$col`";
        if (isset($columnMaps[$table][$col])) {
            $importCols[] = '"' . $columnMaps[$table][$col] . '"';
        } else {
            $importCols[] = '"' . $col . '"';
        }
    }

    $selectCols = implode(', ', $exportCols);
    $columnsList = array_map(function($c) { return trim($c, '`'); }, $exportCols);
    $insertCols = implode(', ', $importCols);
    $placeholders = rtrim(str_repeat('?,', count($exportCols)), ',');
    $insertSql = "INSERT INTO \"$table\" ($insertCols) VALUES ($placeholders)";
    $insertStmt = $pgsql->prepare($insertSql);

    // Fetch in chunks from MySQL
    $offset = 0;
    $chunkSize = 1000;
    $inserted = 0;

    $pgsql->beginTransaction();

    do {
        $selectStmt = $mysql->prepare("SELECT $selectCols FROM `$table` LIMIT $chunkSize OFFSET $offset");
        $selectStmt->execute();
        $rows = $selectStmt->fetchAll(PDO::FETCH_NUM);
        $selectStmt->closeCursor();

        if (count($rows) === 0) {
            break;
        }

        foreach ($rows as $row) {
            $params = [];
            foreach ($row as $i => $value) {
                $colName = $columnsList[$i];
                $type = $mysqlTypes[$colName] ?? '';

                // Set existing thing_id for users with null thing_id
                if ($table === 'users' && $colName === 'thing_id' && $value === null) {
                    static $fallbackThingId = null;
                    if ($fallbackThingId === null) {
                        $fallbackThingId = '939cd822-9e23-450c-8c5e-c23f67cca792';
                    }
                    $params[] = $fallbackThingId;
                    continue;
                }

                if ($value === null) {
                    $params[] = null;
                    continue;
                }

                // tinyint(1) -> boolean
                if (strpos($type, 'tinyint(1)') === 0) {
                    $params[] = $value ? 1 : 0;
                    continue;
                }

                // MySQL "0000-00-00" timestamps -> null
                if (strpos($value, '0000-00-00') === 0) {
                    $params[] = null;
                    continue;
                }

                $params[] = $value;
            }

            $insertStmt->execute($params);
            $inserted++;

            if ($inserted % $chunkSize === 0) {
                $pgsql->commit();
                echo "  Inserted $inserted / $count\n";
                $pgsql->beginTransaction();
            }
        }

        $offset += $chunkSize;
    } while (true);

    $pgsql->commit();

    // Reset serial sequences
    try {
        $seqStmt = $pgsql->query("SELECT pg_get_serial_sequence('\"$table\"', 'id')");
        $seqName = $seqStmt->fetchColumn();
        if ($seqName) {
            $maxStmt = $pgsql->query("SELECT COALESCE(MAX(\"id\"), 0) FROM \"$table\"");
            $maxId = $maxStmt->fetchColumn();
            $pgsql->exec("SELECT setval('$seqName', $maxId)");
        }
    } catch (Exception $e) {
        // No serial sequence
    }

    echo "  Done. Inserted $inserted / $count rows\n";
}

echo "\nMigration complete!\n";
