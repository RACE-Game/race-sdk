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
    InitLogCallbackFunction,
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
    storage: IStorage
    gameAddr: string
    playerAddr: string
    onInitLog?: InitLogCallbackFunction
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
    onInitLog?: InitLogCallbackFunction
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
    storage: IStorage
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

        // Helpers for appending initialization logs
        const pushLog = (log: string) => { if (opts.onInitLog !== undefined) opts.onInitLog(log, 'info') }
        const raiseError = (err: SdkError): never => { if (opts.onInitLog !== undefined) opts.onInitLog(err.message, 'error'); throw err }

        try {
            let startTime = new Date().getTime()
            console.debug(`Player address: ${playerAddr}`)

            pushLog(`Fetching game account at ${gameAddr}`)
            const gameAccount = await transport.getGameAccount(gameAddr)

            if (gameAccount === undefined) {
                return raiseError(SdkError.gameAccountNotFound(gameAddr))
            }
            console.debug('Game account:', gameAccount)
            pushLog('Game account ready')

            const transactorAddr = gameAccount.transactorAddr
            pushLog(`The transactor address is ${transactorAddr}`)
            if (transactorAddr === undefined || gameAccount.checkpointOnChain === undefined) {
                raiseError(SdkError.gameNotServed(gameAddr))
            }

            pushLog(`Fetching token metadata at ${gameAccount.tokenAddr}`)
            let token: IToken | undefined = await transport.getToken(gameAccount.tokenAddr)
            pushLog('Token metadata ready')

            const encryptor = new Encryptor()

            if (transactorAddr === undefined || gameAccount.checkpointOnChain === undefined) {
                return raiseError(SdkError.gameNotServed(gameAddr))
            }

            const [gameBundle, transactorAccount] = await Promise.all([
                (async () => {
                    pushLog(`Fetching game bundle at ${gameAccount.bundleKey}`)
                    const bundle = await getGameBundle(transport, storage, gameAccount.bundleKey)
                    pushLog('Game bundle ready')
                    return bundle
                })(),
                (async () => {
                    pushLog(`Fetching server account at ${transactorAddr}`)
                    const account = await transport.getServerAccount(transactorAddr)
                    pushLog('Server account ready')
                    return account
                })()
            ])

            if (transactorAccount === undefined) {
                return raiseError(SdkError.transactorAccountNotFound(transactorAddr))
            }

            console.debug('Game bundle:', gameBundle)
            console.debug('Transactor account:', transactorAccount)

            const decryptionCache = new DecryptionCache()
            const endpoint = transactorAccount.endpoint

            const connection = Connection.initialize(gameAddr, playerAddr, endpoint, encryptor)
            const profileLoader = new ProfileLoader(transport, storage, onProfile)

            console.debug(`Connected with transactor: ${endpoint}`)
            const client = new Client(playerAddr, encryptor, connection)
            console.debug(`Client created`)

            const getCheckpointParams: GetCheckpointParams = new GetCheckpointParams({
                settleVersion: gameAccount.settleVersion,
            })

            console.debug('Initialize wasm handler and fetch checkpoint')
            const [handler, checkpointOffChain] = await Promise.all([
                (async () => {
                    pushLog('Initializing the game handler')
                    const handler = await Handler.initialize(gameBundle, encryptor, client, decryptionCache)
                    pushLog('Handler initialized')
                    return handler
                })(),
                (async () => {
                    pushLog(`Fetching off-chain checkpoint from connection, version = ${getCheckpointParams.settleVersion}`)
                    const cp = connection.getCheckpoint(getCheckpointParams)
                    pushLog('Off-chain checkpoint ready')
                    return cp
                })()
            ])

            if (gameAccount.checkpointOnChain === undefined) {
                return raiseError(SdkError.gameNotServed(gameAddr))
            } else if (checkpointOffChain === undefined) {
                return raiseError(SdkError.missingCheckpoint())
            }

            const checkpoint = Checkpoint.fromParts(checkpointOffChain, gameAccount.checkpointOnChain)
            pushLog('Full checkpoint parsed')

            const gameContext = new GameContext(checkpoint.sharedData.generalize(), checkpoint.rootData)

            if (token === undefined) {
                pushLog(`Fetching token decimals for ${gameAccount.tokenAddr}`)
                const decimals = await transport.getTokenDecimals(gameAccount.tokenAddr)
                pushLog(`The token has decimals = ${'' + decimals}`)
                if (decimals === undefined) {
                    return raiseError(SdkError.tokenNotFound(gameAccount.tokenAddr))
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
            pushLog(`Initialization completed, costed ${cost} milliseconds`)

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
            // Helpers for appending initialization logs
            const pushLog = (log: string) => { if (opts.onInitLog !== undefined) opts.onInitLog(log, 'info') }
            const raiseError = (err: SdkError): never => { if (opts.onInitLog !== undefined) opts.onInitLog(err.message, 'error'); throw err }

            const { gameId, onEvent, onMessage, onTxState, onConnectionState, onError, onReady } = opts

            const addr = `${this.__gameAddr}:${gameId.toString()}`

            console.group(`SubClient initialization, id: ${gameId}`)
            console.info('Versioned data:', this.__gameContext.versionedData.getSubData(gameId))

            pushLog(`Find sub game from master game context: ${gameId}`)
            const subGame = this.__gameContext.findSubGame(gameId)

            if (subGame === undefined) {
                return raiseError(SdkError.invalidSubId(gameId))
            }
            pushLog('Sub game found')

            console.debug('Sub game:', subGame)

            const bundleKey = subGame.bundleKey

            const decryptionCache = new DecryptionCache()
            const playerAddr = this.__playerAddr

            pushLog(`Fetching game bundle ${bundleKey}`)
            const gameBundle = await getGameBundle(this.__transport, this.__storage, bundleKey)
            pushLog('Game bundle fetched')

            const connection = Connection.initialize(addr, playerAddr, this.__endpoint, this.__encryptor)
            const client = new Client(playerAddr, this.__encryptor, connection)

            const [handler, checkpointOffChain] = await Promise.all([
                (async () => {
                    pushLog('Initializing game handler')
                    const handler = Handler.initialize(gameBundle, this.__encryptor, client, decryptionCache)
                    pushLog('Handler initialized')
                    return handler
                })(),
                (async () => {
                    pushLog('Fetching latest checkpoint')
                    const cp = connection.getLatestCheckpoint()
                    pushLog('Latest checkpoint fetched')
                    return cp
                })(),
            ])

            if (checkpointOffChain === undefined) {
                return raiseError(SdkError.missingCheckpoint())
            }

            /// XXX create a context for subgame
            /// If the context is created from versioned data, we just need a versioned data for sub game

            const subVersionedData = checkpointOffChain.rootData;

            console.debug(subVersionedData)

            const sharedData = {
                balances: this.__gameContext.balances,
                nodes: this.__gameContext.nodes
            }

            const gameContext = new GameContext(sharedData, subVersionedData)
            pushLog('Sub game client initialization completed')

            return new SubClient({
                gameAddr: addr,
                playerAddr: this.__playerAddr,
                transport: this.__transport,
                encryptor: this.__encryptor,
                storage: this.__storage,
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
            console.info('Connecting to transactor')
            this.__connect()
            console.info('Connected to transactor')
            console.info('Establishing event subscription')
            this.__startSubscribe()
            console.info('Event subscription Established')
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

    makeSubGameAddr(gameId: number): string {
        return `${this.__gameAddr}:${gameId}`
    }
}

// Miscellaneous

export async function getGameBundle<W>(transport: ITransport<W>, storage: IStorage | undefined, bundleKey: string): Promise<IGameBundle> {

    let gameBundle = undefined

    if (storage && transport.chain !== 'facade') {
        console.info(`Get game bundle: ${bundleKey} from cache`)
        gameBundle = await storage.getBundle(bundleKey)
        if (gameBundle) {
            return gameBundle
        }
    } else {
        console.info(`Skip bundle cache before we are on facade`)
    }

    if (gameBundle === undefined) {
        console.info(`Fetching game bundle: ${bundleKey}`)
        let response = await fetch(bundleKey)
        let data = new Uint8Array(await response.arrayBuffer())
        gameBundle = { key: bundleKey, data }
    }

    if (!gameBundle) {
        throw SdkError.gameBundleNotFound(bundleKey)
    }

    if (storage && transport.chain !== 'facade') {
        storage.cacheBundle(gameBundle)
    }
    return gameBundle
}

export function makeGameInfo(gameAccount: IGameAccount, token: IToken): GameInfo {
    const info: GameInfo = {
        gameAddr: gameAccount.addr,
        title: gameAccount.title,
        entryType: gameAccount.entryType,
        maxPlayers: gameAccount.maxPlayers,
        tokenAddr: gameAccount.tokenAddr,
        bundleKey: gameAccount.bundleKey,
        data: gameAccount.data,
        dataLen: gameAccount.dataLen,
        token,
    }

    return info
}
