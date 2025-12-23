import { CheckpointOnChain } from './checkpoint'
import { IKind, UnionFromValues } from './types'
import { IEntryType } from './entry-type'
import { IPlayerBalance } from './player-balance'

export const ENTRY_LOCKS = ['Open', 'JoinOnly', 'DepositOnly', 'Closed'] as const
export type EntryLock = UnionFromValues<typeof ENTRY_LOCKS>

export const DEPOSIT_STATUS = ['Pending', 'Rejected', 'Refunded', 'Accepted'] as const
export type DepositStatus = UnionFromValues<typeof DEPOSIT_STATUS>

export interface IPlayerJoin {
    readonly addr: string
    readonly position: number
    readonly accessVersion: bigint
    readonly verifyKey: string
}

export interface IPlayerDeposit {
    readonly addr: string
    readonly amount: bigint
    readonly accessVersion: bigint
    readonly settleVersion: bigint
    readonly status: DepositStatus
}

export interface IServerJoin {
    readonly addr: string
    readonly endpoint: string
    readonly accessVersion: bigint
    readonly verifyKey: string
}

export interface IBonus {
    readonly identifier: string
    readonly tokenAddr: string
    readonly amount: bigint
}

export const VOTE_TYPES = ['ServerVoteTransactorDropOff', 'ClientVoteTransactorDropOff'] as const
export type VoteType = UnionFromValues<typeof VOTE_TYPES>

export interface IVote {
    readonly voter: string
    readonly votee: string
    readonly voteType: VoteType
}

export interface IGameRegistration {
    readonly title: string
    readonly addr: string
    readonly regTime: bigint
    readonly bundleAddr: string
}

export interface IGameAccount {
    readonly addr: string
    readonly title: string
    readonly bundleAddr: string
    readonly tokenAddr: string
    readonly ownerAddr: string
    readonly settleVersion: bigint
    readonly accessVersion: bigint
    readonly players: IPlayerJoin[]
    readonly deposits: IPlayerDeposit[]
    readonly servers: IServerJoin[]
    readonly transactorAddr: string | undefined
    readonly votes: IVote[]
    readonly unlockTime: bigint | undefined
    readonly maxPlayers: number
    readonly dataLen: number
    readonly data: Uint8Array
    readonly entryType: IEntryType
    readonly recipientAddr: string
    readonly checkpointOnChain: CheckpointOnChain | undefined
    readonly entryLock: EntryLock
    readonly bonuses: IBonus[]
    readonly balances: IPlayerBalance[]
}

export interface IServerAccount {
    readonly addr: string
    readonly endpoint: string
    readonly credentials: Uint8Array
}

export interface IGameBundle {
    readonly addr: string
    readonly uri: string
    readonly name: string
    readonly data: Uint8Array
}

export interface IPlayerProfile {
    readonly addr: string
    readonly nick: string
    readonly pfp: string | undefined
    readonly credentials: Uint8Array
}

export interface IRegistrationAccount {
    readonly addr: string
    readonly isPrivate: boolean
    readonly size: number
    readonly owner: string | undefined
    readonly games: IGameRegistration[]
}

export interface IToken {
    readonly addr: string
    readonly icon: string
    readonly name: string
    readonly symbol: string
    readonly decimals: number
}

export class TokenBalance {
    readonly addr!: string
    readonly amount!: bigint
}

export interface INft {
    readonly addr: string
    readonly image: string
    readonly name: string
    readonly symbol: string
    readonly collection: string | undefined
    readonly metadata: any
}

export interface IRecipientAccount {
    readonly addr: string
    readonly capAddr: string | undefined
    readonly slots: IRecipientSlot[]
}

export const RECIPIENT_SLOT_TYPES = ['Nft', 'Token'] as const

export type RecipientSlotType = UnionFromValues<typeof RECIPIENT_SLOT_TYPES>

export interface IRecipientSlot {
    readonly id: number
    readonly slotType: RecipientSlotType
    readonly tokenAddr: string
    readonly shares: IRecipientSlotShare[]
    readonly balance: bigint
}

export interface IRecipientSlotShare {
    readonly owner: IRecipientSlotOwner
    readonly weights: number
    readonly claimAmount: bigint
}

export type RecipientSlotOwnerKind<T extends 'Unassigned' | 'Assigned'> = IKind<T>

export type RecipientSlotOwnerUnassigned = {
    readonly identifier: string
} & RecipientSlotOwnerKind<'Unassigned'>

export type RecipientSlotOwnerAssigned = {
    readonly addr: string
} & RecipientSlotOwnerKind<'Assigned'>

export type IRecipientSlotOwner = RecipientSlotOwnerUnassigned | RecipientSlotOwnerAssigned

/**
 * The registration account data with games consolidated.
 */
export interface IRegistrationWithGames {
    readonly addr: string
    readonly isPrivate: boolean
    readonly size: number
    readonly owner: string | undefined
    readonly games: IGameAccount[]
}

function getEndpointFromGameAccount(gameAccount: IGameAccount): string | undefined {
    const { transactorAddr, servers } = gameAccount

    if (!transactorAddr) {
        return undefined
    }

    const server = servers.find(s => s.addr === transactorAddr)

    return server ? server.endpoint : undefined
}
