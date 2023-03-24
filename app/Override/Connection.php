<?php
/**
 * factology
 * User: fokin
 * Created: 23/06/2020
 */

namespace App\Override;


class Connection extends \Illuminate\Database\MySqlConnection {
    //@Override
    public function query() {
        return new QueryBuilder(
            $this,
            $this->getQueryGrammar(),
            $this->getPostProcessor()
        );
    }
}