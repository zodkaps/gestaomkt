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

import { chave, busca } from "./texto.js";

// Linha que começa com marcador de lista: "-", "•", "*", "1.", "2)", "☐".
const MARCADOR = /^\s*(?:[-–—•·▪►●○✓✔☐□]|\*(?!\*)(?=\s)|\d{1,2}\s*[.)–-](?!\d)|\(\s*\d{1,2}\s*\))\s*/;
// Ordem de serviço no começo da linha (a folha impressa pelo site: "021333 Repor…").
const OS_NA_FRENTE = /^\s*(\d{6})(?:\s+|$)/;
const EMOJI = /[\p{Extended_Pictographic}️‍⁦-⁩]/gu;
const ALERTA = /⚠|‼|❗|❕|🚨|\burgente\b/i;

/** A frota de uma linha que é cabeçalho: "433", "F-433", "Frota 433:",
 *  "F-617 · CAVALO TRATOR", "Inspeção prioridades 616:". Devolve o número. */
export function frotaDaLinha(linha) {
  const t = String(linha || "").replace(EMOJI, "").replace(/\*/g, "").trim();
  let m = t.match(/^(?:frota\s*)?(?:f\s*[-–]?\s*)?(\d{3,4})(\s*[a-z])?\s*:?$/i);
  if (m) return m[1] + (m[2] ? " " + m[2].trim().toUpperCase() : "");
  m = t.match(/^f\s*[-–]\s*(\d{3,4})\b/i);
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

/** O texto da pendência, limpo: sem marcador, sem emoji, sem o ";" do fim,
 *  com a primeira letra maiúscula. Devolve também o que se tirou dele. */
function limparItem(t) {
  let s = String(t || "");
  const alerta = ALERTA.test(s);
  s = s.replace(EMOJI, " ").replace(/\burgente\b/i, " ");
  let top = false;
  if (/\s+TOP\s*$/.test(s)) { top = true; s = s.replace(/\s+TOP\s*$/, ""); }
  s = s.replace(/\s+/g, " ").replace(/[\s;.,:]+$/, "").trim();
  s = s.replace(/^\*+|\*+$/g, "").trim();
  if (s) s = s[0].toUpperCase() + s.slice(1);
  return { texto: s, alerta, top };
}

const ehTitulo = l => /^\*[^*]+\*$/.test(l) || (l.length > 3 && l === l.toUpperCase() && /[A-ZÇÃÕÉÊÍÓÚ]{3}/.test(l) && !MARCADOR.test(l));
const ehConversa = l => /^@|^psc$|^ok\.?$|^obrigad/i.test(l);

function fonteDe(linhas) {
  const t = linhas.join(" \n ");
  if (/inspe[cç][aã]o|inspecionad/i.test(t)) return "Inspeção";
  if (/\bTOP\b/i.test(t)) return "TOP";
  return "";
}

/** Separa a mensagem em blocos, um por frota.
 *
 *  `frotas`: as frotas do site, para "433" virar "F-433". `frotaPadrao`: a
 *  frota da tela de onde se colou (o texto pode não dizer).
 *
 *  Cada bloco: { frota, numero, nova, fonte, temPreventiva, itens, ignoradas }.
 *  Cada item: { texto, alerta, top, os }. */
export function lerPendencias(texto, { frotas = [], frotaPadrao = "" } = {}) {
  const linhas = String(texto || "").replace(/\r/g, "").split("\n")
    .map(l => l.replace(/[⁦-⁩]/g, "").replace(/\s+$/, ""));
  const blocos = [];
  const blocoDa = numero => {
    const r = numero ? resolverFrota(numero, frotas) : { frota: frotaPadrao, nova: false };
    let b = blocos.find(x => x.frota === r.frota);
    if (!b) {
      b = { frota: r.frota, numero, nova: r.nova, fonte: "", temPreventiva: false,
        itens: [], ignoradas: [], cabecalho: [], _semMarcador: [] };
      blocos.push(b);
    }
    return b;
  };
  let b = null;
  let anterior = null;          // o último item, para a linha que continua
  let osPendente = "";          // "021336" sozinho numa linha: é da próxima
  let marcadorSolto = false;    // "—" sozinho numa linha: a próxima é o item

  for (const cru of linhas) {
    const l = cru.trim();
    if (!l) { anterior = null; continue; }
    const semEmoji = l.replace(EMOJI, "").trim();
    if (!semEmoji) { if (anterior && ALERTA.test(l)) anterior.alerta = true; continue; }

    const numero = !MARCADOR.test(l) || /^\s*f\s*[-–]\s*\d/i.test(l) ? frotaDaLinha(l) : "";
    if (numero) {
      b = blocoDa(numero);
      b.cabecalho.push(l);
      anterior = null; osPendente = ""; marcadorSolto = false;
      continue;
    }
    if (!b) b = blocoDa("");

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
      const it = { ...limparItem(resto), os: osItem };
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

  // Sem nenhum marcador no bloco, cada linha é uma pendência (lista colada de
  // um PDF ou digitada sem traço) — a pessoa desmarca o que não for.
  for (const x of blocos) {
    if (!x.itens.length && x._semMarcador.length) {
      for (const l of x._semMarcador) {
        if (l.split(/\s+/).length < 2) continue;
        x.itens.push({ ...limparItem(l), os: "" });
        x.ignoradas.splice(x.ignoradas.indexOf(l), 1);
      }
    }
    x.fonte = fonteDe(x.cabecalho) || fonteDe(x.ignoradas.filter(ehTitulo));
    for (const it of x.itens) { delete it._aberto; }
    delete x.cabecalho; delete x._semMarcador;
  }
  return blocos.filter(x => x.itens.length || x.ignoradas.length);
}

/** Marca, em cada item, se a frota já tem essa pendência em aberto — pela
 *  identidade de atividade (o serviço e a posição, ver texto.js) — e se o
 *  mesmo item veio repetido na própria mensagem. */
export function marcarDuplicadas(frota, itens, atividades) {
  const abertas = atividades.filter(a => a.frota === frota);
  const porChave = new Map(abertas.map(a => [chave(a.frota, a.atividade), a]));
  const porTexto = new Map(abertas.map(a => [busca(a.atividade).replace(/\W+/g, " ").trim(), a]));
  const vistos = new Set();
  return itens.map(it => {
    const k = chave(frota, it.texto);
    const t = busca(it.texto).replace(/\W+/g, " ").trim();
    const ja = porChave.get(k) || porTexto.get(t) || null;
    const repetida = vistos.has(k);
    vistos.add(k);
    return { ...it, duplicada: ja, repetida };
  });
}

/** O que vai na observação: o dia e de onde veio ("[14/10] Inspeção"). É o
 *  formato que a carteira lê para contar há quantos dias a pendência espera. */
export function obsDaOrigem(fonte, dia) {
  const [, m, d] = String(dia || "").split("-");
  return `${d && m ? `[${d}/${m}] ` : ""}${fonte || "Inspeção"}`;
}
