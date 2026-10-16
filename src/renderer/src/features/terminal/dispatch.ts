import { broadcastPeers } from '@/stores/workspace'
import { terminalRegistry } from './registry'

/** Girdiyi kaynak terminale ve yayın açıksa gruptaki diğer terminallere gönderir. */
export function sendInput(originTabId: string, data: string): void {
  terminalRegistry.get(originTabId)?.send(data)
  for (const id of broadcastPeers(originTabId)) terminalRegistry.get(id)?.send(data)
}

/** Komutu kaynak terminalde ve yayın açıksa gruptaki diğer terminallerde çalıştırır. */
export function runCommand(originTabId: string, command: string): void {
  terminalRegistry.get(originTabId)?.run(command)
  for (const id of broadcastPeers(originTabId)) terminalRegistry.get(id)?.run(command)
}
