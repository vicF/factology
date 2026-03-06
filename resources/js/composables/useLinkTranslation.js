// composables/useLinkTranslation.js
import { ref, computed, watch } from 'vue'
import { useObjectCacheStore } from '@/stores/objectCache.js'

/**
 * Композабл для управления переводом и генерации предпросмотра
 */
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
    const isManuallyEdited = ref(!!initialData.translation) // если есть описание с сервера

    // Функция генерации предпросмотра
    const defaultFormatter = (current, linked, type) => {
        if (!current && !linked) return ''

        const parts = []

        // Получаем объекты из кэша
        const currentObj = current ? cacheStore.getCachedObject(current) : null
        const linkedObj = linked ? cacheStore.getCachedObject(linked) : null
        const typeObj = type ? cacheStore.getCachedObject(type) : null

        // Форматируем текущий объект
        if (current) {
            if (currentObj?.name) {
                parts.push(currentObj.name)
            } else {
                parts.push(`[${current.slice(0, 8)}]`)
            }
        }

        // Добавляем стрелку если есть оба объекта
        if (current && linked) {
            parts.push('→')
        }

        // Форматируем связанный объект
        if (linked) {
            if (linkedObj?.name) {
                parts.push(linkedObj.name)
            } else {
                parts.push(`[${linked.slice(0, 8)}]`)
            }
        }

        // Добавляем тип связи
        if (type) {
            const typeText = typeObj?.name || type.slice(0, 4)
            parts.push(`(${typeText})`)
        }

        return parts.join(' ')
    }

    // Выбираем форматтер
    const formatter = customFormatter || defaultFormatter

    // Генерируемое описание (только для просмотра)
    const generatedTranslation = computed(() => {
        return formatter(currentUuid.value, linkedUuid.value, typeUuid.value)
    })

    // Методы для управления
    const setCurrent = (uuid) => {
        currentUuid.value = uuid
        // Не сбрасываем ручной режим при изменении UUID
    }

    const setLinked = (uuid) => {
        linkedUuid.value = uuid
        // Не сбрасываем ручной режим при изменении UUID
    }

    const setType = (uuid) => {
        typeUuid.value = uuid
        // Не сбрасываем ручной режим при изменении UUID
    }

    const setTranslation = (text) => {
        translation.value = text
        isManuallyEdited.value = true // Включаем ручной режим при редактировании
    }

    const resetManualMode = () => {
        isManuallyEdited.value = false
        // Очищаем ручное описание
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

    // Данные для отправки (только ручное описание)
    const toJSON = computed(() => ({
        currentObjectUuid: currentUuid.value,
        linkedObjectUuid: linkedUuid.value,
        linkTypeUuid: typeUuid.value,
        translation: translation.value // только ручное описание
    }))

    return {
        // Реактивные данные
        currentUuid,
        linkedUuid,
        typeUuid,
        translation, // ручное описание
        generatedTranslation, // автоматическое (только для просмотра)
        isManuallyEdited,
        isValid,

        // Методы
        setCurrent,
        setLinked,
        setType,
        setTranslation,
        resetManualMode,
        reset,

        // Данные
        toJSON,

        // Для отладки
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
