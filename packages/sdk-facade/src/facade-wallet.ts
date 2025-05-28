import { makeid } from './utils'

export class FacadeWallet {
    #addr: string

    constructor()
    constructor(addr: string)
    constructor(addr?: string) {
        if (addr === undefined) {
            this.#addr = makeid(16)
        } else {
            this.#addr = addr
        }
    }

    get isConnected() {
        return true
    }

    get walletAddr() {
        return this.#addr
    }
}
