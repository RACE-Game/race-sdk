import { Address } from '@solana/kit'
import { publicKeyExt } from './utils'
import { deserialize, serialize, field, option, array, struct, enums, variant } from '@race-foundation/borsh'
import * as RaceCore from '@race-foundation/sdk-core';
import {
    AEntryType,
    CheckpointOnChain,
    ENTRY_LOCKS,
    Fields,
    Indices,
    RECIPIENT_SLOT_TYPES,
    VOTE_TYPES,
    IGameAccount,
    IPlayerProfile,
    IGameBundle,
    IRecipientAccount,
    IVote,
    IBonus,
    IServerAccount,
    IServerJoin,
    IPlayerJoin,
    IPlayerDeposit,
    IRegistrationAccount,
    IRecipientSlot,
    IGameRegistration,
    IRecipientSlotShare,
    IRecipientSlotOwner,
} from '@race-foundation/sdk-core'


export type EntryLock = RaceCore.Indices<typeof RaceCore.ENTRY_LOCKS>

type RecipientSlotType = RaceCore.Indices<typeof RaceCore.RECIPIENT_SLOT_TYPES>

export class PlayerState {
    @field('u8')
    version!: number
    @field('string')
    nick!: string
    @field(option(publicKeyExt))
    pfpKey?: Address
    @field('u8-array')
    credentials!: Uint8Array

    constructor(fields: Fields<PlayerState>) {
        Object.assign(this, fields)
    }

    serialize(): Uint8Array {
        return serialize(this)
    }

    static deserialize(data: Uint8Array): PlayerState {
        return deserialize(PlayerState, data)
    }

    generalize(addr: Address): IPlayerProfile {
        return {
            addr: addr,
            nick: this.nick,
            pfp: this.pfpKey,
            credentials: this.credentials,
        }
    }
}

type VoteType = Indices<typeof VOTE_TYPES>

export class Vote {
    @field(publicKeyExt)
    voterKey!: Address
    @field(publicKeyExt)
    voteeKey!: Address
    @field('u8')
    voteType!: VoteType
    constructor(fields: Fields<Vote>) {
        Object.assign(this, fields)
    }
    generalize(): IVote {
        return {
            voter: this.voterKey,
            votee: this.voteeKey,
            voteType: RaceCore.VOTE_TYPES[this.voteType],
        }
    }
}

export class ServerJoin {
    @field(publicKeyExt)
    key!: Address
    @field('string')
    endpoint!: string
    @field('u64')
    accessVersion!: bigint
    constructor(fields: IServerJoin) {
        Object.assign(this, fields)
    }
    generalize(): IServerJoin {
        return {
            addr: this.key,
            endpoint: this.endpoint,
            accessVersion: this.accessVersion,
        }
    }
}

export class PlayerJoin {
    @field(publicKeyExt)
    key!: Address
    @field('u16')
    position!: number
    @field('u64')
    accessVersion!: bigint

    constructor(fields: Fields<PlayerJoin>) {
        Object.assign(this, fields)
    }

    generalize(): IPlayerJoin {
        return {
            addr: this.key,
            position: this.position,
            accessVersion: this.accessVersion,
        }
    }
}

export class PlayerDeposit {
    @field(publicKeyExt)
    key!: Address
    @field('u64')
    amount!: bigint
    @field('u64')
    accessVersion!: bigint
    @field('u64')
    settleVersion!: bigint
    @field('u8')
    status!: RaceCore.DepositStatus

    constructor(fields: Fields<PlayerJoin>) {
        Object.assign(this, fields)
    }

    generalize(): IPlayerDeposit {
        return {
            addr: this.key,
            amount: this.amount,
            accessVersion: this.accessVersion,
            settleVersion: this.settleVersion,
            status: this.status,
        }
    }
}

export class Bonus {
    @field('string')
    identifier!: string
    @field(publicKeyExt)
    stakeAddr!: Address
    @field(publicKeyExt)
    tokenAddr!: Address
    @field('u64')
    amount!: bigint

    constructor(fields: Fields<Bonus>) {
        Object.assign(this, fields)
    }

    generalize(): IBonus {
        return {
            identifier: this.identifier,
            tokenAddr: this.tokenAddr,
            amount: this.amount,
        }
    }
}


export class PlayerBalance {
    @field('u64')
    playerId!: bigint
    @field('u64')
    balance!: bigint
    constructor(fields: Fields<PlayerBalance>) {
        Object.assign(this, fields)
    }
}

export class GameState {
    @field('bool')
    isInitialized!: boolean
    @field('string')
    version!: string
    @field('string')
    title!: string
    @field(publicKeyExt)
    bundleKey!: Address
    @field(publicKeyExt)
    stakeKey!: Address
    @field(publicKeyExt)
    ownerKey!: Address
    @field(publicKeyExt)
    tokenKey!: Address
    @field(option(publicKeyExt))
    transactorKey: Address | undefined
    @field('u64')
    accessVersion!: bigint
    @field('u64')
    settleVersion!: bigint
    @field('u16')
    maxPlayers!: number
    @field(publicKeyExt)
    playersRegAccount!: Address
    @field(array(struct(PlayerDeposit)))
    deposits!: PlayerDeposit[]
    @field(array(struct(ServerJoin)))
    servers!: ServerJoin[]
    @field('u32')
    dataLen!: number
    @field('u8-array')
    data!: Uint8Array
    @field(array(struct(Vote)))
    votes!: Vote[]
    @field(option('u64'))
    unlockTime: bigint | undefined
    @field(enums(AEntryType))
    entryType!: AEntryType
    @field(publicKeyExt)
    recipientAddr!: Address
    @field('u8-array')
    checkpoint!: Uint8Array
    @field('u8')
    entryLock!: EntryLock
    @field(array(struct(Bonus)))
    bonuses!: Bonus[]
    @field(array(struct(PlayerBalance)))
    balances!: PlayerBalance[]

    constructor(fields: Fields<GameState>) {
        Object.assign(this, fields)
    }

    serialize(): Uint8Array {
        return serialize(this)
    }

    static deserialize(data: Uint8Array): GameState {
        return deserialize(GameState, data)
    }

    generalize(addr: Address, players: PlayerJoin[]): IGameAccount {
        let checkpointOnChain = undefined
        if (this.checkpoint.length !== 0) {
            checkpointOnChain = RaceCore.CheckpointOnChain.fromRaw(this.checkpoint)
        }

        return {
            addr: addr,
            title: this.title,
            bundleAddr: this.bundleKey,
            ownerAddr: this.ownerKey,
            tokenAddr: this.tokenKey,
            transactorAddr: this.transactorKey,
            accessVersion: this.accessVersion,
            settleVersion: this.settleVersion,
            maxPlayers: this.maxPlayers,
            players: players.map(p => p.generalize()),
            deposits: this.deposits.map(d => d.generalize()),
            servers: this.servers.map(s => s.generalize()),
            dataLen: this.dataLen,
            data: this.data,
            votes: this.votes.map(v => v.generalize()),
            unlockTime: this.unlockTime,
            entryType: this.entryType.generalize(),
            recipientAddr: this.recipientAddr,
            checkpointOnChain,
            entryLock: ENTRY_LOCKS[this.entryLock],
            bonuses: this.bonuses.map(b => b.generalize()),
            balances: this.balances,
        }
    }
}

export class PlayersRegState {
    @field('u64')
    accessVersion!: bigint
    @field('u64')
    settleVersion!: bigint
    @field('usize')
    size!: number
    @field(128)
    positionFlags!: number[]
    @field(array(struct(PlayerJoin)))
    players!: PlayerJoin[]
    constructor(fields: Fields<PlayersRegState>) {
        Object.assign(this, fields)
    }
    static deserialize(data: Uint8Array): PlayersRegState {
        return deserialize(PlayersRegState, data)
    }
}

export class GameReg {
    @field('string')
    title!: string
    @field(publicKeyExt)
    gameKey!: Address
    @field(publicKeyExt)
    bundleKey!: Address
    @field('u64')
    regTime!: bigint
    constructor(fields: Fields<GameReg>) {
        Object.assign(this, fields)
    }
    generalize(): IGameRegistration {
        return {
            title: this.title,
            addr: this.gameKey,
            bundleAddr: this.bundleKey,
            regTime: this.regTime,
        }
    }
}

export class RegistryState {
    @field('bool')
    isInitialized!: boolean
    @field('bool')
    isPrivate!: boolean
    @field('u16')
    size!: number
    @field(publicKeyExt)
    ownerKey!: Address
    @field(array(struct(GameReg)))
    games!: GameReg[]
    constructor(fields: Fields<RegistryState>) {
        Object.assign(this, fields)
    }

    serialize(): Uint8Array {
        return serialize(this)
    }

    static deserialize(data: Uint8Array): RegistryState {
        return deserialize(RegistryState, data)
    }

    generalize(addr: Address): IRegistrationAccount {
        return {
            addr,
            isPrivate: this.isPrivate,
            size: this.size,
            owner: this.ownerKey,
            games: this.games.map(g => g.generalize()),
        }
    }
}

export class ServerState {
    @field('bool')
    isInitialized!: boolean
    @field(publicKeyExt)
    key!: Address
    @field(publicKeyExt)
    ownerKey!: Address
    @field('string')
    endpoint!: string
    @field('u8-array')
    credentials!: Uint8Array

    constructor(fields: Fields<ServerState>) {
        Object.assign(this, fields)
    }

    serialize(): Uint8Array {
        return serialize(this)
    }

    static deserialize(data: Uint8Array): ServerState {
        return deserialize(this, data)
    }

    generalize(): IServerAccount {
        return {
            addr: this.ownerKey,
            endpoint: this.endpoint,
            credentials: this.credentials,
        }
    }
}

export abstract class RecipientSlotOwner {
    generalize(): IRecipientSlotOwner {
        if (this instanceof RecipientSlotOwnerUnassigned) {
            return {
                kind: 'Unassigned',
                identifier: this.identifier,
            }
        } else if (this instanceof RecipientSlotOwnerAssigned) {
            return {
                kind: 'Assigned',
                addr: this.addr
            }
        } else {
            throw new Error('Unsupported SlotOwner type')
        }
    }
}

@variant(0)
export class RecipientSlotOwnerUnassigned extends RecipientSlotOwner {
    @field('string')
    identifier!: string
    constructor(fields: any) {
        super()
        Object.assign(this, fields)
    }
}

@variant(1)
export class RecipientSlotOwnerAssigned extends RecipientSlotOwner {
    @field(publicKeyExt)
    addr!: Address
    constructor(fields: any) {
        super()
        Object.assign(this, fields)
    }
}

export class RecipientSlotShare {
    @field(enums(RecipientSlotOwner))
    owner!: RecipientSlotOwner
    @field('u16')
    weights!: number
    @field('u64')
    claimAmount!: bigint
    constructor(fields: IRecipientSlotShare) {
        Object.assign(this, fields)
    }

    generalize(): IRecipientSlotShare {
        let owner: IRecipientSlotOwner
        if (this.owner instanceof RecipientSlotOwnerAssigned) {
            owner = {
                kind: 'Assigned',
                addr: this.owner.addr,
            }
        } else if (this.owner instanceof RecipientSlotOwnerUnassigned) {
            owner = {
                kind: 'Unassigned',
                identifier: this.owner.identifier,
            }
        } else {
            throw new Error('Invalid slot owner')
        }
        return {
            owner,
            weights: this.weights,
            claimAmount: this.claimAmount,
        }
    }
}

export class RecipientSlot {
    @field('u8')
    id!: number
    @field('u8')
    slotType!: RecipientSlotType
    @field(publicKeyExt)
    tokenAddr!: Address
    @field(publicKeyExt)
    stakeAddr!: Address
    @field(array(struct(RecipientSlotShare)))
    shares!: RecipientSlotShare[]
    constructor(fields: IRecipientSlot) {
        Object.assign(this, fields)
    }

    generalize(balance: bigint): IRecipientSlot {
        return {
            id: this.id,
            slotType: RaceCore.RECIPIENT_SLOT_TYPES[this.slotType],
            tokenAddr: this.tokenAddr,
            shares: this.shares.map(s => s.generalize()),
            balance,
        }
    }
}

export class RecipientState {
    @field('bool')
    isInitialized!: boolean
    @field(option(publicKeyExt))
    capAddr: Address | undefined
    @field(array(struct(RecipientSlot)))
    slots!: RecipientSlot[]

    constructor(fields: Fields<RecipientState>) {
        Object.assign(this, fields)
    }

    serialize(): Uint8Array {
        return serialize(this)
    }

    static deserialize(data: Uint8Array): RecipientState {
        return deserialize(this, data)
    }

    generalize(addr: string, slots: IRecipientSlot[]): IRecipientAccount {
        return {
            addr,
            capAddr: this.capAddr,
            slots,
        }
    }
}
