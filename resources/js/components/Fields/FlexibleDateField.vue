<script setup>
// FlexibleDateField — edits one date bound (start or end) of an object.
// Supports a free-text smart parser (digit strings, ISO, Russian formats,
// qualifiers, era suffixes, alternatives) plus structured controls, and a
// live preview of the normalized canonical bounds.
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
    FlexibleDate,
    formatBoundLocalized,
    formatLocalized,
    QUALIFIERS,
    PRECISIONS,
    QUALIFIER_BEFORE,
    QUALIFIER_AFTER,
    QUALIFIER_BETWEEN,
    QUALIFIER_ALTERNATIVES,
    QUALIFIER_UNKNOWN,
} from '@/utils/flexibleDate'
import { Era, ERA_KEYS } from '@/constants/eras'

const props = defineProps({
    fieldName: { type: String, default: 'start' },
    label: String,
    isEditable: Boolean,
    // Which column this field edits: 'start' or 'end'.
    side: { type: String, default: 'start' },
    start: { type: [String, Number], default: null },
    end: { type: [String, Number], default: null },
    startMeta: { type: Object, default: null },
    endMeta: { type: Object, default: null },
    // When the other side occupies both columns (e.g. a "between" range), this
    // field is disabled so the two don't collide.
    disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:value'])

const { t } = useI18n()

// ── internal editing state ──
const text = ref('')             // primary date expression
const text2 = ref('')            // upper bound for "between"
const alternativesText = ref('') // comma-separated list for "alternatives"
const qualifier = ref(QUALIFIERS[0])
const era = ref(Era.GREGORIAN)
const precision = ref(PRECISIONS[2])
const comment = ref('')
const error = ref(null)
const preview = ref('')

const myMeta = computed(() => (props.side === 'start' ? props.startMeta : props.endMeta))
const myValue = computed(() => (props.side === 'start' ? props.start : props.end))
const otherValue = computed(() => (props.side === 'start' ? props.end : props.start))

const displayText = computed(() => {
    if (!myValue.value && !otherValue.value) return ''
    return formatLocalized(props.start, props.end, props.startMeta || {}, props.endMeta || {}, t)
})

// Preview of a single FlexibleDate (mirrors PHP FlexibleDate::format()).
function previewOf(fd) {
    const meta = fd.toArray()
    if (fd.qualifier === QUALIFIER_BEFORE) return formatLocalized(null, fd.value, meta, meta, t)
    if (fd.qualifier === QUALIFIER_AFTER) return formatLocalized(fd.value, null, meta, meta, t)
    return formatLocalized(fd.value, fd.endValue, meta, meta, t)
}

// Initialize editing state from stored values.
function initFromStored() {
    const meta = myMeta.value
    const fd = meta ? FlexibleDate.fromArray(meta) : null
    const v = myValue.value

    if (fd && fd.qualifier !== QUALIFIER_UNKNOWN && (v || fd.qualifier === QUALIFIER_BEFORE || fd.qualifier === QUALIFIER_AFTER)) {
        qualifier.value = fd.qualifier
        era.value = fd.era
        precision.value = fd.precision
        comment.value = fd.comment || ''
        text.value = fd.original || formatBoundLocalized(fd.value, fd.toArray(), t)
        if (fd.endValue) {
            text2.value = formatBoundLocalized(fd.endValue, fd.toArray(), t)
        }
        if (fd.alternatives.length) {
            alternativesText.value = fd.alternatives
                .map((a) => formatBoundLocalized(a, fd.toArray(), t))
                .join(', ')
        }
    } else {
        // Infer a simple structure from the columns. A legacy start+end pair
        // with no meta is a range of EXACT bounds (e.g. an event that lasted
        // from 12:00 to 22:00) — NOT the "between" qualifier, which implies
        // uncertainty and is a brand-new concept no stored object has yet.
        const my = v != null && v !== '' ? v : null
        if (my) qualifier.value = QUALIFIERS[0]
        else qualifier.value = QUALIFIER_UNKNOWN
        era.value = Era.GREGORIAN
        precision.value = PRECISIONS[2]
        comment.value = ''
        text.value = my ? formatBoundLocalized(String(my), { precision: precision.value, era: era.value }, t) : ''
        // Keep the other bound around: it pre-fills the upper-bound input if the
        // user switches this field to "between", and is otherwise edited by the
        // sibling field for this legacy exact-range shape.
        const other = otherValue.value != null && otherValue.value !== '' ? otherValue.value : null
        text2.value = other ? formatBoundLocalized(String(other), { precision: precision.value, era: era.value }, t) : ''
        alternativesText.value = ''
    }
}

function buildFlexibleDate() {
    if (qualifier.value === QUALIFIER_UNKNOWN || text.value.trim() === '') {
        const fd = new FlexibleDate()
        fd.qualifier = qualifier.value || QUALIFIER_UNKNOWN
        fd.era = era.value
        fd.precision = precision.value
        fd.comment = comment.value || null
        fd.original = text.value
        return fd
    }

    if (qualifier.value === QUALIFIER_BETWEEN) {
        const lo = FlexibleDate.parse(text.value, era.value)
        const hi = FlexibleDate.parse(text2.value, era.value)
        if (!lo || !hi) { error.value = t('dates.parse_error'); return null }
        const fd = new FlexibleDate()
        fd.qualifier = QUALIFIER_BETWEEN
        fd.era = era.value
        fd.precision = precision.value
        fd.comment = comment.value || null
        fd.value = lo.value
        fd.endValue = hi.value
        fd.original = [text.value, text2.value].filter(Boolean).join(' — ')
        return fd
    }

    if (qualifier.value === QUALIFIER_ALTERNATIVES) {
        const parts = alternativesText.value.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
        const fd = new FlexibleDate()
        fd.qualifier = QUALIFIER_ALTERNATIVES
        fd.era = era.value
        fd.precision = precision.value
        fd.comment = comment.value || null
        fd.original = alternativesText.value
        const vals = []
        for (const p of parts) {
            const parsed = FlexibleDate.parse(p, era.value)
            if (!parsed) { error.value = t('dates.parse_error'); return null }
            vals.push(parsed.value)
        }
        if (!vals.length) { error.value = t('dates.parse_error'); return null }
        fd.alternatives = vals
        const sorted = vals.slice().sort((a, b) => (BigInt(a) > BigInt(b) ? 1 : -1))
        fd.value = sorted[0]
        fd.endValue = sorted[sorted.length - 1]
        return fd
    }

    // Exact / approx / before / after — single value.
    const fd = FlexibleDate.parse(text.value, era.value)
    if (!fd) { error.value = t('dates.parse_error'); return null }
    fd.qualifier = qualifier.value
    fd.era = era.value
    fd.precision = precision.value
    fd.comment = comment.value || null
    return fd
}

function emitValue() {
    const fd = buildFlexibleDate()
    if (!fd) return
    const bounds = fd.toDb(props.side)
    // The meta belongs to this field's side; the spanning qualifiers also
    // occupy the other column, which the parent applies from `end`.
    emit('update:value', { start: bounds.start, end: bounds.end, meta: bounds.meta })
    preview.value = previewOf(fd)
    error.value = null
}

function onTextInput() {
    // Smart sync: if the free text parses as a qualified expression, mirror it
    // into the structured controls.
    const parsed = FlexibleDate.parse(text.value, era.value)
    if (parsed) {
        if (parsed.qualifier !== qualifier.value) qualifier.value = parsed.qualifier
        if (parsed.era !== era.value) era.value = parsed.era
        if (parsed.precision !== precision.value) precision.value = parsed.precision
        if (parsed.endValue && parsed.qualifier === QUALIFIER_BETWEEN) {
            text2.value = parsed.endValue
        }
    }
    emitValue()
}

function onSelectChange() {
    emitValue()
}

onMounted(() => {
    if (props.isEditable) {
        initFromStored()
        // Compute an initial preview without emitting — the parent already holds
        // the stored values, and mutating it during the mount render cycle would
        // trigger a recursive-update loop in Vue.
        const fd = buildFlexibleDate()
        if (fd) {
            preview.value = previewOf(fd)
            error.value = null
        }
    }
})
</script>

<template>
    <div class="flexible-date-field">
        <div class="flexible-date-label small text-muted">{{ label }}</div>

        <!-- ══ VIEW MODE ══ -->
        <template v-if="!isEditable">
            <div v-if="displayText || comment" class="small">
                <span>{{ displayText }}</span>
                <span v-if="comment" class="flexible-date-comment text-muted"> — <em>{{ comment }}</em></span>
            </div>
            <span v-else class="small text-muted">—</span>
        </template>

        <!-- ══ EDIT MODE ══ -->
        <template v-else>
            <div v-if="disabled" class="text-muted small">
                {{ t('dates.disabled') }}
            </div>
            <div v-else>
                <input
                    :name="fieldName"
                    v-model="text"
                    type="text"
                    class="form-control form-control-sm"
                    :placeholder="t('dates.placeholder')"
                    @input="onTextInput"
                />

                <!-- Between: second bound -->
                <input
                    v-if="qualifier === 'between'"
                    v-model="text2"
                    type="text"
                    class="form-control form-control-sm mt-1"
                    :placeholder="t('dates.placeholder_upper')"
                    @input="emitValue"
                />

                <!-- Alternatives: comma-separated list -->
                <input
                    v-if="qualifier === 'alternatives'"
                    v-model="alternativesText"
                    type="text"
                    class="form-control form-control-sm mt-1"
                    :placeholder="t('dates.placeholder_alternatives')"
                    @input="emitValue"
                />

                <!-- Live preview / parse error -->
                <div v-if="error" class="text-danger small mt-1">{{ error }}</div>
                <div v-else-if="preview" class="text-muted small mt-1">
                    {{ t('dates.preview') }}: <code>{{ preview }}</code>
                </div>

                <!-- Structured controls -->
                <div class="d-flex flex-wrap gap-2 mt-2">
                    <select v-model="qualifier" class="form-select form-select-sm w-auto" @change="onSelectChange">
                        <option v-for="q in QUALIFIERS" :key="q" :value="q">{{ t('dates.qualifier.' + q) }}</option>
                    </select>
                    <select v-model="era" class="form-select form-select-sm w-auto" @change="onSelectChange">
                        <option v-for="e in ERA_KEYS" :key="e" :value="e">{{ t('era.' + e) }}</option>
                    </select>
                    <select v-model="precision" class="form-select form-select-sm w-auto" @change="onSelectChange">
                        <option v-for="p in PRECISIONS" :key="p" :value="p">{{ t('dates.precision.' + p) }}</option>
                    </select>
                    <input
                        v-model="comment"
                        type="text"
                        class="form-control form-control-sm flex-grow-1"
                        :placeholder="t('dates.comment')"
                        @input="emitValue"
                    />
                </div>
            </div>
        </template>
    </div>
</template>
