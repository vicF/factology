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

export const LINK_TO_PARENT = '361c19af-c011-4051-9329-49c75d1ca0fb';
export const LINK_TO_CLASS = 'c217c185-742f-4a9f-8e69-acea2b4f5aea';
export const SOMETHING = '3e15244c-a9e1-4a91-a0ca-1c65722a64df';

// You can also export as object for better grouping
export const TYPE_NAMES = {
    [CLASS_TYPE]:    'Class',
    [THING_TYPE]:    'Thing',
    [LINK_TYPE]:     'Link',
    [EXTERNAL_TYPE]: 'External'
};
