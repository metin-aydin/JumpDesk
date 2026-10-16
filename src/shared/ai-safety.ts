import type { AiRisk } from './ai'

/**
 * Yapay zekanın önerdiği komutların istemci tarafı denetimi. Model ne derse desin bu kurallar uygulanır: komut tek
 * satır olmalı ve kontrol karakteri içermemeli (satır sonu komutu kendiliğinden çalıştırır), bilinen yıkıcı ya da
 * güvenliği zayıflatan kalıplar "riskli" sayılır.
 */

const MAX_COMMAND_LENGTH = 600
/** Kontrol karakterleri ve satır ayırıcılar (satır sonu, terminale gönderilince komutu çalıştırır). */
// eslint-disable-next-line no-control-regex -- kontrol karakterleri bilerek aranır
const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]')

/** Sunucuyu kullanılmaz hale getiren, veri silen, dışarı veri sızdıran ya da güvenliği kapatan kalıplar. */
const DANGEROUS: RegExp[] = [
  /\brm\s+(?:-[a-z]*\s+)*-[a-z]*[rf][a-z]*\s+(?:-[a-z]*\s+)*(?:\/|\/\*|~|\*|\.\.?\/?|\/(?:etc|usr|var|boot|bin|sbin|lib|lib64|home|root|opt|srv)\b\/?)(?:\s|$)/i,
  /\brm\s+.*--no-preserve-root/i,
  /\b(?:mkfs(?:\.\w+)?|mke2fs|wipefs|fdisk|sfdisk|parted|shred|blkdiscard)\b/i,
  /\bdd\b[^|;&]*\bof=\/dev\//i,
  />\s*\/dev\/(?:sd|hd|vd|xvd|nvme|mmcblk|dm-)/i,
  /:\s*\(\s*\)\s*\{[^}]*:\s*\|\s*:/,
  /\b(?:curl|wget|fetch)\b[^|;&]*\|\s*(?:sudo\s+)?(?:ba|z|da|k|c|tc|fi)?sh\b/i,
  /\b(?:curl|wget)\b[^|;&]*\|\s*(?:sudo\s+)?(?:python\d?|perl|ruby|php|node)\b/i,
  /\bbase64\s+(?:-d|--decode)\b[^|;&]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/i,
  /\b(?:ba|z)?sh\s+-c\s+["']?\$\(\s*(?:curl|wget)/i,
  /\/dev\/(?:tcp|udp)\//i,
  /\b(?:nc|netcat|ncat)\b[^|;&]*\s-(?:[a-z]*e|c)\b/i,
  /\bsocat\b/i,
  /\b(?:curl|wget)\b[^|;&]*(?:-d\s*@|--data(?:-binary)?\s*@|-T\s|--upload-file|-F\s*\S*=@)/i,
  /\b(?:scp|rsync|sftp)\b[^|;&]*\s\S+@\S+:/i,
  /\bchmod\s+(?:-R\s+)?[0-7]?777\s+\/(?:\s|$)/i,
  /\bchmod\s+-R\b[^|;&]*\s\/(?:etc|usr|var|bin|sbin|lib|boot)?\/?(?:\s|$)/i,
  /\bchown\s+-R\b[^|;&]*\s\/(?:etc|usr|var|bin|sbin|lib|boot)?\/?(?:\s|$)/i,
  /\b(?:shutdown|reboot|poweroff|halt)\b/i,
  /\binit\s+[06]\b/i,
  /\bsystemctl\s+(?:poweroff|reboot|halt|kexec|emergency|rescue)\b/i,
  /\bsystemctl\s+(?:stop|disable|mask|kill)\s+(?:sshd?|firewalld|auditd|ufw|iptables|nftables|rsyslog|systemd-journald|selinux|apparmor)\b/i,
  /\b(?:iptables|ip6tables)\s+(?:-[a-z]*\s+)*-(?:F|X|P\s+\w+\s+ACCEPT)\b/,
  /\bnft\s+flush\b/i,
  /\bufw\s+disable\b/i,
  /\bsetenforce\s+0\b/i,
  /(?:^|[;&|(]\s*|\bsudo\s+)(?:userdel|usermod|useradd|groupdel|passwd|chpasswd|chage|visudo|vipw)\b/i,
  /authorized_keys/i,
  /\b(?:tee|sed\s+-i)\b[^|;&]*\/etc\//i,
  />\s*\/etc\//i,
  /\bhistory\s+-[cw]\b/i,
  /\bunset\s+HISTFILE\b/i,
  /\bHISTFILE=\/dev\/null\b/i,
  /\b(?:rm|truncate|shred)\b[^|;&]*\/var\/log/i,
  />\s*\/var\/log\//i,
  /\bjournalctl\b[^|;&]*--vacuum/i,
  /\bkill\s+-9\s+-1\b/i,
  /\bkillall5?\b/i,
  /\bcrontab\s+-r\b/i,
  /\bchattr\s+[+-]i\b/i,
  /\bmount\b[^|;&]*-o\s*remount/i,
  /\bumount\b/i,
  /\bswapoff\s+-a\b/i,
  /\becho\s+[a-z]\s*>\s*\/proc\/sysrq-trigger/i
]

/** Durumu değiştiren ama geri alınabilen işlemler. */
const CAUTION: RegExp[] = [
  /\b(?:rm|rmdir|unlink|mv)\b/i,
  /\bcp\b[^|;&]*\s-[a-z]*f/i,
  /\bsed\s+-i\b/i,
  /\bsystemctl\s+(?:restart|stop|start|reload|disable|enable|mask|unmask)\b/i,
  /\bservice\s+\S+\s+(?:restart|stop|start|reload)\b/i,
  /\b(?:kill|pkill|killall|xkill)\b/i,
  /\b(?:apt|apt-get|yum|dnf|zypper|apk|pacman|rpm|dpkg|snap|pip\d?|npm)\s+(?:-\S+\s+)*(?:install|remove|purge|erase|update|upgrade|autoremove|-i|-e|-r|-U)\b/i,
  /\b(?:chmod|chown|chgrp|setfacl)\b/i,
  /\b(?:truncate|fallocate)\b/i,
  /\bsudo\b/i,
  /\bsu\b(?:\s|$)/i,
  /\b(?:tee)\b/i,
  /\bcrontab\s+-e\b/i,
  /\bdocker\s+(?:rm|rmi|stop|kill|system\s+prune|volume\s+rm)\b/i,
  /\bkubectl\s+(?:delete|drain|cordon|scale|apply|replace|patch)\b/i,
  /(?:^|[^0-9&>])>(?!\s*&|\s*\/dev\/null)\s*\S/
]

/** Metin kontrol karakteri ya da satır ayırıcı içeriyor mu. */
export const hasControlChars = (text: string): boolean => CONTROL.test(text)

/** Komutu tek satırlık, kontrol karakteri içermeyen biçime getirir; uygun değilse null döner. */
export function sanitizeCommand(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const command = raw.trim()
  if (!command || command.length > MAX_COMMAND_LENGTH) return null
  if (CONTROL.test(command)) return null
  return command
}

const RANK: Record<AiRisk, number> = { safe: 0, caution: 1, dangerous: 2 }

/** Komutun kural listesine göre riski. */
export function assessRisk(command: string): AiRisk {
  if (DANGEROUS.some((re) => re.test(command))) return 'dangerous'
  if (CAUTION.some((re) => re.test(command))) return 'caution'
  return 'safe'
}

/** Modelin bildirdiği risk ile kural listesinin bulduğundan yüksek olanı. */
export function combineRisk(model: unknown, command: string): AiRisk {
  const claimed: AiRisk =
    model === 'safe' || model === 'caution' || model === 'dangerous' ? model : 'caution'
  const found = assessRisk(command)
  return RANK[found] > RANK[claimed] ? found : claimed
}
