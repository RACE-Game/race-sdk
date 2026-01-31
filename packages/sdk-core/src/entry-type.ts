import { variant, field } from '@race-foundation/borsh'
import { IKind } from './types'

export type EntryTypeKind = 'cash' | 'ticket' | 'gating' | 'disabled'

// Unified interfaces.

export type IEntryTypeKind<T extends EntryTypeKind> = IKind<T>

export type IEntryTypeCash = {
    readonly minDeposit: bigint
    readonly maxDeposit: bigint
} & IEntryTypeKind<'cash'>

export type IEntryTypeTicket = {
    readonly amount: bigint
} & IEntryTypeKind<'ticket'>

export type IEntryTypeGating = {
    readonly collection: string
} & IEntryTypeKind<'gating'>

export type IEntryTypeDisabled = {} & IEntryTypeKind<'disabled'>

export type IEntryType = IEntryTypeCash | IEntryTypeTicket | IEntryTypeGating | IEntryTypeDisabled

export interface IHasEntryTypeKind {
    kind(): EntryTypeKind
}

// Default implementations, we used it in checkpoint.

export abstract class AEntryType implements IHasEntryTypeKind {
    kind(): EntryTypeKind {
        return 'disabled'
    }

    static from(entryType: IEntryType): AEntryType {
        switch (entryType.kind) {
            case 'cash':
                return new EntryTypeCash(entryType)
            case 'ticket':
                return new EntryTypeTicket(entryType)
            case 'gating':
                return new EntryTypeGating(entryType)
            default:
                return new EntryTypeDisabled({})
        }
    }

    generalize(): IEntryType {
        if (this instanceof EntryTypeCash) {
            return {
                kind: 'cash',
                minDeposit: this.minDeposit,
                maxDeposit: this.maxDeposit,
            }
        } else if (this instanceof EntryTypeTicket) {
            return {
                kind: 'ticket',
                amount: this.amount,
            }
        } else if (this instanceof EntryTypeGating) {
            return {
                kind: 'gating',
                collection: this.collection,
            }
        } else {
            return {
                kind: 'disabled',
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
        return 'cash'
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
        return 'ticket'
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
        return 'gating'
    }
}

@variant(3)
export class EntryTypeDisabled extends AEntryType implements IHasEntryTypeKind {
    constructor(_: any) {
        super()
        Object.setPrototypeOf(this, EntryTypeDisabled.prototype)
    }
    kind(): EntryTypeKind {
        return 'disabled'
    }
}
