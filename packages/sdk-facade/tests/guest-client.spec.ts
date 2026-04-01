import { assert } from 'chai'
import {
    FacadeGuestAuthClient,
    FacadeGuestIdentityResponse,
    FacadeGuestLogoutResponse,
    FacadeGuestRegisterResponse,
} from '../src/guest-client'

describe('FacadeGuestAuthClient', () => {
    const originalFetch = (global as any).fetch

    afterEach(() => {
        ;(global as any).fetch = originalFetch
    })

    it('wraps guest register -> resume -> get me -> logout', async () => {
        const registerResponse: FacadeGuestRegisterResponse = {
            guest: {
                guestId: 'guest_1',
                playerAddr: 'guest_player_1',
                nick: 'SmokeGuest',
                status: 'active',
            },
            profile: {
                addr: 'guest_player_1',
                nick: 'SmokeGuest',
                pfp: undefined,
                credentials: [1, 2, 3],
            },
            balances: {
                FACADE_GUEST_CHIPS: 1000000,
            },
            sessionToken: 'session-token-1',
            expiresAt: 1770000000000,
        }

        const identityResponse: FacadeGuestIdentityResponse = {
            guest: registerResponse.guest,
            profile: registerResponse.profile,
            balances: registerResponse.balances,
            sessionExpiresAt: registerResponse.expiresAt,
        }

        const logoutResponse: FacadeGuestLogoutResponse = { ok: true }

        const fetchMock = ((global as any).fetch = async (_input: unknown, init?: { body?: unknown }) => {
            const body = JSON.parse(String(init?.body))
            const method = body.method

            if (method === 'guest_register') {
                assert.deepEqual(body.params, [{ nick: 'SmokeGuest' }])
                return {
                    ok: true,
                    json: async () => ({ jsonrpc: '2.0', id: body.id, result: registerResponse }),
                } as any
            }

            if (method === 'guest_resume_session' || method === 'guest_get_me') {
                assert.deepEqual(body.params, [{ sessionToken: 'session-token-1' }])
                return {
                    ok: true,
                    json: async () => ({ jsonrpc: '2.0', id: body.id, result: identityResponse }),
                } as any
            }

            if (method === 'guest_logout') {
                assert.deepEqual(body.params, [{ sessionToken: 'session-token-1' }])
                return {
                    ok: true,
                    json: async () => ({ jsonrpc: '2.0', id: body.id, result: logoutResponse }),
                } as any
            }

            throw new Error(`Unexpected RPC method: ${method}`)
        }) as any

        const client = new FacadeGuestAuthClient('http://localhost:12002')

        const registered = await client.guestRegister({ nick: 'SmokeGuest' })
        const resumed = await client.guestResumeSession({ sessionToken: registered.sessionToken })
        const me = await client.guestGetMe({ sessionToken: registered.sessionToken })
        const loggedOut = await client.guestLogout({ sessionToken: registered.sessionToken })

        assert.equal(typeof fetchMock, 'function')
        assert.equal(registered.guest.guestId, 'guest_1')
        assert.equal(resumed.guest.playerAddr, 'guest_player_1')
        assert.equal(me.balances.FACADE_GUEST_CHIPS, 1000000)
        assert.equal(loggedOut.ok, true)
    })

    it('throws the facade rpc message on guest error', async () => {
        ;(global as any).fetch = (async () => {
            return {
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: '1',
                    error: {
                        code: 1,
                        message: 'session-revoked',
                    },
                }),
            } as any
        }) as any

        const client = new FacadeGuestAuthClient('http://localhost:12002')

        try {
            await client.guestResumeSession({ sessionToken: 'bad-token' })
            assert.fail('Expected guestResumeSession to throw')
        } catch (error) {
            assert.include(String(error), 'session-revoked')
        }
    })
})
