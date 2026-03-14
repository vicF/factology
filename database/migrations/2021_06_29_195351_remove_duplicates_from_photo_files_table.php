<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class RemoveDuplicatesFromPhotoFilesTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        // Remove extra records for the same files
        DB::statement('DELETE S1
FROM photo_files AS S1
         INNER JOIN photo_files AS S2
WHERE S1.id > S2.id
  AND S1.filename = S2.filename
  AND S1.path = S2.path
  AND S1.folder_id = S2.folder_id ');
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {

    }
}