<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Auto-generated translations (written by Everything::setLinkTranslation and
     * the taxonomy seeder) are redundant with the arrowed LinkDescription the UI
     * renders now. Manual/descriptive translations that do NOT match these
     * patterns carry real information — those are promoted to a new
     * `description` column, and the `translation` column is cleared everywhere.
     */
    private const AUTO_PATTERN = ' is (related to|of class|a child of|child of|a subclass of|subclass of|a property of|a part of|a member of|involved in|a duplicate of|also known as|the same as|a superclass of|a kind of|a category of|a type of|an instance of) ';
    private const AUTO_PATTERN_NO_NAMES = '^is (related to|of class|a child of|child of|a subclass of|subclass of|a property of|a part of|a member of) ';
    private const AUTO_PATTERN_END = ' is (of class|related to|a child of|child of|a subclass of|subclass of|a property of)$';

    public function up(): void
    {
        if (!Schema::hasColumn('links', 'description')) {
            Schema::table('links', function (Blueprint $table) {
                $table->text('description')->nullable()->after('translation');
            });
        }

        $driver = DB::connection()->getDriverName();
        if ($driver === 'pgsql') {
            $notAuto = "(translation !~ ? AND translation !~ ? AND translation !~ ?)";
        } elseif ($driver === 'mysql') {
            $notAuto = "(translation NOT REGEXP ? AND translation NOT REGEXP ? AND translation NOT REGEXP ?)";
        } else {
            $notAuto = "(translation IS NOT NULL)"; // sqlite etc: promote everything
        }

        DB::table('links')
            ->whereNotNull('translation')
            ->where('translation', '<>', '')
            ->whereRaw($notAuto, [self::AUTO_PATTERN, self::AUTO_PATTERN_NO_NAMES, self::AUTO_PATTERN_END])
            ->update(['description' => DB::raw('translation')]);

        // Redundant generated translations are removed; meaningful ones were
        // copied to description above.
        DB::table('links')->update(['translation' => null]);
    }

    public function down(): void
    {
        if (Schema::hasColumn('links', 'description')) {
            // Restore any description that came from translation before dropping.
            DB::table('links')
                ->whereNull('translation')
                ->whereNotNull('description')
                ->where('description', '<>', '')
                ->update(['translation' => DB::raw('description')]);

            Schema::table('links', function (Blueprint $table) {
                $table->dropColumn('description');
            });
        }
    }
};
