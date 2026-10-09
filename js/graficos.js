// Gráficos em SVG puro, sem biblioteca: linha, colunas empilhadas, barras
// deitadas e a minilinha dos cartões.
//
// As regras são poucas e fixas: marca fina (linha de 2 px, barra de no máximo
// 24 px com a ponta arredondada), grade de um fio só, sem eixo duplo, 2 px de
// fundo separando os pedaços de uma pilha, legenda sempre que há mais de uma
// série, e nenhum número em cada ponto — o valor aparece ao passar o mouse (ou
// o dedo), e está sempre também na tabela logo abaixo. Cor é da série, nunca
// do texto: rótulo e valor ficam na cor do texto.
//
// As cores vêm de variáveis do CSS (--s1, --s2, --s3, --ctx), definidas para o
// tema escuro e para o claro, e validadas contra o fundo de cada um.

import { el } from "./ui.js";

const NS = "http://www.w3.org/2000/svg";

export function svg(tag, attrs = {}, ...filhos) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "style" && typeof v === "object") Object.assign(n.style, v);
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, String(v));
  }
  for (const f of filhos.flat()) {
    if (f == null || f === false) continue;
    n.append(typeof f === "string" || typeof f === "number" ? document.createTextNode(String(f)) : f);
  }
  return n;
}

// ── a dica (tooltip) ────────────────────────────────────────────────────────
// Uma por cartão. O VALOR vem em destaque e o nome da série depois — quem
// passa o mouse já sabe a série, quer o número.

function dicaDe(cartao) {
  let d = cartao.querySelector(":scope > .g-dica");
  if (!d) { d = el("div", { class: "g-dica", role: "status", hidden: true }); cartao.append(d); }
  return d;
}

export function mostrarDica(cartao, x, y, titulo, linhas) {
  const d = dicaDe(cartao);
  d.textContent = "";
  if (titulo) d.append(el("div", { class: "g-dica-tit" }, titulo));
  for (const l of linhas) {
    d.append(el("div", { class: "g-dica-lin" },
      l.cor ? el("i", { class: "chave " + (l.forma || "linha"), style: `--c:${l.cor}` }) : null,
      el("b", {}, l.valor),
      el("span", {}, l.rotulo)));
  }
  d.hidden = false;
  const larg = cartao.clientWidth;
  const w = d.offsetWidth;
  const esquerda = x + 14 + w > larg ? Math.max(4, x - 14 - w) : x + 14;
  d.style.left = esquerda + "px";
  d.style.top = Math.max(4, y - 10) + "px";
}

export function esconderDica(cartao) {
  const d = cartao.querySelector(":scope > .g-dica");
  if (d) d.hidden = true;
}

/** Posição do ponteiro relativa ao cartão. */
function noCartao(cartao, e) {
  const r = cartao.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// ── legenda ─────────────────────────────────────────────────────────────────

export function legenda(series, forma = "linha") {
  return el("div", { class: "g-legenda" }, series.map(s =>
    el("span", { class: "g-leg" },
      el("i", { class: "chave " + (s.forma || forma), style: `--c:${s.cor}` }), s.nome)));
}

// ── o cartão do gráfico ─────────────────────────────────────────────────────

export function cartaoGrafico(titulo, subtitulo, conteudo, { legendaDe = null, forma = "linha", classe = "" } = {}) {
  return el("div", { class: "g-card " + classe },
    el("div", { class: "g-cab" },
      el("div", { class: "g-tit" }, titulo),
      subtitulo ? el("div", { class: "g-sub" }, subtitulo) : null),
    legendaDe ? legenda(legendaDe, forma) : null,
    conteudo);
}

const pct = v => v == null ? "—" : Math.round(v * 100) + "%";

// ── linhas no tempo ─────────────────────────────────────────────────────────
//
// `xs`: rótulos do eixo X. `series`: [{ nome, cor, valores }], valores de 0 a 1
// (ou null, que vira buraco na linha). Um eixo só, sempre de 0 a 100%.
// `marcado`: índice destacado (a semana escolhida). `aoClicar(i)`.

export function graficoLinhas({ largura, altura = 230, xs, series, meta = null,
  marcado = -1, formato = pct, detalhe = null, aoClicar = null }) {
  const m = { e: 40, d: 54, c: 12, b: 26 };
  const W = Math.max(280, largura), H = altura;
  const pw = W - m.e - m.d, ph = H - m.c - m.b;
  const n = xs.length;
  const x = i => m.e + (n === 1 ? pw / 2 : (i * pw) / (n - 1));
  const y = v => m.c + ph - v * ph;

  const s = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: "g-svg",
    role: "img", "aria-label": series.map(z => z.nome).join(" e ") + " por semana" });

  // grade: fios finos, sólidos, recessivos
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    s.append(svg("line", { x1: m.e, x2: W - m.d, y1: y(t), y2: y(t), class: t === 0 ? "g-base" : "g-grade" }));
    s.append(svg("text", { x: m.e - 6, y: y(t) + 4, class: "g-eixo", "text-anchor": "end" }, Math.round(t * 100) + "%"));
  }
  // rótulos do X: todos, se couberem; senão um a cada k
  const passo = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(pw / 38))));
  // o último sempre aparece; o rótulo de antes dele sai se ficaria colado
  const mostraX = i => i === n - 1 || (i % passo === 0 && n - 1 - i >= passo);
  xs.forEach((r, i) => {
    if (!mostraX(i)) return;
    s.append(svg("text", { x: x(i), y: H - 8, class: "g-eixo" + (i === marcado ? " forte" : ""),
      "text-anchor": "middle" }, r));
  });
  if (meta != null) {
    s.append(svg("line", { x1: m.e, x2: W - m.d, y1: y(meta), y2: y(meta), class: "g-meta" }));
    s.append(svg("text", { x: W - m.d + 6, y: y(meta) + 4, class: "g-eixo" }, `meta ${pct(meta)}`));
  }
  // a semana escolhida: uma faixa suave atrás de tudo
  if (marcado >= 0) {
    const larg = n > 1 ? Math.min(28, pw / (n - 1)) : 28;
    s.insertBefore(svg("rect", { x: x(marcado) - larg / 2, y: m.c, width: larg, height: ph,
      class: "g-marca", rx: 4 }), s.firstChild);
  }

  // as linhas, com buraco onde não há valor — a primeira série por cima de
  // todas, porque é o assunto do gráfico
  for (const se of series.slice().reverse()) {
    let d = "", aberto = false;
    se.valores.forEach((v, i) => {
      if (v == null) { aberto = false; return; }
      d += `${aberto ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      aberto = true;
    });
    s.append(svg("path", { d, class: "g-linha", style: { stroke: se.cor } }));
    // ponto isolado (sem vizinho) não aparece como linha: vira marcador
    se.valores.forEach((v, i) => {
      const so = v != null && (se.valores[i - 1] == null) && (se.valores[i + 1] == null);
      if (so) s.append(svg("circle", { cx: x(i), cy: y(v), r: 4, class: "g-ponto", style: { fill: se.cor } }));
    });
  }
  // marcadores na semana escolhida
  if (marcado >= 0) {
    for (const se of series) {
      const v = se.valores[marcado];
      if (v != null) s.append(svg("circle", { cx: x(marcado), cy: y(v), r: 4.5, class: "g-ponto", style: { fill: se.cor } }));
    }
  }
  // rótulo no fim de cada linha — só quando não se atropelam
  const fins = series.map(se => {
    let i = se.valores.length - 1;
    while (i >= 0 && se.valores[i] == null) i--;
    return i >= 0 ? { se, i, v: se.valores[i] } : null;
  }).filter(Boolean);
  const cabem = fins.length < 2 || fins.every((a, k) => fins.every((b, j) =>
    j <= k || Math.abs(y(a.v) - y(b.v)) >= 14));
  if (cabem) {
    for (const f of fins) {
      s.append(svg("text", { x: x(f.i) + 8, y: y(f.v) + 4, class: "g-rot" }, formato(f.v)));
    }
  }

  // a mira: acha a semana mais perto do ponteiro, mostra todas as séries
  const mira = svg("line", { y1: m.c, y2: m.c + ph, class: "g-mira", visibility: "hidden" });
  s.append(mira);
  const capa = svg("rect", { x: m.e - 10, y: 0, width: pw + 20, height: H, class: "g-capa",
    tabindex: 0, "aria-label": "Passe o mouse ou use as setas para ver cada semana" });
  s.append(capa);

  let atual = -1;
  const mostrar = (i, cartao, px, py) => {
    atual = i;
    mira.setAttribute("x1", x(i)); mira.setAttribute("x2", x(i));
    mira.setAttribute("visibility", "visible");
    const linhas = series.map(se => ({ cor: se.cor, valor: formato(se.valores[i]), rotulo: se.nome }));
    if (detalhe) linhas.push(...detalhe(i));
    mostrarDica(cartao, px ?? x(i), py ?? m.c + 10, xs[i], linhas);
  };
  const esconder = cartao => { mira.setAttribute("visibility", "hidden"); esconderDica(cartao); };
  const indice = px => Math.max(0, Math.min(n - 1, Math.round(n === 1 ? 0 : (px - m.e) / pw * (n - 1))));

  capa.addEventListener("pointermove", e => {
    const cartao = s.closest(".g-card");
    const r = s.getBoundingClientRect();
    const p = noCartao(cartao, e);
    mostrar(indice(e.clientX - r.left), cartao, p.x, p.y);
  });
  capa.addEventListener("pointerleave", () => esconder(s.closest(".g-card")));
  capa.addEventListener("click", () => { if (aoClicar && atual >= 0) aoClicar(atual); });
  capa.addEventListener("focus", () => mostrar(marcado >= 0 ? marcado : n - 1, s.closest(".g-card")));
  capa.addEventListener("blur", () => esconder(s.closest(".g-card")));
  capa.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      mostrar(Math.max(0, Math.min(n - 1, (atual < 0 ? n - 1 : atual) + (e.key === "ArrowLeft" ? -1 : 1))),
        s.closest(".g-card"));
    } else if (e.key === "Enter" && aoClicar && atual >= 0) aoClicar(atual);
  });
  if (aoClicar) capa.style.cursor = "pointer";
  return s;
}

// ── colunas empilhadas no tempo ─────────────────────────────────────────────
//
// `series`: [{ nome, cor, valores }] de baixo para cima. Coluna fina (≤ 24 px),
// 2 px de fundo entre os pedaços, ponta de cima arredondada.

function colunaPath(x, yTopo, w, h, raio) {
  if (h <= 0) return "";
  const r = Math.min(raio, h, w / 2);
  return `M${x},${yTopo + h}V${yTopo + r}Q${x},${yTopo} ${x + r},${yTopo}` +
    `H${x + w - r}Q${x + w},${yTopo} ${x + w},${yTopo + r}V${yTopo + h}Z`;
}

export function graficoColunas({ largura, altura = 220, xs, series, marcado = -1,
  formato = v => String(v), aoClicar = null, rotuloTotal = true }) {
  const m = { e: 34, d: 10, c: 16, b: 26 };
  const W = Math.max(280, largura), H = altura;
  const pw = W - m.e - m.d, ph = H - m.c - m.b;
  const n = xs.length;
  const totais = xs.map((_, i) => series.reduce((t, se) => t + (se.valores[i] || 0), 0));
  const max = Math.max(1, ...totais);
  const topo = bonito(max);
  const banda = pw / n;
  const w = Math.min(24, banda * 0.6);
  const y = v => m.c + ph - (v / topo) * ph;

  const s = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: "g-svg", role: "img",
    "aria-label": series.map(z => z.nome).join(", ") + " por semana" });
  for (const t of [0, topo / 2, topo]) {
    s.append(svg("line", { x1: m.e, x2: W - m.d, y1: y(t), y2: y(t), class: t === 0 ? "g-base" : "g-grade" }));
    s.append(svg("text", { x: m.e - 6, y: y(t) + 4, class: "g-eixo", "text-anchor": "end" }, String(Math.round(t))));
  }
  const passo = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(pw / 38))));
  const mostraX = i => i === n - 1 || (i % passo === 0 && n - 1 - i >= passo);

  xs.forEach((rot, i) => {
    const cx = m.e + banda * i + banda / 2;
    const g = svg("g", { class: "g-col" + (i === marcado ? " marcada" : ""), tabindex: 0 });
    if (i === marcado) {
      g.append(svg("rect", { x: cx - banda / 2 + 2, y: m.c, width: banda - 4, height: ph, class: "g-marca", rx: 4 }));
    }
    let base = 0;
    const visiveis = series.map((se, k) => ({ se, k, v: se.valores[i] || 0 })).filter(z => z.v > 0);
    visiveis.forEach((z, j) => {
      const y0 = y(base), y1 = y(base + z.v);
      const ultimo = j === visiveis.length - 1;
      const h = Math.max(0, y0 - y1 - (ultimo ? 0 : 2));
      const d = ultimo
        ? colunaPath(cx - w / 2, y1, w, h, 4)
        : `M${cx - w / 2},${y1 + 2}h${w}v${h}h${-w}Z`;
      if (h > 0) g.append(svg("path", { d, class: "g-barra", style: { fill: z.se.cor } }));
      base += z.v;
    });
    if (rotuloTotal && i === marcado && totais[i]) {
      g.append(svg("text", { x: cx, y: y(totais[i]) - 5, class: "g-rot", "text-anchor": "middle" }, formato(totais[i])));
    }
    // a área de toque é a banda inteira, não só a coluna
    g.append(svg("rect", { x: cx - banda / 2, y: m.c, width: banda, height: ph + m.b, class: "g-alvo" }));
    if (mostraX(i)) {
      g.append(svg("text", { x: cx, y: H - 8, class: "g-eixo" + (i === marcado ? " forte" : ""),
        "text-anchor": "middle" }, rot));
    }
    const dica = (cartao, px, py) => mostrarDica(cartao, px, py, rot,
      [...series.map(se => ({ cor: se.cor, forma: "caixa", valor: formato(se.valores[i] || 0), rotulo: se.nome })),
        { valor: formato(totais[i]), rotulo: "total" }]);
    g.addEventListener("pointermove", e => {
      const cartao = s.closest(".g-card"); const p = noCartao(cartao, e); dica(cartao, p.x, p.y);
    });
    g.addEventListener("pointerleave", () => esconderDica(s.closest(".g-card")));
    g.addEventListener("focus", () => dica(s.closest(".g-card"), cx, m.c));
    g.addEventListener("blur", () => esconderDica(s.closest(".g-card")));
    if (aoClicar) {
      g.style.cursor = "pointer";
      g.addEventListener("click", () => aoClicar(i));
      g.addEventListener("keydown", e => { if (e.key === "Enter") aoClicar(i); });
    }
    s.append(g);
  });
  return s;
}

// ── barras deitadas ─────────────────────────────────────────────────────────
//
// `itens`: [{ rotulo, partes: [{ nome, cor, valor }], ativo }]. A barra cresce
// da esquerda; o total vai na ponta. `marca`: { valor, rotulo } — um fio
// vertical de referência (a capacidade, por exemplo).

export function graficoBarras({ largura, itens, formato = v => String(v), aoClicar = null,
  marca = null, maximo = null, rotuloTotal = null }) {
  const larguraRot = Math.min(150, Math.max(70, largura * 0.26));
  const m = { e: larguraRot, d: 54, c: marca ? 18 : 4, b: 4 };
  const linha = 26, grossura = 14;
  const W = Math.max(280, largura), H = m.c + m.b + itens.length * linha;
  const pw = W - m.e - m.d;
  const totais = itens.map(it => it.partes.reduce((t, p) => t + (p.valor || 0), 0));
  const max = maximo || Math.max(1, ...totais, marca ? marca.valor : 0);
  const x = v => m.e + (v / max) * pw;

  const s = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: "g-svg", role: "img" });
  s.append(svg("line", { x1: m.e, x2: m.e, y1: m.c - 2, y2: H - m.b, class: "g-base" }));
  if (marca) {
    s.append(svg("line", { x1: x(marca.valor), x2: x(marca.valor), y1: m.c - 4, y2: H - m.b, class: "g-meta" }));
    s.append(svg("text", { x: x(marca.valor), y: m.c - 7, class: "g-eixo", "text-anchor": "middle" }, marca.rotulo));
  }
  itens.forEach((it, i) => {
    const cy = m.c + i * linha + linha / 2;
    const g = svg("g", { class: "g-bar" + (it.ativo ? " ativa" : ""), tabindex: 0 });
    g.append(svg("rect", { x: 0, y: cy - linha / 2, width: W, height: linha, class: "g-alvo" }));
    const nome = String(it.rotulo);
    const curto = nome.length * 6.6 > larguraRot - 10 ? nome.slice(0, Math.floor((larguraRot - 10) / 6.6) - 1) + "…" : nome;
    g.append(svg("text", { x: m.e - 8, y: cy + 4, class: "g-cat" + (it.ativo ? " forte" : ""), "text-anchor": "end" }, curto));
    let base = 0;
    const vis = it.partes.filter(p => p.valor > 0);
    vis.forEach((p, j) => {
      const x0 = x(base), x1 = x(base + p.valor);
      const ultimo = j === vis.length - 1;
      const w = Math.max(0, x1 - x0 - (ultimo ? 0 : 2));
      if (w <= 0) { base += p.valor; return; }
      const r = ultimo ? Math.min(4, w / 2, grossura / 2) : 0;
      const d = `M${x0},${cy - grossura / 2}H${x0 + w - r}` +
        (r ? `Q${x0 + w},${cy - grossura / 2} ${x0 + w},${cy - grossura / 2 + r}V${cy + grossura / 2 - r}Q${x0 + w},${cy + grossura / 2} ${x0 + w - r},${cy + grossura / 2}` : `V${cy + grossura / 2}`) +
        `H${x0}Z`;
      g.append(svg("path", { d, class: "g-barra", style: { fill: p.cor } }));
      base += p.valor;
    });
    const tot = totais[i];
    g.append(svg("text", { x: x(tot) + 6, y: cy + 4, class: "g-rot" }, rotuloTotal ? rotuloTotal(it, tot) : formato(tot)));
    const dica = (cartao, px, py) => mostrarDica(cartao, px, py, nome,
      [...it.partes.map(p => ({ cor: p.cor, forma: "caixa", valor: formato(p.valor || 0), rotulo: p.nome })),
        ...(it.partes.length > 1 ? [{ valor: formato(tot), rotulo: "total" }] : []),
        ...(it.extra || [])]);
    g.addEventListener("pointermove", e => {
      const cartao = s.closest(".g-card"); const p = noCartao(cartao, e); dica(cartao, p.x, p.y);
    });
    g.addEventListener("pointerleave", () => esconderDica(s.closest(".g-card")));
    g.addEventListener("focus", () => dica(s.closest(".g-card"), m.e, cy));
    g.addEventListener("blur", () => esconderDica(s.closest(".g-card")));
    if (aoClicar) {
      g.style.cursor = "pointer";
      g.addEventListener("click", () => aoClicar(it));
      g.addEventListener("keydown", e => { if (e.key === "Enter") aoClicar(it); });
    }
    s.append(g);
  });
  return s;
}

// ── a minilinha dos cartões ─────────────────────────────────────────────────
// Cinza para o histórico, a cor de destaque só no ponto atual.

export function minilinha(valores, { largura = 120, altura = 30, marcado = valores.length - 1 } = {}) {
  const n = valores.length;
  const vals = valores.filter(v => v != null);
  const s = svg("svg", { width: largura, height: altura, viewBox: `0 0 ${largura} ${altura}`,
    class: "g-mini", "aria-hidden": "true" });
  if (vals.length < 2) return s;
  const lo = Math.min(0, ...vals), hi = Math.max(1, ...vals);
  const x = i => 3 + (i * (largura - 6)) / (n - 1);
  const y = v => altura - 4 - ((v - lo) / (hi - lo || 1)) * (altura - 8);
  let d = "", aberto = false;
  valores.forEach((v, i) => {
    if (v == null) { aberto = false; return; }
    d += `${aberto ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; aberto = true;
  });
  s.append(svg("path", { d, class: "g-mini-linha" }));
  if (valores[marcado] != null) {
    s.append(svg("circle", { cx: x(marcado), cy: y(valores[marcado]), r: 3.5, class: "g-mini-ponto" }));
  }
  return s;
}

/** Um topo "redondo" para o eixo: 7 → 10, 23 → 25, 140 → 150. */
export function bonito(v) {
  if (v <= 5) return 5;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const k of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (k * p >= v) return k * p;
  return 10 * p;
}
