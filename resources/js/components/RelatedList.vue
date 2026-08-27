<template>
    <div class="related-list">
        <div
            v-for="(link, idx) in visibleLinks"
            :key="linkKey(link, idx)"
            class="related-item"
            :style="indentStyle"
        >
            <div class="related-row">
                <button
                    v-if="expandable(link)"
                    class="related-caret"
                    type="button"
                    :aria-label="isOpen(linkKey(link, idx)) ? 'Collapse' : 'Expand'"
                    @click="toggleExpand(link, idx)"
                >
                    {{ isOpen(linkKey(link, idx)) ? '▾' : '▸' }}
                </button>
                <span v-else class="related-caret-placeholder"></span>

                <LinkDescription
                    v-if="parent"
                    :link="link"
                    :object="parent"
                    size="small"
                    hide-object-name
                />
                <template v-else-if="link.target">
                    <span class="related-type">{{ truncateName(linkTypeName(link), 18) }}</span>
                    <span class="related-type-arrow">→</span>
                    <RouterLink
                        :to="{ name: 'object', params: { uid: link.target.thing_id } }"
                        class="related-target"
                    >
                        <Image
                            :node-id="link.target.thing_id"
                            :type="link.target.type"
                            width="14px"
                            class="related-icon"
                        />
                        <span class="related-name">{{ truncateName(objectName(link.target) || link.name || t('Related')) }}</span>
                    </RouterLink>
                </template>
                <span v-else class="related-name related-name--plain">{{ truncateName(link.name || t('Related')) }}</span>
            </div>

            <div
                v-if="isOpen(linkKey(link, idx)) && link.target && link.target.links && link.target.links.length"
                class="related-children"
            >
                <RelatedList :links="link.target.links" :level="level + 1" :on-expand="onExpand" :exclude-id="excludeId" :parent="link.target" />
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRelatedExpansion } from '../composables/useRelatedExpansion';
import { fieldText, objectName } from '../utils/localized.js';
import Image from './Image.vue';
import LinkDescription from './LinkDescription.vue';

/**
 * Recursive renderer for multilevel related objects.
 *
 * Each link renders its resolved `target` (name + icon). Links that already
 * carry nested `target.links` (pre-fetched) unfold instantly; links without
 * children can be expanded on demand through the optional `onExpand` callback,
 * which is expected to fetch GET /object/{id}?depth=1 and assign the result to
 * `link.target.links`.
 */
const props = defineProps({
    links: {
        type: Array,
        default: () => [],
    },
    level: {
        type: Number,
        default: 1,
    },
    onExpand: {
        type: Function,
        default: null,
    },
    // Thing id to hide everywhere in this subtree — e.g. the object currently
    // being viewed on the object page (a back-link to it is redundant).
    excludeId: {
        type: String,
        default: null,
    },
    // The object that owns these links (each link's "common" endpoint). When
    // provided, rows render the full link description (LinkDescription) with
    // that endpoint collapsed to a "*".
    parent: {
        type: Object,
        default: null,
    },
});

defineOptions({ name: 'RelatedList' });

const { t } = useI18n();
const { isOpen, toggle } = useRelatedExpansion();

const visibleLinks = computed(() => {
    if (!props.excludeId) return props.links;
    return props.links.filter(l => l.target?.thing_id !== props.excludeId);
});

const indentStyle = computed(() => ({ paddingLeft: `${(props.level - 1) * 14}px` }));

const linkKey = (link, idx) => link.link_id ?? `l${props.level}-${idx}`;

const expandable = (link) =>
    !!link.target &&
    (link.target.links?.length > 0 || typeof props.onExpand === 'function');

const toggleExpand = async (link, idx) => {
    const key = linkKey(link, idx);
    if (isOpen(key)) {
        toggle(key);
        return;
    }
    // Load one more level on demand before opening.
    if (link.target && !link.target.links?.length && typeof props.onExpand === 'function') {
        try {
            await props.onExpand(link);
        } catch (e) {
            console.error('RelatedList - failed to load deeper links:', e);
        }
    }
    toggle(key);
};

const linkTypeName = (link) =>
    fieldText(link.link_name, link.link_name_translations) || link.link_name || t('Related');

const truncateName = (text, max = 40) => {
    if (!text) return '';
    return text.length > max ? text.substring(0, max) + '...' : text;
};
</script>

<style scoped>
.related-list {
    display: flex;
    flex-direction: column;
}
.related-item {
    display: flex;
    flex-direction: column;
}
.related-row {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
}
.related-caret {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 11px;
    color: #6c757d;
    flex-shrink: 0;
}
.related-caret-placeholder {
    width: 16px;
    flex-shrink: 0;
}
.related-target {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    text-decoration: none;
    color: inherit;
}
.related-target:hover {
    text-decoration: underline;
}
.related-icon {
    flex-shrink: 0;
}
.related-type {
    font-size: 10px;
    color: #6c757d;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 90px;
    flex-shrink: 0;
}
.related-type-arrow {
    color: #adb5bd;
    font-size: 10px;
    flex-shrink: 0;
}
.related-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
}
.related-name--plain {
    color: #6c757d;
}
.related-children {
    display: flex;
    flex-direction: column;
}
</style>
