import { parseJSONString } from 'fallible-server/utils'


export function validateWebSocketMessage(message, validator) {
    if (typeof message !== 'string') {
        return error({ tag: 'NonStringMessage', message })
    }
    let json
    try {
        json = parseJSONString(message)
    }
    catch {
        return error({ tag: 'NonJSONMessage', message })
    }
    const result = validator.validate(json)
    if (!result.success) {
        return error({ tag: 'InvalidMessage', message, result })
    }
    return ok(result.value)
}
