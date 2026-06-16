<!-- components/LinkDescription.vue -->
<template>
    <span class="link-description" :class="[sizeClass, customClass]">
        <span v-html="generatedText"></span>
    </span>
</template>

<script setup>
import { computed } from 'vue';
import { useObjectCacheStore } from '@/stores/objectCache.js';

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
    }
});

const cacheStore = useObjectCacheStore();

const resolveName = (id, fallback) => {
    if (fallback) return fallback;
    if (!id) return 'Unknown';
    const cached = cacheStore.getCachedObject(id);
    return cached?.name || 'Unknown';
};

const generateLinkDescription = (link, object) => {
    if (!link) return ''

    const parts = []

    const objectIsOne = object.thing_id === link.one_thing_id;

    const oneName = objectIsOne
        ? resolveName(link.one_thing_id, object.name)
        : resolveName(link.one_thing_id, link.name);

    const otherName = objectIsOne
        ? resolveName(link.other_thing_id, link.name)
        : resolveName(link.other_thing_id, object.name);

    const linkTypeName = resolveName(link.link_type_id, link.link_name);

    const oneLink = `<a href="/object/${link.one_thing_id}">${oneName}<!-- (one)--></a>`
    const otherLink = `<a href="/object/${link.other_thing_id}">${otherName}<!-- (other)--></a>`

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
</style>
