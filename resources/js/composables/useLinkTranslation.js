// composables/useLinkTranslation.js
import { useObjectCacheStore } from '@/stores/objectCache.js'

// Функция для генерации перевода из данных link
export function generateLinkDescription(link, object) {
    if (!link) return ''

    //const cacheStore = useObjectCacheStore()

    const parts = []

    parts.push((link.thing_id === link.other_thing_id)? link.name: object.name)
    parts.push('→')
    parts.push(link.link_name)
    parts.push('→')
    parts.push((link.thing_id === link.other_thing_id)? object.name:link.name)

    return parts.join(' ')
}

// Для обратной совместимости, если нужен композабл с состоянием
export function useLinkTranslation() {
    return {
        generateLinkDescription
    }
}
