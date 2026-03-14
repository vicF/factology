<?php
/**
 * factology
 * User: fokin
 * Created: 11/06/2020
 */

namespace App\Models\Classes;


/**
 * @property $thing_id
 * @property $name
 * @property $description
 * @property $start
 * @property $end
 * @property $class_id
 * @method Thing thing_id($thing_id)
 * @method Thing name($name)
 * @method Thing description($description)
 * @method Thing start($start)
 * @method Thing end($end)
 * @method Thing class_id($class_id)
 */
class Thing extends Anything
{
    /**
     * @var array default values for model parameters
     */
    public $defaults = ['end' => null, 'type' => self::THING];
    /**
     * @var string[] values for links and linked tables
     */
    public $additionalParams = ['class_id'];

    /**
     * Calls save method and then creates additional links
     *
     */
    public function createWithLinks()
    {
        parent::createWithLinks();
        $this->setClass($this->class_id);
        //$this->save();
    }
}
