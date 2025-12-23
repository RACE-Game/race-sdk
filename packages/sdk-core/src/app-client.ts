import { Connection, GetCheckpointParams, IConnection } from './connection'
import { GameContext } from './game-context'
import { ITransport } from './transport'
import { Handler } from './handler'
import { Encryptor, IEncryptor, IPublicKeyRaws } from './encryptor'
import { SdkError } from './error'
import { Client } from './client'
import { DecryptionCache } from './decryption-cache'
import { BaseClient } from './base-client'
import { IGameAccount, IGameBundle, IToken } from './accounts'
import {
    ConnectionStateCallbackFunction,
    EventCallbackFunction,
    GameInfo,
    MessageCallbackFunction,
    TxStateCallbackFunction,
    PlayerProfileWithPfp,
    ErrorCallbackFunction,
    ReadyCallbackFunction,
    ProfileCallbackFunction,
} from './types'
import { SubClient } from './sub-client'
import { SharedData } from './shared-data'
import { Checkpoint } from './checkpoint'
import { IProfileLoader, ProfileLoader } from './profile-loader'
import { IStorage } from './storage'
import { GameContextSnapshot } from './game-context-snapshot'

export type AppClientInitOpts = {
    transport: ITransport
    storage?: IStorage
    gameAddr: string
    playerAddr: string
    onEvent: EventCallbackFunction
    onMessage?: MessageCallbackFunction
    onTxState?: TxStateCallbackFunction
    onError?: ErrorCallbackFunction
    onReady?: ReadyCallbackFunction
    onConnectionState?: ConnectionStateCallbackFunction
    onProfile?: ProfileCallbackFunction
    maxRetries?: number
}

export type SubClientInitOpts = {
    gameId: number
    onEvent: EventCallbackFunction
    onMessage?: MessageCallbackFunction
    onTxState?: TxStateCallbackFunction
    onError?: ErrorCallbackFunction
    onConnectionState?: ConnectionStateCallbackFunction
    onReady?: ReadyCallbackFunction
}

export type AppClientCtorOpts = {
    gameAddr: string
    gameAccount: IGameAccount
    playerAddr: string
    handler: Handler
    client: Client
    transport: ITransport
    storage?: IStorage
    encryptor: IEncryptor
    profileLoader: IProfileLoader
    connection: IConnection
    gameContext: GameContext
    onEvent: EventCallbackFunction
    onMessage?: MessageCallbackFunction
    onTxState?: TxStateCallbackFunction
    onConnectionState?: ConnectionStateCallbackFunction
    onError?: ErrorCallbackFunction
    onReady?: ReadyCallbackFunction
    info: GameInfo
    decryptionCache: DecryptionCache
    endpoint: string
    maxRetries: number
}

export class AppClient extends BaseClient {
    __endpoint: string
    __latestGameAccount: IGameAccount

    constructor(opts: AppClientCtorOpts) {
        super({
            logPrefix: 'MainGame|',
            gameId: 0,
            latestCheckpointOnChain: opts.gameAccount.checkpointOnChain,
            ...opts,
        })
        this.__endpoint = opts.endpoint
        this.__latestGameAccount = opts.gameAccount
    }

    static async initialize(opts: AppClientInitOpts): Promise<AppClient> {
        const {
            transport,
            storage,
            playerAddr,
            gameAddr,
            onEvent,
            onMessage,
            onTxState,
            onConnectionState,
            onError,
            onReady,
            onProfile,
            maxRetries,
        } = opts

        const _maxRetries = maxRetries === undefined ? 10 : maxRetries

        console.group(`Initialize AppClient, gameAddr = ${gameAddr}`)

        try {
            let startTime = new Date().getTime()
            console.info(`Player address: ${playerAddr}`)

            const gameAccount = await transport.getGameAccount(gameAddr)
            console.info('Game Account:', gameAccount)
            if (gameAccount === undefined) {
                throw SdkError.gameAccountNotFound(gameAddr)
            }

            const transactorAddr = gameAccount.transactorAddr
            console.info(`Transactor address: ${transactorAddr}`)
            if (transactorAddr === undefined || gameAccount.checkpointOnChain === undefined) {
                throw SdkError.gameNotServed(gameAddr)
            }

            let token: IToken | undefined = await transport.getToken(gameAccount.tokenAddr)

            const [encryptor, gameBundle, transactorAccount] = await Promise.all([
                Encryptor.create(playerAddr, storage),
                getGameBundle(transport, storage, gameAccount.bundleAddr),
                transport.getServerAccount(transactorAddr),
            ])

            if (transactorAddr === undefined || gameAccount.checkpointOnChain === undefined) {
                throw SdkError.gameNotServed(gameAddr)
            }
            if (transactorAccount === undefined) {
                throw SdkError.transactorAccountNotFound(transactorAddr)
            }
            const decryptionCache = new DecryptionCache()
            const endpoint = transactorAccount.endpoint
            const connection = Connection.initialize(gameAddr, playerAddr, endpoint, encryptor)
            const profileLoader = new ProfileLoader(transport, storage, onProfile)

            console.info(`Connected with transactor: ${endpoint}`)
            const client = new Client(playerAddr, encryptor, connection)
            console.info(`Client created`)

            const getCheckpointParams: GetCheckpointParams = new GetCheckpointParams({
                settleVersion: gameAccount.settleVersion,
            })

            console.info('Initialize wasm handler and fetch checkpoint')
            const [handler, checkpointOffChain] = await Promise.all([
                Handler.initialize(gameBundle, encryptor, client, decryptionCache),
                await connection.getCheckpoint(getCheckpointParams),
            ])

            if (gameAccount.checkpointOnChain !== undefined) {
                if (checkpointOffChain === undefined) {
                    throw new Error('No checkpoint from transactor.')
                }
            }

            console.info('The onchain part of checkpoint:', gameAccount.checkpointOnChain)
            console.info('The offchain part of checkpoint:', checkpointOffChain)
            let checkpoint
            if (checkpointOffChain !== undefined && gameAccount.checkpointOnChain !== undefined) {
                checkpoint = Checkpoint.fromParts(checkpointOffChain, gameAccount.checkpointOnChain)
            } else {
                throw SdkError.gameNotServed(gameAddr)
            }

            const gameContext = new GameContext(checkpoint.sharedData.generalize(), checkpoint.rootData)

            if (token === undefined) {
                const decimals = await transport.getTokenDecimals(gameAccount.tokenAddr)
                if (decimals === undefined) {
                    throw SdkError.tokenNotFound(gameAccount.tokenAddr)
                } else {
                    token = {
                        addr: gameAccount.tokenAddr,
                        decimals: decimals,
                        icon: '',
                        name: '-',
                        symbol: '-',
                    }
                }
            }
            const info = makeGameInfo(gameAccount, token)

            const cost = new Date().getTime() - startTime
            console.info(`Initialization costed ${cost} ms`)

            const onReadyWithLoadingProfile = (ctx: GameContextSnapshot, state: Uint8Array) => {
                profileLoader.load(gameAccount.players.map(p => p.addr))
                if (onReady !== undefined) {
                    onReady(ctx, state)
                }
            }

            return new AppClient({
                gameAddr,
                gameAccount,
                handler,
                storage,
                playerAddr,
                client,
                transport,
                connection,
                gameContext,
                onEvent,
                onMessage,
                onTxState,
                onConnectionState,
                onError,
                onReady: onReadyWithLoadingProfile,
                encryptor,
                info,
                decryptionCache,
                profileLoader,
                endpoint,
                maxRetries: _maxRetries,
            })
        } finally {
            console.groupEnd()
        }
    }

    /**
     * Create a client for subgame.
     *
     *
     */
    async subClient(opts: SubClientInitOpts): Promise<SubClient> {
        try {
            const { gameId, onEvent, onMessage, onTxState, onConnectionState, onError, onReady } = opts

            const addr = `${this.__gameAddr}:${gameId.toString()}`

            console.group(`SubClient initialization, id: ${gameId}`)
            console.info('Versioned data:', this.__gameContext.versionedData.getSubData(gameId))

            const subGame = this.__gameContext.findSubGame(gameId)

            if (subGame === undefined) {
                console.warn('Game context:', this.__gameContext)
                throw SdkError.invalidSubId(gameId)
            } else {
                console.info('Sub Game:', subGame)
            }

            const bundleAddr = subGame.bundleAddr

            const decryptionCache = new DecryptionCache()
            const playerAddr = this.__playerAddr
            const connection = Connection.initialize(addr, playerAddr, this.__endpoint, this.__encryptor)
            const client = new Client(playerAddr, this.__encryptor, connection)
            const gameBundle = await getGameBundle(this.__transport, this.__storage, bundleAddr)
            const handler = await Handler.initialize(gameBundle, this.__encryptor, client, decryptionCache)

            /// XXX create a context for subgame
            /// If the context is created from versioned data, we just need a versioned data for sub game

            const subVersionedData = this.__gameContext.versionedData.subData.get(gameId)
            if (subVersionedData === undefined) {
                throw new Error('Sub game does not exist')
            }

            const sharedData = {
                balances: this.__gameContext.balances,
                nodes: this.__gameContext.nodes
            }

            const gameContext = new GameContext(sharedData, subVersionedData)

            return new SubClient({
                gameAddr: addr,
                playerAddr: this.__playerAddr,
                transport: this.__transport,
                encryptor: this.__encryptor,
                onEvent,
                onMessage,
                onTxState,
                onConnectionState,
                onError,
                onReady,
                handler,
                connection,
                client,
                info: this.__info,
                decryptionCache,
                gameContext,
                gameId,
                latestCheckpointOnChain: undefined,
                maxRetries: this.__maxRetries,
                profileLoader: this.__profileLoader,
            })
        } finally {
            console.groupEnd()
        }
    }

    /**
     * Connect to the transactor and retrieve the event stream.
     */
    async attachGame() {
        try {
            this.__connect()
            this.__startSubscribe()
        } catch (e) {
            console.error(this.__logPrefix + 'Attaching game failed', e)
            this.__invokeErrorCallback('attach-failed')
            throw e
        } finally {
            console.groupEnd()
        }
        await this.__processSubscription()
    }

    /**
     * Get player profile by its wallet address.
     */
    getProfile(id: bigint): PlayerProfileWithPfp | undefined
    getProfile(addr: string): PlayerProfileWithPfp | undefined
    getProfile(idOrAddr: string | bigint): PlayerProfileWithPfp | undefined {
        let addr: string = ''
        try {
            if (typeof idOrAddr === 'bigint') {
                addr = this.__gameContext.idToAddr(idOrAddr)
            } else {
                addr = idOrAddr
            }
        } catch (e) {
            return undefined
        }
        return this.__profileLoader.getProfile(addr)
    }

    /**
     * Return if current player is in game.
     */
    isInGame(): boolean {
        // XXX Check nodes, field 'players' has been removed
        //
        // try {
        //     const playerId = this.addrToId(this.__playerAddr)
        //     if (this.__gameContext.players.find(p => p.id === playerId) !== undefined) {
        //         return true
        //     }
        //     return false
        // } catch (e) {
        //     return false
        // }

        return true
    }

    makeSubGameAddr(gameId: number): string {
        return `${this.__gameAddr}:${gameId}`
    }
}

// Miscellaneous

export async function getGameBundle<W>(transport: ITransport<W>, storage: IStorage | undefined, bundleAddr: string): Promise<GameBundle> {
    let gameBundle = undefined

    if (storage) {
        gameBundle = await storage.getBundle(bundleAddr)
        if (gameBundle) {
            return gameBundle
        }
    }

    gameBundle = await transport.getGameBundle(bundleAddr)
    console.debug('Game bundle:', gameBundle)

    if (!gameBundle) {
        throw SdkError.gameBundleNotFound(bundleAddr)
    }

    if (storage) storage.cacheBundle(gameBundle)
    return gameBundle
}

export function makeGameInfo(gameAccount: IGameAccount, token: IToken): GameInfo {
    const info: GameInfo = {
        gameAddr: gameAccount.addr,
        title: gameAccount.title,
        entryType: gameAccount.entryType,
        maxPlayers: gameAccount.maxPlayers,
        tokenAddr: gameAccount.tokenAddr,
        bundleAddr: gameAccount.bundleAddr,
        data: gameAccount.data,
        dataLen: gameAccount.dataLen,
        token,
    }

    return info
}
