import {
    GameAccount,
    GameBundle,
    ServerAccount,
    VoteType,
    RegistrationAccount,
    Nft,
    Token,
    RecipientAccount,
    EntryType,
    TokenBalance,
    PlayerProfile,
} from './accounts'
import { ResponseHandle } from './response'
import { Result } from './types'

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
    entryType: EntryType
    registrationAddr: string
    recipientAddr: string
    data: Uint8Array
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
    verifyKey: string
    createProfileIfNeeded?: boolean
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

export type DepositError = 'profile-not-found' | 'invalid-deposit-amount' | 'game-not-served' | 'game-not-found' | 'unsupported-entry-type'

export type VoteParams = {
    gameAddr: string
    voteType: VoteType
    voterAddr: string
    voteeAddr: string
}

export type CreatePlayerProfileParams = {
    nick: string
    pfp?: string
}

export type CreatePlayerProfileResponse = {
    profile: PlayerProfile
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

export interface ITransport<W=never> {

    walletAddr(wallet: W): string

    createGameAccount(
        wallet: W,
        params: CreateGameAccountParams,
        resp: ResponseHandle<CreateGameResponse, CreateGameError>
    ): Promise<void>

    closeGameAccount(wallet: W, params: CloseGameAccountParams, resp: ResponseHandle<CloseGameAccountResponse, CloseGameAccountError>): Promise<void>

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

    attachBonus(wallet: W, params: AttachBonusParams, resp: ResponseHandle<AttachBonusResponse, AttachBonusError>): Promise<void>;

    unregisterGame(wallet: W, params: UnregisterGameParams, resp: ResponseHandle): Promise<void>

    getGameAccount(addr: string): Promise<GameAccount | undefined>

    listGameAccounts(addrs: string[]): Promise<GameAccount[]>

    getGameBundle(addr: string): Promise<GameBundle | undefined>

    getPlayerProfile(addr: string): Promise<PlayerProfile | undefined>

    listPlayerProfiles(addrs: string[]): Promise<Array<PlayerProfile | undefined>>

    getServerAccount(addr: string): Promise<ServerAccount | undefined>

    getRegistration(addr: string): Promise<RegistrationAccount | undefined>

    getRecipient(addr: string): Promise<RecipientAccount | undefined>

    getTokenDecimals(addr: string): Promise<number | undefined>

    getToken(addr: string): Promise<Token | undefined>

    getNft(addr: string): Promise<Nft | undefined>

    listTokens(tokenAddrs: string[]): Promise<Token[]>

    listTokenBalance(walletAddr: string, tokenAddrs: string[]): Promise<TokenBalance[]>

    listNfts(walletAddr: string): Promise<Nft[]>
}
