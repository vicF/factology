// composables/useLinkTranslation.js
import { ref, computed, watch } from 'vue'
import { useObjectCacheStore } from '@/stores/objectCache.js'

export function useLinkTranslation(options = {}) {
    const {
        initialData = {},
        customFormatter = null
    } = options

    const cacheStore = useObjectCacheStore()

    // Реактивные UUID
    const currentUuid = ref(initialData.currentObjectUuid || null)
    const linkedUuid = ref(initialData.linkedObjectUuid || null)
    const typeUuid = ref(initialData.linkTypeUuid || null)

    // Ручное описание (то, что сохраняется на сервер)
    const translation = ref(initialData.translation || '')

    // Флаг ручного режима
    const isManuallyEdited = ref(!!initialData.translation && initialData.translation.length > 0)

    // Функция генерации предпросмотра
    const defaultFormatter = (current, linked, type) => {
        if (!current && !linked) return ''

        const parts = []

        const currentObj = current ? cacheStore.getCachedObject(current) : null
        const linkedObj = linked ? cacheStore.getCachedObject(linked) : null
        const typeObj = type ? cacheStore.getCachedObject(type) : null

        if (linked) {
            if (linkedObj?.name) {
                parts.push(linkedObj.name)
            } else {
                parts.push(`[${linked.slice(0, 8)}]`)
            }
        }

        parts.push('→')

        if (type) {
            const typeText = typeObj?.name || type.slice(0, 4)
            parts.push(`(${typeText})`)
        }

        if (current && linked) {
            parts.push('→')
        }

        if (current) {
            if (currentObj?.name) {
                parts.push(currentObj.name)
            } else {
                parts.push(`[${current.slice(0, 8)}]`)
            }
        }
        return parts.join(' ')
    }

    const formatter = customFormatter || defaultFormatter

    // Генерируемое описание (только для просмотра)
    const generatedTranslation = computed(() => {
        return formatter(currentUuid.value, linkedUuid.value, typeUuid.value)
    })

    // Методы для управления
    const setCurrent = (uuid) => {
        currentUuid.value = uuid
    }

    const setLinked = (uuid) => {
        linkedUuid.value = uuid
    }

    const setType = (uuid) => {
        typeUuid.value = uuid
    }

    const setTranslation = (text) => {
        translation.value = text
        isManuallyEdited.value = true
    }

    // Сброс к автоматически сгенерированному
    const resetToGenerated = () => {
        translation.value = generatedTranslation.value
        isManuallyEdited.value = true // Оставляем в ручном режиме, но с автоматическим текстом
    }

    // Начать ручное редактирование с копированием автоматического текста
    const startManualEdit = () => {
        if (!isManuallyEdited.value && generatedTranslation.value) {
            translation.value = generatedTranslation.value
        }
        isManuallyEdited.value = true
    }

    // Полностью сбросить ручной режим
    const disableManualMode = () => {
        isManuallyEdited.value = false
        translation.value = ''
    }

    const reset = () => {
        currentUuid.value = null
        linkedUuid.value = null
        typeUuid.value = null
        isManuallyEdited.value = false
        translation.value = ''
    }

    // Валидация
    const isValid = computed(() =>
        currentUuid.value && linkedUuid.value
    )

    // Данные для отправки
    const toJSON = computed(() => ({
        currentObjectUuid: currentUuid.value,
        linkedObjectUuid: linkedUuid.value,
        linkTypeUuid: typeUuid.value,
        translation: translation.value
    }))

    return {
        currentUuid,
        linkedUuid,
        typeUuid,
        translation,
        generatedTranslation,
        isManuallyEdited,
        isValid,

        setCurrent,
        setLinked,
        setType,
        setTranslation,
        resetToGenerated,
        startManualEdit,
        disableManualMode,
        reset,

        toJSON,

        debug: computed(() => ({
            current: currentUuid.value,
            linked: linkedUuid.value,
            type: typeUuid.value,
            manual: translation.value,
            generated: generatedTranslation.value,
            isManuallyEdited: isManuallyEdited.value
        }))
    }
}
