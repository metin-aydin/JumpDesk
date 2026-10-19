import type { IDisposable, Terminal } from '@xterm/xterm'

/**
 * Kabuk entegrasyonu: bağlantıdan sonra uzak bash/zsh'a bir kez kurulan küçük betik, her istemde görünmez
 * OSC dizileri (`ESC ] 6973 ; <tür> ; <base64> BEL`) yayar. Türler:
 *   C = çalışma dizini, L = dizindeki girdiler (`ls -1Ap`), X = son komut (`history 1`, numarasıyla),
 *   H = geçmiş (kurulumda bir kez), I = sunucunun IP'leri, K = komut adları, B = istem sonu (girdi başlangıcı),
 *   M = sunucu durumu (arka plandaki ölçüm döngüsünden; bkz. STATS_SCRIPT).
 */
export const OSC_ID = 6973
/** Entegrasyon işlevlerinin ön eki; bunu içeren komutlar geçmişe ve önerilere alınmaz. */
export const SETUP_MARKER = '__jd_'

const SCRIPT = String.raw`__jd_b64(){ base64 2>/dev/null|tr -d '\n\r';}
__jd_osc(){ printf '\033]6973;%s;%s\007' "$1" "$2";}
__jd_ip(){ { hostname -I 2>/dev/null||ip -4 -o addr show scope global 2>/dev/null|awk '{print $4}'|cut -d/ -f1;}|tr ' ' '\n'|grep -v '^$'|head -n 4|tr '\n' ' ';}
__jd_last1(){ if [ -n "$ZSH_VERSION" ];then fc -l -1 2>/dev/null;else HISTTIMEFORMAT= history 1;fi;}
__jd_prompt(){ local s=$?;__jd_osc C "$(printf '%s' "$PWD"|__jd_b64)";__jd_osc L "$(ls -1Ap 2>/dev/null|head -n 500|__jd_b64)";local h;h=$(__jd_last1);if [ -n "$h" ]&&[ "$h" != "$__jd_last" ];then __jd_last=$h;__jd_osc X "$(printf '%s' "$h"|__jd_b64)";fi;return $s;}
if [ -n "$ZSH_VERSION" ];then precmd_functions+=(__jd_prompt);PROMPT="$PROMPT%{$(printf '\033]6973;B;\007')%}"
__jd_hist(){ fc -ln 1 2>/dev/null|tail -n 1000;};__jd_cmds(){ print -rl -- ${'$'}{(k)commands} 2>/dev/null|sort -u;}
else PROMPT_COMMAND="__jd_prompt${'$'}{PROMPT_COMMAND:+;$PROMPT_COMMAND}"
case "$PS1" in *'\['*|*$'\033'*|*'\e'*);;*)PS1="\[\e[1;32m\]$PS1\[\e[0m\]";;esac
PS1="$PS1\[$(printf '\033]6973;B;\007')\]"
__jd_hist(){ HISTTIMEFORMAT= history|tail -n 1000|sed 's/^ *[0-9]* *//';};__jd_cmds(){ compgen -c 2>/dev/null|sort -u;}
alias ls >/dev/null 2>&1||alias ls='ls --color=auto';alias grep >/dev/null 2>&1||alias grep='grep --color=auto';fi
__jd_osc I "$(__jd_ip|__jd_b64)";__jd_osc H "$(__jd_hist|__jd_b64)";__jd_osc K "$(__jd_cmds|head -n 5000|__jd_b64)";__jd_last=$(__jd_last1)`

/**
 * Sunucu durumu (yalnız Linux, `/proc`): arka planda çalışan döngü (`__jd_sl`) belirli aralıklarla CPU sayaçlarını,
 * belleği, yükü ve açık kalma süresini; ilk örnekte ve her altıncı örnekte çekirdek sayısını, işletim sistemini ve
 * yerel diskleri (`df -l`) M türünde yayar (`__jd_sm`; `__jd_ss` güvenli anı denetler). Kurulum komutu tek satırdır ve
 * satır düzenlemesi olmayan kabuklarda 4096 baytı aşmamalı; betik bu yüzden kısa yazılır. Çıktı terminale yazıldığı için tam ekran programlar ve uzak bağlantılar (vim, less, top,
 * ssh…) öndeyken susar; aksi halde programın çıktı dizilerinin arasına girebilir. Döngü işlem tablosuna girmez
 * (alt kabukta başlatılır), Ctrl+C'den etkilenmez ve kabuk kapanınca biter.
 */
const STATS_SCRIPT = String.raw`__jd_ss(){ local a b c d pg f g tp r cm;read -r a b c d pg f g tp r </proc/$$/stat 2>/dev/null||return 1;[ "$tp" = "$pg" ]&&return 0;[ "$tp" -gt 0 ] 2>/dev/null||return 1;read -r cm </proc/$tp/comm 2>/dev/null||return 1;case "$cm" in vi*|nvim|nano|emacs|less|more|most|man|*top|mc|tmux|screen|watch|ssh|telnet|mosh*|ncdu|nmtui|whiptail|dialog|fzf|mysql|mariadb|psql|sqlplus|tig|lynx|w3m|*ftp|nload|nethogs) return 1;;esac;}
__jd_sm(){ local l k v r;read -r l </proc/stat;printf 'cpu %s\n' "${'$'}{l#cpu}";while read -r k v r;do case $k in Mem*|Buffers:|Cached:|Swap[TF]*) printf '%s %s\n' "${'$'}{k%:}" "$v";;esac;done </proc/meminfo;read -r l </proc/loadavg;printf 'load %s\n' "$l";read -r l </proc/uptime;printf 'up %s\n' "${'$'}{l%% *}";[ "$1" = 1 ]||return 0;printf 'cores %s\nos %s\n' "$(grep -c ^processor /proc/cpuinfo)" "$(. /etc/os-release 2>/dev/null;printf %s "$PRETTY_NAME")";df -Pkl 2>/dev/null|awk 'NR>1&&$2>0&&$1!~/tmpfs|overlay|squashfs/&&$6!~/^\/(dev|run|sys|proc|snap)/{m=$6;for(i=7;i<=NF;i++)m=m" "$i;print "disk",$2,$3,m}';}
__jd_sl(){ local n=0;while kill -0 $$ 2>/dev/null;do if __jd_ss;then __jd_osc M "$(__jd_sm $((n%6==0?1:0))|__jd_b64)";n=$((n+1));fi;[ $n = 1 ]&&sleep 1||sleep $1;done;}
__jd_stat_start(){ [ -r /proc/stat ]||return 0;[ -n "$__jd_sp" ]&&kill -0 $__jd_sp 2>/dev/null&&return 0;__jd_sp=$( (__jd_sl ${'$'}{1:-5} </dev/null >/dev/tty 2>/dev/null & echo $!) );}
__jd_stat_stop(){ [ -n "$__jd_sp" ]&&kill $__jd_sp 2>/dev/null;__jd_sp=;}`

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function fromBase64(b64: string): string {
  try {
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  } catch {
    return ''
  }
}

/**
 * Başındaki boşluk, HISTCONTROL=ignorespace olan kabuklarda satırın geçmişe yazılmasını önler. `statsIntervalSec`
 * verilirse sunucu durumu döngüsü de başlatılır.
 */
export function buildSetupCommand(options: { statsIntervalSec?: number } = {}): string {
  const start = options.statsIntervalSec ? `\n__jd_stat_start ${options.statsIntervalSec}` : ''
  return ` eval "$(printf %s ${toBase64(`${SCRIPT}\n${STATS_SCRIPT}${start}`)} | base64 -d)"\r`
}

/** Entegrasyonu kurulu bir oturumda sunucu durumu döngüsünü başlatan komut (komut satırına yazılır). */
export function buildStatsStartCommand(intervalSec: number): string {
  return ` __jd_stat_start ${intervalSec}`
}

/** Testler için: kabuk betikleri (kurulumla aynı içerik). */
export const SHELL_SCRIPTS = { integration: SCRIPT, stats: STATS_SCRIPT }

export interface IntegrationHandlers {
  onCwd: (cwd: string) => void
  onListing: (entries: string[]) => void
  onCommand: (num: number | undefined, command: string) => void
  onHistory: (commands: string[]) => void
  onIps: (ips: string[]) => void
  onCommandNames: (names: string[]) => void
  onPromptEnd: (pos: { x: number; y: number }) => void
  /** Sunucu durumu örneği (ham `anahtar değer` satırları). */
  onStats?: (payload: string) => void
}

const lines = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter(Boolean)

export function isIntegrationNoise(command: string): boolean {
  return command.includes(SETUP_MARKER) || command.includes('base64 -d)"')
}

export function attachIntegration(term: Terminal, h: IntegrationHandlers): IDisposable {
  return term.parser.registerOscHandler(OSC_ID, (data) => {
    const sep = data.indexOf(';')
    const type = sep < 0 ? data : data.slice(0, sep)
    const payload = sep < 0 ? '' : fromBase64(data.slice(sep + 1))
    switch (type) {
      case 'B': {
        const buf = term.buffer.active
        h.onPromptEnd({ x: buf.cursorX, y: buf.baseY + buf.cursorY })
        break
      }
      case 'C':
        h.onCwd(payload)
        break
      case 'L':
        h.onListing(lines(payload))
        break
      case 'X': {
        const m = /^\s*(\d+)\*?\s+(.*)$/s.exec(payload.trim())
        const command = (m ? m[2] : payload).trim()
        if (command && !isIntegrationNoise(command))
          h.onCommand(m ? Number(m[1]) : undefined, command)
        break
      }
      case 'H':
        h.onHistory(lines(payload).filter((c) => !isIntegrationNoise(c)))
        break
      case 'I':
        h.onIps(payload.split(/\s+/).filter((ip) => ip && !ip.startsWith('127.')))
        break
      case 'K':
        h.onCommandNames(lines(payload))
        break
      case 'M':
        h.onStats?.(payload)
        break
      default:
        break
    }
    return true
  })
}

const OSC_PREFIX = [0x1b, 0x5d, 0x36, 0x39, 0x37, 0x33, 0x3b]

function indexOfPrefix(bytes: Uint8Array): number {
  outer: for (let i = 0; i <= bytes.length - OSC_PREFIX.length; i++) {
    for (let j = 0; j < OSC_PREFIX.length; j++) if (bytes[i + j] !== OSC_PREFIX[j]) continue outer
    return i
  }
  return -1
}

/**
 * Kurulum satırının ekranda yankılanmasını engeller: kurulum gönderildikten sonra gelen çıktı, ilk
 * entegrasyon OSC'si görülene kadar tutulur; öncesi (yankı) atılır, eski istem satırı silinir ve gerisi yazılır.
 * Süre içinde OSC gelmezse (ör. bash yok) tutulan çıktı olduğu gibi gösterilir.
 */
export class SetupEchoGate {
  private pending: Uint8Array[] = []
  private active = false
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly write: (data: Uint8Array | string) => void,
    private readonly onSettled: (ok: boolean) => void
  ) {}

  start(timeoutMs = 3000): void {
    this.active = true
    this.timer = setTimeout(() => this.release(false), timeoutMs)
  }

  get isActive(): boolean {
    return this.active
  }

  /** `true` dönerse veri tutuldu ya da işlendi; çağıran ayrıca yazmamalı. */
  feed(bytes: Uint8Array): boolean {
    if (!this.active) return false
    this.pending.push(bytes)
    const all = this.concat()
    const at = indexOfPrefix(all)
    if (at < 0) return true
    this.finish()
    this.pending = []
    this.write('\r\x1b[2K')
    this.write(all.subarray(at))
    this.onSettled(true)
    return true
  }

  private concat(): Uint8Array {
    const total = this.pending.reduce((n, b) => n + b.byteLength, 0)
    const out = new Uint8Array(total)
    let offset = 0
    for (const b of this.pending) {
      out.set(b, offset)
      offset += b.byteLength
    }
    return out
  }

  private finish(): void {
    this.active = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private release(ok: boolean): void {
    if (!this.active) return
    const all = this.concat()
    this.finish()
    this.pending = []
    if (all.byteLength) this.write(all)
    this.onSettled(ok)
  }

  dispose(): void {
    this.finish()
    this.pending = []
  }
}
