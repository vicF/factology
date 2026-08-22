<?php

namespace App\Console\Commands;

use App\Services\Importer\GedcomImporter;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

class ImportGedcom extends Command
{
    protected $signature = 'factology:import-gedcom
                            {file : Path to the GEDCOM .ged file}
                            {owner : UUID of the owner thing (person)}
                            {--source-name= : Optional source name (defaults to file content hash)}';

    protected $description = 'Import a GEDCOM 5.5.1 file as things and links';

    public function handle(): int
    {
        $filePath = $this->argument('file');
        $ownerId = $this->argument('owner');

        if (!file_exists($filePath) || !is_readable($filePath)) {
            $this->error("File not found or not readable: {$filePath}");
            return self::FAILURE;
        }

        if (!preg_match('/^[a-f0-9-]{36}$/i', $ownerId)) {
            $this->error("Invalid owner UUID format: {$ownerId}");
            return self::FAILURE;
        }

        $this->info("Reading GEDCOM file: {$filePath}");
        $content = file_get_contents($filePath);
        if ($content === false || trim($content) === '') {
            $this->error('Empty or unreadable file');
            return self::FAILURE;
        }

        $this->info('Importing...');
        $fileKey = $this->option('source-name');
        $importer = new GedcomImporter($ownerId, $fileKey, $content);
        $result = $importer->import($content);

        $this->info(sprintf(
            'Import complete: %d imported, %d skipped, %d errors',
            $result['imported'],
            $result['skipped'],
            $result['errors']
        ));

        if (!empty($result['details'])) {
            $this->warn('Details:');
            foreach ($result['details'] as $detail) {
                $this->warn("  - {$detail}");
            }
        }

        return self::SUCCESS;
    }
}