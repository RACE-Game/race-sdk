import { assert } from 'chai';
import {
  GameReg,
  GameState,
  PlayerBalance,
  PlayerDeposit,
  PlayerState,
  RegistryState,
  ServerJoin,
  ServerState,
  Vote,
} from '../src/accounts';
import { REG_ACCOUNT_DATA } from './account_data';
import { EntryTypeCash } from '@race-foundation/sdk-core';
import { address } from '@solana/kit';

const ADDR_1 = address('11111111111111111111111111111111');
const ADDR_2 = address('So11111111111111111111111111111111111111112');
const ADDR_3 = address('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const ADDR_4 = address('C3u1cTJGKP5XzPCvLgQydGWE7aR3x3o5KL8YooFfY4RN');
const ADDR_5 = address('SysvarRent111111111111111111111111111111111');

describe('Test account data serialization', () => {
  it('PlayerState', () => {
    let state = new PlayerState({
      version: 2,
      nick: '16-char_nickname',
      pfpKey: ADDR_1,
      credentials: Uint8Array.of(1, 2, 3),
    });
    let buf = state.serialize();
    let deserialized = PlayerState.deserialize(buf);
    assert.equal(state.version, deserialized.version);
    assert.equal(state.nick, deserialized.nick);
    assert.deepStrictEqual(state.pfpKey, deserialized.pfpKey);
    assert.deepStrictEqual(state.credentials, deserialized.credentials);
  });

  it('PlayerState with no pfp', () => {
    let state = new PlayerState({
      version: 2,
      nick: 'Alice',
      pfpKey: undefined,
      credentials: Uint8Array.of(),
    });
    let buf = state.serialize();
    let deserialized = PlayerState.deserialize(buf);
    assert.deepStrictEqual(state, deserialized);
  });

  it('RegState deserialize', () => {
    let deserialized = RegistryState.deserialize(Buffer.from(REG_ACCOUNT_DATA));
    assert.equal(100, deserialized.size);
    assert.equal(false, deserialized.isPrivate);
    assert.equal(1, deserialized.games.length);
  });

  it('RegistryState', () => {
    let state = new RegistryState({
      isInitialized: true,
      isPrivate: false,
      size: 100,
      ownerKey: ADDR_1,
      games: [
        new GameReg({
          gameKey: ADDR_2,
          title: 'Game A',
          bundleKey: ADDR_3,
          regTime: BigInt(1000),
        }),
        new GameReg({
          gameKey: ADDR_4,
          title: 'Game B',
          bundleKey: ADDR_5,
          regTime: BigInt(2000),
        }),
      ],
    });
    let buf = state.serialize();
    let deserialized = RegistryState.deserialize(buf);
    assert.deepStrictEqual(state, deserialized);
  });

  it('GameState', () => {
    let state = new GameState({
      isInitialized: true,
      version: '0.2.2',
      title: 'test game name',
      bundleKey: ADDR_1,
      stakeKey: ADDR_2,
      ownerKey: ADDR_3,
      tokenKey: ADDR_4,
      transactorKey: ADDR_5,
      accessVersion: BigInt(1),
      settleVersion: BigInt(2),
      maxPlayers: 10,
      playersRegAccount: ADDR_1,
      deposits: [
        new PlayerDeposit({
          key: ADDR_2,
          amount: BigInt(100),
          accessVersion: BigInt(1),
          settleVersion: BigInt(2),
          status: 0,
        }),
      ],
      servers: [
        new ServerJoin({
          key: ADDR_3,
          endpoint: 'http://foo.bar',
          accessVersion: BigInt(2),
        }),
      ],
      dataLen: 10,
      data: Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
      votes: [
        new Vote({
          voterKey: ADDR_4,
          voteeKey: ADDR_5,
          voteType: 0,
        }),
      ],
      unlockTime: undefined,
      entryType: new EntryTypeCash({
        minDeposit: BigInt(100),
        maxDeposit: BigInt(100),
      }),
      recipientAddr: ADDR_2,
      checkpoint: Uint8Array.of(1, 2, 3, 4),
      entryLock: 0,
      bonuses: [],
      balances: [
        new PlayerBalance({
          playerId: BigInt(1),
          balance: BigInt(100),
        }),
      ],
    });
    let buf = state.serialize();
    let deserialized = GameState.deserialize(buf);
    assert.deepStrictEqual(state, deserialized);
  });

  it('ServerState', () => {
    let state = new ServerState({
      isInitialized: true,
      key: ADDR_1,
      ownerKey: ADDR_2,
      endpoint: 'http://foo.bar',
      credentials: Uint8Array.of(1, 2, 3),
    });
    let buf = state.serialize();
    let deserialized = ServerState.deserialize(buf);
    assert.deepStrictEqual(state, deserialized);
  });
});
