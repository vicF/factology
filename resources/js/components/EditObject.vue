<template>
    <Teleport to="body">
        <!-- Main Edit/Create Modal -->
        <div class="modal fade" :id="modalId" tabindex="-1" :aria-labelledby="modalLabelId" aria-hidden="true">
            <div class="modal-dialog modal-dialog-scrollable modal-fullscreen-sm-down">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" :id="modalLabelId">
                            {{ title || (isEditMode ? $t('Edit Object') : $t('Create Object')) }}
                        </h5>
                        <button
                            type="button"
                            class="btn-close"
                            data-bs-dismiss="modal"
                            :aria-label="$t('Close')"
                        ></button>
                    </div>
                    <div class="modal-body">
                        <form @submit.prevent="submitForm">
                            <!-- Class field for Thing type (type 3) -->
                            <div class="mb-3" v-if="formData.type === 3">
                                <LinkedObject
                                    :link="classLinkData"
                                    :currentObject="{ thing_id: formData.thing_id, name: formData.name }"
                                    :index="0"
                                    :singleField="true"
                                    :fixedLinkTypeUuid="LINK_TO_CLASS"
                                    :targetLabel="$t('Class')"
                                    @update="handleClassLinkUpdate"
                                    @remove="handleClassLinkRemove"
                                />
                            </div>

                            <!-- Properties: suggested by class + manually attached, with editors -->
                            <template v-if="formData.type === THING_TYPE">
                                <!-- Inherited flag for property definitions -->
                                <div v-if="isPropertyDefinition" class="mb-3 form-check">
                                    <input
                                        id="inheritedFlag"
                                        v-model="inheritedFlag"
                                        class="form-check-input"
                                        type="checkbox"
                                    />
                                    <label class="form-check-label" for="inheritedFlag">{{ $t('Inherited') }}</label>
                                    <small class="form-text text-muted d-block">{{ $t('Apply to subclasses of the linked classes') }}</small>
                                </div>

                                <div class="mb-3">
                                    <label v-if="displayedProperties.length" class="form-label d-block">{{ $t('Properties') }}</label>
                                    <div v-for="p in displayedProperties" :key="p.thing_id" class="border rounded p-2 mb-2 bg-light">
                                        <label class="form-label small mb-1">{{ objectName(p) || $t('Unnamed') }}</label>

                                        <!-- Coordinates editor -->
                                        <template v-if="p.thing_id === geoPropertyId">
                                            <div class="row g-2">
                                                <div class="col">
                                                    <label class="form-label small mb-1">{{ $t('Latitude') }}</label>
                                                    <input
                                                        type="number"
                                                        step="any"
                                                        class="form-control form-control-sm"
                                                        v-model.number="geoForm.coordinates[1]"
                                                    />
                                                </div>
                                                <div class="col">
                                                    <label class="form-label small mb-1">{{ $t('Longitude') }}</label>
                                                    <input
                                                        type="number"
                                                        step="any"
                                                        class="form-control form-control-sm"
                                                        v-model.number="geoForm.coordinates[0]"
                                                    />
                                                </div>
                                                <div v-if="geoForm.type === 'Point'" class="col">
                                                    <label class="form-label small mb-1">{{ $t('Height (m)') }}</label>
                                                    <input
                                                        type="number"
                                                        step="any"
                                                        class="form-control form-control-sm"
                                                        v-model.number="geoHeight"
                                                    />
                                                </div>
                                            </div>
                                            <select v-model="geoType" class="form-select form-select-sm mt-2">
                                                <option v-for="gtype in GEO_TYPES" :key="gtype" :value="gtype">
                                                    {{ $t(gtype) }}
                                                </option>
                                            </select>
                                            <textarea
                                                v-if="geoForm.type !== 'Point'"
                                                v-model="geoJsonDraft"
                                                class="form-control form-control-sm mt-2 font-monospace"
                                                rows="4"
                                                @input="onGeoJsonInput"
                                            ></textarea>
                                            <div v-if="geoJsonError" class="text-danger small mt-1">{{ geoJsonError }}</div>
                                            <GeoPicker
                                                ref="geoPickerRef"
                                                v-model="geoForm"
                                                :clickable="geoClickable"
                                                @clicked="onGeoPickerClick"
                                                class="mt-2"
                                            />
                                            <small class="text-muted d-block mt-1">{{ geoClickHint }}</small>
                                            <div v-if="geoForm.type !== 'Point'" class="d-flex gap-2 mt-2">
                                                <button
                                                    v-if="geoForm.type === 'Polygon' && canFinishPolygon"
                                                    type="button"
                                                    class="btn btn-outline-secondary btn-sm"
                                                    @click="finishPolygon"
                                                >
                                                    {{ $t('Finish') }}
                                                </button>
                                                <button type="button" class="btn btn-outline-secondary btn-sm" @click="clearGeo">
                                                    {{ $t('Clear') }}
                                                </button>
                                            </div>
                                        </template>

                                        <!-- Generic text editor for other properties -->
                                        <input
                                            v-else
                                            v-model="formData.data.properties[p.thing_id]"
                                            class="form-control form-control-sm"
                                            :placeholder="$t('Value')"
                                        />
                                    </div>

                                    <!-- Add property -->
                                    <button type="button" class="btn btn-outline-secondary btn-sm" @click="togglePropertyPicker">
                                        <i class="bi bi-plus-lg me-1"></i>{{ $t('Add property') }}
                                    </button>
                                    <div v-if="showPropertyPicker" class="border rounded p-2 mt-2 bg-light">
                                        <input
                                            v-model="propertyFilter"
                                            class="form-control form-control-sm"
                                            :placeholder="$t('Search')"
                                        />
                                        <div class="list-group mt-1" style="max-height:200px; overflow:auto;">
                                            <button
                                                v-for="p in filteredProperties"
                                                :key="p.thing_id"
                                                type="button"
                                                class="list-group-item list-group-item-action py-1"
                                                @click="attachProperty(p.thing_id)"
                                            >{{ objectName(p) || $t('Unnamed') }}</button>
                                            <div v-if="!filteredProperties.length" class="text-muted small p-2">
                                                {{ $t('No results found') }}
                                            </div>
                                        </div>
                                        <div class="d-flex gap-2 mt-2">
                                            <input
                                                v-model="newPropertyName"
                                                class="form-control form-control-sm"
                                                :placeholder="$t('New property')"
                                            />
                                            <button type="button" class="btn btn-primary btn-sm" @click="createProperty">
                                                {{ $t('Create & add') }}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </template>

                            <!-- Parent field for Class (2) and Link type (4) — classes
                                 pick class parents, link types pick link-type parents -->
                            <div class="mb-3" v-if="formData.type === CLASS_TYPE || formData.type === LINK_TYPE">
                                <LinkedObject
                                    :link="parentLinkData"
                                    :currentObject="{ thing_id: formData.thing_id, name: formData.name }"
                                    :index="0"
                                    :singleField="true"
                                    :objectType="formData.type"
                                    :fixedLinkTypeUuid="LINK_TO_PARENT"
                                    :targetLabel="$t('Parent')"
                                    @update="handleParentLinkUpdate"
                                    @remove="handleParentLinkRemove"
                                />
                            </div>

                            <!-- rest of the form (name, description, dates, etc.) -->
                            <!-- The main name/description fields edit the plain (original) value.
                                 A small badge shows its declared language; hovering the field
                                 reveals a selector to change that language attribute (the text
                                 stays — used to correct mislabeled legacy fields). -->
                            <div class="mb-3 localized-field" @mouseenter="showNameLang = true" @mouseleave="showNameLang = false">
                                <div class="localized-field-row">
                                    <TextField
                                        fieldName="name"
                                        v-model="formData.name"
                                        :isEditable="true"
                                        :label="$t('Name')"
                                        required
                                    />
                                    <span v-if="!showNameLang" class="field-lang-badge">{{ nameSourceLang.toUpperCase() }}</span>
                                    <FieldLanguageSelect
                                        v-if="showNameLang"
                                        :model-value="nameSourceLang"
                                        :options="langOptions"
                                        @update:model-value="switchFieldLanguage('name', $event)"
                                    />
                                </div>
                            </div>
                            <div class="mb-3 localized-field" @mouseenter="showDescLang = true" @mouseleave="showDescLang = false">
                                <div class="localized-field-row">
                                    <TextField
                                        fieldName="description"
                                        v-model="formData.description"
                                        :isEditable="true"
                                        :label="$t('Description')"
                                    />
                                    <span v-if="!showDescLang" class="field-lang-badge">{{ descriptionSourceLang.toUpperCase() }}</span>
                                    <FieldLanguageSelect
                                        v-if="showDescLang"
                                        :model-value="descriptionSourceLang"
                                        :options="langOptions"
                                        @update:model-value="switchFieldLanguage('description', $event)"
                                    />
                                </div>
                            </div>

                            <!-- Additional languages (translations) -->
                            <div v-if="extraLanguages.length || remainingLanguages.length" class="mb-3">
                                <label class="form-label d-block">{{ $t('Translations') }}</label>
                                <div
                                    v-for="lang in extraLanguages"
                                    :key="lang.code"
                                    class="border rounded p-2 mb-2 bg-light"
                                >
                                    <div class="d-flex justify-content-between align-items-center mb-1">
                                        <span class="badge bg-secondary text-white">{{ lang.name }} <small>({{ lang.code }})</small></span>
                                        <button type="button" class="btn-close btn-sm" @click="removeExtraLanguage(lang.code)"></button>
                                    </div>
                                    <div v-if="lang.code !== nameSourceLang" class="mb-1">
                                        <label class="form-label small mb-1">{{ $t('Name') }}</label>
                                        <input
                                            class="form-control form-control-sm"
                                            :value="getTranslationValue('name', lang.code)"
                                            @input="setTranslationValue('name', lang.code, $event.target.value)"
                                            :placeholder="$t('Name translation')"
                                        />
                                    </div>
                                    <div v-else class="small text-muted mb-1">
                                        {{ $t('Name is already in this language — edit it in the field above.') }}
                                    </div>
                                    <div v-if="lang.code !== descriptionSourceLang">
                                        <label class="form-label small mb-1">{{ $t('Description') }}</label>
                                        <input
                                            class="form-control form-control-sm"
                                            :value="getTranslationValue('description', lang.code)"
                                            @input="setTranslationValue('description', lang.code, $event.target.value)"
                                            :placeholder="$t('Description translation')"
                                        />
                                    </div>
                                    <div v-else class="small text-muted">
                                        {{ $t('Description is already in this language — edit it in the field above.') }}
                                    </div>
                                </div>
                                <div v-if="remainingLanguages.length" class="d-flex align-items-center gap-2">
                                    <select class="form-select form-select-sm w-auto" v-model="pendingExtraLang">
                                        <option :value="null" disabled>{{ $t('Add language…') }}</option>
                                        <option v-for="l in remainingLanguages" :key="l.code" :value="l.code">{{ l.name }}</option>
                                    </select>
                                    <button type="button" class="btn btn-outline-secondary btn-sm" @click="addExtraLanguage">{{ $t('Add') }}</button>
                                </div>
                            </div>
                            <div class="mb-3">
                                <FlexibleDateField
                                    side="start"
                                    :start="formData.start"
                                    :end="formData.end"
                                    :startMeta="formData.start_meta"
                                    :endMeta="formData.end_meta"
                                    :isEditable="true"
                                    :label="$t('Start')"
                                    @update:value="applyStartDate"
                                />
                            </div>
                            <div class="mb-3">
                                <FlexibleDateField
                                    side="end"
                                    :start="formData.start"
                                    :end="formData.end"
                                    :startMeta="formData.start_meta"
                                    :endMeta="formData.end_meta"
                                    :isEditable="true"
                                    :label="$t('End')"
                                    :disabled="startSpansDates"
                                    @update:value="applyEndDate"
                                />
                            </div>

                            <!-- Public checkbox -->
                            <div class="mb-3 form-check">
                                <input
                                    type="checkbox"
                                    class="form-check-input"
                                    id="publicCheckbox"
                                    v-model="formData.public"
                                    :true-value="1"
                                    :false-value="0"
                                />
                                <label class="form-check-label" for="publicCheckbox">
                                    {{ $t('Public') }}
                                </label>
                                <small class="form-text text-muted d-block">
                                    {{ $t('Make this object visible to everyone') }}
                                </small>
                            </div>

                            <!-- Owner (system ownership / reassignment) — admins only -->
                            <div class="mb-3" v-if="isAdmin">
                                <label class="form-label" for="ownerSelect">
                                    {{ $t('Owner') }}
                                </label>
                                <select id="ownerSelect" class="form-select" v-model="formData.owner">
                                    <option value="">—</option>
                                    <option :value="UUID.SYSTEM_OWNER">{{ $t('System Owner') }}</option>
                                    <option v-for="o in ownerOptions" :key="o.thing_id" :value="o.thing_id">
                                        {{ o.name || o.thing_id }}
                                    </option>
                                </select>
                                <small class="form-text text-muted d-block">
                                    {{ $t('Assigning "System Owner" marks this object as a system object included in the default export') }}
                                </small>
                            </div>

                            <!-- Object type indicator -->
                            <div v-if="formData.type == 1" class="mb-3">{{ $t('Type General') }}</div>
                            <div v-if="formData.type == CLASS_TYPE" class="mb-3">{{ $t('Type Class') }}</div>
                            <div v-else-if="formData.type == THING_TYPE" class="mb-3">{{ $t('Type Thing') }}</div>
                            <div v-else-if="formData.type == LINK_TYPE" class="mb-3">{{ $t('Type Link') }}</div>
                            <div v-else-if="formData.type == 5" class="mb-3">{{ $t('Type External') }}</div>
                            <div v-else-if="formData.type == SERVER_TYPE" class="mb-3">{{ $t('Type Server') }}</div>
                            <div v-else class="mb-3">{{ $t('Unknown type') }}</div>

                            <!-- Top action row: all links sit between this and the bottom row -->
                            <div
                                v-if="regularLinks.length > 0 || externalLinks.length > 0"
                                class="d-flex justify-content-between align-items-center mb-3"
                            >
                                <div class="d-flex gap-2">
                                    <button type="button" class="btn btn-primary" @click="addNewLinkedObject">
                                        {{ $t('Add Link') }}
                                    </button>
                                    <button type="button" class="btn btn-primary" @click="addExternalLink">
                                        {{ $t('Add External Link') }}
                                    </button>
                                </div>
                                <div class="d-flex gap-2">
                                    <button
                                        type="button"
                                        class="btn btn-secondary"
                                        data-bs-dismiss="modal"
                                    >
                                        {{ $t('Close') }}
                                    </button>
                                    <button type="submit" class="btn btn-primary">
                                        {{ isEditMode ? $t('Update') : $t('Save') }}
                                    </button>
                                </div>
                            </div>

                            <!-- Display regular links (not special ones) -->
                            <LinkedObject
                                v-for="(item, idx) in regularLinks"
                                :key="item.id"
                                :ref="(el) => setLinkedObjectRef(idx, el)"
                                :link="{
                                    // Keep the link's stored direction — forcing one_thing_id
                                    // to the current object made incoming links (where the
                                    // current object is other_thing_id) render as self-links.
                                    one_thing_id: item.one_thing_id || formData.thing_id,
                                    other_thing_id: item.other_thing_id,
                                    link_type_id: item.link_type_id,
                                    translation: item.translation,
                                    link_id: item.link_id,
                                    link_start: item.link_start,
                                    link_end: item.link_end,
                                    link_start_meta: item.link_start_meta,
                                    link_end_meta: item.link_end_meta,
                                    name: item.name,
                                    one_name: item.one_name
                                }"
                                :currentObject="{
                                    thing_id: formData.thing_id,
                                    name: formData.name
                                }"
                                :index="idx"
                                :objectType="formData.type === CLASS_TYPE ? CLASS_TYPE : THING_TYPE"
                                :lockFirstObject="true"
                                :currentObjectUnsaved="!isEditMode"
                                @update="updateItem"
                                @remove="removeItem"
                            />

                            <!-- External links -->
                            <div v-if="externalLinks.length" class="mb-1">
                                <label class="form-label mb-0">{{ $t('External Links') }}</label>
                            </div>
                            <div v-for="(el, idx) in externalLinks" :key="el._key" class="d-flex gap-2 mb-2">
                                <input
                                    :ref="(node) => setExternalLinkRef(el._key, node)"
                                    type="url"
                                    class="form-control"
                                    v-model="el.url"
                                    :placeholder="$t('https://example.com/...')"
                                />
                                <button type="button" class="btn btn-outline-danger" @click="removeExternalLink(idx)">
                                    {{ $t('Remove') }}
                                </button>
                            </div>
                            <small v-if="externalLinks.length" class="form-text text-muted d-block mb-3">
                                {{ $t('External links point to URLs instead of other objects.') }}
                            </small>

                            <!-- Bottom action row: the same buttons duplicated below the links -->
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <div class="d-flex gap-2">
                                    <button type="button" class="btn btn-primary" @click="addNewLinkedObject">
                                        {{ $t('Add Link') }}
                                    </button>
                                    <button type="button" class="btn btn-primary" @click="addExternalLink">
                                        {{ $t('Add External Link') }}
                                    </button>
                                </div>
                                <div class="modal-footer border-0 p-0 m-0">
                                    <button
                                        type="button"
                                        class="btn btn-secondary"
                                        data-bs-dismiss="modal"
                                    >
                                        {{ $t('Close') }}
                                    </button>
                                    <button type="submit" class="btn btn-primary">
                                        {{ isEditMode ? $t('Update') : $t('Save') }}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>

        <!-- Unsaved Changes Confirmation Modal -->
        <div class="modal fade" :id="confirmModalId" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered modal-sm">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">{{ $t('Unsaved Changes') }}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" :aria-label="$t('Close')"></button>
                    </div>
                    <div class="modal-body">
                        <p>{{ $t('You have unsaved changes. Are you sure you want to close?') }}</p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            {{ $t('Cancel') }}
                        </button>
                        <button type="button" class="btn btn-danger" @click="confirmClose">
                            {{ $t('Close without Saving') }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <!-- Error modal -->
        <ErrorModal
            :title="$t('Save Failed')"
            :message="errorMessage"
            :details="errorDetails"
            :show="showError"
            @close="showError = false; errorMessage = ''; errorDetails = ''"
        />
    </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { Modal } from 'bootstrap';
import { v4 as uuidv4 } from 'uuid';
import { useI18n } from 'vue-i18n';

// CRITICAL: These component imports are required - DO NOT REMOVE
import TextField from './Fields/TextField.vue';
import FlexibleDateField from './Fields/FlexibleDateField.vue';
import LinkedObject from './Fields/LinkedObject.vue';
import FieldLanguageSelect from './Fields/FieldLanguageSelect.vue';

import { CLASS_TYPE, LINK_TO_CLASS, LINK_TO_PARENT, LINK_TO_RELATED, LINK_TYPE, SERVER_TYPE, THING_TYPE } from "../constants.js";
import { eventBus } from "../eventBus.js";
import ErrorModal from "./ErrorModal.vue";
import { useObjectsStore } from '@/stores/objects';
import { useObjectCacheStore } from '@/stores/objectCache.js';
import { useAuthStore } from '@/stores/auth';
import { UUID } from '../constants/uuid';
import { currentLocale, changeSourceLang, objectName } from '../utils/localized.js';
import { GEO_TYPES, appendVertex, closePolygon, extractCoordinates, isGeoPropertyName, isLegacyLatLng, latLngToPoint, stripBlankCoords } from '../utils/geo.js';
import GeoPicker from './GeoPicker.vue';
import { loadLanguages } from '../localization/languageCatalog.js';

const objectsStore = useObjectsStore();
const authStore = useAuthStore();

// Props definition
const props = defineProps({
    object: { type: Object, default: null },
    params: { type: Object, default: () => ({}) },
    title: { type: String, default: '' },
    initialLinkedObjects: { type: Array, default: () => [] },
    callback: { type: Object, default: null },
    // When several create modals are stacked (link-row "Create" while another
    // modal is open), only the top one is visible. A modal that becomes
    // inactive is hidden without the unsaved-changes prompt — its form state
    // stays mounted so it can be shown again later.
    active: { type: Boolean, default: true },
});

// Emits definition
const emit = defineEmits(['close', 'object-created', 'object-updated', 'callback-complete']);

// Composables
const { t } = useI18n();
const router = useRouter();

// Computed
const isEditMode = computed(() => !!props.object);

// The properties map must be a plain object (thing_id => value). Legacy
// objects may carry `properties` as an array (old list format); writing
// string keys onto an array silently drops them during JSON serialization,
// so coerce arrays to an empty object.
const normalizePropertiesMap = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value;
};

// Refs
const formData = ref({
    thing_id: isEditMode.value ? (props.object.thing_id || props.object.id || uuidv4()) : uuidv4(),
    name: '',        // current-locale text (filled by initLocalization)
    description: '', // current-locale text (filled by initLocalization)
    start: isEditMode.value ? props.object.start || '' : '',
    end: isEditMode.value ? props.object.end || '' : '',
    start_meta: isEditMode.value ? (props.object.start_meta || null) : null,
    end_meta: isEditMode.value ? (props.object.end_meta || null) : null,
    public: isEditMode.value ? (props.object.public ? 1 : 0) : 0,
    type: props.params.type || 3,
    owner: isEditMode.value ? (props.object.owner || '') : '',
    data: isEditMode.value && props.object.data && typeof props.object.data === 'object'
        ? { ...props.object.data, properties: normalizePropertiesMap(props.object.data.properties) }
        : { properties: {} },
});

// Owner options for the admin-only Owner select (from /search/options)
const ownerOptions = ref([]);
const isAdmin = computed(() => !!authStore.user?.is_admin);

// ── Flexible date fields ──────────────────────────────────────────
// The Start field owns both columns for spanning qualifiers
// (between/alternatives/before occupy the end column too); the End
// field is then disabled so the two can't collide.
const startSpansDates = computed(() => {
    const q = formData.value.start_meta?.qualifier;
    return q === 'between' || q === 'alternatives' || q === 'before';
});

function applyStartDate({ start, end, meta }) {
    formData.value.start = start || null;
    formData.value.start_meta = meta || null;
    if (end != null && end !== '') {
        formData.value.end = end;
    }
}

function applyEndDate({ start, end, meta }) {
    formData.value.end = end || null;
    formData.value.end_meta = meta || null;
}

const loadOwnerOptions = async () => {
    try {
        const res = await axios.get('/search/options');
        ownerOptions.value = res.data?.owners || [];
    } catch (e) {
        ownerOptions.value = [];
    }
};

// ── Localized text editing state ─────────────────────────────────
// The main name/description fields edit the PLAIN (original) value
// (formData.name/description). Each field's declared language lives in
// *SourceLang (name_translations.lang). Other languages live in
// *Translations[code] and are edited in the Translations section.
// Changing a field's language via the hover selector only re-tags the text
// (or promotes an existing translation) — it never discards content.
const locale = currentLocale();
const nameSourceLang = ref(locale);
const descriptionSourceLang = ref(locale);
const nameTranslations = ref({});
const descriptionTranslations = ref({});
const extraLanguages = ref([]);      // [{ code, name }] shown in the translations section
const pendingExtraLang = ref(null);
const availableLanguages = ref([]);
const showNameLang = ref(false);     // hover state for the per-field language selectors
const showDescLang = ref(false);
let originalLocalization = '';

function parseTranslations(v) {
    if (!v) return {};
    if (typeof v === 'string') {
        try { return JSON.parse(v) || {}; } catch { return {}; }
    }
    if (typeof v === 'object' && !Array.isArray(v)) return v;
    return {};
}

function pickExtraTranslations(map, source) {
    const out = {};
    for (const [k, v] of Object.entries(map || {})) {
        if (k === 'lang' || k === source) continue;
        if (v != null && String(v).trim() !== '') out[k] = v;
    }
    return out;
}

function seedExtraLanguages() {
    const withContent = new Set([
        ...Object.keys(nameTranslations.value),
        ...Object.keys(descriptionTranslations.value),
    ]);
    // A language can be a translation for one field even when it is the source
    // of the other (e.g. an English description translation when the name is
    // English), so any language with content is shown here.
    for (const l of availableLanguages.value) {
        if (withContent.has(l.code) && !extraLanguages.value.some((e) => e.code === l.code)) {
            extraLanguages.value.push({ ...l });
        }
    }
}

function initLocalization(object) {
    const o = object || {};
    const nl = parseTranslations(o.name_translations);
    const dl = parseTranslations(o.description_translations);
    nameSourceLang.value = nl.lang || locale;
    descriptionSourceLang.value = dl.lang || locale;
    formData.value.name = o.name || '';
    formData.value.description = o.description || '';
    nameTranslations.value = pickExtraTranslations(nl, nameSourceLang.value);
    descriptionTranslations.value = pickExtraTranslations(dl, descriptionSourceLang.value);
    seedExtraLanguages();
    originalLocalization = localizationSnapshot();
}

// Languages offered by the per-field selectors: the seeded catalog plus the
// current UI locale and each field's source language (they may be missing
// from the catalog, e.g. legacy data).
const langOptions = computed(() => {
    const opts = availableLanguages.value.map((l) => ({ ...l }));
    const add = (code) => {
        if (code && !opts.some((l) => l.code === code)) opts.push({ code, name: code });
    };
    add(locale);
    add(nameSourceLang.value);
    add(descriptionSourceLang.value);
    return opts;
});

/**
 * Change a field's declared language. The text stays (this is for correcting
 * mislabeled legacy fields); if the new language already has a translation,
 * that translation becomes the plain value and the old plain moves into the
 * translations map — all content is preserved.
 */
function switchFieldLanguage(field, code) {
    if (field === 'name') {
        if (code === nameSourceLang.value) return;
        const res = changeSourceLang({
            plain: formData.value.name,
            translations: nameTranslations.value,
            oldLang: nameSourceLang.value,
            newLang: code,
        });
        formData.value.name = res.plain;
        nameTranslations.value = res.translations;
        nameSourceLang.value = code;
    } else {
        if (code === descriptionSourceLang.value) return;
        const res = changeSourceLang({
            plain: formData.value.description,
            translations: descriptionTranslations.value,
            oldLang: descriptionSourceLang.value,
            newLang: code,
        });
        formData.value.description = res.plain;
        descriptionTranslations.value = res.translations;
        descriptionSourceLang.value = code;
    }
    // The newly-selected source language is handled by the main field; remove
    // it from the section and re-add any language that gained content.
    extraLanguages.value = extraLanguages.value.filter((l) => l.code !== code);
    seedExtraLanguages();
}

// Languages offered by the "Add language…" dropdown. The current UI language is
// included too (you may want a translation in your own language); only languages
// that are the source of BOTH fields are excluded, since adding them would give
// a block with no editable inputs.
const remainingLanguages = computed(() =>
    availableLanguages.value.filter((l) => {
        if (extraLanguages.value.some((e) => e.code === l.code)) return false;
        const isNameSource = l.code === nameSourceLang.value;
        const isDescSource = l.code === descriptionSourceLang.value;
        return !(isNameSource && isDescSource);
    })
);

// The Translations section only edits non-source languages (the main fields
// own the source language), so these read/write the translations maps directly.
function getTranslationValue(field, code) {
    const map = field === 'name' ? nameTranslations.value : descriptionTranslations.value;
    return map[code] || '';
}

function setTranslationValue(field, code, value) {
    const map = field === 'name' ? nameTranslations.value : descriptionTranslations.value;
    map[code] = value;
}

function addExtraLanguage() {
    const l = availableLanguages.value.find((x) => x.code === pendingExtraLang.value);
    if (l && !extraLanguages.value.some((e) => e.code === l.code)) {
        extraLanguages.value.push({ ...l });
    }
    pendingExtraLang.value = null;
}

function removeExtraLanguage(code) {
    extraLanguages.value = extraLanguages.value.filter((l) => l.code !== code);
}

/**
 * Build the plain value + translations map for a field. The plain value is
 * the main-field text; the translations map always carries the field's
 * declared language (`lang`) plus the other-language entries.
 */
function buildFieldPayload(field) {
    const isName = field === 'name';
    const plain = isName ? (formData.value.name || '') : (formData.value.description || '');
    const lang = isName ? nameSourceLang.value : descriptionSourceLang.value;
    const out = { lang };
    const source = isName ? nameTranslations.value : descriptionTranslations.value;
    for (const [k, v] of Object.entries(source)) {
        if (v != null && String(v).trim() !== '') out[k] = v;
    }
    return { plain, translations: out };
}

function localizationSnapshot() {
    return JSON.stringify({
        name: formData.value.name,
        description: formData.value.description,
        nameSourceLang: nameSourceLang.value,
        descriptionSourceLang: descriptionSourceLang.value,
        nameTranslations: nameTranslations.value,
        descriptionTranslations: descriptionTranslations.value,
        extraLanguages: extraLanguages.value,
    });
}

initLocalization(isEditMode.value ? props.object : null);

const showError = ref(false);
const errorMessage = ref('');
const errorDetails = ref('');

// Cache new UUID immediately so ObjectField doesn't try to fetch a non-existent object
const cacheStore = useObjectCacheStore();
if (!isEditMode.value && formData.value.thing_id && !cacheStore.hasCachedObject(formData.value.thing_id)) {
    cacheStore.cacheObject(formData.value.thing_id, {
        thing_id: formData.value.thing_id,
        name: formData.value.name || 'New Object',
        type: formData.value.type,
    }, formData.value.type);
}

// Keep the unsaved object's cache entry in sync with the live name, so links
// whose other end is this object (e.g. after swapping direction) display the
// typed name instead of the "New Object" placeholder.
watch(() => formData.value.name, (name) => {
    if (isEditMode.value || !formData.value.thing_id) return;
    const cached = cacheStore.getCachedObject(formData.value.thing_id);
    if (cached) {
        cacheStore.cacheObject(formData.value.thing_id, {
            ...cached,
            name: name || 'New Object',
        }, formData.value.type);
    }
});

// Special links as full objects (same shape as regular links)
const classLinkData = ref({
    one_thing_id: formData.value.thing_id,
    other_thing_id: '',
    link_type_id: LINK_TO_CLASS,
    translation: '',
    link_id: null,
});

const parentLinkData = ref({
    one_thing_id: formData.value.thing_id,
    other_thing_id: '',
    link_type_id: LINK_TO_PARENT,
    translation: '',
    link_id: null,
});

const linkedObjects = ref([]); // regular links (excluding class and parent)
const externalLinks = ref([]); // external links (annotations pointing to URLs)

// Template refs so we can focus a newly added link row
const linkedObjectRefs = ref({});
const externalLinkInputs = ref({});

let modalInstance = null;
let confirmModalInstance = null;
let isClosing = false;
let isSubmitting = false;
// Set while the modal is hidden because a stacked modal on top became active —
// hides for this reason must not show the unsaved-changes prompt.
let isForcedHide = false;

// Unsaved changes tracking
const originalFormData = ref({});
const originalLinkedObjects = ref([]);
const originalClassLink = ref(null);
const originalParentLink = ref(null);
const originalExternalLinks = ref([]);

const hasUnsavedChanges = computed(() => {
    if (isSubmitting) return false;

    const formChanged = Object.keys(originalFormData.value).some(key => {
        const original = originalFormData.value[key];
        const current = formData.value[key];
        if (original === current) return false;
        if (typeof original === 'object' && typeof current === 'object') {
            return JSON.stringify(original) !== JSON.stringify(current);
        }
        return (original || '') !== (current || '');
    });

    const linksChanged = JSON.stringify(originalLinkedObjects.value) !== JSON.stringify(linkedObjects.value);
    const classLinkChanged = JSON.stringify(originalClassLink.value) !== JSON.stringify(classLinkData.value);
    const parentLinkChanged = JSON.stringify(originalParentLink.value) !== JSON.stringify(parentLinkData.value);
    const externalLinksChanged = JSON.stringify(originalExternalLinks.value) !== JSON.stringify(externalLinks.value);
    const localizationChanged = originalLocalization !== localizationSnapshot();

    return formChanged || linksChanged || classLinkChanged || parentLinkChanged || externalLinksChanged || localizationChanged;
});

// Regular links (all links except class and parent)
const regularLinks = computed(() => linkedObjects.value);

// Event handlers
const handleClassLinkUpdate = ({ data }) => {
    classLinkData.value = { ...classLinkData.value, ...data };
};

const handleClassLinkRemove = () => {
    classLinkData.value.other_thing_id = '';
    classLinkData.value.link_id = null;
};

// ── Properties (suggested by class + manually attached) ─────────────────
// Properties are things of the seeded "Property" class linked to a class via
// the PROPERTY_APPLIES_TO link type ("is a property of class"; recursively
// inherited from ancestors when the property's own `inherited` flag allows).
// The edit form offers those, plus an "Add property" picker for any property
// in the system. Coordinate-shaped properties get the Coordinates
// (GeoJSON) editor; others a plain text value.
const suggestedProperties = ref([]);
const knownProperties = ref({});   // thing_id -> { thing_id, name, name_translations, inherited }
const allProperties = ref([]);     // every property definition (for the picker)
const showPropertyPicker = ref(false);
const propertyFilter = ref('');
const newPropertyName = ref('');
const geoPropertyId = ref(null);
const geoPickerRef = ref(null);
let lastSuggestedClassId = null;

const registerProperties = (list) => {
    for (const p of list || []) {
        if (p && p.thing_id) knownProperties.value[p.thing_id] = p;
    }
};

const loadSuggestedProperties = async (classId) => {
    // The class selector can re-emit the same id during init/render; the
    // property list for a class is static, so skip an identical refetch.
    if (classId === lastSuggestedClassId) return;
    lastSuggestedClassId = classId;
    if (!classId) {
        suggestedProperties.value = [];
        resolveGeoPropertyId();
        return;
    }
    try {
        const res = await axios.get(`/class/${classId}/properties`);
        suggestedProperties.value = res.data?.data ?? [];
    } catch (e) {
        console.error('[EditObject] failed to load suggested properties:', e);
        suggestedProperties.value = [];
    }
    registerProperties(suggestedProperties.value);
    resolveGeoPropertyId();
};

// Properties shown in the editor: suggested ones first, then any manually
// attached ones (keys present in data.properties).
const displayedProperties = computed(() => {
    const ids = [];
    const props = [];
    const push = (p) => {
        if (!p || !p.thing_id || ids.includes(p.thing_id)) return;
        ids.push(p.thing_id);
        props.push(p);
    };
    for (const p of suggestedProperties.value) push(p);
    for (const id of Object.keys(formData.value.data?.properties || {})) {
        push(knownProperties.value[id]);
    }
    return props;
});

// Register placeholder entries for attached property ids we know nothing about
// (e.g. legacy objects), so the generic editor rows render even without a fetch.
watch(() => Object.keys(formData.value.data?.properties || {}), (keys) => {
    for (const id of keys) {
        if (!knownProperties.value[id]) {
            knownProperties.value[id] = { thing_id: id, name: null, name_translations: null };
        }
    }
}, { immediate: true });

// Pick which property gets the Coordinates editor: an existing
// coordinate-shaped value first (legacy + unlinked properties), otherwise the
// first known property whose name suggests coordinates — but only when it has
// no value yet, so an existing plain-text value is never hijacked.
const resolveGeoPropertyId = () => {
    const existing = extractCoordinates(formData.value.data?.properties);
    if (existing.length) {
        geoPropertyId.value = existing[0].property_id;
        return;
    }
    const byName = Object.values(knownProperties.value).find((p) => {
        if (!isGeoPropertyName(p.name)) return false;
        const v = formData.value.data.properties[p.thing_id];
        return v === undefined || v === null || v === '';
    });
    geoPropertyId.value = byName?.thing_id ?? null;
};

// The geo editor binds to the object's property value as a GeoJSON geometry.
// Mutations (lat/lng/height inputs) happen in place; GeoPicker and the JSON
// textarea replace the object via the setter. The getter seeds the entry and
// converts legacy { lat, lng } values to a Point.
const geoForm = computed({
    get: () => {
        const id = geoPropertyId.value;
        const props = formData.value.data.properties;
        if (!id) return { type: 'Point', coordinates: [null, null] };
        let value = props[id];
        if (isLegacyLatLng(value)) {
            value = latLngToPoint(value);
            props[id] = value;
        }
        if (value === undefined || value === null || value === '') {
            value = { type: 'Point', coordinates: [null, null] };
            props[id] = value;
        }
        return value;
    },
    set: (value) => {
        if (geoPropertyId.value) formData.value.data.properties[geoPropertyId.value] = value;
        // Keep the raw GeoJSON draft in sync when the geometry changed from
        // outside the textarea (e.g. vertex drags), but never clobber the
        // user's own typing: a draft that parses to the same geometry is left as-is.
        if (value?.type && value.type !== 'Point') {
            let stale = true;
            if (geoJsonDraft.value) {
                try {
                    stale = JSON.stringify(JSON.parse(geoJsonDraft.value)) !== JSON.stringify(value);
                } catch (e) {
                    stale = true; // unparseable draft → not from a committed geometry
                }
            }
            if (stale) geoJsonDraft.value = JSON.stringify(value, null, 2);
        }
    },
});

// Optional elevation (3rd coordinate element) — Point only.
const geoHeight = computed({
    get: () => (geoForm.value?.type === 'Point' ? (geoForm.value.coordinates?.[2] ?? null) : null),
    set: (v) => {
        if (geoForm.value?.type === 'Point') geoForm.value.coordinates[2] = v;
    },
});

const defaultCoordinates = (type) => {
    switch (type) {
        case 'Point': return [null, null];
        case 'LineString': return [[null, null], [null, null]];
        case 'Polygon': return [[[null, null], [null, null], [null, null], [null, null]]];
        case 'MultiPoint': return [[null, null]];
        case 'MultiLineString': return [[[null, null], [null, null]]];
        case 'MultiPolygon': return [[[[null, null], [null, null], [null, null], [null, null]]]];
        default: return [null, null];
    }
};

// Geometry type selector: changing type resets coordinates to a template.
const geoType = computed({
    get: () => geoForm.value?.type ?? 'Point',
    set: (type) => {
        const next = { type, coordinates: defaultCoordinates(type) };
        geoForm.value = next;
        if (type !== 'Point') geoJsonDraft.value = JSON.stringify(next, null, 2);
        geoJsonError.value = '';
    },
});

// Raw GeoJSON editor for non-Point geometries (live-validated).
const geoJsonDraft = ref('');
const geoJsonError = ref('');

const onGeoJsonInput = (event) => {
    const raw = String(event.target.value || '').trim();
    if (!raw) {
        geoJsonError.value = '';
        return;
    }
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && GEO_TYPES.includes(parsed.type)
            && Array.isArray(parsed.coordinates)) {
            geoForm.value = parsed;
            geoJsonError.value = '';
        } else {
            geoJsonError.value = t('Invalid GeoJSON');
        }
    } catch (e) {
        geoJsonError.value = t('Invalid GeoJSON');
    }
};

// Sync the JSON draft when a non-Point geometry appears (load / type change).
watch(() => geoForm.value?.type, (type) => {
    if (type && type !== 'Point') {
        geoJsonDraft.value = JSON.stringify(geoForm.value, null, 2);
        geoJsonError.value = '';
    }
});

// ── Click-to-build vertex editing ──────────────────────────────────────────
// Map clicks build the geometry: a click sets a Point, appends a vertex to a
// LineString/MultiPoint, or appends a vertex to a Polygon ring (Finish closes
// the ring). MultiLineString/MultiPolygon stay textarea-only.
const CLICK_BUILD_TYPES = ['Point', 'MultiPoint', 'LineString', 'Polygon'];

const geoClickable = computed(() => CLICK_BUILD_TYPES.includes(geoForm.value?.type));

const onGeoPickerClick = ({ lat, lng }) => {
    const next = appendVertex(geoForm.value, lng, lat);
    if (!next) return;
    geoForm.value = next;
    if (next.type !== 'Point') geoJsonDraft.value = JSON.stringify(next, null, 2);
};

const finishPolygon = () => {
    const next = closePolygon(geoForm.value);
    if (next !== geoForm.value) {
        geoForm.value = next;
        geoJsonDraft.value = JSON.stringify(next, null, 2);
    }
};

const clearGeo = () => {
    const type = geoForm.value?.type || 'Point';
    const next = { type, coordinates: defaultCoordinates(type) };
    geoForm.value = next;
    if (type !== 'Point') geoJsonDraft.value = JSON.stringify(next, null, 2);
    geoJsonError.value = '';
};

// "Finish" is offered while a polygon ring is open (≥3 vertices, not closed).
const canFinishPolygon = computed(() => {
    const geometry = geoForm.value;
    if (!geometry || geometry.type !== 'Polygon') return false;
    const ring = stripBlankCoords(geometry.coordinates?.[0]);
    if (ring.length < 3) return false;
    const first = ring[0];
    const last = ring[ring.length - 1];
    return !(first[0] === last[0] && first[1] === last[1]);
});

const geoClickHint = computed(() => {
    const type = geoForm.value?.type;
    if (type === 'Point') return t('Click the map to set coordinates');
    if (type === 'MultiPoint' || type === 'LineString' || type === 'Polygon') {
        return t('Click the map to add points');
    }
    return t('Edit GeoJSON below');
});

const ensureAllProperties = async () => {
    if (allProperties.value.length) return;
    try {
        const res = await axios.get('/properties');
        allProperties.value = res.data?.data ?? [];
        registerProperties(allProperties.value);
    } catch (e) {
        console.error('[EditObject] failed to load properties:', e);
    }
};

const togglePropertyPicker = async () => {
    showPropertyPicker.value = !showPropertyPicker.value;
    if (showPropertyPicker.value) await ensureAllProperties();
};

const filteredProperties = computed(() => {
    const q = propertyFilter.value.trim().toLowerCase();
    const attached = new Set(Object.keys(formData.value.data?.properties || {}));
    return allProperties.value.filter((p) => {
        if (attached.has(p.thing_id)) return false;
        if (!q) return true;
        return String(p.name || '').toLowerCase().includes(q);
    });
});

const attachProperty = (propId) => {
    const props = formData.value.data.properties;
    if (!(propId in props)) props[propId] = '';
    showPropertyPicker.value = false;
    propertyFilter.value = '';
    resolveGeoPropertyId();
};

// Inline "create a new property" — a Property-class object via the store endpoint.
const createProperty = async () => {
    const name = newPropertyName.value.trim();
    if (!name) return;
    const thingId = uuidv4();
    try {
        await axios.post(`/object/${thingId}`, {
            thing_id: thingId,
            name,
            type: THING_TYPE,
            public: 1,
            class: {
                one_thing_id: thingId,
                link_type_id: LINK_TO_CLASS,
                other_thing_id: UUID.PROPERTY_CLASS,
                public: 1,
            },
        });
        const created = { thing_id: thingId, name, name_translations: null };
        registerProperties([created]);
        allProperties.value = [...allProperties.value, created];
        newPropertyName.value = '';
        attachProperty(thingId);
    } catch (e) {
        console.error('[EditObject] failed to create property:', e);
    }
};

// Re-fetch suggested properties whenever the chosen class changes.
watch(() => classLinkData.value.other_thing_id, (newId) => {
    loadSuggestedProperties(newId);
});

// "Inherited" flag on property definitions: stored as data.inherited (default
// true) — controls whether the property propagates to a class's subclasses.
const isPropertyDefinition = computed(() =>
    formData.value.type === THING_TYPE
    && !!classLinkData.value.other_thing_id
    && classLinkData.value.other_thing_id === UUID.PROPERTY_CLASS
);

const inheritedFlag = computed({
    get: () => formData.value.data.inherited ?? true,
    set: (v) => { formData.value.data.inherited = v; },
});

// Drop untouched property values (empty Point geometry / empty string) so the
// editor never persists junk entries when the user saved without input.
const sanitizeGeoProperties = () => {
    const props = formData.value.data?.properties;
    if (!props || typeof props !== 'object') return;
    for (const [id, value] of Object.entries(props)) {
        if (value === '' || value === null || value === undefined) {
            delete props[id];
            continue;
        }
        if (typeof value === 'object' && !Array.isArray(value) && value.type === 'Point') {
            const c = value.coordinates;
            const blank = !Array.isArray(c) || c.length < 2
                || c[0] === null || c[1] === null || c[0] === '' || c[1] === '';
            if (blank) delete props[id];
        }
    }
};

const handleParentLinkUpdate = ({ data }) => {
    parentLinkData.value = { ...parentLinkData.value, ...data };
};
const handleParentLinkRemove = () => {
    parentLinkData.value.other_thing_id = '';
    parentLinkData.value.link_id = null;
};

const modalId = `editObjectModal-${formData.value.thing_id}`;
const modalLabelId = `editObjectModalLabel-${formData.value.thing_id}`;
const confirmModalId = `confirmModal-${formData.value.thing_id}`;

// Guards for recursive initialization
const isInitializing = ref(false);
const lastInitializedId = ref(null);

// Initialize data
const initializeData = () => {
    if (isInitializing.value) return;
    isInitializing.value = true;

    linkedObjects.value = [];
    externalLinks.value = [];

    // Reset special links
    classLinkData.value = {
        one_thing_id: formData.value.thing_id,
        other_thing_id: '',
        link_type_id: LINK_TO_CLASS,
        translation: '',
        link_id: null,
    };
    parentLinkData.value = {
        one_thing_id: formData.value.thing_id,
        other_thing_id: '',
        link_type_id: LINK_TO_PARENT,
        translation: '',
        link_id: null,
    };

    // Process initialLinkedObjects
    props.initialLinkedObjects.forEach(item => {
        const linkItem = {
            one_thing_id: item.one_thing_id || '',
            other_thing_id: item.other_thing_id || '',
            link_type_id: item.link_type_id || '',
            translation: item.description || item.translation || '',
            link_id: item.linkId ?? item.link_id ?? null,
            link_start: item.link_start || null,
            link_end: item.link_end || null,
            link_start_meta: item.link_start_meta || null,
            link_end_meta: item.link_end_meta || null,
            name: item.name || null,
            one_name: item.one_name || null,
        };

        if (formData.value.type === THING_TYPE && item.link_type_id === LINK_TO_CLASS) {
            classLinkData.value = { ...classLinkData.value, ...linkItem };
            return;
        }

        if ((formData.value.type === CLASS_TYPE || formData.value.type === LINK_TYPE) && item.link_type_id === LINK_TO_PARENT) {
            const parentId = linkItem.one_thing_id || linkItem.other_thing_id;
            if (parentId) {
                parentLinkData.value.other_thing_id = parentId;
                parentLinkData.value.link_id = linkItem.link_id;
                parentLinkData.value.translation = linkItem.translation;
            }
            console.log('[EditObject] parentLinkData set to:', JSON.parse(JSON.stringify(parentLinkData.value)));
            return;
        }

        linkedObjects.value.push(linkItem);
    });

    // For edit mode, also read from existing object
    if (isEditMode.value && props.object) {
        if (formData.value.type === THING_TYPE && props.object.class?.thing_id && !classLinkData.value.other_thing_id) {
            classLinkData.value.other_thing_id = props.object.class.thing_id;
            classLinkData.value.link_id = props.object.class?.link_id || null;
        }
        if ((formData.value.type === CLASS_TYPE || formData.value.type === LINK_TYPE) && props.object.links) {
            const parentLinkFromLinks = props.object.links.find(link => link.link_type_id === LINK_TO_PARENT);
            if (parentLinkFromLinks) {
                let parentId;
                if (parentLinkFromLinks.one_thing_id === props.object.thing_id) {
                    parentId = parentLinkFromLinks.other_thing_id;
                } else {
                    parentId = parentLinkFromLinks.one_thing_id;
                }
                parentLinkData.value.other_thing_id = parentId;
                parentLinkData.value.link_id = parentLinkFromLinks.link_id;
                parentLinkData.value.translation = parentLinkFromLinks.translation || '';
                console.log('[EditObject] parentLinkData updated from existing links:', JSON.parse(JSON.stringify(parentLinkData.value)));
            }
        }

        // For edit mode, also load existing external links
        if (Array.isArray(props.object.external_links)) {
            externalLinks.value = props.object.external_links.map(el => ({
                id: el.id || null,
                _key: el.id || uuidv4(), // stable frontend-only key for v-for
                url: el.url || '',
            }));
        }
    }

    // Store original state
    originalFormData.value = JSON.parse(JSON.stringify(formData.value));
    originalLinkedObjects.value = JSON.parse(JSON.stringify(linkedObjects.value));
    originalClassLink.value = JSON.parse(JSON.stringify(classLinkData.value));
    originalParentLink.value = JSON.parse(JSON.stringify(parentLinkData.value));
    originalExternalLinks.value = JSON.parse(JSON.stringify(externalLinks.value));

    isInitializing.value = false;
};

initializeData();

// Helper methods
const setLinkedObjectRef = (index, el) => {
    if (el) linkedObjectRefs.value[index] = el;
    else delete linkedObjectRefs.value[index];
};

const addNewLinkedObject = async () => {
    linkedObjects.value.push({
        id: uuidv4(),
        one_thing_id: formData.value.thing_id,
        other_thing_id: '',
        link_type_id: LINK_TO_RELATED,
        translation: '',
        link_id: null,
        link_start: null,
        link_end: null,
        link_start_meta: null,
        link_end_meta: null,
    });
    await nextTick();
    // Focus the second-object selector — the first one is fixed to the current
    // object, so the user only ever needs to fill in the other end of the link.
    linkedObjectRefs.value[linkedObjects.value.length - 1]?.focusSecondObject?.();
};

const updateItem = ({ index, data }) => {
    linkedObjects.value[index] = { ...linkedObjects.value[index], ...data };
};

const removeItem = (index) => {
    linkedObjects.value.splice(index, 1);
};

const setExternalLinkRef = (key, node) => {
    if (node) externalLinkInputs.value[key] = node;
    else delete externalLinkInputs.value[key];
};

const addExternalLink = async () => {
    const key = uuidv4();
    externalLinks.value.push({
        id: null, // stays null for new rows so the backend inserts instead of updating
        _key: key, // stable frontend-only key for v-for
        url: '',
    });
    await nextTick();
    externalLinkInputs.value[key]?.focus();
};

const removeExternalLink = (index) => {
    externalLinks.value.splice(index, 1);
};

const confirmClose = () => {
    if (document.activeElement?.blur) document.activeElement.blur();
    if (confirmModalInstance) confirmModalInstance.hide();
    const modalElement = document.getElementById(modalId);
    if (modalElement && modalInstance) {
        modalElement.removeEventListener('hide.bs.modal', handleHideModal);
        modalInstance.hide();
    }
    emit('close');
};

const handleHideModal = (event) => {
    if (document.activeElement?.blur) document.activeElement.blur();
    const modalElement = document.getElementById(modalId);
    if (!modalElement || !modalInstance) {
        event.preventDefault();
        event.stopPropagation();
        return;
    }
    // A stacked modal becoming active hides this one — no unsaved-changes
    // prompt for that; the form stays mounted underneath.
    if (isForcedHide) return;
    if (hasUnsavedChanges.value && !isClosing && !isSubmitting) {
        event.preventDefault();
        event.stopPropagation();
        if (confirmModalInstance) confirmModalInstance.show();
    }
};

const submitForm = async () => {
    if (isSubmitting) return;
    try {
        isSubmitting = true;

        const linkDateFields = (item) => {
            const out = {};
            for (const f of ['link_start', 'link_end', 'link_start_meta', 'link_end_meta']) {
                if (item[f] != null && item[f] !== '') out[f] = item[f];
            }
            return out;
        };
        sanitizeGeoProperties();

        const linksToAdd = regularLinks.value
            .filter(item => item.other_thing_id?.trim() && !item.link_id)
            .map(item => ({
                // Respect the row's own direction: normally the currently edited
                // object, but the user may have swapped it, making the other end
                // the first object.
                one_thing_id: item.one_thing_id || formData.value.thing_id,
                link_type_id: item.link_type_id,
                other_thing_id: item.other_thing_id,
                description: item.translation || '',
                public: 0,
                ...linkDateFields(item),
            }));

        const namePayload = buildFieldPayload('name');
        const descPayload = buildFieldPayload('description');
        const payload = {
            thing_id: formData.value.thing_id,
            name: namePayload.plain,
            name_translations: namePayload.translations,
            description: descPayload.plain,
            description_translations: descPayload.translations,
            start: formData.value.start || null,
            end: formData.value.end || null,
            start_meta: formData.value.start_meta || null,
            end_meta: formData.value.end_meta || null,
            public: formData.value.public,
            type: formData.value.type,
            data: formData.value.data,
        };

        // Owner (system ownership / reassignment) — admins only
        if (isAdmin.value) {
            payload.owner = formData.value.owner || undefined;
        }

        if (formData.value.type === THING_TYPE && classLinkData.value.other_thing_id) {
            payload.class = {
                one_thing_id: formData.value.thing_id,
                link_type_id: LINK_TO_CLASS,
                other_thing_id: classLinkData.value.other_thing_id,
                description: classLinkData.value.translation || '',
                link_id: classLinkData.value.link_id || undefined,
                public: 1,
            };
        }

        if ((formData.value.type === CLASS_TYPE || formData.value.type === LINK_TYPE) && parentLinkData.value.other_thing_id) {
            payload.parent = {
                one_thing_id: parentLinkData.value.other_thing_id,
                link_type_id: LINK_TO_PARENT,
                other_thing_id: formData.value.thing_id,
                description: parentLinkData.value.translation || '',
                link_id: parentLinkData.value.link_id || undefined,
                public: 1,
            };
        }

        if (linksToAdd.length > 0) payload.links_to_add = linksToAdd;

        if (isEditMode.value) {
            const linksToUpdate = regularLinks.value
                .filter(item => item.link_id && item.other_thing_id?.trim())
                .map(item => ({
                    link_id: item.link_id,
                    one_thing_id: item.one_thing_id || formData.value.thing_id,
                    other_thing_id: item.other_thing_id,
                    link_type_id: item.link_type_id,
                    translation: item.translation,
                    ...linkDateFields(item),
                }));
            if (linksToUpdate.length > 0) payload.links_to_update = linksToUpdate;

            const linksToDelete = originalLinkedObjects.value
                .filter(orig => orig.link_id && !regularLinks.value.find(curr => curr.link_id === orig.link_id))
                .map(orig => orig.link_id);
            if (linksToDelete.length > 0) payload.links_to_delete = linksToDelete;
        }

        // Full desired external-links list — the backend diffs it against existing rows.
        payload.external_links = externalLinks.value
            .map(el => ({ id: el.id || undefined, url: (el.url || '').trim() }))
            .filter(el => el.url);

        console.log('[EditObject] Final payload:', JSON.parse(JSON.stringify(payload)));

        let response;
        if (isEditMode.value) {
            response = await axios.put(`/object/${formData.value.thing_id}`, payload);
            cacheStore.cacheObject(formData.value.thing_id, response.data.data || response.data, formData.value.type);
            emit('object-updated', response.data);
            if (formData.value.type === CLASS_TYPE || formData.value.type === LINK_TYPE) {
                // Reload the authoritative class tree so renames and new
                // translations (localized display names) show in the sidebar.
                objectsStore.loadClassTree();
            }
        } else {
            response = await axios.post(`/object/${formData.value.thing_id}`, payload);
            // Update cache with real saved data
            cacheStore.cacheObject(formData.value.thing_id, response.data.data || response.data, formData.value.type);
            emit('object-created', response.data);
            if (formData.value.type === CLASS_TYPE) {
                objectsStore.addClassToTree(formData.value.thing_id, formData.value.name, parentLinkData.value.other_thing_id);
            } else if (formData.value.type === LINK_TYPE) {
                // Reload from the server so the new node carries its real type
                // (addClassToTree omits it), keeping the tree's create actions
                // correct for the freshly added link type.
                objectsStore.loadClassTree();
            }
            if (props.callback && props.callback.type === 'link-created') {
                eventBus.emit('link-created', {
                    requestId: props.callback.requestId,
                    newObjectId: formData.value.thing_id,
                    newObjectName: formData.value.name,
                    index: props.callback.index,
                    linkTypeUuid: props.callback.linkTypeUuid,
                    comment: props.callback.comment
                });
            }
        }

        if (document.activeElement?.blur) document.activeElement.blur();
        const modalElement = document.getElementById(modalId);
        if (modalElement) modalElement.removeEventListener('hide.bs.modal', handleHideModal);
        if (modalInstance) modalInstance.hide();
        setTimeout(() => {
            emit('close');
            isSubmitting = false;
        }, 300);
    } catch (error) {
        console.error('Submit error:', error.response || error);
        const resp = error.response?.data || {};
        errorMessage.value = resp.message || error.message || 'Unknown error';
        errorDetails.value = resp.errors || '';
        showError.value = true;
        isSubmitting = false;
    }
};

onMounted(async () => {
    availableLanguages.value = await loadLanguages();
    seedExtraLanguages();
    await nextTick();
    if (isAdmin.value) loadOwnerOptions();
    const modalElement = document.getElementById(modalId);
    const confirmModalElement = document.getElementById(confirmModalId);
    if (modalElement) {
        modalInstance = new Modal(modalElement);
        modalElement.addEventListener('hide.bs.modal', handleHideModal);
        // The GeoPicker mini-map mounts inside a hidden Bootstrap modal; give it
        // its real size once the modal is visible so tiles/markers lay out.
        modalElement.addEventListener('shown.bs.modal', () => {
            if (geoPickerRef.value) geoPickerRef.value.invalidate();
        });
        modalElement.addEventListener('hidden.bs.modal', () => {
            const wasForcedHide = isForcedHide;
            isForcedHide = false;
            if (!isSubmitting && !wasForcedHide) emit('close');
        });
        setTimeout(() => {
            if (modalInstance && modalElement && props.active) modalInstance.show();
        }, 100);
    }
    if (confirmModalElement) confirmModalInstance = new Modal(confirmModalElement);
});

// Stacked create modals: hide this one (no prompt) when a modal above becomes
// active, and re-show it when it becomes the top again.
watch(() => props.active, (active) => {
    const modalElement = document.getElementById(modalId);
    if (!modalElement || !modalInstance) return;
    if (active) {
        modalInstance.show();
    } else {
        isForcedHide = true;
        modalInstance.hide();
    }
});

onUnmounted(() => {
    const modalElement = document.getElementById(modalId);
    if (modalElement) modalElement.removeEventListener('hide.bs.modal', handleHideModal);
    if (modalInstance) modalInstance.hide();
    if (confirmModalInstance) confirmModalInstance.hide();
});

watch(() => props.object, (newObject, oldObject) => {
    if (!newObject) return;
    const newId = newObject.thing_id || newObject.id;
    const oldId = oldObject?.thing_id || oldObject?.id;
    if (newId === oldId && lastInitializedId.value === newId) return;
    lastInitializedId.value = newId;

    formData.value = {
        thing_id: newObject.thing_id || newObject.id || uuidv4(),
        name: '',
        description: '',
        start: newObject.start || '',
        end: newObject.end || '',
        public: newObject.public ? 1 : 0,
        type: props.params.type || 3,
        owner: newObject.owner || '',
        data: newObject.data && typeof newObject.data === 'object'
            ? { ...newObject.data, properties: normalizePropertiesMap(newObject.data.properties) }
            : { properties: {} },
    };
    initLocalization(newObject);
    initializeData();
}, { deep: false });
</script>

<style scoped>
.modal-dialog {
    max-width: 800px;
}

/* Per-field language selector: hidden until the field is hovered, then
   overlaid on the right edge of the input. */
.localized-field-row {
    position: relative;
}
.localized-field-row :deep(.field-lang-select) {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 5;
    max-width: 150px;
    width: auto;
}
.field-lang-badge {
    position: absolute;
    top: 2px;
    right: 4px;
    z-index: 5;
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    color: #495057;
    background: #e9ecef;
    border: 1px solid #ced4da;
    border-radius: 3px;
    padding: 1px 5px;
    pointer-events: none;
}

/* Mobile responsive styles */
@media (max-width: 767.98px) {
    .modal-dialog {
        margin: 0.5rem;
        max-width: calc(100% - 1rem);
    }

    .modal-content {
        border-radius: 12px;
        overflow: hidden;
    }

    .modal-body {
        padding: 1rem;
        max-height: 70vh;
        overflow-y: auto;
    }

    .btn-primary, .btn-secondary {
        padding: 8px 16px;
        font-size: 14px;
    }
}

@media (max-width: 480px) {
    .modal-body {
        padding: 0.75rem;
    }

    .modal-footer {
        flex-direction: column;
        gap: 8px;
    }

    .modal-footer .btn {
        width: 100%;
        margin: 0;
    }
}

.btn-primary {
    background-color: #007bff;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
}
.btn-primary:hover {
    background-color: #0056b3;
}
.btn-secondary {
    background-color: #6c757d;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
}
.btn-secondary:hover {
    background-color: #5a6268;
}
.btn-danger {
    background-color: #dc3545;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
}
.btn-danger:hover {
    background-color: #c82333;
}
/* Public checkbox styling */
.form-check {
    padding-left: 1.8em;
}

.form-check-input {
    width: 1.2em;
    height: 1.2em;
    margin-top: 0.15em;
    margin-left: -1.8em;
}

.form-check-label {
    font-weight: 500;
    cursor: pointer;
}

.form-text {
    font-size: 0.75rem;
    margin-top: 0.25rem;
}
</style>
