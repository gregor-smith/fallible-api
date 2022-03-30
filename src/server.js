import { error, ok } from 'fallible'
import {
    ResultMessageHandlerComposer,
    headersIndicateWebSocketRequest,
    parseCharSetContentTypeHeader,
    parseJSONStream,
    parseJSONString,
    parseMultipartRequest,
    parseContentLengthHeader,
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
    const contentType = parseCharSetContentTypeHeader(header)
    return contentType !== undefined
        && contentType.type === 'application/json'
        && isUTF8Charset(contentType.characterSet)
}


function jsonOnOpenCallback(onOpen) {
    return async function * (uuid) {
        const iterator = onOpen(uuid)
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
    return async function * (data, uuid) {
        const result = messageToResult(data, validator)
        const iterator = onMessage(result, uuid)
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
            onOpen: jsonOnOpenCallback(state.body.onOpen),
            onMessage: state.body.onMessage === undefined
                ? undefined
                : jsonOnMessageCallback(state.body.onMessage, inValidator)
        }
    })
}


class InternalException extends Error {
    constructor(value) {
        super()
        this.value = value
    }
}


function throwIfOtherException(exception) {
    if (!(exception instanceof InternalException)) {
        throw exception
    }
}


function checkUpgradeForNoResponsesWebSocketEndpoint(isLikelyWebSocketRequest) {
    if (!isLikelyWebSocketRequest) {
        throw new InternalException({ tag: 'UpgradeRequired' })
    }
}


function checkUpgradeForNonWebSocketEndpoint(isLikelyWebSocketRequest) {
    if (isLikelyWebSocketRequest) {
        throw new InternalException({ tag: 'UpgradeDenied' })
    }
}


function checkAuthForRequiredAuthEndpoint(headers, cookies) {
    if (headers[CSRF_HEADER] === undefined) {
        throw new InternalException({ tag: 'CSRFHeaderRequired' })
    }
    if (cookies[AUTH_COOKIE_NAME] === undefined) {
        throw new InternalException({ tag: 'AuthRequired' })
    }
}


function checkAuthForOptionalAuthEndpoint(headers) {
    if (headers[CSRF_HEADER] === undefined) {
        throw new InternalException({ tag: 'CSRFHeaderRequired' })
    }
}


function checkAcceptForEndpointWithResponses(headers, isLikelyWebSocketRequest, matchContentType) {
    if (isLikelyWebSocketRequest) {
        return
    }
    if (headers['Accept'] === undefined
            || !preferredContentTypes(headers['Accept']).some(matchContentType)) {
        throw new InternalException({
            tag: 'InvalidAcceptHeader',
            header: headers['Accept']
        })
    }
    if (headers['Accept-Charset'] === undefined
            || !preferredCharsets(headers['Accept-Charset']).some(isUTF8Charset)) {
        throw new InternalException({
            tag: 'InvalidAcceptCharsetHeader',
            header: headers['Accept-Charset']
        })
    }
}


function checkContentEncodingForBodyEndpoint(headers) {
    if (headers['Content-Encoding'] !== undefined) {
        throw new InternalException({
            tag: 'UnsupportedContentEncodingHeader',
            header: headers['Content-Encoding']
        })
    }
}


function getContentLength(headers) {
    if (headers['Content-Length'] === undefined) {
        throw new InternalException({ tag: 'InvalidContentLengthHeader' })
    }
    const length = parseContentLengthHeader(headers['Content-Length'])
    if (length === undefined) {
        throw new InternalException({
            tag: 'InvalidContentLengthHeader',
            header: headers['Content-Length']
        })
    }
    return length
}


function checkContentForBodyEndpointWithFiles(headers, config) {
    checkContentEncodingForBodyEndpoint(headers)
    if (!headers['Content-Type']?.startsWith('multipart/form-data')) {
        throw new InternalException({
            tag: 'InvalidContentTypeHeader',
            header: headers['Content-Type']
        })
    }
    const length = getContentLength(headers)
    if (config?.multipart === undefined) {
        return
    }
    const {
        minimumFileSize = 0,
        maximumFileSize = Infinity,
        maximumFileCount = Infinity,
        maximumFieldsSize = Infinity
    } = config.multipart
    if (length < minimumFileSize) {
        throw new InternalException({ tag: 'MultipartFileBelowMinimumSize' })
    }
    if (length > (maximumFileSize * maximumFileCount) + maximumFieldsSize) {
        throw new InternalException({ tag: 'MultipartMaximumTotalFileSizeExceeded' })
    }
}


function checkContentForBodyEndpointWithInputButNoFiles(headers, config) {
    checkContentEncodingForBodyEndpoint(headers)
    if (!isUTF8JSONContentTypeHeader(headers['Content-Type'])) {
        throw new InternalException({
            tag: 'InvalidContentTypeHeader',
            header: headers['Content-Type']
        })
    }
    const length = getContentLength(headers)
    if (length > config?.json?.maximumSize ?? Infinity) {
        throw new InternalException({ tag: 'JSONMaximumSizeExceeded' })
    }
}


async function parseMultipart(message, files, config) {
    const parseResult = await parseMultipartRequest(message, config)
    if (!parseResult.ok) {
        switch (parseResult.tag) {
            case 'InvalidMultipartContentTypeHeader':
                throw new InternalException({ tag: 'InvalidContentTypeHeader' })
            case 'RequestAborted':
                throw new InternalException({ tag: 'MultipartStreamClosed' })
            case 'BelowMinimumFileSize':
                throw new InternalException({ tag: 'MultipartFileBelowMinimumSize' })
            case 'MaximumFileCountExceeded':
            case 'MaximumFileSizeExceeded':
            case 'MaximumTotalFileSizeExceeded':
            case 'MaximumFieldsCountExceeded':
            case 'MaximumFieldsSizeExceeded':
                throw new InternalException({ tag: `Multipart${parseResult.tag}` })
            case 'UnknownError':
                throw new InternalException({
                    tag: 'MultipartUnknownParseError',
                    error: parseResult.error
                })
            default:
                throw new Error('Unexpected multipart parse result')
        }
    }
    const entries = Object.entries(files)
        .map(([ file, definition ]) => [
            file,
            Record_(definition)
        ])
    const validator = Record_(
        Object.fromEntries(entries)
    )
    const filesValidationResult = validator.validate(parseResult.value.files)
    if (!filesValidationResult.success) {
        throw new InternalException({
            tag: 'MultipartFilesInvalid',
            files: parseResult.value.files
        })
    }
    return filesValidationResult.value
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
            checkUpgrade = checkUpgradeForNoResponsesWebSocketEndpoint
        }
    }
    else {
        checkUpgrade = checkUpgradeForNonWebSocketEndpoint
    }

    let checkAuth
    switch (endpoint.auth) {
        case 'required': {
            checkAuth = checkAuthForRequiredAuthEndpoint
            break
        }
        case 'optional': {
            checkAuth = checkAuthForOptionalAuthEndpoint
            break
        }
        default:
            throw new Error('Unexpected endpoint auth type')
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

    let checkContent
    if (method !== 'GET') {
        if (endpoint.files === undefined) {
            if (endpoint.input !== undefined) {
                checkContent = checkContentForBodyEndpointWithInputButNoFiles
            }
        }
        else {
            checkContent = checkContentForBodyEndpointWithFiles
        }
    }

    const headersHandler = (message, state) => {
        if (message.method !== method) {
            return errorResponse({
                tag: 'WrongMethod',
                method: message.method
            })
        }

        const isLikelyWebSocketRequest = headersIndicateWebSocketRequest(message.headers)

        try {
            checkUpgrade?.(isLikelyWebSocketRequest)
            checkAuth?.(message.headers, state.cookies)
            checkAccept?.(message.headers, isLikelyWebSocketRequest, contentTypeMatcher)
            checkContent?.(message.headers, state.config)
        }
        catch (err) {
            throwIfOtherException(err)
            return errorResponse(err.value)
        }

        return okResponse({
            ...state,
            isLikelyWebSocketRequest,
            token: state.cookies[AUTH_COOKIE_NAME]
        })
    }

    let bodyParsingAndValidationHandler
    if (method === 'GET') {
        if (endpoint.input !== undefined) {
            bodyParsingAndValidationHandler = (_, state) => {
                const jsonParam = state.url.searchParams.get(JSON_KEY)
                if (jsonParam === null) {
                    return errorResponse({ tag: 'URLQueryRequired' })
                }
                let json
                try {
                    json = parseJSONString(jsonParam)
                }
                catch {
                    return errorResponse({
                        tag: 'URLQueryMalformed',
                        query: jsonParam
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
        if (endpoint.input === undefined) {
            bodyParsingAndValidationHandler = async (message, state) => {
                let files
                try {
                    files = await parseMultipart(
                        message,
                        endpoint.files,
                        state.config?.multipart
                    )
                }
                catch (err) {
                    throwIfOtherException(err)
                    return errorResponse(err.value)
                }
                return okResponse({ ...state, files })
            }
        }
        else {
            bodyParsingAndValidationHandler = async (message, state) => {
                let files
                try {
                    files = await parseMultipart(
                        message,
                        endpoint.files,
                        state.config?.multipart
                    )
                }
                catch (err) {
                    throwIfOtherException(err)
                    return errorResponse(err.value)
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
                    files
                })
            }
        }
    }
    else if (endpoint.input !== undefined) {
        bodyParsingAndValidationHandler = async (message, state) => {
            const parseResult = await parseJSONStream(message, state.config?.json)
            if (!parseResult.ok) {
                switch (parseResult.tag) {
                    case 'MaximumSizeExceeded':
                        return errorResponse({ tag: 'JSONMaximumSizeExceeded' })
                    case 'ReadError':
                        return errorResponse({ tag: 'JSONStreamClosed' })
                    case 'DecodeError':
                    case 'InvalidSyntax':
                        return errorResponse({ tag: 'JSONStreamMalformed' })
                    default:
                        throw new Error('Unexpected JSON parse result')
                }
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

    const finalHandler = (_, state) => {
        if (state.status === 101) {
            return websocketResponse(state, endpoint.websocket.up)
        }
        switch (endpoint.responses[state.status]?.type) {
            case 'html':
                return response(state)
            case 'json':
                return response({
                    ...state,
                    body: JSON.stringify(state.body),
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                        ...state.headers
                    }
                })
            case 'binary':
                return response({
                    ...state,
                    body: state.body.data,
                    headers: {
                        'Content-Type': state.body.mimetype,
                        ...state.headers
                    }
                })
            default:
                throw new Error('Unexpected response type')
        }
    }

    let composer = new ResultMessageHandlerComposer(headersHandler)
        .intoResultHandler(sessionHandler)
    if (bodyParsingAndValidationHandler !== undefined) {
        composer = composer.intoResultHandler(bodyParsingAndValidationHandler)
    }
    return composer.intoHandler(bodyHandler)
        .intoHandler(finalHandler)
        .build()
}


const regexEscapePattern = /[.*+?^${}()|[\]\\]/g

export function createSchemaHandler(schema, handlers) {
    const escaped = schema.prefix.replace(regexEscapePattern, '\\$&')
    const prefixPattern = new RegExp(`^${escaped}(.+)`)
    return (message, state, sockets) => {
        const path = prefixPattern.exec(state.url.pathname)?.[1]
        return handlers[path]?.(message, state, sockets) ?? response()
    }
}
