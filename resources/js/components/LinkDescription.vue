<!-- components/LinkDescription.vue -->
<template>
    <span class="link-description" :class="[sizeClass, customClass]">
        <span v-html="generatedText"></span>
    </span>
</template>

<script setup>
import { computed } from 'vue';
import { useObjectCacheStore } from '@/stores/objectCache.js';
import { fieldText, objectName } from '../utils/localized.js';

const props = defineProps({
    link: {
        type: Object,
        required: true
    },
    object: {
        type: Object,
        required: true
    },
    size: {
        type: String,
        default: 'small',
        validator: (value) => ['small', 'medium', 'large'].includes(value)
    },
    customClass: {
        type: String,
        default: ''
    },
    // When true, the endpoint matching `object` is rendered as a compact
    // "*" marker instead of its name — used in related-items lists where the
    // common object would otherwise be repeated on every row.
    hideObjectName: {
        type: Boolean,
        default: false
    }
});

const cacheStore = useObjectCacheStore();

const resolveName = (id, fallback) => {
    if (!id) return 'Unknown';
    const cached = cacheStore.getCachedObject(id);
    if (cached) return objectName(cached) || 'Unknown';
    return fallback || 'Unknown';
};

const generateLinkDescription = (link, object) => {
    if (!link) return ''

    const parts = []

    const objectIsOne = object.thing_id === link.one_thing_id;

    // The API provides both endpoint names: link.name is the name of
    // other_thing_id and link.one_name the name of one_thing_id. The current
    // object's own name is always available. (In the edit modal neither server
    // name is passed, so the fallbacks are the current object's name or
    // 'Unknown' — the LinkedObject preload fills the cache and this computed
    // re-resolves.)
    const oneName = objectIsOne
        ? resolveName(link.one_thing_id, objectName(object))
        : resolveName(link.one_thing_id, link.one_name);

    const otherName = objectIsOne
        ? resolveName(link.other_thing_id, link.name)
        : resolveName(link.other_thing_id, objectName(object));

    // Prefer the payload's translated link-type name (link_type thing's
    // name_translations), then the cache, then the plain English name.
    const linkTypeName = fieldText(link.link_name, link.link_name_translations)
        || resolveName(link.link_type_id, link.link_name);

    // Space-saving marker for the endpoint that equals the passed object.
    const marker = '<span class="link-common-marker">*</span>';
    const oneIsObject = link.one_thing_id === object.thing_id;
    const oneText = oneIsObject && props.hideObjectName ? marker : oneName;
    const otherText = !oneIsObject && props.hideObjectName ? marker : otherName;

    const oneLink = `<a href="/object/${link.one_thing_id}">${oneText}<!-- (one)--></a>`
    const otherLink = `<a href="/object/${link.other_thing_id}">${otherText}<!-- (other)--></a>`

    parts.push(oneLink)
    parts.push(' → ')
    parts.push(`<a href="/object/${link.link_type_id}">${linkTypeName}</a>`)
    parts.push(' → ')
    parts.push(otherLink)

    return parts.join('')
};

const generatedText = computed(() => generateLinkDescription(props.link, props.object));

const sizeClass = computed(() => {
    switch (props.size) {
        case 'small': return 'text-small';
        case 'medium': return 'text-medium';
        case 'large': return 'text-large';
        default: return 'text-small';
    }
});
</script>

<style>
/* Глобальные стили для этого компонента */
.link-description {
    color: #236bac !important;
    display: inline-block;
}

.link-description a,
.link-description a:link,
.link-description a:visited,
.link-description a:hover,
.link-description a:active,
.link-description a:focus {
    color: #236bac !important;
    text-decoration: none !important;
    cursor: pointer;
}

.link-description a:hover {
    text-decoration: underline !important;
}

.text-small {
    font-size: 0.875rem !important;
}

.text-medium {
    font-size: 1rem !important;
}

.text-large {
    font-size: 1.25rem !important;
}

.link-description a {
    --bs-link-color-rgb: none !important;
    --bs-link-opacity: none !important;
    --bs-link-hover-color-rgb: none !important;
}

.link-common-marker {
    font-weight: bold;
}
</style>
