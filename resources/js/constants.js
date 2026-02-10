// resources/js/constants.js

export const OBJECT_TYPES = {
    CLASS:    2,
    THING:    3,
    LINK:     4,
    EXTERNAL: 5
};

// Optional: named exports if you prefer
export const CLASS_TYPE    = 2;
export const THING_TYPE    = 3;
export const LINK_TYPE     = 4;
export const EXTERNAL_TYPE = 5;

// You can also export as object for better grouping
export const TYPE_NAMES = {
    [CLASS_TYPE]:    'Class',
    [THING_TYPE]:    'Thing',
    [LINK_TYPE]:     'Link',
    [EXTERNAL_TYPE]: 'External'
};
