import type { Result } from 'fallible'
import type { Failure, Runtype } from 'runtypes'


export type WebSocketMessageError<Data> =
    | {
        tag: 'InvalidMessage'
        message: string
        result: Failure
    }
    | {
        tag: 'NonJSONMessage'
        message: string
    }
    | {
        tag: 'NonStringMessage'
        message: Data
    }


export declare function validateWebSocketMessage<Validated, Data>(
    message: string | Data,
    validator: Runtype<Validated>
): Result<Validated, WebSocketMessageError<Data>>
