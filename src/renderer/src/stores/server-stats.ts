import { create } from 'zustand'

export interface DiskUsage {
  mount: string
  /** Bayt. */
  size: number
  used: number
}

/** Bir sunucunun son durumu (kabuk entegrasyonunun M iletilerinden). */
export interface ServerStats {
  /** CPU kullanımı (%); iki örnek gelene kadar null. */
  cpu: number | null
  /** Son CPU değerleri (eskiden yeniye). */
  cpuHistory: number[]
  /** Son bellek kullanım oranları (%; eskiden yeniye). */
  memHistory: number[]
  /** Bayt. */
  memTotal: number
  memUsed: number
  swapTotal: number
  swapUsed: number
  /** 1, 5 ve 15 dakikalık yük ortalaması. */
  load: [number, number, number] | null
  uptimeSec: number | null
  cores: number | null
  os: string | null
  disks: DiskUsage[]
  /** Son örneğin geldiği an (ms). */
  updatedAt: number
}

interface CpuCounters {
  total: number
  idle: number
}

/** Kabuğun yaydığı ham örnek (`anahtar değer…` satırları). */
export interface RawSample {
  cpu: CpuCounters | null
  mem: Record<string, number>
  load: [number, number, number] | null
  uptimeSec: number | null
  cores: number | null
  os: string | null
  /** Yalnız disk bilgisi taşıyan örneklerde dolu (her örnekte gelmez). */
  disks: DiskUsage[] | null
}

const HISTORY = 40

/** M iletisinin içeriğini ayrıştırır; tanınmayan satırlar atlanır. */
export function parseSample(text: string): RawSample {
  const sample: RawSample = {
    cpu: null,
    mem: {},
    load: null,
    uptimeSec: null,
    cores: null,
    os: null,
    disks: null
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const space = trimmed.indexOf(' ')
    const key = space < 0 ? trimmed : trimmed.slice(0, space)
    const rest = space < 0 ? '' : trimmed.slice(space + 1).trim()
    const nums = rest.split(/\s+/).map(Number)
    switch (key) {
      case 'cpu': {
        // user nice system idle iowait irq softirq steal (guest alanları user/nice içinde sayılır)
        const [user, nice, system, idle, iowait = 0, irq = 0, softirq = 0, steal = 0] = nums
        if ([user, nice, system, idle].every(Number.isFinite)) {
          const idleAll = idle + iowait
          sample.cpu = {
            total: user + nice + system + idleAll + irq + softirq + steal,
            idle: idleAll
          }
        }
        break
      }
      case 'MemTotal':
      case 'MemAvailable':
      case 'MemFree':
      case 'Buffers':
      case 'Cached':
      case 'SwapTotal':
      case 'SwapFree':
        if (Number.isFinite(nums[0])) sample.mem[key] = nums[0] * 1024
        break
      case 'load':
        if (nums.slice(0, 3).every(Number.isFinite)) sample.load = [nums[0], nums[1], nums[2]]
        break
      case 'up':
        if (Number.isFinite(nums[0])) sample.uptimeSec = nums[0]
        break
      case 'cores':
        if (Number.isFinite(nums[0]) && nums[0] > 0) sample.cores = nums[0]
        break
      case 'os':
        if (rest) sample.os = rest
        break
      case 'disk': {
        const parts = rest.split(/\s+/)
        const size = Number(parts[0]) * 1024
        const used = Number(parts[1]) * 1024
        const mount = parts.slice(2).join(' ')
        if (Number.isFinite(size) && Number.isFinite(used) && size > 0 && mount) {
          sample.disks ??= []
          sample.disks.push({ mount, size, used })
        }
        break
      }
      default:
        break
    }
  }
  return sample
}

/** Ham örneği önceki durum ve önceki CPU sayaçlarıyla birleştirir. */
export function applySample(
  previous: ServerStats | null,
  previousCpu: CpuCounters | null,
  raw: RawSample,
  now: number
): ServerStats {
  let cpu: number | null = previous?.cpu ?? null
  if (raw.cpu && previousCpu) {
    const total = raw.cpu.total - previousCpu.total
    const idle = raw.cpu.idle - previousCpu.idle
    if (total > 0) cpu = Math.min(100, Math.max(0, ((total - idle) / total) * 100))
  }
  const mem = raw.mem
  const memTotal = mem['MemTotal'] ?? previous?.memTotal ?? 0
  const available =
    mem['MemAvailable'] ??
    (mem['MemFree'] !== undefined
      ? mem['MemFree'] + (mem['Buffers'] ?? 0) + (mem['Cached'] ?? 0)
      : undefined)
  const swapTotal = mem['SwapTotal'] ?? previous?.swapTotal ?? 0
  const memUsed =
    available !== undefined ? Math.max(0, memTotal - available) : (previous?.memUsed ?? 0)
  return {
    cpu,
    cpuHistory:
      cpu !== null && raw.cpu && previousCpu
        ? [...(previous?.cpuHistory ?? []), cpu].slice(-HISTORY)
        : (previous?.cpuHistory ?? []),
    memHistory:
      memTotal > 0 && available !== undefined
        ? [...(previous?.memHistory ?? []), (memUsed / memTotal) * 100].slice(-HISTORY)
        : (previous?.memHistory ?? []),
    memTotal,
    memUsed,
    swapTotal,
    swapUsed:
      mem['SwapFree'] !== undefined
        ? Math.max(0, swapTotal - mem['SwapFree'])
        : (previous?.swapUsed ?? 0),
    load: raw.load ?? previous?.load ?? null,
    uptimeSec: raw.uptimeSec ?? previous?.uptimeSec ?? null,
    cores: raw.cores ?? previous?.cores ?? null,
    os: raw.os ?? previous?.os ?? null,
    disks: raw.disks ?? previous?.disks ?? [],
    updatedAt: now
  }
}

interface ServerStatsStore {
  byTab: Record<string, ServerStats>
  /** Ölçüm döngüsü başlatılan (kurulumda ya da elle) oturumlar. */
  requested: Record<string, boolean>
}

export const useServerStats = create<ServerStatsStore>(() => ({ byTab: {}, requested: {} }))

/** Son CPU sayaçları; her örnekte değiştiği için çizim durumunun dışında tutulur. */
const lastCpu = new Map<string, CpuCounters>()

export function recordStats(tabId: string, payload: string): void {
  const raw = parseSample(payload)
  const previous = useServerStats.getState().byTab[tabId] ?? null
  const next = applySample(previous, lastCpu.get(tabId) ?? null, raw, Date.now())
  if (raw.cpu) lastCpu.set(tabId, raw.cpu)
  useServerStats.setState((s) => ({
    byTab: { ...s.byTab, [tabId]: next },
    requested: s.requested[tabId] ? s.requested : { ...s.requested, [tabId]: true }
  }))
}

export function markStatsRequested(tabId: string): void {
  useServerStats.setState((s) => ({ requested: { ...s.requested, [tabId]: true } }))
}

/** Oturum kapanınca ya da yeniden bağlanınca durum silinir. */
export function clearStats(tabId: string): void {
  lastCpu.delete(tabId)
  useServerStats.setState((s) => {
    if (!(tabId in s.byTab) && !(tabId in s.requested)) return s
    const byTab = { ...s.byTab }
    const requested = { ...s.requested }
    delete byTab[tabId]
    delete requested[tabId]
    return { byTab, requested }
  })
}

/** Kullanım oranına göre eşik: %80 uyarı, %90 kritik. */
export function usageLevel(percent: number | null): 'ok' | 'warn' | 'critical' {
  if (percent === null) return 'ok'
  if (percent >= 90) return 'critical'
  if (percent >= 80) return 'warn'
  return 'ok'
}

/** En dolu disk (şeritte gösterilen). */
export function fullestDisk(disks: DiskUsage[]): DiskUsage | null {
  let best: DiskUsage | null = null
  for (const d of disks) if (!best || d.used / d.size > best.used / best.size) best = d
  return best
}
