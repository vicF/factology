// resources/js/gedcom/gedcomFixtures.js
//
// GEDCOM fixtures copied VERBATIM from the server PHP tests
// (tests/Feature/GedcomImportTest.php and GedcomImportSourcesTest.php on the
// feature/gedcom branch) so the client importer is exercised against the exact
// inputs the PHP importer was validated against.
//
// Expected-count comments reflect the fact that fixtures travel through
// importers that always (re)run with the same test owner and fileKey defaults
// (a fresh DB per test → one pass only).

/** Simple John/Jane family (mirrors testImportsSimpleGedcom). */
export const SIMPLE_FAMILY_GEDCOM = [
    '0 HEAD',
    '1 SOUR FTM',
    '1 CHAR UTF-8',
    '0 @I1@ INDI',
    '1 NAME John /Smith/',
    '1 SEX M',
    '1 BIRT',
    '2 DATE 12 APR 1856',
    '0 @I2@ INDI',
    '1 NAME Jane /Doe/',
    '1 SEX F',
    '1 BIRT',
    '2 DATE 1860',
    '1 DEAT',
    '2 DATE AFT 1900',
    '0 @F1@ FAM',
    '1 HUSB @I1@',
    '1 WIFE @I2@',
    '1 MARR',
    '2 DATE 1880',
    '0 TRLR',
].join('\n');

/**
 * John Smith M *1856, Jane Doe F *1860 †aft1900, marriage in 1880.
 * expected: imported = 1 person(John) + 1 person(Jane) + 1 BIRT + 1 DEAT +
 * 1 MARR + 1 MARRIED_TO = 6. (Places absent → no place things.)
 */

/** Woman with a married name differing from her birth surname. */
export const MARRIED_WOMAN_GEDCOM = [
    '0 HEAD',
    '1 CHAR UTF-8',
    '0 @I1@ INDI',
    '1 NAME Victoria /Smith/',
    '2 GIVN Victoria',
    '2 SURN Smith',
    '2 _MARNM McAllen',
    '1 SEX F',
    '1 BIRT',
    '2 DATE 1901',
    '0 TRLR',
].join('\n');

/**
 * Women store the married name only when SEX F and _MARNM != SURN; the person
 * name is recomposed as "Given Married (Birth)" → "Victoria McAllen (Smith)".
 * expected: imported = 1 person + 1 BIRT = 2; name keeps no '/';
 * properties.married_name === 'McAllen'.
 */

/** url-only source cited by a BIRT event (mirrors url_only_sources…). */
export const URL_ONLY_SOURCE_GEDCOM = [
    '0 HEAD',
    '1 CHAR UTF-8',
    '0 @I1@ INDI',
    '1 NAME John /Smith/',
    '1 BIRT',
    '2 DATE 12 APR 1856',
    '2 SOUR @S1@',
    '0 @S1@ SOUR',
    '1 TITL www.example-site.ru',
    '1 WWW http://www.example-site.ru/page',
    '0 TRLR',
].join('\n');

/**
 * Birth event cites a URL-only source → no Source thing is created; the URL is
 * attached as an external link on the birth event.
 * expected: imported = 1 person + 1 BIRT = 2; no source thing;
 * external_links row on the BIRT thing (1).
 */

/** Bibliographic source cited by a BIRT event (mirrors cited_bibliographic…). */
export const CITED_BIBLIOGRAPHIC_GEDCOM = [
    '0 HEAD',
    '1 CHAR UTF-8',
    '0 @I1@ INDI',
    '1 NAME John /Smith/',
    '1 BIRT',
    '2 DATE 12 APR 1856',
    '2 SOUR @S2@',
    '0 @S2@ SOUR',
    '1 TITL Метрическая книга',
    '1 PUBL Архив',
    '1 WWW http://example.org/metric',
    '0 TRLR',
].join('\n');

/**
 * Bibliographic source (title + publisher + URL) is classed under SOURCE_CLASS
 * and its URL is kept as an external link; the birth event gets a
 * source → EVIDENCE → event citation edge.
 * expected: imported = 1 person + 1 BIRT + 1 source = 3;
 * 1 external_links row on the source; 1 EVIDENCE edge.
 */

/** Standalone bibliographic source (no citation) (mirrors bibliographic_sources…). */
export const STANDALONE_BIBLIOGRAPHIC_GEDCOM = [
    '0 HEAD',
    '1 CHAR UTF-8',
    '0 @S2@ SOUR',
    '1 TITL Указатель «Возвращенные имена»',
    '1 PUBL Память народа',
    '1 WWW http://pamyat-naroda.ru/book',
    '0 TRLR',
].join('\n');

/** url-only source cited by NOTHING (mirrors uncited_url_only_sources…). */
export const UNCITED_URL_ONLY_GEDCOM = [
    '0 HEAD',
    '1 CHAR UTF-8',
    '0 @S3@ SOUR',
    '1 TITL www.orphan-site.org',
    '0 TRLR',
].join('\n');

/** A BIRT/DEAT event pair is fine for most person tests. */

/**
 * Residence-with-place + an independent BIRT sharing one settlement so the
 * place is reused for both events (single Place thing). Mirrors the style of
 * SIMPLE_FAMILY / Russian-content GEDCOMs with PLAC parsing.
 */
export const RESIDENCE_PLACE_GEDCOM = [
    '0 HEAD',
    '1 CHAR UTF-8',
    '0 @I1@ INDI',
    '1 NAME Иван /Петров/',
    '1 SEX M',
    '1 BIRT',
    '2 DATE 1856-04-12',
    '2 PLAC Москва, Россия',
    '1 RESI',
    '2 DATE 1900',
    '2 PLAC Москва, Россия',
    '0 TRLR',
].join('\n');

/**
 * Both the birth and the residence happen "в Москве" → a single Place-class
 * thing reused by both events (INSIDE links ×2), residence event named
 * «Проживание в Москва».
 * expected: imported = 1 person + 1 BIRT + 1 RESI + 1 place = 4;
 * 2 INSIDE links; placeCache prevents a duplicate place thing.
 */
