import type { Result } from 'fallible'
import type {
    MessageHandler,
    Headers,
    Response as FallibleResponse,
    StreamBody,
    AwaitableIterator,
    WebSocketCloseInfo,
    WebSocketCloseCallback,
    WebSocketSendErrorCallback,
    ParseWebSocketHeadersError,
    ParsedWebSocketHeaders
} from 'fallible-server'
import type { Failure, Runtype, Static } from 'runtypes'

import type { JSON_KEY } from './constants.js'
import type {
    BodyEndpoint,
    Schema as Sch,
    FilesDefinition,
    FileDefinition,
    Method,
    Response,
    WebSocketEndpoint,
    Endpoint as EP,
    HasAnyResponse,
    NonBodyEndpoint,
    Files,
    Responses,
    Endpoints as EPS,
    JSONResponse,
    BinaryResponse
} from './schema.js'


export interface EndpointHandlerPreStateURLSearchParams {
    get(key: JSON_KEY): string | null
}

export interface EndpointHandlerPreStateURL {
    pathname: string
    searchParams: EndpointHandlerPreStateURLSearchParams
}

export type EndpointHandlerPreState = {
    url: EndpointHandlerPreStateURL
    cookies: Record<string, string>
    config?: {
        multipart?: {
            minimumFileSize?: number
            maximumFileSize?: number
            maximumFileCount?: number
            maximumFieldsCount?: number
            maximumFieldsSize?: number
            saveDirectory?: string
            keepFileExtensions?: boolean
        }
        json?: {
            maximumSize?: number
        }
    }
}


export type BodyHandlerResponse<Status extends number, Body> = {
    status: Status
    body: Body
    headers?: Headers
}

export type WebSocketHandlerResponse<In, Out> = {
    accept: string
    protocol?: string
    maximumMessageSize?: number
    uuid?: string
    onOpen: WebSocketOpenCallback<Out>
    onMessage?: WebSocketMessageCallback<In, Out>
    onClose?: WebSocketCloseCallback
    onSendError?: WebSocketSendErrorCallback
    headers?: Headers
}

export type WebSocketMessageError =
    | {
        tag: 'InvalidMessage'
        data: string
        result: Failure
    }
    | {
        tag: 'NonJSONMessage'
        data: string
    }
    | {
        tag: 'NonStringMessage'
        data: Buffer | Buffer[] | ArrayBuffer
    }

export type WebSocketOpenCallback<T> = (
    socketUUID: string
) => AwaitableIterator<T, WebSocketCloseInfo | void>
export type WebSocketMessageCallback<In, Out> = (
    message: Result<In, WebSocketMessageError>,
    socketUUID: string
) => AwaitableIterator<Out, WebSocketCloseInfo | void>


export type WrongMethodError = {
    tag: 'WrongMethod'
    method: Method
}
export type UpgradeDeniedError = {
    tag: 'UpgradeDenied'
}
export type UpgradeError = {
    tag: 'UpgradeError'
    error: ParseWebSocketHeadersError
}
export type CSRFHeaderRequiredError = {
    tag: 'CSRFHeaderRequired'
}
export type AuthRequiredError = {
    tag: 'AuthRequired'
}
export type InvalidContentTypeHeaderError = {
    tag: 'InvalidContentTypeHeader'
    header: string
}
export type UnsupportedContentEncodingHeaderError = {
    tag: 'UnsupportedContentEncodingHeader'
    header: string
}
export type InvalidContentLengthHeaderError = {
    tag: 'InvalidContentLengthHeader'
    header?: string
}

export type URLQueryRequiredError = {
    tag: 'URLQueryRequired'
}
export type URLQueryMalformedError = {
    tag: 'URLQueryMalformed'
    query: string
}
export type URLQueryInputInvalidError = {
    tag: 'URLQueryInputInvalid'
    input: unknown
}

export type MultipartStreamClosedError = {
    tag: 'MultipartStreamClosed'
}
export type MultipartFileBelowMinimumSizeError = {
    tag: 'MultipartFileBelowMinimumSize'
}
export type MultipartMaximumFileCountExceededError = {
    tag: 'MultipartMaximumFileCountExceeded'
}
export type MultipartMaximumFileSizeExceededError = {
    tag: 'MultipartMaximumFileSizeExceeded'
}
export type MultipartMaximumTotalFileSizeExceededError = {
    tag: 'MultipartMaximumTotalFileSizeExceeded'
}
export type MultipartMaximumFieldsCountExceededError = {
    tag: 'MultipartMaximumFieldsCountExceeded'
}
export type MultipartMaximumFieldsSizeExceededError = {
    tag: 'MultipartMaximumFieldsSizeExceeded'
}
export type MultipartUnknownParseError = {
    tag: 'MultipartUnknownParseError'
    error: unknown
}
export type MultipartFilesInvalidError = {
    tag: 'MultipartFilesInvalid'
    files: Record<string, FileDefinition>
}
export type MultipartJSONFieldRequiredError = {
    tag: 'MultipartJSONFieldRequired'
}
export type MultipartJSONFieldMalformedError = {
    tag: 'MultipartJSONFieldMalformed'
    field: string
}
export type MultipartJSONFieldInputInvalidError = {
    tag: 'MultipartJSONFieldInputInvalid'
    input: unknown
}

export type JSONMaximumSizeExceededError = {
    tag: 'JSONMaximumSizeExceeded'
}
export type JSONStreamClosedError = {
    tag: 'JSONStreamClosed'
}
export type JSONStreamMalformedError = {
    tag: 'JSONStreamMalformed'
}
export type JSONInputInvalidError = {
    tag: 'JSONInputInvalid'
    input: unknown
}


export type HeadersHandlerError<Endpoint extends EP> =
    | WrongMethodError
    | (Endpoint extends WebSocketEndpoint
        ? (HasAnyResponse<Endpoint['responses']> extends true
            ? never
            : UpgradeError)
        : UpgradeDeniedError)
    | (Endpoint['auth'] extends 'required' | 'optional'
        ? CSRFHeaderRequiredError
        : never)
    | (Endpoint['auth'] extends 'required'
        ? AuthRequiredError
        : never)
    | (Endpoint extends BodyEndpoint
        ? (Endpoint['files'] extends FilesDefinition
            ? (
                | InvalidContentTypeHeaderError
                | UnsupportedContentEncodingHeaderError
                | InvalidContentLengthHeaderError
            )
            : (Endpoint['input'] extends Runtype
                ? (
                    | InvalidContentTypeHeaderError
                    | UnsupportedContentEncodingHeaderError
                    | InvalidContentLengthHeaderError
                )
                : never))
        : never)

export type SessionHandlerError<Endpoint extends EP, T> =
    | HeadersHandlerError<Endpoint>
    | T

export type BodyParsingAndValidationHandlerError<Endpoint extends EP, T> =
    | SessionHandlerError<Endpoint, T>
    | (Endpoint extends NonBodyEndpoint
        ? (Endpoint['input'] extends Runtype
            ? (URLQueryRequiredError | URLQueryMalformedError | URLQueryInputInvalidError)
            : never)
        : (Endpoint extends BodyEndpoint
            ? Endpoint['files'] extends FilesDefinition
                ? (
                    | MultipartStreamClosedError
                    | MultipartFileBelowMinimumSizeError
                    | MultipartMaximumFileCountExceededError
                    | MultipartMaximumFileSizeExceededError
                    | MultipartMaximumTotalFileSizeExceededError
                    | MultipartMaximumFieldsCountExceededError
                    | MultipartMaximumFieldsSizeExceededError
                    | MultipartUnknownParseError
                    | MultipartFilesInvalidError
                    | (Endpoint['input'] extends Runtype
                        ? (
                            | MultipartJSONFieldRequiredError
                            | MultipartJSONFieldMalformedError
                            | MultipartJSONFieldInputInvalidError
                        )
                        : never)
                )
                : (
                    | JSONMaximumSizeExceededError
                    | JSONStreamClosedError
                    | JSONStreamMalformedError
                    | JSONInputInvalidError
                )
            : never))


export type InitialHandlerState<Endpoint extends EP, T> =
    & T
    & {
        isWebSocketRequest: Endpoint extends WebSocketEndpoint
            ? (HasAnyResponse<Endpoint['responses']> extends true
                ? Result<ParsedWebSocketHeaders, ParseWebSocketHeadersError>
                : ParsedWebSocketHeaders)
            : undefined
        token: Endpoint['auth'] extends 'required'
            ? string
            : (Endpoint['auth'] extends 'optional'
                ? string | undefined
                : undefined)
    }

export type SessionHandlerState<
    Endpoint extends EP,
    PreState extends EndpointHandlerPreState,
    SessionState
> =
    & InitialHandlerState<Endpoint, PreState>
    & { session: SessionState }

type InputArg<T extends Runtype | undefined> = T extends Runtype
    ? { input: Static<T> }
    : {}

type FilesArg<T extends FilesDefinition | undefined> = T extends FilesDefinition
    ? { files: Files<T> }
    : {}

export type BodyParsingAndValidationHandlerState<
    Endpoint extends EP,
    PreState extends EndpointHandlerPreState,
    SessionState
> =
    & SessionHandlerState<Endpoint, PreState, SessionState>
    & InputArg<Endpoint['input']>
    & (Endpoint extends BodyEndpoint
        ? FilesArg<Endpoint['files']>
        : never)

type ResponseData<T extends Response> = T extends JSONResponse
    ? Static<T['data']>
    : T extends BinaryResponse
        ? { data: Uint8Array | StreamBody, mimetype: Static<T['mimetype']> }
        : string

type BodyHandlerResponses<T extends Responses> = {
    [S in keyof T]: BodyHandlerResponse<
        S extends number ? S : never,
        T[S] extends Response ? ResponseData<T[S]> : never
    >
}[keyof T]

export type BodyHandlerState<Endpoint extends EP> =
    | (Endpoint extends WebSocketEndpoint
        ? WebSocketHandlerResponse<Static<Endpoint['websocket']['up']>, Static<Endpoint['websocket']['down']>>
        : never)
    | BodyHandlerResponses<Endpoint['responses']>


export type SessionHandler<
    Endpoint extends EP,
    PreState extends EndpointHandlerPreState,
    SessionState,
    Error
> = MessageHandler<
    InitialHandlerState<Endpoint, PreState>,
    Result<
        SessionHandlerState<Endpoint, PreState, SessionState>,
        SessionHandlerError<Endpoint, Error>
    >
>

export type BodyHandler<
    Endpoint extends EP,
    PreState extends EndpointHandlerPreState,
    SessionState,
    Error
> = MessageHandler<
    Result<
        BodyParsingAndValidationHandlerState<Endpoint, PreState, SessionState>,
        BodyParsingAndValidationHandlerError<Endpoint, Error>
    >,
    BodyHandlerState<Endpoint>
>

export type EndpointHandler<PreState extends EndpointHandlerPreState> = MessageHandler<PreState>

export type SchemaHandler<PreState extends EndpointHandlerPreState> = MessageHandler<PreState, FallibleResponse | undefined>


export type CreateHandlerArguments<
    Endpoint extends EP,
    PreState extends EndpointHandlerPreState,
    SessionState,
    Error
> = {
    sessionHandler: SessionHandler<Endpoint, PreState, SessionState, Error>,
    bodyHandler: BodyHandler<Endpoint, PreState, SessionState, Error>
}

export declare function createEndpointHandler<
    Endpoint extends EP,
    PreState extends EndpointHandlerPreState,
    SessionState,
    Error
>(
    endpoint: Endpoint,
    args: CreateHandlerArguments<
        Endpoint,
        PreState,
        SessionState,
        Error
    >
): EndpointHandler<PreState>


export type Handlers<Endpoints extends EPS, PreState extends EndpointHandlerPreState> = {
    [K in keyof Endpoints]: EndpointHandler<PreState>
}


export declare function createSchemaHandler<
    Schema extends Sch,
    PreState extends EndpointHandlerPreState
>(
    schema: Schema,
    handlers: Handlers<Schema['endpoints'], PreState>
): SchemaHandler<PreState>
