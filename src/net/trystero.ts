// Trystero-backed transport: WebRTC mesh with signaling over public nostr
// relays. No accounts, no servers — TURN fallback covers restrictive NATs.
// Same approach (and free infrastructure) as the sibling Ludo project.

import { joinRoom, selfId } from 'trystero/nostr'
import type { MessageHandler, MsgKind, Transport } from './transport'

const APP_ID = 'ag-snakes-ladders-v1'

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    // Open Relay Project free TURN (metered.ca) — public shared credentials.
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
}

const KINDS: MsgKind[] = ['hello', 'snap', 'intent', 'deny', 'fx', 'bye']

type TrysteroRoom = ReturnType<typeof joinRoom>

export function makeTrysteroTransport(): Transport {
  let room: TrysteroRoom | null = null
  const msgHandlers: MessageHandler[] = []
  const joinHandlers: ((p: string) => void)[] = []
  const leaveHandlers: ((p: string) => void)[] = []
  let senders = new Map<MsgKind, (data: unknown, to?: string) => void>()

  return {
    selfId,
    async join(code: string) {
      room = joinRoom({ appId: APP_ID, rtcConfig: RTC_CONFIG, relayRedundancy: 4 }, 'r' + code)
      senders = new Map()
      for (const kind of KINDS) {
        const [send, recv] = room.makeAction(kind)
        senders.set(kind, (data, to) => send(data as never, to))
        recv((data, peer) => msgHandlers.forEach((cb) => cb(kind, data, peer)))
      }
      room.onPeerJoin((peer) => joinHandlers.forEach((cb) => cb(peer)))
      room.onPeerLeave((peer) => leaveHandlers.forEach((cb) => cb(peer)))
    },
    leave() {
      void room?.leave()
      room = null
    },
    send(kind, data, to) {
      senders.get(kind)?.(data, to)
    },
    onMessage(cb) {
      msgHandlers.push(cb)
    },
    onPeerJoin(cb) {
      joinHandlers.push(cb)
    },
    onPeerLeave(cb) {
      leaveHandlers.push(cb)
    },
  }
}
