<script setup>
// DateCalendarPicker — a month-grid calendar for the flexible date field.
// Renders in the selected era (gregorian/julian/world_creation/hijri/hebrew)
// via Era.eraToJDN/monthLength, so the grid shows the correct month lengths
// and weekday alignment for any calendar. The year input accepts any integer,
// including negative (BC) and huge years.
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Era } from '@factology/engine/constants/eras.js'
import { currentLocale } from '@/utils/localized.js'

const props = defineProps({
    era: { type: String, default: Era.GREGORIAN },
    precision: { type: String, default: 'day' },
    modelValue: { type: Object, default: null }, // { year, month, day, hour, minute, second }
})

const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

const viewYear = ref(1)
const viewMonth = ref(1)
const selected = ref({ year: null, month: null, day: null, hour: 0, minute: 0, second: 0 })

// Fall back to today (gregorian, converted into the era) when nothing is selected.
function todayInEra(era) {
    const now = new Date()
    const c = Era.fromCanonical(era, now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())
    return { year: c.year, month: c.month, day: c.day, hour: 0, minute: 0, second: 0 }
}

function initFromModel() {
    const base = props.modelValue && props.modelValue.year != null
        ? { ...props.modelValue }
        : todayInEra(props.era)
    selected.value = base
    viewYear.value = base.year
    viewMonth.value = Math.min(base.month || 1, Era.maxMonth(props.era))
}

watch(() => [props.modelValue, props.era], () => { initFromModel() }, { deep: true })

initFromModel()

const maxMonth = computed(() => Era.maxMonth(props.era))

// Days in the currently viewed month.
const daysInView = computed(() => {
    try {
        return Era.monthLength(props.era, viewYear.value, viewMonth.value)
    } catch {
        return 30
    }
})

const hasTime = computed(() => props.precision === 'minute' || props.precision === 'second')

// Grid cells: leading nulls for the weekday offset, day numbers, trailing nulls.
const grid = computed(() => {
    const firstJdn = Era.eraToJDN(props.era, viewYear.value, viewMonth.value, 1)
    const offset = Era.weekday(firstJdn) // 0 = Monday
    const cells = []
    for (let i = 0; i < offset; i++) cells.push(null)
    for (let d = 1; d <= daysInView.value; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
})

const weekdayLabels = computed(() => {
    const locale = currentLocale()
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    // Build labels for Mon..Sun (2026-08-03 is a Monday).
    const labels = []
    for (let i = 0; i < 7; i++) {
        const d = new Date(Date.UTC(2026, 7, 3 + i))
        labels.push(fmt.format(d).replace('.', ''))
    }
    return labels
})

const monthLabel = computed(() => {
    const locale = currentLocale()
    // Hijri/Hebrew month names differ from the shared Western names — show the
    // number rather than a wrong Gregorian name.
    if (props.era === Era.HIJRI || props.era === Era.HEBREW) {
        return 'M' + viewMonth.value
    }
    return new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(Date.UTC(2020, viewMonth.value - 1, 1)))
})

const eraLabel = computed(() => t('era.' + (props.era || Era.GREGORIAN)))
const bcLabel = computed(() => t('dates.bc'))

const yearDisplay = computed(() => (viewYear.value < 0 ? (-viewYear.value) + ' ' + bcLabel.value : viewYear.value))

function goMonth(delta) {
    let y = viewYear.value
    let m = viewMonth.value + delta
    const max = maxMonth.value
    while (m < 1) { m += max; y-- }
    while (m > max) { m -= max; y++ }
    viewYear.value = y
    viewMonth.value = m
}

function onYearInput(e) {
    const v = parseInt(e.target.value, 10)
    if (!Number.isNaN(v) && Math.abs(v) <= 10000000) {
        viewYear.value = v
    }
}

function pickDay(day) {
    const next = { ...selected.value, year: viewYear.value, month: viewMonth.value, day }
    selected.value = next
    emit('update:modelValue', next)
}

function updateTime(field, e) {
    const v = parseInt(e.target.value, 10)
    if (Number.isNaN(v)) return
    const max = field === 'hour' ? 23 : 59
    selected.value = { ...selected.value, [field]: Math.max(0, Math.min(max, v)) }
    emit('update:modelValue', { ...selected.value })
}
</script>

<template>
    <div class="date-calendar-picker" data-testid="date-calendar-picker">
        <div class="calendar-header">
            <button type="button" class="btn btn-outline-secondary btn-sm" @click="goMonth(-1)">‹</button>
            <div class="calendar-title">
                <span class="calendar-month">{{ monthLabel }}</span>
                <input
                    type="number"
                    class="calendar-year form-control form-control-sm"
                    :value="viewYear"
                    @change="onYearInput"
                    data-testid="calendar-year"
                />
                <span class="calendar-era text-muted">{{ eraLabel }}</span>
            </div>
            <button type="button" class="btn btn-outline-secondary btn-sm" @click="goMonth(1)">›</button>
        </div>

        <div class="calendar-weekdays">
            <span v-for="(w, i) in weekdayLabels" :key="i" class="calendar-wd">{{ w }}</span>
        </div>

        <div class="calendar-grid">
            <span
                v-for="(cell, i) in grid"
                :key="i"
                class="calendar-cell"
                :class="{
                    'calendar-day': cell != null,
                    'calendar-selected': cell != null && selected.year === viewYear && selected.month === viewMonth && selected.day === cell,
                    'calendar-today': false,
                }"
                :data-testid="cell != null ? 'calendar-day-' + cell : null"
                @click="cell != null && pickDay(cell)"
            >{{ cell ?? '' }}</span>
        </div>

        <div v-if="hasTime" class="calendar-time d-flex gap-1 mt-2">
            <input type="number" min="0" max="23" class="form-control form-control-sm" :value="selected.hour" @change="updateTime('hour', $event)" data-testid="calendar-hour" />
            <span class="calendar-colon">:</span>
            <input type="number" min="0" max="59" class="form-control form-control-sm" :value="selected.minute" @change="updateTime('minute', $event)" data-testid="calendar-minute" />
            <input v-if="precision === 'second'" type="number" min="0" max="59" class="form-control form-control-sm" :value="selected.second" @change="updateTime('second', $event)" data-testid="calendar-second" />
        </div>
    </div>
</template>

<style scoped>
.date-calendar-picker {
    width: 260px;
    padding: 8px;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    background: #fff;
    font-size: 0.8rem;
}

.calendar-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
}

.calendar-title {
    flex: 1;
    text-align: center;
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 6px;
}

.calendar-month {
    font-weight: 600;
    text-transform: capitalize;
}

.calendar-year {
    width: 70px;
    text-align: center;
}

.calendar-era {
    font-size: 0.7rem;
}

.calendar-weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    text-align: center;
    color: #6c757d;
    font-size: 0.7rem;
    margin-bottom: 2px;
}

.calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 1px;
}

.calendar-cell {
    text-align: center;
    padding: 4px 0;
    border-radius: 4px;
}

.calendar-day {
    cursor: pointer;
}

.calendar-day:hover {
    background: #e9ecef;
}

.calendar-selected {
    background: #0d6efd;
    color: #fff;
    font-weight: 600;
}

.calendar-colon {
    align-self: center;
}
</style>
