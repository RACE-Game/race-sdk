import { BaseClient } from './base-client'
import { Client } from './client'
import { IConnection, ConnectParams } from './connection'
import { IStorage } from './storage'
import { DecryptionCache } from './decryption-cache'
import { IEncryptor } from './encryptor'
import { GameContext } from './game-context'
import { Handler } from './handler'
import { ITransport } from './transport'
import {
    GameInfo,
    ConnectionStateCallbackFunction,
    EventCallbackFunction,
    MessageCallbackFunction,
    TxStateCallbackFunction,
    ErrorCallbackFunction,
    ReadyCallbackFunction,
} from './types'
import { CheckpointOnChain } from './checkpoint'
import { IProfileLoader } from './profile-loader'

export type SubClientCtorOpts = {
    gameAddr: string
    gameId: number
    handler: Handler
    playerAddr: string
    client: Client
    transport: ITransport
    encryptor: IEncryptor
    storage: IStorage
    profileLoader: IProfileLoader
    connection: IConnection
    gameContext: GameContext
    latestCheckpointOnChain: CheckpointOnChain | undefined
    onEvent: EventCallbackFunction
    onMessage: MessageCallbackFunction | undefined
    onTxState: TxStateCallbackFunction | undefined
    onConnectionState: ConnectionStateCallbackFunction | undefined
    onError: ErrorCallbackFunction | undefined
    onReady: ReadyCallbackFunction | undefined
    info: GameInfo
    decryptionCache: DecryptionCache
    maxRetries: number
}

export class SubClient extends BaseClient {
    constructor(opts: SubClientCtorOpts) {
        super({
            logPrefix: `SubGame#${opts.gameId}|`,
            ...opts,
        })
    }

    __connect() {
        const settleVersion = this.__gameContext.versionedData.versions.settleVersion || 0n
        this.__connection.connect(new ConnectParams({ settleVersion }))
    }

    /**
     * Connect to the transactor and retrieve the event stream.
     */
    async attachGame() {
        console.group(`${this.__logPrefix}Attach to game`)
        try {
            this.__connect()
            this.__startSubscribe()
        } catch (e) {
            console.error('Attaching game failed', e)
            throw e
        } finally {
            console.groupEnd()
        }
        await this.__processSubscription()
    }
}
