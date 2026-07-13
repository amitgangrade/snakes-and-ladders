// BroadcastChannel transport: multiplayer between tabs of the same browser,
// zero network. Open http://localhost:5173/?net=bc in two tabs to test the
// full online flow offline. Presence is emulated with heartbeats.

import type { MessageHandler, MsgKind, Transport } from './transport'

const HEARTBEAT_MS = 1200
const TIMEOUT_MS = 4000

interface Packet {
  t: 'hb' | 'bye' | 'msg'
  from: string
  kind?: MsgKind
  data?: unknown
  to?: string
}

export function makeBcTransport(): Transport {
  const selfId = 'bc-' + Math.random().toString(36).slice(2, 10)
  let chan: BroadcastChannel | null = null
  let hbTimer: ReturnType<typeof setInterval> | null = null
  const peers = new Map<string, number>() // id -> lastSeen
  const msgHandlers: MessageHandler[] = []
  const joinHandlers: ((p: string) => void)[] = []
  const leaveHandlers: ((p: string) => void)[] = []

  function seen(id: string) {
    if (id === selfId) return
    if (!peers.has(id)) {
      peers.set(id, Date.now())
      joinHandlers.forEach((cb) => cb(id))
    } else {
      peers.set(id, Date.now())
    }
  }

  function drop(id: string) {
    if (peers.delete(id)) leaveHandlers.forEach((cb) => cb(id))
  }

  function post(p: Packet) {
    chan?.postMessage(p)
  }

  return {
    selfId,
    async join(code: string) {
      chan = new BroadcastChannel('snl-room-' + code)
      chan.onmessage = (ev: MessageEvent<Packet>) => {
        const p = ev.data
        if (!p || p.from === selfId) return
        if (p.t === 'bye') return drop(p.from)
        seen(p.from)
        if (p.t === 'msg' && p.kind && (!p.to || p.to === selfId)) {
          msgHandlers.forEach((cb) => cb(p.kind!, p.data, p.from))
        }
      }
      post({ t: 'hb', from: selfId })
      hbTimer = setInterval(() => {
        post({ t: 'hb', from: selfId })
        const now = Date.now()
        for (const [id, last] of peers) if (now - last > TIMEOUT_MS) drop(id)
      }, HEARTBEAT_MS)
    },
    leave() {
      post({ t: 'bye', from: selfId })
      if (hbTimer) clearInterval(hbTimer)
      hbTimer = null
      chan?.close()
      chan = null
      peers.clear()
    },
    send(kind, data, to) {
      post({ t: 'msg', from: selfId, kind, data, to })
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
