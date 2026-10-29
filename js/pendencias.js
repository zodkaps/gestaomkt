// Ler pendências coladas — a mensagem do WhatsApp com a inspeção, o e-mail, o
// texto do PDF do TOP — e separar o que é pendência do que é conversa.
//
// O formato que chega é o de quem escreve no celular:
//
//     433
//     *PENDENCIAS IDENTIFICADAS NA INSPEÇÃO*
//     - Soldar trincas no lastro dianteiro LD;
//     - Substituir lonas de freio do segundo eixo LE;
//     @Fulano enviar para o fornecedor
//
// A frota é a linha que é só um número (ou "F-433", ou "Inspeção prioridades
// 616:"); a pendência é a linha com marcador (-, •, 1.); o resto é conversa e
// fica de fora — mas à vista, para quem confere pôr de volta o que for
// pendência. Nada aqui grava: a tela mostra e a pessoa confirma.

import { chave, busca, esqueleto, posicao } from "./texto.js";

// Linha que começa com marcador de lista: "-", "•", "*", "1.", "2)", "☐".
const MARCADOR = /^\s*(?:[-–—•·▪►●○✓✔☐□]|\*(?!\*)(?=\s)|\d{1,2}\s*[.)–-](?!\d)|\(\s*\d{1,2}\s*\))\s*/;
// Ordem de serviço no começo da linha (a folha impressa pelo site: "021333 Repor…").
const OS_NA_FRENTE = /^\s*(\d{6})(?:\s+|$)/;
const EMOJI = /[\p{Extended_Pictographic}️‍⁦-⁩]/gu;
const ALERTA = /⚠|‼|❗|❕|🚨|\burgente\b/i;

/** A frota de uma linha que é cabeçalho: "433", "F-433", "F616", "Frota 433:",
 *  "F-617 · CAVALO TRATOR", "F434 LIBERADO COM RESTRIÇÃO", "Inspeção
 *  prioridades 616:". Devolve o número. */
export function frotaDaLinha(linha) {
  const t = String(linha || "").replace(EMOJI, "").replace(/\*/g, "").trim();
  let m = t.match(/^(?:frota\s*)?(?:f\s*[-–]?\s*)?(\d{3,4})(\s*[a-z])?\s*:?$/i);
  if (m) return m[1] + (m[2] ? " " + m[2].trim().toUpperCase() : "");
  m = t.match(/^f\s*[-–]?\s*(\d{3,4})\b(?!\s*[/.,]\d)/i);
  if (m) return m[1];
  // "Inspeção prioridades 616:" — um título com o número, terminando em ":"
  m = t.match(/^[^\d:]{3,60}?\b(\d{3,4})\b\s*:$/);
  if (m && !MARCADOR.test(t)) return m[1];
  return "";
}

/** "433" → a frota como o site escreve ("F-433"), procurando nas que existem.
 *  `nova` diz que nenhuma frota do site tem esse número. */
export function resolverFrota(numero, frotas = []) {
  if (!numero) return { frota: "", nova: false };
  const [n, letra] = String(numero).split(" ");
  const so = f => String(f).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const alvo = "F" + n + (letra || "");
  const exata = frotas.find(f => so(f) === alvo);
  if (exata) return { frota: exata, nova: false };
  if (!letra) {
    const comLetra = frotas.filter(f => so(f).startsWith("F" + n) && /^[A-Z]$/.test(so(f).slice(1 + n.length)));
    if (comLetra.length === 1) return { frota: comLetra[0], nova: false };
  }
  return { frota: "F-" + n + (letra ? " " + letra : ""), nova: true };
}

/** O texto da pendência, limpo: sem marcador, sem emoji, sem o ";" ou o "-"
 *  do fim, parênteses sem espaço por dentro, primeira letra maiúscula. */
function limparItem(t) {
  let s = String(t || "");
  const alerta = ALERTA.test(s);
  s = s.replace(EMOJI, " ").replace(/\burgente\b/i, " ");
  let top = false;
  if (/\s+TOP\s*$/.test(s)) { top = true; s = s.replace(/\s+TOP\s*$/, ""); }
  s = s.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
  s = s.replace(/\s+/g, " ").replace(/[\s;.,:\-–]+$/, "").trim();
  s = s.replace(/^\*+|\*+$/g, "").trim();
  if (s) s = s[0].toUpperCase() + s.slice(1);
  return { texto: s, alerta, top };
}

// Verbo no infinitivo ("verificar", "corrigir", "repor") — é por ele que uma
// linha com duas pendências grudadas se separa. Palavras que terminam igual e
// não são verbo ficam de fora.
const NAO_VERBO = new Set(["lugar", "solar", "celular", "auxiliar", "particular", "similar", "militar",
  "familiar", "escolar", "par", "lar", "mar", "ar", "ver", "ter", "ir", "intercooler", "cooler", "trailer",
  "container", "scanner", "freezer", "poster", "carter", "cárter", "pomar", "colar", "polar", "dólar", "radar"]);
const PREPOSICOES = new Set(["de", "da", "do", "das", "dos", "a", "o", "as", "os", "e", "ou", "para", "pra",
  "com", "sem", "em", "no", "na", "nos", "nas", "por", "pelo", "pela", "ao", "à", "que", "se", "não", "nao"]);
const ehVerbo = w => {
  const x = busca(w).replace(/[^a-z]/g, "");
  return x.length >= 4 && !NAO_VERBO.has(x) && (/(ar|er|ir)$/.test(x) || /^(re|com|dis|pro|sup|im)?por$/.test(x));
};

/** Uma linha sem marcador pode trazer mais de uma pendência:
 *    "fixar corote-lubrificar tirantes da porta-corrigir falha no motor"
 *    "fixar base do cinto do motorista desobstruir esguicho do limpador"
 *    "luz da placa revisar regular freios"
 *    "lameira traseira LD fixar, paralama fixar LD"
 *  Separa no "-" seguido de verbo (ou depois de ")"), na vírgula entre duas
 *  partes que têm verbo, e antes de um verbo quando a parte de antes já tem o
 *  dela (ou termina em verbo). Dentro de parênteses não se mexe. Palavra com
 *  hífen ("para-choque", "ar-condicionado") fica inteira. */
export function separarJuntas(linha) {
  let partes = [];
  // 1. o hífen que junta duas pendências
  let atual = "", nivel = 0;
  const l = String(linha);
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (c === "(") nivel++;
    if (c === ")") nivel = Math.max(0, nivel - 1);
    if ((c === "-" || c === "–") && nivel === 0) {
      const depois = l.slice(i + 1);
      const prox = (depois.match(/^\s*([\p{L}]+)/u) || [])[1] || "";
      const antes = atual.trimEnd();
      if (!depois.trim()) { atual += ""; continue; }                     // "-" no fim: some
      if (antes.endsWith(")") || (prox && ehVerbo(prox) && antes.split(/\s+/).length >= 2)) {
        partes.push(atual); atual = ""; continue;
      }
    }
    atual += c;
  }
  partes.push(atual);
  // 2. a vírgula entre duas partes que têm verbo
  partes = partes.flatMap(pt => {
    const pedacos = pt.split(/,\s+/);
    if (pedacos.length < 2) return [pt];
    const comVerbo = pedacos.map(x => x.split(/\s+/).some(ehVerbo));
    return comVerbo.every(Boolean) ? pedacos : [pt];
  });
  // 3. o verbo que começa outra pendência no meio da linha
  partes = partes.flatMap(pt => {
    const pal = pt.trim().split(/\s+/);
    const r = [];
    let ini = 0, nivel2 = 0, temVerbo = false;
    for (let k = 0; k < pal.length; k++) {
      const w = pal[k];
      const dentro = nivel2 > 0 || w.startsWith("(");
      nivel2 += (w.match(/\(/g) || []).length - (w.match(/\)/g) || []).length;
      if (dentro || !ehVerbo(w)) continue;
      const anterior = pal[k - 1] ? busca(pal[k - 1]).replace(/[^a-z]/g, "") : "";
      const antVerbo = k > ini && ehVerbo(pal[k - 1]);
      if (k - ini >= 1 && (antVerbo || (temVerbo && k - ini >= 3 && !PREPOSICOES.has(anterior)))) {
        r.push(pal.slice(ini, k).join(" ")); ini = k; temVerbo = true; continue;
      }
      temVerbo = true;
    }
    r.push(pal.slice(ini).join(" "));
    return r;
  });
  return partes.map(x => x.trim()).filter(x => x && x.replace(/[\s\-–;.,]/g, ""));
}

const ehTitulo = l => /^\*[^*]+\*$/.test(l) || (l.length > 3 && l === l.toUpperCase() && /[A-ZÇÃÕÉÊÍÓÚ]{3}/.test(l) && !MARCADOR.test(l));
const ehConversa = l => /^@|^psc$|^ok\.?$|^obrigad/i.test(l);
// "Veículo não liberado devido a seguinte observação:" — o que vem depois é o
// porquê da reprovação (já está nas pendências), não pendência nova.
const ehMotivoReprovacao = l => /(n[aã]o\s+liberad\w*|reprovad\w*)\s+(devido|por\s+causa|pel[oa]s?\s+seguintes?)|devido\s+[aà]s?\s+seguintes?/i.test(l);
const ehObservacao = l => /^obs(erva[cç][aã]o)?\s*[:\-–]/i.test(l);
const ehPreventiva = l => /^\*?\s*prevent\w*\s*\*?\s*:?$/i.test(l);

function fonteDe(linhas) {
  const t = linhas.join(" \n ");
  if (/\bTOP\b/.test(t)) return "TOP";
  if (/inspe[cç][aã]o|inspecionad/i.test(t)) return "Inspeção";
  return "";
}

/** "14/10" ou "14/10/2026" num cabeçalho → "2026-10-14". Sem ano, o do dia de
 *  hoje (o mês de dezembro lido em janeiro é do ano anterior). */
function diaDe(linhas, ref) {
  for (const l of linhas) {
    const m = l.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (!m) continue;
    let ano = m[3] ? Number(m[3].length === 2 ? "20" + m[3] : m[3]) : Number(ref.slice(0, 4));
    const d = `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if (!m[3] && d > ref) ano -= 1;
    return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return "";
}

/** Separa a mensagem em blocos, um por frota.
 *
 *  `frotas`: as frotas do site, para "433" virar "F-433". `frotaPadrao`: a
 *  frota da tela de onde se colou (o texto pode não dizer). `ref`: o dia de
 *  hoje, para a data do cabeçalho ("TOP REPROVADOS 14/10").
 *
 *  Cada bloco: { frota, numero, nova, fonte, dia, situacao, temPreventiva,
 *  motivos, notas, itens, ignoradas }. Cada item: { texto, alerta, top, os,
 *  dividida }. */
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function lerPendencias(texto, { frotas = [], frotaPadrao = "", ref = hojeLocal() } = {}) {
  const linhas = String(texto || "").replace(/\r/g, "").split("\n")
    .map(l => l.replace(/[⁦-⁩]/g, "").replace(/\s+$/, ""));
  const temCabecalho = linhas.some(l => l.trim() && !MARCADOR.test(l.trim()) && frotaDaLinha(l.trim()));
  const preambulo = [];
  const blocos = [];
  const blocoDa = numero => {
    const r = numero ? resolverFrota(numero, frotas) : { frota: frotaPadrao, nova: false };
    let b = blocos.find(x => x.frota === r.frota);
    if (!b) {
      b = { frota: r.frota, numero, nova: r.nova, fonte: "", dia: "", situacao: "", temPreventiva: false,
        motivos: [], notas: [], itens: [], ignoradas: [], cabecalho: [], _semMarcador: [] };
      blocos.push(b);
    }
    return b;
  };
  let b = temCabecalho ? null : blocoDa("");
  let anterior = null;          // o último item, para a linha que continua
  let osPendente = "";          // "021336" sozinho numa linha: é da próxima
  let marcadorSolto = false;    // "—" sozinho numa linha: a próxima é o item
  let emMotivos = false;        // depois de "Veículo não liberado devido a…"

  for (const cru of linhas) {
    const l = cru.trim();
    if (!l) { anterior = null; emMotivos = false; continue; }
    const semEmoji = l.replace(EMOJI, "").trim();
    if (!semEmoji) { if (anterior && ALERTA.test(l)) anterior.alerta = true; continue; }

    const numero = !MARCADOR.test(l) || /^\s*f\s*[-–]?\s*\d/i.test(l) ? frotaDaLinha(l) : "";
    if (numero) {
      b = blocoDa(numero);
      b.cabecalho.push(l);
      // "F434 LIBERADO COM RESTRIÇÃO": a situação vem na mesma linha
      const resto = l.replace(/^\W*f\s*[-–]?\s*\d{3,4}\s*[a-z]?\b\s*[·:\-–]?\s*/i, "").trim();
      if (/liberad|reprovad|restri/i.test(resto)) b.situacao = resto;
      anterior = null; osPendente = ""; marcadorSolto = false; emMotivos = false;
      continue;
    }
    // antes da primeira frota: o título da mensagem ("TOP REPROVADOS 14/10")
    if (!b) {
      if (MARCADOR.test(l)) b = blocoDa("");
      else { preambulo.push(l); continue; }
    }
    if (emMotivos) { b.motivos.push(limparItem(l).texto); continue; }
    if (ehMotivoReprovacao(l)) { emMotivos = true; b.ignoradas.push(l); anterior = null; continue; }
    if (ehObservacao(l)) { b.notas.push(l.replace(/^obs(erva[cç][aã]o)?\s*[:\-–]\s*/i, "")); b.ignoradas.push(l); anterior = null; continue; }
    if (ehPreventiva(l)) { b.temPreventiva = true; b.ignoradas.push(l); continue; }

    // a folha do site: OS sozinha, ou na frente do texto
    const os = l.match(OS_NA_FRENTE);
    if (os && !l.slice(os[0].length).trim()) { osPendente = os[1]; continue; }

    const marcado = MARCADOR.exec(l);
    if (marcado || marcadorSolto || osPendente || (os && /[a-z]/i.test(l))) {
      let resto = marcado ? l.slice(marcado[0].length) : l;
      let osItem = osPendente;
      const osAqui = resto.match(OS_NA_FRENTE);
      if (osAqui) { osItem = osAqui[1]; resto = resto.slice(osAqui[0].length); }
      osPendente = "";
      if (!resto.replace(EMOJI, "").trim()) { marcadorSolto = true; continue; }
      marcadorSolto = false;
      const it = { ...limparItem(resto), os: osItem, dividida: false };
      if (it.texto) { b.itens.push(it); anterior = it; it._aberto = !/[;.]\s*(\S*\p{Extended_Pictographic}.*)?$/u.test(l); }
      continue;
    }

    // Continuação de um item quebrado em duas linhas (o PDF faz isso): o item
    // não terminou com ";" ou "." e a linha começa minúscula ou com "(".
    if (anterior && anterior._aberto && /^[a-zà-ú(]/.test(l) && !ehConversa(l)) {
      const mais = limparItem(l);
      anterior.texto = (anterior.texto + " " + mais.texto.charAt(0).toLowerCase() + mais.texto.slice(1)).trim();
      anterior.top = anterior.top || mais.top;
      anterior.alerta = anterior.alerta || mais.alerta;
      continue;
    }
    anterior = null;
    if (/preventiva/i.test(l)) b.temPreventiva = true;
    if (!b.itens.length || ehTitulo(l)) b.cabecalho.push(l);
    if (ehConversa(l) || ehTitulo(l)) { b.ignoradas.push(l); continue; }
    b.ignoradas.push(l);
    b._semMarcador.push(l);
  }

  // Sem nenhum marcador no bloco, cada linha é uma pendência (o TOP vem
  // assim, uma por linha) — e a linha com duas grudadas se separa. A pessoa
  // confere e desmarca o que não for.
  const fonteGeral = fonteDe(preambulo);
  const diaGeral = diaDe(preambulo, ref);
  for (const x of blocos) {
    if (!x.itens.length && x._semMarcador.length) {
      for (const l of x._semMarcador) {
        if (l.split(/\s+/).length < 2) continue;
        const partes = separarJuntas(l);
        for (const pt of partes) {
          const it = { ...limparItem(pt), os: "", dividida: partes.length > 1 };
          if (it.texto) x.itens.push(it);
        }
        x.ignoradas.splice(x.ignoradas.indexOf(l), 1);
      }
    }
    x.fonte = fonteDe(x.cabecalho) || fonteGeral || fonteDe(x.ignoradas.filter(ehTitulo));
    x.dia = diaDe(x.cabecalho, ref) || diaGeral;
    for (const it of x.itens) { delete it._aberto; }
    delete x.cabecalho; delete x._semMarcador;
  }
  return blocos.filter(x => x.itens.length || x.ignoradas.length);
}

// Verbos que só dizem "olhar" ou "falta" — não distinguem uma pendência de
// outra: "Verificar sirene de ré" e "sirene de ré" são a mesma coisa, e
// "Providenciar estepe" é o "Sem estepe" que já estava na carteira.
const GENERICOS = new Set(["verific", "revis", "corrig", "realiz", "providenci", "diagnostic", "chec",
  "confer", "avali", "analis", "inspecion", "sem", "falt", "nao", "sanar", "san", "esta", "estao"]);

/** As palavras que dizem O QUÊ de uma pendência, para comparar com outra
 *  escrita de outro jeito: sem os verbos de só olhar, "para-brisa" junto,
 *  gerúndio como infinitivo ("falhando" = "falhar"). */
function objeto(t) {
  const txt = busca(t).replace(/(\p{L})-(\p{L})/gu, "$1$2")
    .replace(/\b(\p{L}{3,}?)(ando|endo|indo)\b/gu, "$1ar");
  return new Set(esqueleto(txt).split(" ").filter(w => w && !GENERICOS.has(w)));
}
// "contaminação" e "contaminado" ficam com radicais um pouco diferentes; o
// começo comprido igual basta.
const mesmaPalavra = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));
const quantasEm = (x, y) => [...x].filter(w => [...y].some(v => mesmaPalavra(w, v))).length;

/** Marca, em cada item, se a frota já tem essa pendência em aberto:
 *  - `duplicada`: a mesma (o serviço e a posição, ver texto.js);
 *  - `parecida`: escrita de outro jeito — as palavras do que é (sem os verbos
 *    de só olhar) batem quase todas, e o lugar não briga. Fica com a mais
 *    parecida das que estão em aberto;
 *  - `repetida`: veio duas vezes na própria mensagem. */
export function marcarDuplicadas(frota, itens, atividades) {
  const abertas = atividades.filter(a => a.frota === frota);
  const porChave = new Map(abertas.map(a => [chave(a.frota, a.atividade), a]));
  const norm = t => busca(t).replace(/(\p{L})-(\p{L})/gu, "$1$2").replace(/\W+/g, " ").trim();
  const porTexto = new Map(abertas.map(a => [norm(a.atividade), a]));
  const contem = (x, y) => [...x].every(w => y.has(w));
  const lugarCombina = (p, q) => contem(p, q) || contem(q, p);
  // o lado vem muito entre parênteses ("Revisar luz de freio (LE)"): para o
  // lugar, os parênteses se abrem
  const lugar = t => posicao(String(t).replace(/[()]/g, " "));
  const indice = abertas.map(a => ({ a, obj: objeto(a.atividade), pos: lugar(a.atividade) }));
  const vistos = new Set();
  return itens.map(it => {
    const k = chave(frota, it.texto);
    const ja = porChave.get(k) || porTexto.get(norm(it.texto)) || null;
    let parecida = null;
    if (!ja) {
      const obj = objeto(it.texto), pos = lugar(it.texto);
      let melhor = 0;
      for (const x of indice) {
        if (!obj.size || !x.obj.size || !lugarCombina(pos, x.pos)) continue;
        const comum = quantasEm(obj, x.obj);
        const menor = Math.min(obj.size, x.obj.size);
        const igual = comum === obj.size && quantasEm(x.obj, obj) === x.obj.size;
        const quase = menor >= 2 && comum / menor >= 0.75;
        if (!igual && !quase) continue;
        const nota = comum / (obj.size + x.obj.size - comum);
        if (nota > melhor) { melhor = nota; parecida = x.a; }
      }
    }
    const repetida = vistos.has(k);
    vistos.add(k);
    return { ...it, duplicada: ja, parecida, repetida };
  });
}

/** O que vai na observação: o dia e de onde veio ("[14/10] Inspeção"). É o
 *  formato que a carteira lê para contar há quantos dias a pendência espera. */
export function obsDaOrigem(fonte, dia) {
  const [, m, d] = String(dia || "").split("-");
  return `${d && m ? `[${d}/${m}] ` : ""}${fonte || "Inspeção"}`;
}
