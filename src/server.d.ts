import type { Awaitable, Result } from 'fallible'
import type {
    MessageHandler,
    Header,
    Cookie,
    AwaitableIterator,
    CloseWebsocket,
    Response as FallibleResponse
} from 'fallible-server'
import type { Failure, Runtype, Static } from 'runtypes'

import type {
    BodyEndpoint,
    Schema as Sch,
    FilesDefinition,
    FileDefinition,
    Method,
    Response,
    WebsocketEndpoint,
    Endpoint as EP,
    HasAnyResponse,
    NonBodyEndpoint,
    Files,
    ResponseData,
    Responses,
    Endpoints as EPS
} from './schema.js'


export type EndpointHandlerPreState = {
    url: {
        path: string
        query: Record<string, string>
    }
    method: Method
    headers: Record<string, string>
    cookies: Record<string, string>
}

export type BodyHandlerResponse<Status extends number, Body> = {
    status: Status
    body: Body
    headers?: Record<string, Header>
    cookies?: Record<string, Cookie>
}

export type WebsocketIterator<T> = AwaitableIterator<
    T,
    typeof CloseWebsocket | void,
    void
>

export type WebsocketMessageError =
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

export type WebsocketOpenCallback<T> = () => WebsocketIterator<T>
export type WebsocketMessageCallback<In, Out> = (
    message: Result<In, WebsocketMessageError>
) => WebsocketIterator<Out>
export type WebsocketCloseCallback = (code: number, reason: string) => Awaitable<void>
export type WebsocketSendErrorCallback = (
    message: string | Buffer | Buffer[] | ArrayBuffer,
    error: globalThis.Error
) => Awaitable<void>

export type WebsocketBody<In, Out> = {
    onOpen?: WebsocketOpenCallback<Out>
    onMessage: WebsocketMessageCallback<In, Out>
    onClose?: WebsocketCloseCallback
    onSendError?: WebsocketSendErrorCallback
}


export type WrongMethodError = {
    tag: 'WrongMethod'
    method: Method
}
export type UpgradeDeniedError = {
    tag: 'UpgradeDenied'
}
export type UpgradeRequiredError = {
    tag: 'UpgradeRequired'
}
export type CSRFHeaderRequiredError = {
    tag: 'CSRFHeaderRequired'
}
export type AuthRequiredError = {
    tag: 'AuthRequired'
}
export type InvalidAcceptHeaderError = {
    tag: 'InvalidAcceptHeader'
    header?: string
}
export type InvalidAcceptCharsetHeaderError = {
    tag: 'InvalidAcceptCharsetHeader'
    header?: string
}
export type InvalidContentTypeHeaderError = {
    tag: 'InvalidContentTypeHeader'
    header: string
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

export type MultipartFieldsTooLargeError = {
    tag: 'MultipartFieldsTooLarge'
}
export type MultipartFilesTooLargeError = {
    tag: 'MultipartFilesTooLarge'
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

export type JSONTooLargeError = {
    tag: 'JSONTooLarge'
}
export type JSONStreamClosedError = {
    tag: 'JSONStreamClosed'
}
export type JSONStreamMalformedError = {
    tag: 'JSONStreamMalformed'
}
export type JSONStreamUnknownParseError = {
    tag: 'JSONStreamUnknownParseError'
    error: unknown
}
export type JSONInputInvalidError = {
    tag: 'JSONInputInvalid'
    input: unknown
}


export type HeadersHandlerError<Endpoint extends EP> =
    | WrongMethodError
    | (Endpoint extends WebsocketEndpoint
        ? (HasAnyResponse<Endpoint['responses']> extends true
            ? never
            : UpgradeRequiredError)
        : UpgradeDeniedError)
    | (Endpoint['auth'] extends 'required' | 'optional'
        ? CSRFHeaderRequiredError
        : never)
    | (Endpoint['auth'] extends 'required'
        ? AuthRequiredError
        : never)
    | (HasAnyResponse<Endpoint['responses']> extends true
        ? InvalidAcceptHeaderError | InvalidAcceptCharsetHeaderError
        : never)
    | (Endpoint extends BodyEndpoint
        ? (Endpoint['files'] extends FilesDefinition
            ? InvalidContentTypeHeaderError
            : (Endpoint['input'] extends Runtype
                ? InvalidContentTypeHeaderError
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
                    | MultipartFieldsTooLargeError
                    | MultipartFilesTooLargeError
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
                    | JSONTooLargeError
                    | JSONStreamClosedError
                    | JSONStreamMalformedError
                    | JSONStreamUnknownParseError
                    | JSONInputInvalidError
                )
            : never))


export type InitialHandlerState<Endpoint extends EP, T> =
    & T
    & {
        isWebsocketRequest: boolean
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

type BodyHandlerResponses<T extends Responses> = {
    [S in keyof T]: BodyHandlerResponse<
        S extends number ? S : never,
        T[S] extends Response ? ResponseData<T[S]> : never
    >
}[keyof T]

export type BodyHandlerState<Endpoint extends EP> =
    | (Endpoint extends WebsocketEndpoint
        ? BodyHandlerResponse<101, WebsocketBody<Static<Endpoint['websocket']['up']>, Static<Endpoint['websocket']['down']>>>
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
