<?php
/**
 * facts
 * User: fokin
 * Created: 02/10/2019
 */

namespace Fokin\PhotoFacts\Models;

use App\UUID;
use Facts\Classes\Anything;


/**
 * Class for presentation of photo in photos project
 *
 * @package Facts\Models
 */
class Photo
{
    protected $_data;

    public function __construct($data) {
        $this->_data = $data;
    }

    public function getStorageName() {
        [$storage] = Anything::dataGetType($this->_data, UUID::LINK_TO_STORAGE);

        switch($storage) {
            case UUID::FLICKR_F0KIN:
                return 'Flickr';
            case UUID::YANDEX_VICF:
                return 'Yandex';
            case UUID::MAC_MINI:
                return 'Mac Mini';
            default:
                return 'unknown';
        }
    }
}
