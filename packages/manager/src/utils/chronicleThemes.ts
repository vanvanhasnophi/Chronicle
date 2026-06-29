// Chronicle Marp theme CSS generators (light + dark)
// Default: hardcoded blue. `accent: "follow"` → uses var(--accent-color).
// `accent: "#e74c3c"` → custom hex.

function light(accent = '#2563eb'): string {
  return `/* @theme chronicle */
section{font-family:"InterVariable","Inter",-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;font-size:28px;line-height:1.6;color:#111;background:#fff;padding:60px 80px;width:1280px;height:720px}
section h1{color:${accent};margin-bottom:.2em}
section a{color:${accent}}
section code{font-family:"JetBrains Mono","Fira Code",monospace;background:#f0f0f0;padding:2px 6px;border-radius:4px}
section pre{background:#f5f5f5;border:1px solid #e5e7eb;padding:16px;border-radius:6px;overflow:hidden}
section pre code{background:none;padding:0}
.hljs{background:transparent}
.hljs-keyword{color:#00f}.hljs-string{color:#a31515}.hljs-comment{color:green}
.hljs-number{color:#098658}.hljs-title{color:#795e26}.hljs-type{color:#267f99}
.hljs-built_in{color:#00f}.hljs-literal{color:#00f}.hljs-meta{color:#a31515}
.hljs-attr{color:#795e26}.hljs-params{color:#001080}.hljs-variable{color:#0b5394}.hljs-subst{color:#0b5394}
section.lead{text-align:center;padding-top:18%}
section.lead h1{font-size:3em}
section.invert{color:#fff;background:#1a1a2e}
section.invert h1{color:#fff}
header{position:absolute;top:30px;color:#6b7280}
footer{position:absolute;bottom:20px;color:#6b7280}
section::after{color:#6b7280}`
}

function dark(accent = '#58a6ff'): string {
  return `/* @theme chronicle-dark */
section{font-family:"InterVariable","Inter",-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;font-size:28px;line-height:1.6;color:#e5e7eb;background:color-mix(in srgb,${accent} 3%,#080808);padding:60px 80px;width:1280px;height:720px}
section h1{color:${accent};margin-bottom:.2em}
section a{color:${accent}}
section code{font-family:"JetBrains Mono","Fira Code",monospace;background:#161616;padding:2px 6px;border-radius:4px}
section pre{background:#080808;border:1px solid #1a1a1a;padding:16px;border-radius:6px;overflow:hidden}
section pre code{background:none;padding:0}
.hljs{background:transparent}
.hljs-keyword{color:#569cd6}.hljs-string{color:#ce9178}.hljs-comment{color:#6a9955}
.hljs-number{color:#b5cea8}.hljs-title{color:#569cd6}.hljs-type{color:#4ec9b0}
.hljs-built_in{color:#569cd6}.hljs-literal{color:#569cd6}.hljs-meta{color:#ce9178}
.hljs-attr{color:#9cdcfe}.hljs-params{color:#9cdcfe}
section.lead{text-align:center;padding-top:18%}
section.lead h1{font-size:3em}
section.invert{color:#111;background:#fff}
section.invert h1{color:#111}
header{position:absolute;top:30px;color:#8b949e}
footer{position:absolute;bottom:20px;color:#8b949e}
section::after{color:#8b949e}`
}

export const chronicleCSS = light()
export const chronicleDarkCSS = dark()
export function chronicleLightTheme(accent: string) { return light(accent) }
export function chronicleDarkTheme(accent: string) { return dark(accent) }
