import {
    ConnectionState,
    IConnection,
    SubmitEventParams,
    ConnectParams,
    ConnectionSubscription,
    SubmitMessageParams,
} from './connection'
import { EventEffects, GameContext } from './game-context'
import { GameContextSnapshot } from './game-context-snapshot'
import { Credentials } from './credentials'
import { ITransport } from './transport'
import { IStorage } from './storage'
import { Handler } from './handler'
import { IEncryptor } from './encryptor'
import { IGameAccount } from './accounts'
import { sha256String } from './utils'
import { Client } from './client'
import { CLIENT_MODES } from './client-mode'
import { Custom, GameEvent, ICustomEvent } from './events'
import { DecryptionCache } from './decryption-cache'
import {
    ConnectionStateCallbackFunction,
    ErrorCallbackFunction,
    ErrorKind,
    EventCallbackFunction,
    EventCallbackOptions,
    GameInfo,
    MessageCallbackFunction,
    ReadyCallbackFunction,
    TxStateCallbackFunction,
} from './types'
import {
    BroadcastFrame,
    BroadcastFrameBacklogs,
    BroadcastFrameMessage,
    BroadcastFrameSync,
    BroadcastFrameEvent,
    BroadcastFrameTxState,
} from './broadcast-frames'
import { InitAccount } from './init-account'
import { CheckpointOnChain } from './checkpoint'
import { SdkError } from './error'
import { Node } from './node'
import { IProfileLoader } from './profile-loader'

const MAX_RETRIES = 3

export type InitState = {
    initAccount: InitAccount
    checkpointOnChain: CheckpointOnChain | undefined
}

export type BaseClientCtorOpts = {
    gameAddr: string
    gameId: number
    playerAddr: string
    handler: Handler
    client: Client
    transport: ITransport
    encryptor: IEncryptor
    storage: IStorage
    profileLoader: IProfileLoader
    connection: IConnection
    gameContext: GameContext
    latestCheckpointOnChain: CheckpointOnChain | undefined
    onEvent: EventCallbackFunction
    onMessage?: MessageCallbackFunction
    onTxState?: TxStateCallbackFunction
    onConnectionState?: ConnectionStateCallbackFunction
    onError?: ErrorCallbackFunction
    onReady?: ReadyCallbackFunction
    info: GameInfo
    decryptionCache: DecryptionCache
    logPrefix: string
    maxRetries: number
}

export class BaseClient {
    __gameAddr: string
    __gameId: number
    __playerAddr: string
    __handler: Handler
    __client: Client
    __transport: ITransport
    __connection: IConnection
    __storage: IStorage
    __gameContext: GameContext
    __onEvent: EventCallbackFunction
    __onMessage?: MessageCallbackFunction
    __onReady?: ReadyCallbackFunction
    __onTxState?: TxStateCallbackFunction
    __onError?: ErrorCallbackFunction
    __onConnectionState?: ConnectionStateCallbackFunction
    __profileLoader: IProfileLoader
    __encryptor: IEncryptor
    __info: GameInfo
    __decryptionCache: DecryptionCache
    __logPrefix: string
    __latestCheckpointOnChain: CheckpointOnChain | undefined
    __sub: ConnectionSubscription | undefined
    __closed: boolean
    __maxRetries: number

    constructor(opts: BaseClientCtorOpts) {
        this.__gameAddr = opts.gameAddr
        this.__gameId = opts.gameId
        this.__latestCheckpointOnChain = opts.latestCheckpointOnChain
        this.__handler = opts.handler
        this.__playerAddr = opts.playerAddr
        this.__client = opts.client
        this.__transport = opts.transport
        this.__connection = opts.connection
        this.__storage = opts.storage
        this.__gameContext = opts.gameContext
        this.__onEvent = opts.onEvent
        this.__onMessage = opts.onMessage
        this.__onTxState = opts.onTxState
        this.__onError = opts.onError
        this.__onReady = opts.onReady
        this.__onConnectionState = opts.onConnectionState
        this.__profileLoader = opts.profileLoader
        this.__encryptor = opts.encryptor
        this.__info = opts.info
        this.__decryptionCache = opts.decryptionCache
        this.__logPrefix = opts.logPrefix
        this.__sub == undefined
        this.__closed = false
        this.__maxRetries = opts.maxRetries
    }

    get playerAddr(): string {
        return this.__playerAddr
    }

    /**
     * Return the playerId of current player or undefined if current
     * player is not in the game.
     */
    get playerId(): bigint | undefined {
        try {
            return this.__gameContext.addrToId(this.playerAddr)
        } catch (e) {
            return undefined
        }
    }

    get gameAddr(): string {
        return this.__gameAddr
    }

    get gameContext(): GameContext {
        return this.__gameContext
    }

    get info(): GameInfo {
        return this.__info
    }

    /**
     * Get hidden knowledge by random id. The result contains both
     * public and private information.  For performance reason, it's
     * better to cache the result somewhere instead of calling this
     * function frequently.
     */
    getRevealed(randomId: number): Map<number, string> {
        return this.__decryptionCache.get(randomId) || new Map()
    }

    /**
     * Exit current game.  This will let current player to leave the game.
     */
    async exit(): Promise<void>
    async exit(keepConnection: boolean): Promise<void>
    async exit(keepConnection: boolean = false) {
        await this.__connection.exitGame({ keepConnection })
    }

    /**
     * Detach the game connection.
     */
    detach() {
        this.__connection.disconnect()
        this.__closed = true
    }

    /**
     * Parse the id to player's address.
     *
     * Throw an error when it fails.
     */
    idToAddr(id: bigint): string {
        return this.__gameContext.idToAddr(id)
    }

    /**
     * Parse the player's address to its id.
     *
     * Throw an error when it fails.
     */
    addrToId(addr: string): bigint {
        return this.__gameContext.addrToId(addr)
    }

    /**
     * Submit an event.
     */
    submitEvent(raw: Uint8Array): Promise<void>
    submitEvent(customEvent: ICustomEvent): Promise<void>
    async submitEvent(arg: ICustomEvent | Uint8Array): Promise<void> {
        let raw = arg instanceof Uint8Array ? arg : arg.serialize()
        const id = this.__gameContext.addrToId(this.playerAddr)
        const event = new Custom({ sender: id, raw })
        const connState = await this.__connection.submitEvent(
            new SubmitEventParams({
                event,
            })
        )
        if (connState !== undefined && this.__onConnectionState !== undefined) {
            this.__onConnectionState(connState)
        }
    }

    /**
     * Submit a message.
     */
    async submitMessage(content: string): Promise<void> {
        const connState = await this.__connection.submitMessage(
            new SubmitMessageParams({
                content,
            })
        )
        if (connState !== undefined && this.__onConnectionState !== undefined) {
            this.__onConnectionState(connState)
        }
    }

    __invokeErrorCallback(err: ErrorKind, arg?: any) {
        if (this.__onError) {
            this.__onError(err, arg)
        } else {
            console.error(`${this.__logPrefix}An error occured: ${err}, to handle it, use \`onError\`.`)
        }
    }

    async __invokeEventCallback(event: GameEvent, options: EventCallbackOptions) {
        const snapshot = new GameContextSnapshot(this.__gameContext, this.__decryptionCache)
        const state = this.__gameContext.handlerState
        this.__onEvent(snapshot, state, event, options)
    }

    async __getGameAccount(): Promise<IGameAccount> {
        let retries = 0
        while (true) {
            if (retries === MAX_RETRIES) {
                this.__invokeErrorCallback('onchain-data-not-found')
                throw new Error(`Game account not found, after ${retries} retries`)
            }
            try {
                const gameAccount = await this.__transport.getGameAccount(this.gameAddr)
                if (gameAccount === undefined) {
                    retries += 1
                    continue
                }
                return gameAccount
            } catch (e: any) {
                console.warn(e, 'Failed to fetch game account, will retry in 3s')
                await new Promise(r => setTimeout(r, 3000))
                retries += 1
                continue
            }
        }
    }

    async __processSubscription() {
        if (this.__sub !== undefined) {
            let retries = 0
            for await (const item of this.__sub) {
                if (item === undefined) {
                    break
                } else if (item instanceof BroadcastFrame) {
                    await this.__handleBroadcastFrame(item)
                } else {
                    await this.__handleConnectionState(item)
                }

                if (item === 'disconnected' && this.__sub === undefined && !this.__closed) {
                    retries += 1
                    if (retries >= this.__maxRetries) {
                        throw new Error(`Can not connect to transactor after retried ${retries} times`)
                    }
                    console.info(`Try reconnect after 1 second, [${retries}/${this.__maxRetries}]`)
                    await new Promise(r => setTimeout(r, 1000))
                    this.__client.flushSecretStates()
                    this.__gameContext.reset()
                    this.__connect()
                } else {
                    retries = 0
                }
            }
        }
    }

    async __checkStateSha(stateSha: string, err: ErrorKind) {
        const sha = await sha256String(this.__gameContext.handlerState)
        if (sha !== stateSha && stateSha !== '') {
            console.warn(
                `An error occurred in event loop: ${err}, game: ${this.__gameAddr}, local: ${sha}, remote: ${stateSha}`
            )
        } else {
            console.info('State SHA validation passed:', stateSha)
        }
    }

    async __handleEvent(frame: BroadcastFrameEvent) {
        const { event, timestamp, stateSha } = frame
        console.group(this.__logPrefix + 'Handle event: ' + event.kind() + ' at timestamp: ' + timestamp)
        let state: Uint8Array | undefined
        let err: ErrorKind | undefined
        let effects: EventEffects | undefined

        try {
            // For log group
            try {
                console.info('Event:', event)
                console.info('Game context:', this.__gameContext)
                this.__gameContext.setTimestamp(timestamp)
                effects = await this.__handler.handleEvent(this.__gameContext, event)
                state = this.__gameContext.handlerState
                await this.__checkStateSha(stateSha, 'event-state-sha-mismatch')
            } catch (e: any) {
                console.error(this.__logPrefix, e)
                err = 'handle-event-error'
            }

            if (!err) {
                await this.__invokeEventCallback(event, {
                    isCheckpoint: effects?.checkpoint !== undefined,
                })
            }

            if (err) {
                this.__invokeErrorCallback(err, state)
                throw new Error(`An error occurred in event loop: ${err}`)
            }
        } finally {
            console.groupEnd()
        }
    }

    async __loadNodeCredentials(node: Node) {
        const addr = node.addr

        let credentials;

        if (node.mode === 0) { // player
            // XXX preload this profile?
            const profile = await this.__profileLoader.getProfile(addr)

            if (profile === undefined) {
                throw new Error(`Profile account not found for ${addr}`)
            }

            console.debug(`Player ${addr} credentials:`, profile.credentials)
            credentials = Credentials.deserialize(profile.credentials)
        } else {
            const server = await this.__transport.getServerAccount(addr)

            if (server === undefined) {
                throw new Error(`Server account not found for ${addr}`)
            }

            console.debug(`Server ${addr} credentials:`, server.credentials)
            credentials = Credentials.deserialize(server.credentials)
        }

        this.__gameContext.addNode(node.addr, node.id, CLIENT_MODES[node.mode])

        if (this.playerAddr === node.addr) {
            const secret = await this.__storage.getSecret(addr)
            if (!secret) {
                throw new Error('Secret not found in storage, do `generateCredentials` before any game')
            }
            await this.__encryptor.importCredentials(secret, addr, credentials)
        } else {
            await this.__encryptor.importPublicCredentials(addr, credentials)
        }
    }


    async __loadServerCredentials(addr: string, id: bigint, transactor_addr: string) {
        const server = await this.__transport.getServerAccount(addr)

        if (server === undefined) {
            throw new Error(`Server account not found for ${addr}`)
        }

        const credentials = Credentials.deserialize(server.credentials)
        const mode = addr === transactor_addr ? 'Transactor' : 'Validator'

        this.__gameContext.addNode(addr, id, mode)

        await this.__encryptor.importPublicCredentials(addr, credentials)

        console.info(`Load server for ${addr}, mode: ${mode}`)
    }

    async __loadPlayerCredentials(addr: string, id: bigint) {
        const profile = await this.__profileLoader.getProfile(addr)

        if (profile === undefined) {
            throw new Error(`Profile account not found for ${addr}`)
        }

        const credentials = Credentials.deserialize(profile.credentials)
        const mode = 'Player'

        this.__gameContext.addNode(addr, id, mode)

        if (this.playerAddr === addr) {
            const secret = await this.__storage.getSecret(addr)
            if (!secret) {
                throw new Error('Secret not found in storage, do `generateCredentials` before any game')
            }
            await this.__encryptor.importCredentials(secret, addr, credentials)
        } else {
            await this.__encryptor.importPublicCredentials(addr, credentials)
        }

        console.info(`Load profile for ${addr}`)
    }

    async __handleSync(frame: BroadcastFrameSync) {
        console.group(`${this.__logPrefix}Receive sync broadcast`, frame)
        try {
            await this.__profileLoader.load(frame.newPlayers.map(p => p.addr))

            for (const node of frame.newServers) {
                await this.__loadServerCredentials(node.addr, node.accessVersion, frame.transactor_addr)
            }

            for (const node of frame.newPlayers) {
                await this.__loadPlayerCredentials(node.addr, node.accessVersion)
            }

            this.__gameContext.setAccessVersion(frame.accessVersion)

        } finally {
            console.groupEnd()
        }
    }

    async __handleBroadcastFrame(frame: BroadcastFrame) {
        if (frame instanceof BroadcastFrameMessage) {
            console.group(`${this.__logPrefix}Receive message broadcast`, frame)
            try {
                if (this.__onMessage !== undefined) {
                    const { message } = frame
                    this.__onMessage(message)
                }
            } finally {
                console.groupEnd()
            }
        } else if (frame instanceof BroadcastFrameTxState) {
            console.group(`${this.__logPrefix}Receive transaction state broadcast`, frame)
            try {
                if (this.__onTxState !== undefined) {
                    const { txState } = frame
                    this.__onTxState(txState)
                }
            } finally {
                console.groupEnd()
            }
        } else if (frame instanceof BroadcastFrameSync) {
            await this.__handleSync(frame)
        } else if (frame instanceof BroadcastFrameEvent) {
            await this.__handleEvent(frame)
        } else if (frame instanceof BroadcastFrameBacklogs) {
            console.group(`${this.__logPrefix}Receive event backlogs`, frame)
            console.debug(`Game ID = ${this.__gameId}`)

            const nodes: Node[] = frame.checkpointOffChain?.sharedData?.nodes || []

            console.debug('Load node information:', nodes)

            const nodePlayerAddrs = nodes.filter(n => n.mode === 0).map(n => n.addr)
            await this.__profileLoader.load(nodePlayerAddrs)

            for (const node of nodes) {
                await this.__loadNodeCredentials(node)
            }

            // TODO, remove the unnecessary part of the message.
            //
            // The versioned data for current game is always the rootData.

            console.log(frame)
            console.log(frame.checkpointOffChain)
            console.log(frame.checkpointOffChain?.rootData)

            let versionedData = frame.checkpointOffChain?.rootData

            if (versionedData === undefined) {
                console.warn('Invalid versioned data', versionedData)
                throw SdkError.missingCheckpoint()
            }

            this.__gameContext.versionedData = versionedData
            this.__gameContext.setHandlerState(versionedData.handlerState)
            this.__gameContext.versions = versionedData.versions

            await this.__checkStateSha(frame.stateSha, 'checkpoint-state-sha-mismatch')

            try {
                for (const backlogFrame of frame.backlogs) {
                    if (backlogFrame instanceof BroadcastFrameEvent) {
                        await this.__handleEvent(backlogFrame)
                    } else if (backlogFrame instanceof BroadcastFrameSync) {
                        await this.__handleSync(backlogFrame)
                    } else {
                        console.error('Invalid backlog', backlogFrame)
                    }
                }
                // Call onReady to indicate all backlogs are consumed
                if (this.__onReady !== undefined) {
                    const snapshot = new GameContextSnapshot(this.__gameContext, this.__decryptionCache)
                    const state = this.__gameContext.handlerState
                    this.__onReady(snapshot, state)
                } else {
                    console.warn('Callback onReady is not provided.')
                }
            } catch (e) {
                console.error(e)
            } finally {
                console.groupEnd()
            }
        }
    }

    /**
     * Connect to the transactor.
     */
    __connect() {
        this.__connection.connect(
            new ConnectParams({
                settleVersion: this.__gameContext.versions.settleVersion,
            })
        )
    }

    __startSubscribe() {
        this.__sub = this.__connection.subscribeEvents()
    }

    async __handleConnectionState(state: ConnectionState) {
        if (state === 'disconnected') {
            if (this.__onConnectionState !== undefined) {
                this.__onConnectionState('disconnected')
            }
            this.__sub = undefined
        } else if (state === 'connected') {
            if (this.__onConnectionState !== undefined) {
                this.__onConnectionState('connected')
            }
        } else if (state === 'closed') {
            if (this.__onConnectionState !== undefined) {
                this.__onConnectionState('closed')
            }
        } else if (state === 'reconnected') {
            if (this.__onConnectionState !== undefined) {
                this.__onConnectionState('reconnected')
            }
        }
    }

    get gameId(): number {
        return this.__gameId
    }

    get connection(): IConnection {
        return this.__connection
    }
}
