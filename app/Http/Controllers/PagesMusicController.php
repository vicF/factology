<?php
/**
 * factology
 * User: fokin
 * Created: 14/01/2021
 */

namespace App\Http\Controllers;


use App\Models\Classes\Anything;
use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;

class PagesMusicController extends Controller
{
    public function bands()
    {
        $data = DB::table('links')
            ->select('links.*', 'things.*')
            ->where('links.link_type_id', UUID::LINK_TO_CLASS)
            ->where('links.other_thing_id', UUID::MUSIC_BAND)
            ->where('things.deleted', 0)
            ->auth('links')
            ->join('things', 'links.one_thing_id', 'things.thing_id')
            ->auth('things')
            ->orderBy('name')
            ->get()->toArray();
        array_walk($data, static function ($row) {
            [$row->start_year] = explode('-', Anything::dateFromDb($row->start));
            [$row->end_year] = explode('-', Anything::dateFromDb($row->end));
            return $row;
        });
        return view('pages.music.bands', ['data' => $data]);
    }

    public function band($id)
    {
        $data['band'] = Anything::createFromId($id);
        $data['concerts'] = DB::table('links')
            ->where('links.link_type_id', UUID::PRESENT_AS_ACTOR)
            ->where('links.other_thing_id', $id)
            ->where('things.deleted', 0)
            ->auth('links')
            ->join('things', 'links.one_thing_id', 'things.thing_id')
            ->auth('things')
            ->orderBy('start', 'desc')
            ->get()->toArray();
        array_walk($data['concerts'], static function ($row) {
            $row->start_date = Anything::dateFromDb($row->start);
            $row->end_date = Anything::dateFromDb($row->end);
            return $row;
        });
        $data['members'] = DB::table('links')
            ->whereIn('links.link_type_id', [UUID::MEMBER_OF])
            ->where('links.other_thing_id', $id)
            ->where('things.deleted', 0)
            ->auth('links')
            ->join('things', 'links.one_thing_id', 'things.thing_id')
            ->auth('things')
            ->orderBy('start', 'desc')
            ->get()->toArray();
        array_walk($data['members'], static function ($row) {
            $row->start_year = Anything::dateFromDb($row->link_start);
            $row->end_year = Anything::dateFromDb($row->link_end, null, 'Y');
            return $row;
        });
        $data['now'] = Anything::dateToDb((new \DateTime())->format(Anything::TIME_FORMAT));  // to compare
        $data['upcoming'] = true;
        return view('pages.music.band', $data);
    }

    public function event($id) {

    }

    public function events() {

    }
}
