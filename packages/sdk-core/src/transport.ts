import {
    IGameAccount,
    IGameBundle,
    IServerAccount,
    VoteType,
    IRegistrationAccount,
    INft,
    IToken,
    IRecipientAccount,
    TokenBalance,
    IPlayerProfile,
} from './accounts'
import { ResponseHandle } from './response'
import { Result } from './types'
import { IEntryType } from './entry-type'

export type SendTransactionResult<Sig> = Result<Sig, any>

export type RecipientSlotOwnerInit = { addr: string } | { identifier: string }

export type RecipientSlotShareInit = {
    owner: RecipientSlotOwnerInit
    weights: number
}

export type RecipientSlotInit = {
    id: number
    slotType: 'nft' | 'token'
    tokenAddr: string
    initShares: RecipientSlotShareInit[]
}

export type CreateGameAccountParams = {
    title: string
    bundleAddr: string
    tokenAddr: string
    maxPlayers: number
    entryType: IEntryType
    registrationAddr: string
    recipientAddr: string
    data: Uint8Array
    // Optional, the number of player fees to sponsor
    // Currently supported on Solana
    sponsorPlayerSlots?: number
}

export type CreateGameResponse = {
    gameAddr: string
    signature: string
}

export type CreateGameError = 'invalid-title' | 'invalid-depsoit-range'

export type CloseGameAccountParams = {
    regAddr: string
    gameAddr: string
}

export type JoinParams = {
    gameAddr: string
    amount: bigint
    position: number
}

export type JoinError =
    | 'table-is-full'
    | 'insufficient-funds'
    | 'game-not-served'
    | 'unsupported-entry-type'
    | 'invalid-deposit-amount'
    | 'game-not-found'
    | 'profile-not-found'
    | CreatePlayerProfileError // As we can create profile at first join

export type JoinResponse = {
    signature: string
}

export type DepositParams = {
    gameAddr: string
    amount: bigint
    settleVersion: bigint
}

export type DepositResponse = {
    signature: string
}

export type DepositError =
    | 'profile-not-found'
    | 'invalid-deposit-amount'
    | 'game-not-served'
    | 'game-not-found'
    | 'unsupported-entry-type'

export type VoteParams = {
    gameAddr: string
    voteType: VoteType
    voterAddr: string
    voteeAddr: string
}

export type CreatePlayerProfileParams = {
    secret: Uint8Array
    nick: string
    pfp?: string
}

export type CreatePlayerProfileResponse = {
    profile: IPlayerProfile
    signature: string
}

export type CreatePlayerProfileError = 'invalid-nick'

export type PublishGameParams = {
    uri: string
    name: string
    symbol: string
}

export type CreateRegistrationParams = {
    isPrivate: boolean
    size: number
}

export type CreateRegistrationResponse = {
    registrationAddr: string
    signature: string
}

export type CreateRegistrationError = 'invalid-size'

export type CreateRecipientParams = {
    capAddr?: string
    slots: RecipientSlotInit[]
}

export type CreateRecipientResponse = {
    recipientAddr: string
    signature: string
}

export type CreateRecipientError = 'duplicated-id' | 'invalid-size'

export type RegisterGameParams = {
    gameAddr: string
    regAddr: string
}

export type RegisterGameResponse = {
    gameAddr: string
    regAddr: string
}

export type RegisterGameError = 'registration-is-full'

export type UnregisterGameParams = {
    gameAddr: string
    regAddr: string
}

export type RecipientClaimParams = {
    recipientAddr: string
}

export type RecipientClaimResponse = {
    recipientAddr: string
    signature: string
}

export type RecipientClaimError = 'not-found' | 'no-slots-to-claim'

export type AttachBonusItem = {
    identifier: string
    tokenAddr: string
    amount: bigint
}

export type AttachBonusParams = {
    gameAddr: string
    bonuses: AttachBonusItem[]
}

export type AttachBonusResponse = {
    signature: string
}

export type CloseGameAccountResponse = {
    signature: string
}

export type CloseGameAccountError =
    | 'game-not-found'
    | 'permission-denied'
    | 'game-not-in-reg'
    | 'reg-not-found'
    | 'players-reg-not-found'

export type AttachBonusError = 'bonuses-is-full' | 'game-not-found' | 'too-much-bonuses'

export type AddRecipientSlotParams = {
    recipientAddr: string
    slot: RecipientSlotInit
}

export type AddRecipientSlotResponse = {
    recipientAddr: string
    signature: string
}

export type AddRecipientSlotError =
    | 'recipient-not-found'
    | 'slot-id-exists'
    | 'invalid-slot-params'
    | 'unsupported-entry-type'

export interface ITransport<W = never> {
    walletAddr(wallet: W): string

    get chain(): string

    createGameAccount(
        wallet: W,
        params: CreateGameAccountParams,
        resp: ResponseHandle<CreateGameResponse, CreateGameError>
    ): Promise<void>

    closeGameAccount(
        wallet: W,
        params: CloseGameAccountParams,
        resp: ResponseHandle<CloseGameAccountResponse, CloseGameAccountError>
    ): Promise<void>

    join(wallet: W, params: JoinParams, resp: ResponseHandle<JoinResponse, JoinError>): Promise<void>

    deposit(wallet: W, params: DepositParams, resp: ResponseHandle<DepositResponse, DepositError>): Promise<void>

    // vote(wallet: W, params: VoteParams): Promise<TransactionResult<void>>

    createPlayerProfile(
        wallet: W,
        params: CreatePlayerProfileParams,
        resp: ResponseHandle<CreatePlayerProfileResponse, CreatePlayerProfileError>
    ): Promise<void>

    createRecipient(
        wallet: W,
        params: CreateRecipientParams,
        resp: ResponseHandle<CreateRecipientResponse, CreateRecipientError>
    ): Promise<void>

    createRegistration(
        wallet: W,
        params: CreateRegistrationParams,
        resp: ResponseHandle<CreateRegistrationResponse, CreateRegistrationError>,
    ): Promise<void>

    addRecipientSlot(
        wallet: W,
        params: AddRecipientSlotParams,
        resp: ResponseHandle<AddRecipientSlotResponse, AddRecipientSlotError>
    ): Promise<void>

    registerGame(
        wallet: W,
        params: RegisterGameParams,
        resp: ResponseHandle<RegisterGameResponse, RegisterGameError>
    ): Promise<void>

    recipientClaim(
        wallet: W,
        params: RecipientClaimParams,
        resp: ResponseHandle<RecipientClaimResponse, RecipientClaimError>
    ): Promise<void>

    attachBonus(
        wallet: W,
        params: AttachBonusParams,
        resp: ResponseHandle<AttachBonusResponse, AttachBonusError>
    ): Promise<void>

    unregisterGame(wallet: W, params: UnregisterGameParams, resp: ResponseHandle): Promise<void>

    getGameAccount(addr: string): Promise<IGameAccount | undefined>

    listGameAccounts(addrs: string[]): Promise<IGameAccount[]>

    getGameBundle(addr: string): Promise<IGameBundle | undefined>

    getPlayerProfile(addr: string): Promise<IPlayerProfile | undefined>

    listPlayerProfiles(addrs: string[]): Promise<Array<IPlayerProfile | undefined>>

    listServerAccounts(addrs: string[]): Promise<Array<IServerAccount | undefined>>

    getServerAccount(addr: string): Promise<IServerAccount | undefined>

    getRegistration(addr: string): Promise<IRegistrationAccount | undefined>

    getRecipient(addr: string): Promise<IRecipientAccount | undefined>

    getTokenDecimals(addr: string): Promise<number | undefined>

    getToken(addr: string): Promise<IToken | undefined>

    getNft(addr: string): Promise<INft | undefined>

    listTokens(tokenAddrs: string[]): Promise<IToken[]>

    listTokenBalance(walletAddr: string, tokenAddrs: string[]): Promise<TokenBalance[]>

    listNfts(walletAddr: string): Promise<INft[]>

    getCredentialOriginSecret(wallet: W): Promise<Uint8Array>
}
