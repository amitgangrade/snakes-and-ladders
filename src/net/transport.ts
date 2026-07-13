// Minimal message transport interface — implemented by Trystero (real
// internet play) and BroadcastChannel (same-browser testing via ?net=bc).

export type MsgKind = 'hello' | 'snap' | 'intent' | 'deny' | 'fx' | 'bye'

export type MessageHandler = (kind: MsgKind, data: unknown, from: string) => void

export interface Transport {
  selfId: string
  join(code: string): Promise<void>
  leave(): void
  send(kind: MsgKind, data: unknown, to?: string): void
  onMessage(cb: MessageHandler): void
  onPeerJoin(cb: (peer: string) => void): void
  onPeerLeave(cb: (peer: string) => void): void
}
