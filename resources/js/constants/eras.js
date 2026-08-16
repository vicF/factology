// resources/js/constants/eras.js
//
// Mirrors app/Models/Data/Era.php — calendar/era registry ("летоисчисление").
// Must stay in sync with the PHP constants and implement the same integer math.
//
// All conversions produce/consume canonical proleptic Gregorian dates
// (astronomical year numbering: year 0 = 1 BC, negative years for BC).

export const ERA_KEYS = ['gregorian', 'julian', 'world_creation', 'hijri', 'hebrew'];

export const Era = {
    GREGORIAN: 'gregorian',
    JULIAN: 'julian',
    WORLD_CREATION: 'world_creation',
    HIJRI: 'hijri',
    HEBREW: 'hebrew',

    MAX_ERA_YEAR: 10000000,

    LABELS: {
        gregorian: 'era.gregorian',
        julian: 'era.julian',
        world_creation: 'era.world_creation',
        hijri: 'era.hijri',
        hebrew: 'era.hebrew',
    },

    keys() {
        return ERA_KEYS;
    },

    isValid(key) {
        return ERA_KEYS.includes(key);
    },

    label(key) {
        return this.LABELS[key] || this.LABELS.gregorian;
    },

    // Exact integer floor division (JS % truncates toward zero; % keeps sign of a).
    floorDiv(a, b) {
        let q = Math.trunc(a / b);
        const r = a % b;
        if (r !== 0 && (a < 0) !== (b < 0)) {
            q--;
        }
        return q;
    },

    // ─── Gregorian (proleptic, astronomical year numbering) ───

    gregorianToJDN(year, month, day) {
        const a = this.floorDiv(14 - month, 12);
        const y = year + 4800 - a;
        const m = month + 12 * a - 3;
        return day + this.floorDiv(153 * m + 2, 5) + 365 * y
            + this.floorDiv(y, 4) - this.floorDiv(y, 100) + this.floorDiv(y, 400) - 32045;
    },

    jdnToGregorian(jdn) {
        const a = jdn + 32044;
        const b = this.floorDiv(4 * a + 3, 146097);
        const c = a - this.floorDiv(146097 * b, 4);
        const d = this.floorDiv(4 * c + 3, 1461);
        const e = c - this.floorDiv(1461 * d, 4);
        const m = this.floorDiv(5 * e + 2, 153);
        const day = e - this.floorDiv(153 * m + 2, 5) + 1;
        const month = m + 3 - 12 * this.floorDiv(m, 10);
        const year = 100 * b + d - 4800 + this.floorDiv(m, 10);
        return { year, month, day };
    },

    // ─── Julian (proleptic) ───

    julianToJDN(year, month, day) {
        const a = this.floorDiv(14 - month, 12);
        const y = year + 4800 - a;
        const m = month + 12 * a - 3;
        return day + this.floorDiv(153 * m + 2, 5) + 365 * y
            + this.floorDiv(y, 4) - 32083;
    },

    jdnToJulian(jdn) {
        const c = jdn + 32082;
        const d = this.floorDiv(4 * c + 3, 1461);
        const e = c - this.floorDiv(1461 * d, 4);
        const m = this.floorDiv(5 * e + 2, 153);
        const day = e - this.floorDiv(153 * m + 2, 5) + 1;
        const month = m + 3 - 12 * this.floorDiv(m, 10);
        const year = d - 4800 + this.floorDiv(m, 10);
        return { year, month, day };
    },

    // ─── Hijri (tabular / civil Islamic calendar) ───

    isHijriLeap(year) {
        return ((year * 11 + 14) % 30) < 11;
    },

    hijriMonthLength(year, month) {
        if (month === 12) {
            return this.isHijriLeap(year) ? 30 : 29;
        }
        return (month % 2 === 1) ? 30 : 29;
    },

    hijriToJDN(year, month, day) {
        const daysBeforeYear = (year - 1) * 354 + this.floorDiv(3 + 11 * year, 30);
        let daysBeforeMonth = 0;
        for (let m = 1; m < month; m++) {
            daysBeforeMonth += this.hijriMonthLength(year, m);
        }
        return 1948440 + daysBeforeYear + daysBeforeMonth + day - 1;
    },

    jdnToHijri(jdn) {
        const days = jdn - 1948440;
        let year = this.floorDiv(30 * days + 10646, 10631);
        while (this.hijriToJDN(year, 1, 1) > jdn) year--;
        while (this.hijriToJDN(year + 1, 1, 1) <= jdn) year++;
        let start = this.hijriToJDN(year, 1, 1);
        for (let month = 1; month <= 12; month++) {
            const len = this.hijriMonthLength(year, month);
            if (jdn < start + len) {
                return { year, month, day: jdn - start + 1 };
            }
            start += len;
        }
        return { year, month: 12, day: jdn - start + 1 };
    },

    // ─── Hebrew (lunisolar, Reingold–Dershowitz molad + postponements) ───

    isHebrewLeap(year) {
        return (7 * year + 1) % 19 < 7;
    },

    hebrewNewYear(year) {
        const monthsElapsed = this.floorDiv(235 * year - 234, 19);
        const partsElapsed = 12084 + 13753 * monthsElapsed;
        let day = monthsElapsed * 29 + this.floorDiv(partsElapsed, 25920);
        const parts = partsElapsed % 25920;
        const leap = this.isHebrewLeap(year);
        if (parts >= 19440
            || (day % 7 === 2 && parts >= 9924 && !leap)
            || (day % 7 === 1 && parts >= 16789 && leap)) {
            day++;
        }
        if (day % 7 === 0 || day % 7 === 3 || day % 7 === 5) {
            day++;
        }
        return day + 347999;
    },

    hebrewYearLength(year) {
        return this.hebrewNewYear(year + 1) - this.hebrewNewYear(year);
    },

    hebrewMonthLength(year, month) {
        const leap = this.isHebrewLeap(year);
        const ylen = this.hebrewYearLength(year);
        switch (month) {
            case 1: return 30;
            case 2: return (ylen === 355 || ylen === 385) ? 30 : 29;
            case 3: return (ylen === 353 || ylen === 383) ? 29 : 30;
            case 4: return 29;
            case 5: return 30;
            case 6: return leap ? 30 : 29;
            case 7: return leap ? 29 : 30;
            case 8: return leap ? 30 : 29;
            default: return (((month + (leap ? 1 : 0)) % 2) === 1) ? 30 : 29;
        }
    },

    hebrewToJDN(year, month, day) {
        let jdn = this.hebrewNewYear(year);
        for (let m = 1; m < month; m++) {
            jdn += this.hebrewMonthLength(year, m);
        }
        return jdn + day - 1;
    },

    jdnToHebrew(jdn) {
        const fixed = jdn - 1721425;
        let year = Math.floor((fixed + 1373429) / 365.24682220597794);
        while (this.hebrewNewYear(year) > jdn) year--;
        while (this.hebrewNewYear(year + 1) <= jdn) year++;
        let start = this.hebrewNewYear(year);
        for (let month = 1; month <= 13; month++) {
            const len = this.hebrewMonthLength(year, month);
            if (jdn < start + len) {
                return { year, month, day: jdn - start + 1 };
            }
            start += len;
        }
        return { year, month: 13, day: jdn - start + 1 };
    },

    // ─── Era ⇄ canonical Gregorian ───

    toCanonical(era, year, month, day) {
        switch (era) {
            case this.GREGORIAN:
                return { year, month, day, degrade: false };
            case this.JULIAN: {
                if (Math.abs(year) > this.MAX_ERA_YEAR) break;
                const c = this.jdnToGregorian(this.julianToJDN(year, month, day));
                return { ...c, degrade: false };
            }
            case this.WORLD_CREATION: {
                if (Math.abs(year) > this.MAX_ERA_YEAR + 5509) break;
                const julianYear = year - (month >= 9 ? 5509 : 5508);
                const c = this.jdnToGregorian(this.julianToJDN(julianYear, month, day));
                return { ...c, degrade: false };
            }
            case this.HIJRI: {
                if (Math.abs(year) > this.MAX_ERA_YEAR) break;
                const c = this.jdnToGregorian(this.hijriToJDN(year, month, day));
                return { ...c, degrade: false };
            }
            case this.HEBREW: {
                if (Math.abs(year) > this.MAX_ERA_YEAR) break;
                const c = this.jdnToGregorian(this.hebrewToJDN(year, month, day));
                return { ...c, degrade: false };
            }
        }
        return { year, month, day, degrade: true };
    },

    fromCanonical(era, year, month, day) {
        switch (era) {
            case this.GREGORIAN:
                return { year, month, day, degrade: false };
            case this.JULIAN: {
                if (Math.abs(year) > this.MAX_ERA_YEAR) break;
                const c = this.jdnToJulian(this.gregorianToJDN(year, month, day));
                return { ...c, degrade: false };
            }
            case this.WORLD_CREATION: {
                if (Math.abs(year) > this.MAX_ERA_YEAR) break;
                const julian = this.jdnToJulian(this.gregorianToJDN(year, month, day));
                const amYear = julian.year + (julian.month >= 9 ? 5509 : 5508);
                return { year: amYear, month: julian.month, day: julian.day, degrade: false };
            }
            case this.HIJRI: {
                if (Math.abs(year) > this.MAX_ERA_YEAR) break;
                const c = this.jdnToHijri(this.gregorianToJDN(year, month, day));
                return { ...c, degrade: false };
            }
            case this.HEBREW: {
                if (Math.abs(year) > this.MAX_ERA_YEAR) break;
                const c = this.jdnToHebrew(this.gregorianToJDN(year, month, day));
                return { ...c, degrade: false };
            }
        }
        return { year, month, day, degrade: true };
    },
};
