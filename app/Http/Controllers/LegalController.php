<?php

namespace App\Http\Controllers;

use App\Models\LegalDocument;
use Illuminate\Http\Request;

class LegalController extends Controller
{
    /**
     * Get a legal document by type, locale, and country.
     * GET /api/v1/legal/{type}?locale=ru&country=RU
     */
    public function show($type, Request $request)
    {
        $validTypes = ['terms', 'privacy'];
        if (!in_array($type, $validTypes)) {
            return response()->json(['message' => 'Invalid document type'], 404);
        }

        $locale = $request->query('locale', app()->getLocale());
        $country = strtoupper($request->query('country', '*'));

        // Try exact match first: type + country + locale
        $doc = LegalDocument::where('type', $type)
            ->where('country', $country)
            ->where('locale', $locale)
            ->orderBy('version', 'desc')
            ->first();

        // Fallback to type + country + en
        if (!$doc) {
            $doc = LegalDocument::where('type', $type)
                ->where('country', $country)
                ->where('locale', 'en')
                ->orderBy('version', 'desc')
                ->first();
        }

        // Fallback to type + universal (*) + requested locale
        if (!$doc) {
            $doc = LegalDocument::where('type', $type)
                ->where('country', '*')
                ->where('locale', $locale)
                ->orderBy('version', 'desc')
                ->first();
        }

        // Final fallback: type + universal + en
        if (!$doc) {
            $doc = LegalDocument::where('type', $type)
                ->where('country', '*')
                ->where('locale', 'en')
                ->orderBy('version', 'desc')
                ->first();
        }

        if (!$doc) {
            return response()->json(['message' => 'Document not found'], 404);
        }

        return response()->json([
            'type' => $doc->type,
            'title' => $doc->title,
            'content' => $doc->content,
            'version' => $doc->version,
            'country' => $doc->country,
            'locale' => $doc->locale,
        ]);
    }

    /**
     * List all available legal document types and their versions.
     * GET /api/v1/legal
     */
    public function index(Request $request)
    {
        $locale = $request->query('locale', app()->getLocale());
        $country = strtoupper($request->query('country', '*'));

        $documents = LegalDocument::where(function ($q) use ($country) {
                $q->where('country', $country)->orWhere('country', '*');
            })
            ->where(function ($q) use ($locale) {
                $q->where('locale', $locale)->orWhere('locale', 'en');
            })
            ->orderBy('type')
            ->orderBy('country', 'desc') // '*' comes after specific
            ->orderBy('locale', 'desc')  // 'en' comes after specific
            ->orderBy('version', 'desc')
            ->get()
            ->unique('type'); // one per type, priority to most specific match

        return response()->json($documents->map(function ($doc) {
            return [
                'type' => $doc->type,
                'title' => $doc->title,
                'version' => $doc->version,
                'country' => $doc->country,
                'locale' => $doc->locale,
            ];
        })->values());
    }
}
