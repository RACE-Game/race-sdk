import { field, struct, enums, variant } from '@race-foundation/borsh'
import { Indices, Fields } from './types'
import { Credentials } from './credentials'
import { CLIENT_MODES, ClientMode } from './client-mode'

export type NodeStatusKind = 'Pending' | 'Confirming' | 'Ready' | 'Disconnected'

export type INodeStatus = { kind: 'Pending', accessVersion: bigint }
    | { kind: 'Confirming' }
    | { kind: 'Ready' }
    | { kind: 'Disconnected' }

export abstract class ANodeStatus {
    generalize(): INodeStatus {
        if (this instanceof NodeStatusPending) {
            return {
                kind: 'Pending', accessVersion: this.accessVersion
            }
        } else if (this instanceof NodeStatusConfirming) {
            return { kind: 'Confirming' }
        } else if (this instanceof NodeStatusReady) {
            return { kind: 'Ready' }
        } else {
            return { kind: 'Disconnected' }
        }
    }

    get kind(): NodeStatusKind {
        return 'Disconnected'
    }
}

@variant(0)
export class NodeStatusPending extends ANodeStatus {
    @field('u64')
    accessVersion!: bigint

    get kind(): NodeStatusKind {
        return 'Pending'
    }

    constructor(fields: Fields<NodeStatusPending>) {
        super();
        Object.assign(this, fields)
    }
}

@variant(1)
export class NodeStatusConfirming extends ANodeStatus {
    get kind(): NodeStatusKind {
        return 'Confirming'
    }

    constructor() {
        super();
    }
}


@variant(2)
export class NodeStatusReady extends ANodeStatus {
    get kind(): NodeStatusKind {
        return 'Ready'
    }

    constructor() {
        super();
    }
}


@variant(3)
export class NodeStatusDisconnected extends ANodeStatus {
    get kind(): NodeStatusKind {
        return 'Disconnected'
    }

    constructor() {
        super();
    }
}

export interface INode {
    addr: string
    id: bigint
    mode: ClientMode
    status: INodeStatus
    credentials: Credentials
}

export class Node {
    @field('string')
    addr!: string
    @field('u64')
    id!: bigint
    @field('u8')
    mode!: Indices<typeof CLIENT_MODES>
    @field(enums(ANodeStatus))
    status!: ANodeStatus
    @field(struct(Credentials))
    credentials!: Credentials

    generalize(): INode {
        return {
            addr: this.addr,
            id: this.id,
            mode: CLIENT_MODES[this.mode],
            status: this.status.generalize(),
            credentials: this.credentials,
        }
    }

    constructor(fields: Fields<Node>) {
        Object.assign(this, fields)
    }
}
