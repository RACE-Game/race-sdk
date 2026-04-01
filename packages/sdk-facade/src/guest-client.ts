import { makeid } from './utils'

export interface FacadeGuestRegisterRequest {
    nick: string
}

export interface FacadeGuestSessionRequest {
    sessionToken: string
}

export interface FacadeGuestAccountSummary {
    guestId: string
    playerAddr: string
    nick: string
    status: string
}

export interface FacadeGuestProfile {
    addr: string
    nick: string
    pfp?: string
    credentials: number[]
}

export type FacadeGuestBalanceSummary = Record<string, number>

export interface FacadeGuestIdentityResponse {
    guest: FacadeGuestAccountSummary
    profile: FacadeGuestProfile
    balances: FacadeGuestBalanceSummary
    sessionExpiresAt: number
}

export interface FacadeGuestRegisterResponse {
    guest: FacadeGuestAccountSummary
    profile: FacadeGuestProfile
    balances: FacadeGuestBalanceSummary
    sessionToken: string
    expiresAt: number
}

export interface FacadeGuestLogoutResponse {
    ok: boolean
}

interface JsonRpcSuccess<T> {
    jsonrpc: string
    id: string | number
    result: T
}

interface JsonRpcFailure {
    jsonrpc: string
    id: string | number | null
    error: {
        code: number
        message: string
        data?: unknown
    }
}

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcFailure

export class FacadeGuestAuthClient {
    #url: string

    constructor(url: string = 'http://localhost:12002') {
        this.#url = url
    }

    async guestRegister(params: FacadeGuestRegisterRequest): Promise<FacadeGuestRegisterResponse> {
        return this.request('guest_register', [params])
    }

    async guestResumeSession(params: FacadeGuestSessionRequest): Promise<FacadeGuestIdentityResponse> {
        return this.request('guest_resume_session', [params])
    }

    async guestGetMe(params: FacadeGuestSessionRequest): Promise<FacadeGuestIdentityResponse> {
        return this.request('guest_get_me', [params])
    }

    async guestLogout(params: FacadeGuestSessionRequest): Promise<FacadeGuestLogoutResponse> {
        return this.request('guest_logout', [params])
    }

    private async request<T>(method: string, params: unknown[]): Promise<T> {
        const reqData = JSON.stringify({
            jsonrpc: '2.0',
            method,
            id: makeid(16),
            params,
        })

        const resp = await fetch(this.#url, {
            method: 'POST',
            body: reqData,
            headers: {
                'Content-Type': 'application/json',
            },
        })

        if (!resp.ok) {
            throw new Error(`Facade guest RPC ${method} failed with HTTP ${resp.status}`)
        }

        const payload: JsonRpcResponse<T> = await resp.json()
        if ('error' in payload) {
            throw new Error(`Facade guest RPC ${method} failed: ${payload.error.message}`)
        }

        return payload.result
    }
}
