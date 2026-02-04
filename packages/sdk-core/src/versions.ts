import { field } from '@race-foundation/borsh'
import { Fields } from './types'


export class Versions {
    @field('u64')
    accessVersion!: bigint

    @field('u64')
    settleVersion!: bigint

    static default(): Versions {
        return new Versions({ accessVersion: 0n, settleVersion: 0n })
    }

    constructor(fields: Fields<Versions>) {
        Object.assign(this, fields)
    }
}
