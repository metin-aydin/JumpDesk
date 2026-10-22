import type { IDisposable, Terminal } from '@xterm/xterm'

/**
 * Kabuk entegrasyonu: bağlantıdan sonra uzak bash/zsh'a bir kez kurulan küçük betik, her istemde görünmez
 * OSC dizileri (`ESC ] 6973 ; <tür> ; <base64> BEL`) yayar. Türler:
 *   C = çalışma dizini, L = dizindeki girdiler (`ls -1Ap`), X = son komut (`history 1`, numarasıyla),
 *   H = geçmiş (kurulumda bir kez), I = sunucunun IP'leri, K = komut adları, B = istem sonu (girdi başlangıcı),
 *   M = sunucu durumu (arka plandaki ölçüm döngüsünden; bkz. STATS_SCRIPT).
 * Küçük harfli h, k ve m; H, K ve M'nin gzip ile sıkıştırılmış hâlidir (büyük ya da sık gönderilen veri).
 */
export const OSC_ID = 6973
/** Entegrasyon işlevlerinin ön eki; bunu içeren komutlar geçmişe ve önerilere alınmaz. */
export const SETUP_MARKER = '__jd_'

const SCRIPT = String.raw`__jd_b64(){ base64 2>/dev/null|tr -d '\n\r';}
__jd_osc(){ printf '\033]6973;%s;%s\007' "$1" "$2";}
__jd_ip(){ { hostname -I 2>/dev/null||ip -4 -o addr show scope global 2>/dev/null|awk '{print $4}'|cut -d/ -f1;}|tr ' ' '\n'|grep -v '^$'|head -n 4|tr '\n' ' ';}
__jd_last1(){ if [ -n "$ZSH_VERSION" ];then fc -l -1 2>/dev/null;else HISTTIMEFORMAT= history 1;fi;}
__jd_prompt(){ local s=$?;__jd_osc C "$(printf '%s' "$PWD"|__jd_b64)";__jd_osc L "$(ls -1Ap 2>/dev/null|head -n 500|__jd_b64)";local h;h=$(__jd_last1);if [ -n "$h" ]&&[ "$h" != "$__jd_last" ];then __jd_last=$h;__jd_osc X "$(printf '%s' "$h"|__jd_b64)";fi;[ -n "$__jd_sp" ]&&! kill -0 $__jd_sp 2>/dev/null&&__jd_stat_start $__jd_si;return $s;}
if [ -n "$ZSH_VERSION" ];then precmd_functions+=(__jd_prompt);PROMPT="$PROMPT%{$(printf '\033]6973;B;\007')%}"
__jd_hist(){ fc -ln 1 2>/dev/null|tail -n 1000;};__jd_cmds(){ print -rl -- ${'$'}{(k)commands} 2>/dev/null|sort -u;}
else PROMPT_COMMAND="__jd_prompt${'$'}{PROMPT_COMMAND:+;$PROMPT_COMMAND}"
case "$PS1" in *'\['*|*$'\033'*|*'\e'*);;*)PS1="\[\e[1;32m\]$PS1\[\e[0m\]";;esac
PS1="$PS1\[$(printf '\033]6973;B;\007')\]"
__jd_hist(){ HISTTIMEFORMAT= history|tail -n 1000|sed 's/^ *[0-9]* *//';};__jd_cmds(){ compgen -c 2>/dev/null|sort -u;}
alias ls >/dev/null 2>&1||alias ls='ls --color=auto';alias grep >/dev/null 2>&1||alias grep='grep --color=auto';fi
__jd_init(){ __jd_osc I "$(__jd_ip|__jd_b64)";__jd_osc h "$(__jd_hist|gzip -c|__jd_b64)";[ "$1" = 1 ]&&__jd_osc k "$(__jd_cmds|head -n 5000|gzip -c|__jd_b64)";__jd_last=$(__jd_last1);[ "$2" -gt 0 ] 2>/dev/null&&__jd_stat_start "$2";return 0;}`

/**
 * Sunucu durumu (yalnız Linux, `/proc`): arka planda çalışan döngü (`__jd_sl`) belirli aralıklarla toplam ve çekirdek
 * başına CPU sayaçlarını, belleği, yükü ve açık kalma süresini; ilk örnekte ve her altıncı örnekte çekirdek sayısını,
 * bellek sayfası boyutunu, işletim sistemini ve yerel diskleri (`df -l`) gzip'li m türünde yayar (`__jd_sm`; `__jd_ss`
 * güvenli anı denetler). Her örnekte en çok CPU harcayan (`pc`, önceki örnekten bu yana tik) ve en çok bellek tutan
 * (`pm`, sayfa) beş işlem de gelir (`__jd_pr` tüm işlemlerin sayaçları, `__jd_tp` farkı ve sıralamayı çıkarır).
 * Kurulum komutu tek satırdır ve satır düzenlemesi olmayan kabuklarda 4096 baytı aşmamalı; betik bu yüzden kısa
 * yazılır. Çıktı terminale yazıldığı için tam ekran programlar ve uzak bağlantılar (vim, less, top,
 * ssh…) öndeyken susar; aksi halde programın çıktı dizilerinin arasına girebilir. Döngü işlem tablosuna girmez
 * (alt kabukta başlatılır) ve kabuk kapanınca biter. Kabukla aynı süreç grubunda olduğundan istemde basılan Ctrl+C,
 * Ctrl+\ ve Ctrl+Z ona da gider; döngü ve alt süreçleri bu sinyalleri yok sayar. Döngü yine de durmuşsa
 * (`__jd_stat_stop` dışında) bir sonraki istemde aynı aralıkla yeniden başlatılır.
 */
const STATS_SCRIPT = String.raw`__jd_ss(){ local a b c d pg f g tp r cm;read -r a b c d pg f g tp r </proc/$$/stat 2>/dev/null||return 1;[ "$tp" = "$pg" ]&&return 0;[ "$tp" -gt 0 ] 2>/dev/null||return 1;read -r cm </proc/$tp/comm 2>/dev/null||return 1;case "$cm" in vi*|nvim|nano|emacs|less|more|most|man|*top|mc|tmux|screen|watch|ssh|telnet|mosh*|ncdu|nmtui|whiptail|dialog|fzf|mysql|mariadb|psql|sqlplus|tig|lynx|w3m|*ftp|nload|nethogs) return 1;;esac;}
__jd_sm(){ local l k v r;while read -r k r;do case $k in cpu*) printf '%s %s\n' "$k" "$r";;*) break;;esac;done </proc/stat;while read -r k v r;do case $k in Mem*|Buffers:|Cached:|Swap[TF]*) printf '%s %s\n' "${'$'}{k%:}" "$v";;esac;done </proc/meminfo;read -r l </proc/loadavg;printf 'load %s\n' "$l";read -r l </proc/uptime;printf 'up %s\n' "${'$'}{l%% *}";[ "$1" = 1 ]||return 0;printf 'cores %s\npg %s\nos %s\n' "$(grep -c ^processor /proc/cpuinfo)" "$(getconf PAGESIZE 2>/dev/null)" "$(. /etc/os-release 2>/dev/null;printf %s "$PRETTY_NAME")";df -Pkl 2>/dev/null|awk 'NR>1&&$2>0&&$1!~/tmpfs|overlay|squashfs/&&$6!~/^\/(dev|run|sys|proc|snap)/{m=$6;for(i=7;i<=NF;i++)m=m" "$i;print "disk",$2,$3,m}';}
__jd_pr(){ cat /proc/[0-9]*/stat 2>/dev/null|awk '{c=$0;sub(/^[0-9]+ \(/,"",c);sub(/\) [^)]*$/,"",c);r=$0;sub(/.*\) /,"",r);split(r,f," ");print $1,f[12]+f[13],f[22],c}';}
__jd_tp(){ local t;t=$({ printf '%s\n' "$1";echo --;printf '%s\n' "$2";}|awk '$0=="--"{s=1;next}!s{o[$1]=$2;next}{c=$0;sub(/^[^ ]+ [^ ]+ [^ ]+ /,"",c);print(($1 in o)?$2-o[$1]:$2),$3,$1,c}');[ -n "$1" ]&&printf '%s\n' "$t"|sort -rn|head -n 5|sed 's/^\([0-9-]*\) [0-9]* /pc \1 /';printf '%s\n' "$t"|sort -k2,2rn|head -n 5|sed 's/^[0-9-]* /pm /';}
__jd_sl(){ local n=0 p c;while kill -0 $$ 2>/dev/null;do if __jd_ss;then c=$(__jd_pr);__jd_osc m "$({ __jd_sm $((n%6==0?1:0));__jd_tp "$p" "$c";}|gzip -c|__jd_b64)";p=$c;n=$((n+1));fi;[ $n = 1 ]&&sleep 1||sleep $1;done;}
__jd_stat_start(){ [ -r /proc/stat ]||return 0;[ -n "$__jd_sp" ]&&kill -0 $__jd_sp 2>/dev/null&&return 0;__jd_si=${'$'}{1:-5};__jd_sp=$( (trap '' INT QUIT TSTP;__jd_sl $__jd_si </dev/null >/dev/tty 2>/dev/null & echo $!) );}
__jd_stat_stop(){ [ -n "$__jd_sp" ]&&kill $__jd_sp 2>/dev/null;__jd_sp=;}`

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

async function gzipBase64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

async function gunzipBase64(b64: string): Promise<string> {
  try {
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
    return await new Response(stream).text()
  } catch {
    return ''
  }
}

let packedScript: Promise<string> | null = null

/**
 * Kurulum komutu: betik gzip ile sıkıştırılıp tek satırda gönderilir (satır kısa kalır; satır düzenlemesi olmayan
 * kabuklarda 4096 bayt sınırı vardır, yankı da JumpServer üzerinden daha az veri taşır). Başındaki boşluk,
 * HISTCONTROL=ignorespace olan kabuklarda satırın geçmişe yazılmasını önler. `commandNames` false ise komut adları
 * istenmez (önbellekte var); `statsIntervalSec` verilirse sunucu durumu döngüsü başlatılır.
 */
export async function buildSetupCommand(
  options: { statsIntervalSec?: number; commandNames?: boolean } = {}
): Promise<string> {
  packedScript ??= gzipBase64(`${SCRIPT}\n${STATS_SCRIPT}\n`)
  const packed = await packedScript
  const names = options.commandNames === false ? 0 : 1
  return ` eval "$(printf %s ${packed} | base64 -d | gzip -dc)";__jd_init ${names} ${options.statsIntervalSec ?? 0}\r`
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
  // Sıkıştırılmış durum örnekleri sırayla açılır; geç açılan bir örnek yenisinin üzerine yazmaz.
  let stats = Promise.resolve()
  return term.parser.registerOscHandler(OSC_ID, (data) => {
    const sep = data.indexOf(';')
    const type = sep < 0 ? data : data.slice(0, sep)
    const packed = sep < 0 ? '' : data.slice(sep + 1)
    const payload = type === 'h' || type === 'k' || type === 'm' ? '' : fromBase64(packed)
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
      case 'h':
        void gunzipBase64(packed).then((text) =>
          h.onHistory(lines(text).filter((c) => !isIntegrationNoise(c)))
        )
        break
      case 'k':
        void gunzipBase64(packed).then((text) => h.onCommandNames(lines(text)))
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
      case 'm':
        stats = stats.then(() => gunzipBase64(packed)).then((text) => h.onStats?.(text))
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
 * Kurulum satırının ekranda yankılanmasını engeller: kurulum gönderildikten sonra gelen çıktı, ilk entegrasyon OSC'si
 * görülene kadar tutulur ve öncesi (yankı) atılır. Ardından gelen görünmez OSC dizileri yazılır; eski istem satırı
 * ancak görünür ilk çıktıdan (yeni istem) hemen önce silinir, böylece kurulum sürerken istem ekranda kalır. Süre
 * içinde OSC gelmezse (ör. bash yok) tutulan çıktı olduğu gibi gösterilir.
 */
export class SetupEchoGate {
  private pending: Uint8Array[] = []
  private active = false
  private timer: ReturnType<typeof setTimeout> | null = null
  /** Entegrasyon kuruldu, eski istem satırı görünür ilk çıktıdan önce silinecek. */
  private erasing = false
  /** Bir OSC dizisinin içinde (dizi parçalar arasında bölünebilir); `oscEsc` sonlandırıcının (ESC \) ilk baytı. */
  private inOsc = false
  private oscEsc = false

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
    if (this.erasing) return this.passUntilVisible(bytes)
    if (!this.active) return false
    this.pending.push(bytes)
    const all = this.concat()
    const at = indexOfPrefix(all)
    if (at < 0) return true
    this.finish()
    this.pending = []
    this.erasing = true
    this.onSettled(true)
    return this.passUntilVisible(all.subarray(at))
  }

  /** OSC dizilerini olduğu gibi yazar; görünür ilk bayttan önce eski istem satırını siler ve kapıyı kapatır. */
  private passUntilVisible(bytes: Uint8Array): boolean {
    let i = 0
    while (i < bytes.length) {
      const b = bytes[i]
      if (this.inOsc) {
        i++
        if (this.oscEsc) {
          this.oscEsc = false
          if (b === 0x5c) this.inOsc = false
        } else if (b === 0x07) this.inOsc = false
        else if (b === 0x1b) this.oscEsc = true
        continue
      }
      if (b === 0x1b && bytes[i + 1] === 0x5d) {
        this.inOsc = true
        i += 2
        continue
      }
      if (i > 0) this.write(bytes.subarray(0, i))
      this.write('\r\x1b[2K')
      this.write(bytes.subarray(i))
      this.erasing = false
      return true
    }
    this.write(bytes)
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
    this.erasing = false
  }
}
