import { RandomState, RandomSpec } from './random-state'
import { DecisionState } from './decision-state'
import { VersionedData } from './versioned-data'
import { SharedData, ISharedData } from './shared-data'
import { Versions } from './versions'
import { GameSpec } from './game-spec'
import { ClientMode } from './client-mode'
import { INode, INodeStatus } from './node'
import { Credentials } from './credentials'
import {
    ActionTimeout,
    Answer,
    CiphertextAndDigest,
    GameEvent,
    OperationTimeout,
    Random,
    RandomnessReady,
    SecretShare,
    Shutdown,
    WaitingTimeout,
} from './events'
import { InitAccount } from './init-account'
import {
    Effect,
    EmitBridgeEvent,
    LaunchSubGame,
    Settle,
    Transfer,
    PlayerBalance,
    BalanceChange,
    BalanceChangeAdd,
} from './effect'
import { IGameAccount } from './accounts'
import { IEntryType } from './entry-type'
import { Ciphertext, Digest, Fields } from './types'
import { sha256String } from './utils'

const OPERATION_TIMEOUT = 15_000n

export type GameStatus = 'Idle' | 'Running' | 'Closed'

export interface DispatchEvent {
    timeout: bigint
    event: GameEvent
}

export interface IdAddrPair {
    id: bigint
    addr: string
}

export interface EventEffects {
    settles: Settle[]
    transfer: Transfer | undefined
    checkpoint: Uint8Array | undefined
    launchSubGames: LaunchSubGame[]
    bridgeEvents: EmitBridgeEvent[]
    startGame: boolean
}

export class GameContext {
    gameSpec: GameSpec
    versions: Versions
    status: GameStatus
    nodes: INode[]
    dispatch: DispatchEvent | undefined
    handlerState: Uint8Array
    balances: PlayerBalance[]
    timestamp: bigint
    randomStates: RandomState[]
    decisionStates: DecisionState[]
    versionedData: VersionedData
    subGames: GameSpec[]
    entryType: IEntryType

    constructor(sharedData: ISharedData, versionedData: VersionedData) {
        let subGames: GameSpec[] = []
        for (const vd of versionedData.subData.values()) {
            subGames.push(vd.gameSpec)
        }

        this.gameSpec = versionedData.gameSpec
        this.versions = versionedData.versions
        this.status = 'Idle'
        this.dispatch = undefined
        this.nodes = sharedData.nodes
        this.timestamp = 0n
        this.randomStates = []
        this.decisionStates = []
        this.handlerState = versionedData.handlerState
        this.versionedData = versionedData
        this.subGames = subGames
        this.entryType = versionedData.gameSpec.entryType.generalize()
        this.balances = sharedData.balances
    }

    idToAddrUnchecked(id: bigint): string | undefined {
        return this.nodes.find(x => x.id === id)?.addr
    }

    idToAddr(id: bigint): string {
        let found = this.idToAddrUnchecked(id)
        if (found === undefined) {
            throw new Error(`Cannot map id to address: ${id.toString()}`)
        }
        return found
    }

    addrToIdUnchecked(addr: string): bigint | undefined {
        return this.nodes.find(x => x.addr === addr)?.id
    }

    addrToId(addr: string): bigint {
        let found = this.addrToIdUnchecked(addr)
        if (found === undefined) {
            throw new Error(`Cannot map address to id: ${addr}`)
        }
        return found
    }

    getNodeByAddress(addr: string): INode | undefined {
        return this.nodes.find(n => n.addr === addr)
    }

    dispatchEvent(event: GameEvent, timeout: bigint) {
        this.dispatch = {
            event,
            timeout: this.timestamp + timeout,
        }
    }

    dispatchEventInstantly(event: GameEvent) {
        this.dispatchEvent(event, 0n)
    }

    waitTimeout(timeout: bigint) {
        this.dispatch = {
            event: new WaitingTimeout({}),
            timeout: this.timestamp + timeout,
        }
    }

    actionTimeout(playerId: bigint, timeout: bigint) {
        this.dispatch = {
            event: new ActionTimeout({ playerId }),
            timeout: this.timestamp + timeout,
        }
    }

    shutdownGame() {
        this.dispatch = {
            event: new Shutdown({}),
            timeout: 0n,
        }
    }

    getRandomState(randomId: number): RandomState {
        if (randomId <= 0) {
            throw new Error('Invalid random id: ' + randomId)
        }
        const st = this.randomStates[randomId - 1]
        if (st === undefined) {
            throw new Error('Invalid random id: ' + randomId)
        }
        return st
    }

    getDecisionState(decisionId: number): DecisionState {
        if (decisionId <= 0) {
            throw new Error('Invalid decision id: ' + decisionId)
        }
        const st = this.decisionStates[decisionId - 1]
        if (st === undefined) {
            throw new Error('Invalid decision id: ' + decisionId)
        }
        return st
    }

    assign(randomId: number, playerAddr: string, indexes: number[]) {
        const st = this.getRandomState(randomId)
        st.assign(playerAddr, indexes)
    }

    reveal(randomId: number, indexes: number[]) {
        const st = this.getRandomState(randomId)
        st.reveal(indexes)
    }

    isRandomReady(randomId: number): boolean {
        const k = this.getRandomState(randomId).status.kind
        return k === 'ready' || k === 'waiting-secrets'
    }

    isAllRandomReady(): boolean {
        for (const st of this.randomStates) {
            const k = st.status.kind
            if (k !== 'ready' && k !== 'waiting-secrets') {
                return false
            }
        }
        return true
    }

    isSecretsReady(): boolean {
        return this.randomStates.every(st => st.status.kind === 'ready')
    }

    setNodeStatus(addr: string, status: INodeStatus) {
        let n = this.nodes.find(n => n.addr === addr)
        if (n === undefined) {
            throw new Error('Invalid node address')
        }
        n.status = status
    }

    addNode(nodeAddr: string, accessVersion: bigint, mode: ClientMode, credentials: Credentials) {
        this.nodes = this.nodes.filter(n => n.addr !== nodeAddr)
        this.nodes.push({
            addr: nodeAddr,
            id: accessVersion,
            mode,
            status: { kind: 'Pending', accessVersion },
            credentials,
        })
    }

    setAccessVersion(accessVersion: bigint) {
        this.versions.accessVersion = accessVersion
    }

    initRandomState(spec: RandomSpec): number {
        const randomId = this.randomStates.length + 1
        const owners = this.nodes.filter(n => n.status.kind === 'Ready' && n.mode !== 'Player').map(n => n.addr)
        const randomState = new RandomState(randomId, spec, owners)
        this.randomStates.push(randomState)
        return randomId
    }

    addSharedSecrets(_addr: string, shares: SecretShare[]) {
        for (const share of shares) {
            if (share instanceof Random) {
                const { randomId, toAddr, fromAddr, index, secret } = share
                this.getRandomState(randomId).addSecret(fromAddr, toAddr, index, secret)
            } else if (share instanceof Answer) {
                const { fromAddr, decisionId, secret } = share
                this.getDecisionState(decisionId).addSecret(fromAddr, secret)
            }
        }
    }

    randomizeAndMask(addr: string, randomId: number, ciphertexts: Ciphertext[]) {
        let st = this.getRandomState(randomId)
        st.mask(addr, ciphertexts)
        this.dispatchRandomizationTimeout(randomId)
    }

    lock(addr: string, randomId: number, ciphertextsAndTests: CiphertextAndDigest[]) {
        let st = this.getRandomState(randomId)
        st.lock(addr, ciphertextsAndTests)
        this.dispatchRandomizationTimeout(randomId)
    }

    dispatchRandomizationTimeout(randomId: number) {
        const noDispatch = this.dispatch === undefined
        let st = this.getRandomState(randomId)
        const statusKind = st.status.kind
        if (statusKind === 'ready') {
            this.dispatchEventInstantly(new RandomnessReady({ randomId }))
        } else if (statusKind === 'locking' || statusKind === 'masking') {
            const addr = st.status.addr
            const id = this.addrToId(addr)
            if (noDispatch) {
                this.dispatchEvent(new OperationTimeout({ ids: [id] }), OPERATION_TIMEOUT)
            }
        } else if (statusKind === 'waiting-secrets') {
            if (noDispatch) {
                const ids = st.listOperatingAddrs().map(x => this.addrToId(x))
                this.dispatchEvent(new OperationTimeout({ ids }), OPERATION_TIMEOUT)
            }
        }
    }

    bumpSettleVersion() {
        this.versions.settleVersion += 1n
    }

    addRevealedRandom(randomId: number, revealed: Map<number, string>) {
        const st = this.getRandomState(randomId)
        st.addRevealed(revealed)
    }

    addRevealedAnswer(decisionId: number, revealed: string) {
        const st = this.getDecisionState(decisionId)
        st.addReleased(revealed)
    }

    ask(owner: string): number {
        const id = this.decisionStates.length + 1
        const st = new DecisionState(id, owner)
        this.decisionStates.push(st)
        return id
    }

    answerDecision(id: number, owner: string, ciphertext: Ciphertext, digest: Digest) {
        const st = this.getDecisionState(id)
        st.setAnswer(owner, ciphertext, digest)
    }

    getRevealed(randomId: number): Map<number, string> {
        let st = this.getRandomState(randomId)
        return st.revealed
    }

    async applyEffect(effect: Effect): Promise<EventEffects> {
        // console.debug('Apply effect:', effect)
        if (effect.startGame) {
        } else if (effect.stopGame) {
            this.shutdownGame()
        } else if (effect.actionTimeout !== undefined) {
            this.actionTimeout(effect.actionTimeout.playerId, effect.actionTimeout.timeout)
        } else if (effect.waitTimeout !== undefined) {
            this.waitTimeout(effect.waitTimeout)
        } else if (effect.cancelDispatch) {
            this.dispatch = undefined
        }
        for (const assign of effect.assigns) {
            const addr = this.idToAddr(assign.playerId)
            this.assign(assign.randomId, addr, assign.indexes)
        }
        for (const reveal of effect.reveals) {
            this.reveal(reveal.randomId, reveal.indexes)
        }
        for (const ask of effect.asks) {
            this.ask(ask.playerAddr)
        }
        for (const spec of effect.initRandomStates) {
            this.initRandomState(spec)
        }

        let settles: Settle[] = []

        if (effect.handlerState !== undefined) {
            await this.setHandlerState(effect.handlerState)
            if (effect.isCheckpoint) {
                this.bumpSettleVersion()
                this.versionedData.handlerState = effect.handlerState

                // Reset random states
                this.randomStates = []
                this.decisionStates = []

                // Sort settles and track player states
                settles = this.makeSettlesFromEffect(effect)
                this.balances = effect.balances
            } else if (effect.isInit) {
                this.bumpSettleVersion()
                this.versionedData = VersionedData.init(this.gameSpec, this.versions, effect.handlerState)
            }
        }

        // XXX do we manage the sub game?
        // we already have that info in versinoed data's sub data.

        // for (const subGame of effect.launchSubGames) {
        //     this.addSubGame(subGame)
        // }

        return {
            checkpoint: effect.isCheckpoint ? effect.handlerState : undefined,
            settles,
            transfer: effect.transfer,
            startGame: effect.startGame,
            launchSubGames: effect.launchSubGames,
            bridgeEvents: effect.bridgeEvents,
        }
    }

    setNodeReady(accessVersion: bigint) {
        for (const n of this.nodes) {
            if (n.status.kind === 'Pending') {
                if (n.status.accessVersion <= accessVersion) {
                    console.debug(`Set node ${n.addr} status to ready`)
                    n.status = { kind: 'Ready' }
                }
            }
        }
    }

    setTimestamp(timestamp: bigint) {
        this.timestamp = timestamp
    }

    findSubGame(gameId: number): GameSpec | undefined {
        return this.subGames.find(g => g.gameId === Number(gameId))
    }

    addSubGame(subGame: GameSpec) {
        const found = this.subGames.find(s => s.gameId === subGame.gameId)
        if (found === undefined) {
            this.subGames.push(subGame)
        }
    }

    async setHandlerState(state: Uint8Array) {
        this.handlerState = state
    }

    get accessVersion(): bigint {
        return this.versions.accessVersion
    }

    get settleVersion(): bigint {
        return this.versions.settleVersion
    }

    /**
     *  Reset the GameContext.
     *
     *  This function is mainly used after reconnection.
     */
    reset() {
        this.randomStates = []
    }

    makeSettlesFromEffect(effect: Effect): Settle[] {
        let settlesMap: Map<bigint, Settle> = new Map<bigint, Settle>()

        for (let withdraw of effect.withdraws) {
            const existing = settlesMap.get(withdraw.playerId)
            if (existing) {
                existing.amount += withdraw.amount
            } else {
                settlesMap.set(
                    withdraw.playerId,
                    new Settle({
                        id: withdraw.playerId,
                        amount: withdraw.amount,
                        change: undefined,
                        eject: false,
                    })
                )
            }
        }

        for (let eject of effect.ejects) {
            const existing = settlesMap.get(eject)
            if (existing) {
                existing.eject = true
            } else {
                settlesMap.set(eject, new Settle({ id: eject, amount: 0n, change: undefined, eject: true }))
            }
        }

        let balancesChange: Map<bigint, bigint> = new Map<bigint, bigint>()
        for (let origBalance of this.balances) {
            balancesChange.set(origBalance.playerId, -origBalance.balance)
        }

        for (let balance of effect.balances) {
            const existing = balancesChange.get(balance.playerId)
            if (existing !== undefined) {
                balancesChange.set(balance.playerId, existing + balance.balance)
            } else {
                balancesChange.set(balance.playerId, balance.balance)
            }
        }

        for (let [playerId, chg] of balancesChange) {
            let change: BalanceChange | undefined = undefined
            if (chg > 0) {
                change = new BalanceChangeAdd({ amount: chg })
            } else if (chg < 0) {
                change = new BalanceChangeAdd({ amount: -chg })
            }

            const existing = settlesMap.get(playerId)
            if (existing) {
                existing.change = change
            } else {
                settlesMap.set(playerId, { id: playerId, amount: 0n, change: change, eject: false })
            }
        }

        return [...settlesMap.values()]
    }
}
