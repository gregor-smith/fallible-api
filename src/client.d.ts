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
    WebsocketEndpoint,
    WebsocketCommunication,
    ExtractWebsocketEndpointNames,
    Response,
    ResponseData,
    BodyMethod
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


export type WebsocketConnectError<Abortable extends boolean> =
    | NetworkError
    | (Abortable extends true ? AbortedError : never)

export type ConnectResult<Endpoint extends EP, Abortable extends boolean> =
    Endpoint extends WebsocketEndpoint
        ? WebsocketConnectResult<Endpoint, Abortable>
        : never

export type WebsocketConnectResult<Endpoint extends WebsocketEndpoint, Abortable extends boolean> =
    Result<
        ValidatedWebsocket<Endpoint['websocket']>,
        WebsocketConnectError<Abortable>
    >

export type WebsocketMessageError =
    | { tag: 'InvalidTypeError', message: ArrayBuffer | Blob }
    | { tag: 'InvalidJSONError', message: string }
    | { tag: 'ValidationError', result: Failure, message: unknown }

export type WebsocketMessageResult<T> = Result<T, WebsocketMessageError>


export type CloseListener = (event: CloseEvent) => void

export type MessageListener<T> = (result: WebsocketMessageResult<T>) => void


export declare class ValidatedWebsocket<WS extends WebsocketCommunication> {
    public readonly validator: WS['down']
    public readonly state: number
    public readonly buffered: number

    public constructor(socket: WebSocket, validator: WS['down'])

    public addCloseListener(listener: CloseListener): void
    public removeCloseListener(listener: CloseListener): void

    public addMessageListener(listener: MessageListener<Static<WS['down']>>): void
    public removeMessageListener(listener: MessageListener<Static<WS['down']>>): void

    public close(): void

    public send(message: Static<WS['up']>): void
}


export type ConnectWebsocketArguments<Abortable extends boolean> = {
    host?: string
    tls?: boolean
} & (
    Abortable extends true
        ? { signal: AbortSignal }
        : { signal?: undefined }
)


export declare function connectWebsocketEndpoint<
    Schema extends Sch,
    Endpoint extends ExtractWebsocketEndpointNames<Schema['endpoints']>
>(
    schema: Schema,
    endpointName: Endpoint,
    args?: ConnectWebsocketArguments<false>
): Awaitable<ConnectResult<Schema['endpoints'][Endpoint], false>>
export declare function connectWebsocketEndpoint<
    Schema extends Sch,
    Endpoint extends ExtractWebsocketEndpointNames<Schema['endpoints']>
>(
    schema: Schema,
    endpointName: Endpoint,
    args: ConnectWebsocketArguments<true>
): Awaitable<ConnectResult<Schema['endpoints'][Endpoint], true>>
