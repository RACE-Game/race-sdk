import { makeid } from './utils'
import { GameAccount, GameBundle, Nft, PlayerProfile, RegistrationAccount, ServerAccount } from './accounts'
import * as RaceCore from '@race-foundation/sdk-core'
import {
    ResponseHandle,
    CreateGameError,
    CreateGameResponse,
    CreatePlayerProfileError,
    JoinError,
    CreatePlayerProfileResponse,
    JoinResponse,
    CreateRecipientParams,
    CreateRecipientResponse,
    CreateRecipientError,
    DepositResponse,
    DepositError,
    UnregisterGameParams,
    VoteParams,
    RecipientClaimParams,
    RegisterGameParams,
    PublishGameParams,
    ITransport,
    JoinParams,
    CloseGameAccountParams,
    CreateGameAccountParams,
    CreatePlayerProfileParams,
    CreateRegistrationParams,
    DepositParams,
    AttachBonusParams,
    IToken,
    TokenBalance,
    AddRecipientSlotError,
    AddRecipientSlotParams,
    AddRecipientSlotResponse,
    hexToBuffer,
    generateCredentials,
} from '@race-foundation/sdk-core'
import { deserialize } from '@race-foundation/borsh'
import { FacadeWallet } from './facade-wallet'

interface JoinInstruction {
    playerAddr: string
    gameAddr: string
    position: number
    amount: bigint
    accessVersion: bigint
}

interface DepositInstruction {
    playerAddr: string
    gameAddr: string
    settleVersion: bigint
}

interface CreatePlayerProfileInstruction {
    playerAddr: string
    nick: string
    pfp?: string
    credentials: number[]
}

interface CreateGameAccountInstruction {
    walletAddr: string
    gameAddr: string
    title: string
    bundleAddr: string
    tokenAddr: string
    maxPlayers: number
    minDeposit?: bigint
    maxDeposit?: bigint
    soltId?: number
    ticketPrice?: bigint
    collection?: string
    data: number[]
}

interface AddRecipientSlotInstruction {
    recipientAddr: string
    slot: RaceCore.RecipientSlotInit
}

const nftMap: Record<string, Nft> = {
    nft01: {
        addr: 'nft01',
        image: 'https://arweave.net/plLA2nFm_TyHDA76v9GAkaH-nUnymuA4cIvRj64BTLs',
        name: 'test01',
        symbol: 'test01',
        collection: undefined,
        metadata: {},
    },
    nft02: {
        addr: 'nft02',
        image: 'https://arweave.net/-GdwsYztEccy_luXkhZPY95UD48fDCWavgLe_RP_zAk',
        name: 'test02',
        symbol: 'test02',
        collection: undefined,
        metadata: {},
    },
}

const tokenMap: Record<string, IToken> = {
    FACADE_NATIVE: {
        name: 'Native Token',
        symbol: 'NATIVE',
        decimals: 9,
        icon: 'https://arweave.net/SH106hrChudKjQ_c6e6yd0tsGUbFIScv2LL6Dp-LDiI',
        addr: 'FACADE_NATIVE',
    },
    FACADE_USDT: {
        name: 'Tether USD',
        symbol: 'USDT',
        decimals: 6,
        icon: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg',
        addr: 'FACADE_USDT',
    },
    FACADE_USDC: {
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
        icon: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
        addr: 'FACADE_USDC',
    },
    FACADE_RACE: {
        name: 'Race Protocol',
        symbol: 'RACE',
        decimals: 9,
        icon: 'https://raw.githubusercontent.com/NutsPokerTeam/token-list/main/assets/mainnet/RACE5fnTKB9obGtCusArTQ6hhdNXAtf3HarvJM17rxJ/logo.svg',
        addr: 'FACADE_RACE',
    },
}

export class FacadeTransport implements ITransport<FacadeWallet> {
    #url: string

    constructor(url: string = 'http://localhost:12002') {
        this.#url = url
    }

    walletAddr(wallet: FacadeWallet): string {
        return wallet.walletAddr
    }

    async createGameAccount(
        wallet: FacadeWallet,
        params: CreateGameAccountParams,
        response: ResponseHandle<CreateGameResponse, CreateGameError>
    ): Promise<void> {
        const walletAddr = wallet.walletAddr
        const gameAddr = makeid(16)
        const data = [...params.data]
        const ix: CreateGameAccountInstruction = { walletAddr, gameAddr, ...params, ...params.entryType, data }
        const signature = await this.sendInstruction('create_account', ix)
        response.succeed({ gameAddr, signature })
    }
    closeGameAccount(_wallet: FacadeWallet, _params: CloseGameAccountParams): Promise<void> {
        throw new Error('Method not implemented.')
    }

    async deposit(
        wallet: FacadeWallet,
        params: DepositParams,
        response: ResponseHandle<DepositResponse, DepositError>
    ): Promise<void> {
        const playerAddr = wallet.walletAddr
        const gameAccount = await this.getGameAccount(params.gameAddr)
        if (gameAccount === undefined) {
            return response.failed('game-not-found')
        }
        if (params.settleVersion !== gameAccount.settleVersion) {
            return response.failed('invalid-deposit-amount')
        }
        const ix: DepositInstruction = { playerAddr, ...params }
        const signature = await this.sendInstruction('deposit', ix)
        response.succeed({ signature })
    }

    vote(_wallet: FacadeWallet, _params: VoteParams): Promise<void> {
        throw new Error('Method not implemented.')
    }
    publishGame(_wallet: FacadeWallet, _params: PublishGameParams): Promise<void> {
        throw new Error('Method not implemented.')
    }
    createRegistration(_wallet: FacadeWallet, _params: CreateRegistrationParams): Promise<void> {
        throw new Error('Method not implemented.')
    }
    registerGame(_wallet: FacadeWallet, _params: RegisterGameParams): Promise<void> {
        throw new Error('Method not implemented.')
    }
    unregisterGame(_wallet: FacadeWallet, _params: UnregisterGameParams): Promise<void> {
        throw new Error('Method not implemented.')
    }
    recipientClaim(_wallet: FacadeWallet, _params: RecipientClaimParams): Promise<void> {
        throw new Error('Method not implemented.')
    }
    attachBonus(_wallet: FacadeWallet, _params: AttachBonusParams): Promise<void> {
        throw new Error('Method not implemented.')
    }

    async listTokens(tokenAddrs: string[]): Promise<IToken[]> {
        return Object.values(tokenMap).filter(t => tokenAddrs.includes(t.addr))
    }

    async listTokenBalance(walletAddr: string, tokenAddrs: string[]): Promise<TokenBalance[]> {
        const balances = await this.fetchBalances(walletAddr, tokenAddrs)
        const tokens = Object.values(tokenMap).filter(t => tokenAddrs.includes(t.addr))
        let ret: TokenBalance[] = []
        for (const token of tokens) {
            const amount = balances.get(token.addr) || 0n
            ret.push({
                addr: token.addr,
                amount,
            })
        }
        return ret
    }

    async createPlayerProfile(
        wallet: FacadeWallet,
        params: CreatePlayerProfileParams,
        response: ResponseHandle<CreatePlayerProfileResponse, CreatePlayerProfileError>
    ): Promise<void> {
        const playerAddr = wallet.walletAddr

        // Fetch the old one
        const playerProfile = await this.getPlayerProfile(playerAddr)

        let credentials
        if (!playerProfile) {
            const originSecret = hexToBuffer(wallet.walletAddr)
            credentials = (await generateCredentials(originSecret)).serialize()
        } else {
            credentials = playerProfile.credentials
        }

        const ix: CreatePlayerProfileInstruction = {
            playerAddr,
            credentials: [...credentials],
            nick: params.nick,
            pfp: params.pfp,
        }
        const signature = await this.sendInstruction('create_profile', ix)
        const profile = { addr: playerAddr, nick: params.nick, pfp: params.pfp, credentials }
        console.info('Profile:', profile)
        response.succeed({ signature, profile })
    }

    async createRecipient(
        _wallet: FacadeWallet,
        _params: CreateRecipientParams,
        _response: ResponseHandle<CreateRecipientResponse, CreateRecipientError>
    ): Promise<void> {
        throw new Error('Method not implemented.')
    }

    async addRecipientSlot(
        _wallet: FacadeWallet,
        params: AddRecipientSlotParams,
        response: ResponseHandle<AddRecipientSlotResponse, AddRecipientSlotError>
    ): Promise<void> {
        const { recipientAddr, slot } = params

        const recipient = await this.getRecipient(recipientAddr)
        if (!recipient) {
            return response.failed('recipient-not-found')
        }

        if (recipient.slots.some(s => s.id === slot.id)) {
            return response.failed('slot-id-exists')
        }

        const ix: AddRecipientSlotInstruction = {
            recipientAddr,
            slot,
        }

        const signature = await this.sendInstruction('add_recipient_slot', ix)
        response.succeed({ recipientAddr, signature })
    }

    async join(
        wallet: FacadeWallet,
        params: JoinParams,
        response: ResponseHandle<JoinResponse, JoinError>
    ): Promise<void> {
        const playerAddr = wallet.walletAddr
        const gameAccount = await this.getGameAccount(params.gameAddr)
        if (gameAccount === undefined) {
            return response.failed('game-not-found')
        }
        const ix: JoinInstruction = { playerAddr, accessVersion: gameAccount.accessVersion, ...params }
        if (params.createProfileIfNeeded) {
            const playerProfile = await this.getPlayerProfile(wallet.walletAddr)
            if (!playerProfile) {
                console.info('No profile found, create a new one before join')
                const originSecret = hexToBuffer(wallet.walletAddr)
                const credentials = (await generateCredentials(originSecret)).serialize()

                console.info("XXX credentials:", credentials)

                const createPlayerProfileIx: CreatePlayerProfileInstruction = {
                    playerAddr,
                    nick: wallet.walletAddr.substring(0, 6),
                    pfp: undefined,
                    credentials: [...credentials],
                }
                await this.sendInstruction('create_profile', createPlayerProfileIx)
            }
        }
        const signature = await this.sendInstruction('join', ix)
        response.succeed({ signature })
    }
    async getGameAccount(addr: string): Promise<RaceCore.IGameAccount | undefined> {
        const data: Uint8Array | undefined = await this.fetchState('get_account_info', [addr])
        if (data === undefined) return undefined
        const gameAccount = deserialize(GameAccount, data).generalize()
        console.debug(`Got game account ${addr}:`, gameAccount)
        return gameAccount
    }
    async listGameAccounts(addrs: string[]): Promise<RaceCore.IGameAccount[]> {
        let ret = []
        for (const addr of addrs) {
            const gameAccount = await this.getGameAccount(addr)
            if (gameAccount !== undefined) {
                ret.push(gameAccount)
            } else {
                console.warn(`Game not found: ${addr}`)
            }
        }
        return ret
    }
    async getGameBundle(addr: string): Promise<GameBundle | undefined> {
        const data: Uint8Array | undefined = await this.fetchState('get_game_bundle', [addr])
        if (data === undefined) return undefined
        return deserialize(GameBundle, data)
    }
    async getPlayerProfile(addr: string): Promise<PlayerProfile | undefined> {
        const data: Uint8Array | undefined = await this.fetchState('get_profile', [addr])
        if (data === undefined) return undefined
        return deserialize(PlayerProfile, data)
    }
    async listPlayerProfiles(addrs: string[]): Promise<Array<PlayerProfile | undefined>> {
        return await Promise.all(addrs.map(addr => this.getPlayerProfile(addr)))
    }
    async getServerAccount(addr: string): Promise<ServerAccount | undefined> {
        const data: Uint8Array | undefined = await this.fetchState('get_server_info', [addr])
        if (data === undefined) return undefined
        return deserialize(ServerAccount, data)
    }
    async listServerAccounts(addrs: string[]): Promise<Array<ServerAccount | undefined>> {
        return await Promise.all(addrs.map(addr => this.getServerAccount(addr)))
    }
    async getRegistration(addr: string): Promise<RegistrationAccount | undefined> {
        const data: Uint8Array | undefined = await this.fetchState('get_registration_info', [addr])
        if (data === undefined) return undefined
        return deserialize(RegistrationAccount, data)
    }

    async getRecipient(_addr: string): Promise<RaceCore.IRecipientAccount | undefined> {
        return undefined
    }

    async getTokenDecimals(addr: string): Promise<number | undefined> {
        return tokenMap[addr]?.decimals
    }

    async getToken(addr: string): Promise<IToken | undefined> {
        return tokenMap[addr]
    }

    async fetchBalances(walletAddr: string, tokenAddrs: string[]): Promise<Map<string, bigint>> {
        let ret = new Map()
        for (const addr of tokenAddrs) {
            const data = await this.fetchState('get_balance', [walletAddr, addr])
            if (data !== undefined) {
                const view = new DataView(data.buffer)
                const balance = view.getBigUint64(0, true)
                ret.set(addr, balance)
            }
        }
        return ret
    }

    async getNft(addr: string): Promise<Nft | undefined> {
        return nftMap[addr]
    }

    async listNfts(_walletAddr: string): Promise<Nft[]> {
        return Object.values(nftMap)
    }

    async sendInstruction(method: string, ix: any): Promise<string> {
        const reqData = JSON.stringify(
            {
                jsonrpc: '2.0',
                method,
                id: makeid(16),
                params: [ix],
            },
            (_key, value) => (typeof value === 'bigint' ? Number(value) : value)
        )
        const resp = await fetch(this.#url, {
            method: 'POST',
            body: reqData,
            headers: {
                'Content-Type': 'application/json',
            },
        })
        if (!resp.ok) {
            throw new Error('Failed to send instruction: ' + reqData)
        }
        console.log('Facade response:', await resp.json())
        return 'facadesig'
    }

    async fetchState(method: string, params: any): Promise<Uint8Array | undefined> {
        const reqData = JSON.stringify({
            jsonrpc: '2.0',
            method,
            id: makeid(16),
            params,
        })
        const resp = await fetch(this.#url, {
            method: 'POST',
            body: reqData,
            headers: {
                'Content-Type': 'application/json',
            },
        })
        if (!resp.ok) {
            throw new Error('Failed to fetch data at :' + params)
        }
        const { result } = await resp.json()
        console.debug('Facade request:', { method, params, result })
        if (result) {
            return Uint8Array.from(result)
        } else {
            return undefined
        }
    }

    async getCredentialOriginSecret(wallet: FacadeWallet): Promise<Uint8Array> {
        return hexToBuffer(this.walletAddr(wallet))
    }
}
