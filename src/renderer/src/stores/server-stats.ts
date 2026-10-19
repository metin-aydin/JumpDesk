import { create } from 'zustand'

export interface DiskUsage {
  mount: string
  /** Bayt. */
  size: number
  used: number
}

/** Bir işlemin kullanımı: CPU listesinde toplam CPU içindeki pay (%), bellek listesinde bayt. */
export interface ProcessUsage {
  pid: number
  name: string
  value: number
}

/** Bir sunucunun son durumu (kabuk entegrasyonunun M iletilerinden). */
export interface ServerStats {
  /** CPU kullanımı (%); iki örnek gelene kadar null. */
  cpu: number | null
  /** Son CPU değerleri (eskiden yeniye). */
  cpuHistory: number[]
  /** Son bellek kullanım oranları (%; eskiden yeniye). */
  memHistory: number[]
  /** Çekirdek başına CPU kullanımı (%; `cpu0`, `cpu1`… sırasıyla); iki örnek gelene kadar boş. */
  coreUsage: number[]
  /** Çekirdek başına son değerler (eskiden yeniye). */
  coreHistory: number[][]
  /** Son aralıkta en çok CPU harcayan işlemler (CPU harcamayanlar dışarıda). */
  topCpu: ProcessUsage[]
  /** En çok bellek (RSS) tutan işlemler. */
  topMem: ProcessUsage[]
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
  /** Bellek sayfası boyutu (bayt). */
  pageSize: number
  /** Son örneğin geldiği an (ms). */
  updatedAt: number
}

export interface CpuCounters {
  total: number
  idle: number
}

/** Bir örnekteki CPU sayaçları: toplam ve çekirdek başına. */
export interface CpuSnapshot {
  all: CpuCounters | null
  cores: CpuCounters[] | null
}

/** Kabuğun yaydığı ham örnek (`anahtar değer…` satırları). */
export interface RawSample {
  cpu: CpuCounters | null
  /** Çekirdek başına sayaçlar (`cpuN` satırları, N sırasıyla). */
  coreCpu: CpuCounters[] | null
  mem: Record<string, number>
  load: [number, number, number] | null
  uptimeSec: number | null
  cores: number | null
  os: string | null
  /** Yalnız disk bilgisi taşıyan örneklerde dolu (her örnekte gelmez). */
  disks: DiskUsage[] | null
  /** Önceki örnekten bu yana en çok CPU tiki harcayan işlemler (ilk örnekte gelmez). */
  procCpu: ProcessUsage[] | null
  /** En çok bellek tutan işlemler (sayfa). */
  procMem: ProcessUsage[] | null
  /** Bellek sayfası boyutu (bayt). */
  pageSize: number | null
}

/** Ölçüm döngüsünün sayfa boyutu gelmeden önce varsaydığı değer. */
const DEFAULT_PAGE_SIZE = 4096

const HISTORY = 40

/** `/proc/stat` CPU satırının sayaçları: user nice system idle iowait irq softirq steal (guest alanları user/nice içinde). */
function cpuCounters(nums: number[]): CpuCounters | null {
  const [user, nice, system, idle, iowait = 0, irq = 0, softirq = 0, steal = 0] = nums
  if (![user, nice, system, idle].every(Number.isFinite)) return null
  const idleAll = idle + iowait
  return { total: user + nice + system + idleAll + irq + softirq + steal, idle: idleAll }
}

/** İki sayaç arasındaki kullanım (%); süre geçmediyse null. */
function usageBetween(current: CpuCounters, previous: CpuCounters): number | null {
  const total = current.total - previous.total
  const idle = current.idle - previous.idle
  return total > 0 ? Math.min(100, Math.max(0, ((total - idle) / total) * 100)) : null
}

/** M iletisinin içeriğini ayrıştırır; tanınmayan satırlar atlanır. */
export function parseSample(text: string): RawSample {
  const sample: RawSample = {
    cpu: null,
    coreCpu: null,
    mem: {},
    load: null,
    uptimeSec: null,
    cores: null,
    os: null,
    disks: null,
    procCpu: null,
    procMem: null,
    pageSize: null
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const space = trimmed.indexOf(' ')
    const key = space < 0 ? trimmed : trimmed.slice(0, space)
    const rest = space < 0 ? '' : trimmed.slice(space + 1).trim()
    const nums = rest.split(/\s+/).map(Number)
    const core = /^cpu(\d+)$/.exec(key)
    if (core) {
      const counters = cpuCounters(nums)
      if (counters) (sample.coreCpu ??= [])[Number(core[1])] = counters
      continue
    }
    switch (key) {
      case 'cpu':
        sample.cpu = cpuCounters(nums)
        break
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
      case 'pg':
        if (Number.isFinite(nums[0]) && nums[0] > 0) sample.pageSize = nums[0]
        break
      case 'pc':
      case 'pm': {
        // <tik ya da sayfa> <pid> <işlem adı>
        const parts = rest.split(/\s+/)
        const value = Number(parts[0])
        const pid = Number(parts[1])
        const name = parts.slice(2).join(' ')
        if (!Number.isFinite(value) || !Number.isFinite(pid) || !name) break
        const list = key === 'pc' ? (sample.procCpu ??= []) : (sample.procMem ??= [])
        list.push({ pid, name, value })
        break
      }
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

/** Çekirdek başına kullanım; çekirdek sayısı değişmişse ya da önceki sayaç yoksa boş. */
function coreUsageBetween(current: CpuCounters[] | null, previous: CpuCounters[] | null): number[] {
  if (!current || !previous || current.length !== previous.length) return []
  const usage: number[] = []
  for (let i = 0; i < current.length; i++) {
    const value = current[i] && previous[i] ? usageBetween(current[i], previous[i]) : null
    if (value === null) return []
    usage.push(value)
  }
  return usage
}

/** Ham örneği önceki durum ve önceki CPU sayaçlarıyla birleştirir. */
export function applySample(
  previous: ServerStats | null,
  previousCpu: CpuSnapshot | null,
  raw: RawSample,
  now: number
): ServerStats {
  let cpu: number | null = previous?.cpu ?? null
  if (raw.cpu && previousCpu?.all) cpu = usageBetween(raw.cpu, previousCpu.all) ?? cpu
  // İşlem tikleri /proc/stat ile aynı birimdedir; pay, aynı aralıktaki toplam CPU tikine oranlanır.
  const cpuTicks = raw.cpu && previousCpu?.all ? raw.cpu.total - previousCpu.all.total : 0
  const pageSize = raw.pageSize ?? previous?.pageSize ?? DEFAULT_PAGE_SIZE
  const coreUsage = coreUsageBetween(raw.coreCpu, previousCpu?.cores ?? null)
  const previousCores = previous?.coreHistory ?? []
  const coreHistory =
    coreUsage.length === 0
      ? previousCores
      : coreUsage.map((value, i) =>
          [...(previousCores.length === coreUsage.length ? previousCores[i] : []), value].slice(
            -HISTORY
          )
        )
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
      cpu !== null && raw.cpu && previousCpu?.all
        ? [...(previous?.cpuHistory ?? []), cpu].slice(-HISTORY)
        : (previous?.cpuHistory ?? []),
    memHistory:
      memTotal > 0 && available !== undefined
        ? [...(previous?.memHistory ?? []), (memUsed / memTotal) * 100].slice(-HISTORY)
        : (previous?.memHistory ?? []),
    coreUsage: coreUsage.length > 0 ? coreUsage : (previous?.coreUsage ?? []),
    coreHistory,
    topCpu:
      raw.procCpu && cpuTicks > 0
        ? raw.procCpu
            .filter((p) => p.value > 0)
            .map((p) => ({ ...p, value: Math.min(100, (p.value / cpuTicks) * 100) }))
        : (previous?.topCpu ?? []),
    topMem: raw.procMem
      ? raw.procMem.map((p) => ({ ...p, value: p.value * pageSize }))
      : (previous?.topMem ?? []),
    pageSize,
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
const lastCpu = new Map<string, CpuSnapshot>()

export function recordStats(tabId: string, payload: string): void {
  const raw = parseSample(payload)
  const previous = useServerStats.getState().byTab[tabId] ?? null
  const next = applySample(previous, lastCpu.get(tabId) ?? null, raw, Date.now())
  if (raw.cpu) lastCpu.set(tabId, { all: raw.cpu, cores: raw.coreCpu })
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

/** En büyük disk (şeritte gösterilen). */
export function largestDisk(disks: DiskUsage[]): DiskUsage | null {
  let best: DiskUsage | null = null
  for (const d of disks) if (!best || d.size > best.size) best = d
  return best
}
