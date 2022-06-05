import { error, ok } from 'fallible'
import { parseCharSetContentTypeHeader } from 'fallible-server/utils'

import { CSRF_HEADER, JSON_KEY } from './constants.js'
import { validateWebSocketMessage } from './shared.js'


const abortedError = error({ tag: 'Aborted' })


function networkOrAbortedError(signal, exception) {
    return signal?.aborted
        ? abortedError
        : error({ tag: 'NetworkError', exception })
}


function unexpectedContentTypeError(response) {
    return error({
        tag: 'UnexpectedContentType',
        response
    })
}


function outputDecodeError(response, exception) {
    return error({
        tag: 'OutputDecodeError',
        response,
        exception
    })
}


function buildGETURL(url, input) {
    if (input === undefined) {
        return url
    }
    const query = encodeURIComponent(JSON.stringify(input))
    return `${url}?${JSON_KEY}=${query}`
}


export function buildURL(schema, endpoint, input) {
    let url = schema.prefix + endpoint
    const { method } = schema.endpoints[endpoint]
    if (method === undefined || method === 'GET') {
        url = buildGETURL(url, input)
    }
    return url
}


export async function fetchEndpoint(schema, endpoint, { input, files, signal }) {
    if (signal?.aborted) {
        return abortedError
    }

    const { method, auth, responses } = schema.endpoints[endpoint]

    const headers = {}
    let url = schema.prefix + endpoint
    let body

    if (method === undefined || method === 'GET') {
        url = buildGETURL(url, input)
    }
    else if (files !== undefined) {
        body = new FormData()
        for (const [ name, blob ] of Object.entries(files)) {
            body.append(name, blob)
        }
        if (input !== undefined) {
            body.append(JSON_KEY, JSON.stringify(input))
        }
    }
    else if (input !== undefined) {
        body = JSON.stringify(input)
        headers['Content-Type'] = 'application/json; charset=utf-8'
    }

    let credentials
    switch (auth) {
        case 'required':
        case 'optional':
            credentials = 'same-origin'
            headers[CSRF_HEADER] = ''
            break
        default:
            credentials = 'omit'
    }

    let response
    try {
        response = await fetch(url, { method, body, headers, credentials, signal })
    }
    catch (exception) {
        return networkOrAbortedError(signal, exception)
    }

    const res = responses[response.status]
    if (res === undefined) {
        return error({ tag: 'UnexpectedStatus', response })
    }

    const contentType = response.headers.get('Content-Type')
    if (contentType === null) {
        return unexpectedContentTypeError(response)
    }
    const parsed = parseCharSetContentTypeHeader(contentType)
    if (parsed === undefined || parsed.characterSet !== 'utf-8') {
        return unexpectedContentTypeError(response)
    }

    switch (res.type) {
        case 'html': {
            if (parsed.type !== 'text/html') {
                return unexpectedContentTypeError(response)
            }
            let data
            try {
                data = await response.text()
            }
            catch (exception) {
                return outputDecodeError(response, exception)
            }
            return ok({
                status: response.status,
                data
            })
        }
        case 'json': {
            if (parsed.type !== 'application/json') {
                return unexpectedContentTypeError(response)
            }
            let output
            try {
                output = await response.json()
            }
            catch (exception) {
                return outputDecodeError(response, exception)
            }
            const result = res.data.validate(output)
            if (!result.success) {
                return error({
                    tag: 'OutputValidationError',
                    output,
                    response,
                    result
                })
            }
            return ok({
                status: response.status,
                data: result.value
            })
        }
        case 'binary': {
            if (!res.mimetype.guard(parsed.type)) {
                return unexpectedContentTypeError(response)
            }
            // TODO: return web stream
            let data
            try {
                data = await response.blob()
            }
            catch (exception) {
                return outputDecodeError(response, exception)
            }
            return ok({
                status: response.status,
                data
            })
        }
        default:
            throw new Error('Unexpected response type')
    }
}


// TODO: use EventTarget
export class ValidatedWebSocket {
    #socket
    #messageListeners

    constructor(socket, validator) {
        this.#socket = socket
        this.#messageListeners = []
        this.validator = validator

        socket.addEventListener('message', ({ data }) => {
            if (this.#messageListeners.length === 0) {
                return
            }
            const result = validateWebSocketMessage(data, this.validator)
            for (const listener of this.#messageListeners) {
                listener(result)
            }
        })
    }

    addCloseListener(listener) {
        this.#socket.addEventListener('close', listener)
    }

    removeCloseListener(listener) {
        this.#socket.removeEventListener('close', listener)
    }

    addMessageListener(listener) {
        this.#messageListeners.push(listener)
    }

    removeMessageListener(listener) {
        this.#messageListeners = this.#messageListeners.filter(l => l !== listener)
    }

    close() {
        this.#socket.close()
    }

    send(message) {
        this.#socket.send(JSON.stringify(message))
    }

    get state() {
        return this.#socket.readyState
    }

    get buffered() {
        return this.#socket.bufferedAmount
    }
}


export function connectWebSocketEndpoint(
    schema,
    endpointName,
    {
        host = location.host,
        tls = location.protocol === 'https:',
        signal
    } = {}
) {
    if (signal?.aborted) {
        return abortedError
    }

    return new Promise(resolve => {
        const socket = new WebSocket(
            `${tls ? 'wss' : 'ws'}://${host}${schema.prefix}${endpointName}`
        )

        const onAbort = () => socket.close()

        const onClose = () => {
            signal?.removeEventListener('abort', onAbort)
            socket.removeEventListener('close', onClose)
            socket.removeEventListener('open', onOpen)
            resolve(networkOrAbortedError(signal))
        }

        const onOpen = () => {
            socket.removeEventListener('close', onClose)
            socket.removeEventListener('open', onOpen)
            const endpoint = schema.endpoints[endpointName]
            const wrapper = new ValidatedWebSocket(socket, endpoint.websocket.down)
            resolve(ok(wrapper))
        }

        signal?.addEventListener('abort', onAbort)
        socket.addEventListener('close', onClose)
        socket.addEventListener('open', onOpen)
    })
}
