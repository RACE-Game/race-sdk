import { variant, field } from '@race-foundation/borsh'
import { IKind } from './types'

export type EntryTypeKind = 'Cash' | 'Ticket' | 'Gating' | 'Disabled'

// Unified interfaces.

export type IEntryTypeKind<T extends EntryTypeKind> = IKind<T>

export type IEntryTypeCash = {
    readonly minDeposit: bigint
    readonly maxDeposit: bigint
} & IEntryTypeKind<'Cash'>

export type IEntryTypeTicket = {
    readonly amount: bigint
} & IEntryTypeKind<'Ticket'>

export type IEntryTypeGating = {
    readonly collection: string
} & IEntryTypeKind<'Gating'>

export type IEntryTypeDisabled = {} & IEntryTypeKind<'Disabled'>

export type IEntryType = IEntryTypeCash | IEntryTypeTicket | IEntryTypeGating | IEntryTypeDisabled

export interface IHasEntryTypeKind {
    kind(): EntryTypeKind
}

// Default implementations, we used it in checkpoint.

export abstract class AEntryType implements IHasEntryTypeKind {
    kind(): EntryTypeKind {
        return 'Disabled'
    }

    static from(entryType: IEntryType): AEntryType {
        switch (entryType.kind) {
            case 'Cash':
                return new EntryTypeCash(entryType)
            case 'Ticket':
                return new EntryTypeTicket(entryType)
            case 'Gating':
                return new EntryTypeGating(entryType)
            default:
                return new EntryTypeDisabled({})
        }
    }

    generalize(): IEntryType {
        if (this instanceof EntryTypeCash) {
            return {
                kind: 'Cash',
                minDeposit: this.minDeposit,
                maxDeposit: this.maxDeposit,
            }
        } else if (this instanceof EntryTypeTicket) {
            return {
                kind: 'Ticket',
                amount: this.amount,
            }
        } else if (this instanceof EntryTypeGating) {
            return {
                kind: 'Gating',
                collection: this.collection,
            }
        } else {
            return {
                kind: 'Disabled',
            }
        }
    }
}

@variant(0)
export class EntryTypeCash extends AEntryType implements IHasEntryTypeKind {
    @field('u64')
    minDeposit!: bigint
    @field('u64')
    maxDeposit!: bigint
    constructor(fields: any) {
        super()
        Object.assign(this, fields)
        Object.setPrototypeOf(this, EntryTypeCash.prototype)
    }
    kind(): EntryTypeKind {
        return 'Cash'
    }
}

@variant(1)
export class EntryTypeTicket extends AEntryType implements IHasEntryTypeKind {
    @field('u64')
    amount!: bigint
    constructor(fields: any) {
        super()
        Object.assign(this, fields)
        Object.setPrototypeOf(this, EntryTypeTicket.prototype)
    }
    kind(): EntryTypeKind {
        return 'Ticket'
    }
}

@variant(2)
export class EntryTypeGating extends AEntryType implements IHasEntryTypeKind {
    @field('string')
    collection!: string
    constructor(fields: any) {
        super()
        Object.assign(this, fields)
        Object.setPrototypeOf(this, EntryTypeGating.prototype)
    }
    kind(): EntryTypeKind {
        return 'Gating'
    }
}

@variant(3)
export class EntryTypeDisabled extends AEntryType implements IHasEntryTypeKind {
    constructor(_: any) {
        super()
        Object.setPrototypeOf(this, EntryTypeDisabled.prototype)
    }
    kind(): EntryTypeKind {
        return 'Disabled'
    }
}
