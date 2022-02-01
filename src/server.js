import { error, ok } from 'fallible'
import {
    composeMessageHandlers,
    composeResultMessageHandlers,
    messageIsWebSocketRequest,
    parseContentTypeHeader,
    parseJSONStream,
    parseJSONString,
    parseMultipartStream,
    response
} from 'fallible-server'
import {
    charsets as preferredCharsets,
    mediaTypes as preferredContentTypes,
} from '@hapi/accept'

import { AUTH_COOKIE_NAME, CSRF_HEADER, JSON_KEY } from './constants.js'


function errorResponse(state) {
    return response(error(state))
}


function okResponse(state) {
    return response(ok(state))
}


function isJSONOrAnyContentType(contentType) {
    switch (contentType) {
        case 'application/json':
        case '*/*':
            return true
        default:
            return false
    }
}


function isHTMLOrAnyContentType(contentType) {
    switch (contentType) {
        case 'text/html':
        case '*/*':
            return true
        default:
            return false
    }
}


function isHTMLOrJSONOrAnyContentType(contentType) {
    switch (contentType) {
        case 'text/html':
        case 'application/json':
        case '*/*':
            return true
        default:
            return false
    }
}


function isUTF8Charset(charset) {
    switch (charset) {
        case 'utf-8':
        case 'utf8':
            return true
        default:
            return false
    }
}


function isUTF8JSONContentTypeHeader(header) {
    if (header === undefined) {
        return false
    }
    const contentType = parseContentTypeHeader(header)
    return contentType !== undefined
        && contentType.characterSet !== undefined
        && contentType.type === 'application/json'
        && isUTF8Charset(contentType.characterSet)
}


function filesValidator(files) {
    const entries = Object.entries(files)
        .map(([ file, definition ]) => [
            file,
            Record_(definition)
        ])
    return Record_(
        Object.fromEntries(entries)
    )
}


function jsonOnOpenCallback(onOpen) {
    return async function * () {
        const iterator = onOpen()
        while (true) {
            const result = await iterator.next()
            if (result.done) {
                return result.value
            }
            yield JSON.stringify(result.value)
        }
    }
}


function messageToResult(data, validator) {
    if (typeof data !== 'string') {
        return error({ tag: 'NonStringMessage', data })
    }
    let json
    try {
        json = parseJSONString(data)
    }
    catch {
        return error({ tag: 'NonJSONMessage', data })
    }
    const result = validator.validate(json)
    if (!result.success) {
        return error({ tag: 'InvalidMessage', data, result })
    }
    return ok(result.value)
}


function jsonOnMessageCallback(onMessage, validator) {
    return async function * (data) {
        const result = messageToResult(data, validator)
        const iterator = onMessage(result)
        while (true) {
            const result = await iterator.next()
            if (result.done) {
                return result.value
            }
            yield JSON.stringify(result.value)
        }
    }
}


function websocketResponse(state, inValidator) {
    return response({
        ...state,
        body: {
            ...state.body,
            onOpen: state.body.onOpen === undefined
                ? undefined
                : jsonOnOpenCallback(state.body.onOpen),
            onMessage: jsonOnMessageCallback(state.body.onMessage, inValidator)
        }
    })
}


class HandlerException extends Error {
    constructor(value) {
        super()
        this.value = value
    }
}


function checkUpgradeForNoResponsesWebsocketEndpoint(isWebsocketRequest) {
    if (!isWebsocketRequest) {
        throw new HandlerException({ tag: 'UpgradeRequired' })
    }
}


function checkUpgradeForNonWebsocketEndpoint(isWebsocketRequest) {
    if (isWebsocketRequest) {
        throw new HandlerException({ tag: 'UpgradeDenied' })
    }
}


function checkAuthForRequiredAuthEndpoint(headers, cookies) {
    if (headers[CSRF_HEADER] === undefined) {
        throw new HandlerException({ tag: 'CSRFHeaderRequired' })
    }
    if (cookies[AUTH_COOKIE_NAME] === undefined) {
        throw new HandlerException({ tag: 'AuthRequired' })
    }
}


function checkAuthForOptionalAuthEndpoint(headers) {
    if (headers[CSRF_HEADER] === undefined) {
        throw new HandlerException({ tag: 'CSRFHeaderRequired' })
    }
}


function checkAcceptForEndpointWithResponses(headers, isWebsocketRequest, matchContentType) {
    if (isWebsocketRequest) {
        return
    }
    if (headers['Accept'] === undefined
            || !preferredContentTypes(headers['Accept']).some(matchContentType)) {
        throw new HandlerException({
            tag: 'InvalidAcceptHeader',
            header: headers['Accept']
        })
    }
    if (headers['Accept-Charset'] === undefined
            || !preferredCharsets(headers['Accept-Charset']).some(isUTF8Charset)) {
        throw new HandlerException({
            tag: 'InvalidAcceptCharsetHeader',
            header: headers['Accept-Charset']
        })
    }
}


function checkContentTypeForBodyEndpointWithFiles(headers) {
    if (!headers['Content-Type']?.startsWith('multipart/form-data')) {
        throw new HandlerException({
            tag: 'InvalidContentTypeHeader',
            header: headers['Content-Type']
        })
    }
}


function checkContentTypeForBodyEndpointWithInputButNoFiles(headers) {
    if (!isUTF8JSONContentTypeHeader(headers['Content-Type'])) {
        throw new HandlerException({
            tag: 'InvalidContentTypeHeader',
            header: headers['Content-Type']
        })
    }
}


function noBodyParsingHandler(_, state) {
    return okResponse(state)
}


export function createEndpointHandler(
    schema,
    endpointName,
    { sessionHandler, bodyHandler }
) {
    const endpoint = schema.endpoints[endpointName]
    const method = endpoint.method ?? 'GET'

    let hasJSONResponse = false
    let hasHTMLResponse = false
    for (const response of Object.values(endpoint.responses)) {
        if (response.type === 'html') {
            hasHTMLResponse = true
        }
        else {
            hasJSONResponse = true
        }
        if (hasHTMLResponse && hasJSONResponse) {
            break
        }
    }
    const hasResponses = hasJSONResponse || hasHTMLResponse

    let checkUpgrade
    if ('websocket' in endpoint) {
        if (!hasResponses) {
            checkUpgrade = checkUpgradeForNoResponsesWebsocketEndpoint
        }
    }
    else {
        checkUpgrade = checkUpgradeForNonWebsocketEndpoint
    }

    let checkAuth
    switch (endpoint.auth) {
        case 'required': {
            checkAuth = checkAuthForRequiredAuthEndpoint
            break
        }
        case 'optional': {
            checkAuth = checkAuthForOptionalAuthEndpoint
        }
    }

    let contentTypeMatcher
    if (hasJSONResponse && !hasHTMLResponse) {
        contentTypeMatcher = isJSONOrAnyContentType
    }
    else if (!hasJSONResponse && hasHTMLResponse) {
        contentTypeMatcher = isHTMLOrAnyContentType
    }
    else {
        contentTypeMatcher = isHTMLOrJSONOrAnyContentType
    }

    let checkAccept
    if (hasResponses) {
        checkAccept = checkAcceptForEndpointWithResponses
    }

    let checkContentType
    if (method !== 'GET') {
        if (endpoint.files === undefined) {
            if (endpoint.input !== undefined) {
                checkContentType = checkContentTypeForBodyEndpointWithInputButNoFiles
            }
        }
        else {
            checkContentType = checkContentTypeForBodyEndpointWithFiles
        }
    }

    const headersHandler = (message, _sockets, state) => {
        if (state.method !== method) {
            return errorResponse({
                tag: 'WrongMethod',
                method: state.method
            })
        }

        const isWebsocketRequest = messageIsWebSocketRequest(message)

        try {
            checkUpgrade?.(isWebsocketRequest)
            checkAuth?.(state.headers, state.cookies)
            checkAccept?.(state.headers, isWebsocketRequest, contentTypeMatcher)
            checkContentType?.(state.headers)
        }
        catch (err) {
            if (!(err instanceof HandlerException)) {
                throw err
            }
            return errorResponse(err.value)
        }

        return okResponse({
            ...state,
            isWebsocketRequest,
            token: state.cookies[AUTH_COOKIE_NAME]
        })
    }

    let bodyParsingAndValidationHandler
    if (method === 'GET') {
        if (endpoint.input === undefined) {
            bodyParsingAndValidationHandler = noBodyParsingHandler
        }
        else {
            bodyParsingAndValidationHandler = (_message, _sockets, state) => {
                if (state.url.query[JSON_KEY] === undefined) {
                    return errorResponse({ tag: 'URLQueryRequired' })
                }
                let json
                try {
                    json = parseJSONString(state.url.query[JSON_KEY])
                }
                catch {
                    return errorResponse({
                        tag: 'URLQueryMalformed',
                        query: state.url.query[JSON_KEY]
                    })
                }
                const result = endpoint.input.validate(json)
                if (!result.success) {
                    return errorResponse({
                        tag: 'URLQueryInputInvalid',
                        input: json
                    })
                }
                return okResponse({
                    ...state,
                    input: result.value
                })
            }
        }
    }
    else if (endpoint.files !== undefined) {
        const validator = filesValidator(endpoint.files)
        if (endpoint.input === undefined) {
            bodyParsingAndValidationHandler = async (message, _sockets, state) => {
                const parseResult = await parseMultipartStream(message)
                switch (parseResult.tag) {
                    case 'FieldsTooLarge':
                    case 'FilesTooLarge':
                        return errorResponse({ tag: `Multipart${parseResult.tag}` })
                    case 'OtherError':
                        return errorResponse({
                            tag: 'MultipartUnknownParseError',
                            error: parseResult.error
                        })
                }
                const filesValidationResult = validator.validate(parseResult.value.files)
                if (!filesValidationResult.success) {
                    return errorResponse({
                        tag: 'MultipartFilesInvalid',
                        files: parseResult.value.files
                    })
                }
                return okResponse({
                    ...state,
                    files: filesValidationResult.value
                })
            }
        }
        else {
            bodyParsingAndValidationHandler = async (message, _sockets, state) => {
                const parseResult = await parseMultipartStream(message)
                switch (parseResult.tag) {
                    case 'FieldsTooLarge':
                    case 'FilesTooLarge':
                        return errorResponse({ tag: `Multipart${parseResult.tag}` })
                    case 'OtherError':
                        return errorResponse({
                            tag: 'MultipartUnknownParseError',
                            error: parseResult.error
                        })
                }
                const filesValidationResult = validator.validate(parseResult.value.files)
                if (!filesValidationResult.success) {
                    return errorResponse({
                        tag: 'MultipartFilesInvalid',
                        files: parseResult.value.files
                    })
                }
                if (parseResult.value.fields[JSON_KEY] === undefined) {
                    return errorResponse({ tag: 'MultipartJSONFieldRequired' })
                }
                let json
                try {
                    json = parseJSONString(parseResult.value.fields[JSON_KEY])
                }
                catch {
                    return errorResponse({
                        tag: 'MultipartJSONFieldMalformed',
                        field: parseResult.value.fields[JSON_KEY]
                    })
                }
                const inputValidationResult = endpoint.input.validate(json)
                if (!inputValidationResult.success) {
                    return errorResponse({
                        tag: 'MultipartJSONFieldInputInvalid',
                        input: json
                    })
                }
                return okResponse({
                    ...state,
                    input: inputValidationResult.value,
                    files: filesValidationResult.value
                })
            }
        }
    }
    else if (endpoint.input !== undefined) {
        bodyParsingAndValidationHandler = async (message, _sockets, state) => {
            const parseResult = await parseJSONStream(message)
            switch (parseResult.tag) {
                case 'LimitExceeded':
                    return errorResponse({ tag: 'JSONTooLarge' })
                case 'StreamClosed':
                    return errorResponse({ tag: 'JSONStreamClosed' })
                case 'NonBufferChunk':
                case 'InvalidSyntax':
                    return errorResponse({ tag: 'JSONStreamMalformed' })
                case 'OtherError':
                    return errorResponse({
                        tag: 'JSONStreamUnknownParseError',
                        error: parseResult.error
                    })
            }
            const validationResult = endpoint.input.validate(parseResult.value)
            if (!validationResult.success) {
                return errorResponse({
                    tag: 'JSONInputInvalid',
                    input: parseResult.value
                })
            }
            return okResponse({
                ...state,
                input: validationResult.value
            })
        }
    }
    else {
        bodyParsingAndValidationHandler = noBodyParsingHandler
    }

    const finalHandler = (_message, _sockets, state) => {
        if (state.status === 101) {
            return websocketResponse(state, endpoint.websocket.up)
        }
        const res = endpoint.responses[state.status]
        switch (res?.type) {
            case 'html':
                return response(state)
            case 'json':
                return response({
                    ...state,
                    body: JSON.stringify(state.body),
                    headers: {
                        ...state.headers,
                        'Content-Type': 'application/json; charset=utf-8'
                    }
                })
            case undefined:
                throw new Error('No response definition for status returned by body handler')
        }
    }

    return composeMessageHandlers([
        composeResultMessageHandlers([
            headersHandler,
            sessionHandler,
            bodyParsingAndValidationHandler,
        ]),
        bodyHandler,
        finalHandler
    ])
}


const regexEscapePattern = /[.*+?^${}()|[\]\\]/g


export function createSchemaHandler(schema, handlers) {
    const escaped = schema.prefix.replace(regexEscapePattern, '\\$&')
    const prefixPattern = new RegExp(`^${escaped}(.+)`)
    return (message, sockets, state) => {
        const path = prefixPattern.exec(state.url.path)?.[1]
        return handlers[path]?.(message, sockets, state)
    }
}
