import type { Result, Awaitable } from 'fallible'
import type { Failure, Runtype, Static } from 'runtypes'

import type {
    Schema as Sch,
    BodyEndpoint,
    FetchEndpoint as EP,
    HasJSONResponse,
    Responses,
    FilesDefinition,
    FilesData,
    WebSocketEndpoint,
    WebSocketCommunication,
    ExtractWebSocketEndpointNames,
    Response,
    BodyMethod,
    JSONResponse,
    BinaryResponse
} from './schema.js'


export declare function buildURL<
    Schema extends Sch,
    Endpoint extends keyof Schema['endpoints'],
>(
    schema: Schema,
    endpoint: Endpoint,
    ...args: Schema['endpoints'][Endpoint]['method'] extends BodyMethod
        ? []
        : Schema['endpoints'][Endpoint]['input'] extends Runtype
            ? [ Static<Schema['endpoints'][Endpoint]['input']> ]
            : []
): string


type ResponseData<Res extends Response> = Res extends JSONResponse
    ? Static<Res['data']>
    : Res extends BinaryResponse
        ? Blob
        : string


export type ResponseResult<Status extends number, Res extends Response> = {
    status: Status
    data: ResponseData<Res>
}

export type FetchOutput<Res extends Responses> = {
    [S in keyof Res]: ResponseResult<
        S extends number ? S : never,
        Res[S] extends Response ? Res[S] : never
    >
}[keyof Res]

export type AbortedError = {
    tag: 'Aborted'
}
export type NetworkError = {
    tag: 'NetworkError'
    exception?: unknown
}
export type UnexpectedStatusError = {
    tag: 'UnexpectedStatus'
    response: Response
}
export type UnexpectedContentTypeError = {
    tag: 'UnexpectedContentType'
    response: Response
}
export type OutputDecodeError = {
    tag: 'OutputDecodeError'
    response: Response
    exception: unknown
}
export type OutputValidationError = {
    tag: 'OutputValidationError'
    output: unknown
    response: Response
    result: Failure
}
export type FetchError<Res extends Responses, Abortable extends boolean> =
    | NetworkError
    | UnexpectedStatusError
    | UnexpectedContentTypeError
    | OutputDecodeError
    | (HasJSONResponse<Res> extends true ? OutputValidationError : never)
    | (Abortable extends true ? AbortedError : never)

export type FetchResult<Res extends Responses, Abortable extends boolean> = Result<
    FetchOutput<Res>,
    FetchError<Res, Abortable>
>

type FilesArgument<T extends BodyEndpoint['files']> = T extends FilesDefinition
    ? { files: FilesData<T> }
    : { files?: undefined }

export type FetchArguments<Endpoint extends EP, Abortable extends boolean> =
    & (
        Abortable extends true
            ? { signal: AbortSignal }
            : { signal?: undefined }
    )
    & (
        Endpoint['input'] extends Runtype
            ? { input: Static<Endpoint['input']> }
            : { input?: undefined }
    )
    & (
        Endpoint extends BodyEndpoint
            ? FilesArgument<Endpoint['files']>
            : FilesArgument<undefined>
    )


export declare function fetchEndpoint<
    Schema extends Sch,
    Endpoint extends keyof Schema['endpoints'],
    Abortable extends boolean
>(
    schema: Schema,
    endpoint: Endpoint,
    args: FetchArguments<Schema['endpoints'][Endpoint], Abortable>
): Promise<FetchResult<Schema['endpoints'][Endpoint]['responses'], Abortable>>


export type WebSocketConnectError<Abortable extends boolean> =
    | NetworkError
    | (Abortable extends true ? AbortedError : never)

export type ConnectResult<Endpoint extends EP, Abortable extends boolean> =
    Endpoint extends WebSocketEndpoint
        ? WebSocketConnectResult<Endpoint, Abortable>
        : never

export type WebSocketConnectResult<Endpoint extends WebSocketEndpoint, Abortable extends boolean> =
    Result<
        ValidatedWebSocket<Endpoint['websocket']>,
        WebSocketConnectError<Abortable>
    >

export type WebSocketMessageError =
    | { tag: 'InvalidTypeError', message: ArrayBuffer | Blob }
    | { tag: 'InvalidJSONError', message: string }
    | { tag: 'ValidationError', result: Failure, message: unknown }

export type WebSocketMessageResult<T> = Result<T, WebSocketMessageError>


export type CloseListener = (event: CloseEvent) => void

export type MessageListener<T> = (result: WebSocketMessageResult<T>) => void


export declare class ValidatedWebSocket<WS extends WebSocketCommunication> {
    #private

    readonly validator: WS['down']
    readonly state: number
    readonly buffered: number

    constructor(socket: WebSocket, validator: WS['down'])

    addCloseListener(listener: CloseListener): void
    removeCloseListener(listener: CloseListener): void

    addMessageListener(listener: MessageListener<Static<WS['down']>>): void
    removeMessageListener(listener: MessageListener<Static<WS['down']>>): void

    close(): void

    send(message: Static<WS['up']>): void
}


export type ConnectWebSocketArguments<Abortable extends boolean> = {
    host?: string
    tls?: boolean
} & (
    Abortable extends true
        ? { signal: AbortSignal }
        : { signal?: undefined }
)


export declare function connectWebSocketEndpoint<
    Schema extends Sch,
    Endpoint extends ExtractWebSocketEndpointNames<Schema['endpoints']>
>(
    schema: Schema,
    endpointName: Endpoint,
    args?: ConnectWebSocketArguments<false>
): Awaitable<ConnectResult<Schema['endpoints'][Endpoint], false>>
export declare function connectWebSocketEndpoint<
    Schema extends Sch,
    Endpoint extends ExtractWebSocketEndpointNames<Schema['endpoints']>
>(
    schema: Schema,
    endpointName: Endpoint,
    args: ConnectWebSocketArguments<true>
): Awaitable<ConnectResult<Schema['endpoints'][Endpoint], true>>
