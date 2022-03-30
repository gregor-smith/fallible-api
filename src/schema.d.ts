import type { Runtype, Static } from 'runtypes'


export type Status =
    | 200
    | 201
    | 202
    | 203
    | 204
    | 205
    | 206
    | 207
    | 300
    | 301
    | 302
    | 303
    | 304
    | 305
    | 307
    | 400
    | 401
    | 402
    | 403
    | 404
    | 405
    | 406
    | 407
    | 408
    | 409
    | 410
    | 411
    | 412
    | 413
    | 414
    | 415
    | 416
    | 417
    | 418
    | 422
    | 423
    | 424
    | 425
    | 426
    | 428
    | 429
    | 431
    | 500
    | 501
    | 502
    | 503
    | 504
    | 505
    | 506
    | 507
    | 509
    | 510
    | 511

export type HTMLResponse = {
    type: 'html'
}
export type JSONResponse = {
    type: 'json'
    data: Runtype
}
export type BinaryResponse = {
    type: 'binary'
    mimetype: Runtype<string>
}

export type Response = HTMLResponse | JSONResponse | BinaryResponse
export type Responses = { [S in Status]?: Response }

export type WebSocketCommunication = {
    // TODO: allow non-JSON messages
    up: Runtype
    down: Runtype
}

export type BodyMethod = 'PUT' | 'POST' | 'PATCH' | 'DELETE'
export type GETMethod = 'GET'
export type Method = BodyMethod | GETMethod

export type Auth = 'required' | 'optional' | 'none'


export type FileDefinition = {
    name?: Runtype<string>
    mimetype?: Runtype<string>
    size?: Runtype<number>
    dateModified?: Runtype<Date>
}
export type FilesDefinition = Record<string, FileDefinition>

export type File<T extends FileDefinition> =
    & (T['name'] extends Runtype
        ? { name: Static<T['name']> }
        : { name: undefined })
    & (T['mimetype'] extends Runtype
        ? { mimetype: Static<T['mimetype']> }
        : { mimetype: undefined })
    & (T['size'] extends Runtype
        ? { size: Static<T['size']> }
        : { size: undefined })
    & (T['dateModified'] extends Runtype
        ? { dateModified: Static<T['dateModified']> }
        : { dateModified: undefined })
    & {
        path: string
    }
export type Files<T extends FileDefinition> = {
    [K in keyof T]: File<T[K]>
}

type EndpointBase = {
    auth?: Auth
    input?: Runtype
    responses: Responses
}
export type NonBodyEndpoint = EndpointBase & {
    method?: GETMethod
}
export type WebSocketEndpoint = NonBodyEndpoint & {
    websocket: WebSocketCommunication
}
export type BodyEndpoint = EndpointBase & {
    method: BodyMethod
    files?: FilesDefinition
}
export type FetchEndpoint = NonBodyEndpoint | BodyEndpoint
export type Endpoint = WebSocketEndpoint | FetchEndpoint

export type Endpoints = Record<string, Endpoint>
export type ExtractWebSocketEndpointNames<T extends Endpoints> = {
    [K in keyof T]: T[K] extends WebSocketEndpoint
        ? K
        : never
}[keyof T]
export type ExtractWebSocketEndpoints<T extends Endpoints> = Pick<
    T,
    ExtractWebSocketEndpointNames<T>
>

export type Schema = {
    prefix: string
    endpoints: Endpoints
}

export type FilesData<T extends FilesDefinition> = Record<keyof T, Blob>

type HasResponse<T extends Responses, R extends Response> = {
    [S in keyof T]: T[S] extends R
        ? true
        : never
}[keyof T]
export type HasJSONResponse<T extends Responses> = HasResponse<T, JSONResponse>
export type HasHTMLResponse<T extends Responses> = HasResponse<T, HTMLResponse>
export type HasBinaryResponse<T extends Responses> = HasResponse<T, BinaryResponse>
export type HasAnyResponse<T extends Responses> = {
    [S in keyof T]: true
}[keyof T]

export declare const schema: <T extends Schema>(schema: T) => T
export declare const endpoint: <T extends Endpoint>(endpoint: T) => T
