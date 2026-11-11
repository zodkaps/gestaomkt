// Os indicadores de PCM do painel de OS (09/11/2026; revisão de 11/11/2026).
//
// Só contas, sem tela: recebem as OS já montadas pelo painel (js/os/painel.js
// — `abertura`, `sit`, `fim`, `fimReal`, `dias`, `tipo`, `classe`, `grupo`,
// `progEm`, `liberada`, `horas`, `prevEstado`, `lancDepois`) e um período, e
// devolvem os números. Ficam aqui, separados, para o teste (testes/rodar.js)
// conferir cada fórmula com dado inventado — e para a fórmula escrita no
// cartão ser a mesma que a conta.
//
// A regra de toda conta de carteira (revisão de 11/11/2026), igual em todas as abas:
//   - a OS ENTRA na carteira no dia da abertura (Dt. Original);
//   - SAI no dia do fim da manutenção (R. Fim Man.) da OS encerrada (Término = Sim) —
//     mas nunca antes de entrar: a OS lançada no Protheus depois do serviço (o fim
//     antes da abertura) entra e sai no dia da abertura (`saidaDe`);
//   - está EM ABERTO num dia quem entrou até ele e não saiu até ele (`emAberto`);
//   - num período: backlog inicial (em aberto na véspera) + entradas − saídas =
//     backlog final (em aberto no último dia com dado). `movimento` confere a
//     conta e devolve a diferença — que só não é zero se um dado vier torto.
// O que não tem data não entra em conta nenhuma: aparece na auditoria.
// Nada aqui inventa meta: o número e a regra; quem decide se está bom é o PCM.

const DIA = 864e5;
const t = (iso) => Date.parse(iso + "T00:00:00Z");
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
/** O dia anterior (AAAA-MM-DD). */
export const diaAntes = (d) => iso(t(d) - DIA);
/** O domingo da semana (segunda a domingo) de um dia. */
export const domingoDe = (d) => iso(t(d) + ((7 - new Date(t(d)).getUTCDay()) % 7) * DIA);

export function mediana(v) {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const media = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
const fracao = (n, d) => (d ? n / d : null);

/** Quantos dias tem o período, contando até a data do export (o futuro não conta). */
export function diasDe({ desde, ate, base }) {
  const fim = ate < base ? ate : base;
  return Math.max(0, Math.round((t(fim) - t(desde)) / DIA) + 1);
}

/** O período para comparar: o de mesmo tamanho logo antes. A semana (`unidade: "semana"`) compara com a
 *  semana anterior nos mesmos dias; o mês, com o mês anterior nos mesmos dias (até o fim dele). */
export function anterior({ desde, ate, base, unidade = "" }) {
  const fim = ate < base ? ate : base;
  const n = Math.round((t(fim) - t(desde)) / DIA) + 1;
  if (unidade === "semana") return { desde: iso(t(desde) - 7 * DIA), ate: iso(t(fim) - 7 * DIA), base };
  if (unidade === "mes") {
    const a = Number(desde.slice(0, 4)), m = Number(desde.slice(5, 7));
    const de = m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, "0")}-01`;
    const ultimo = iso(Date.UTC(Number(de.slice(0, 4)), Number(de.slice(5, 7)), 0)), ate2 = iso(t(de) + (n - 1) * DIA);
    return { desde: de, ate: ate2 > ultimo ? ultimo : ate2, base };
  }
  return { desde: iso(t(desde) - n * DIA), ate: iso(t(desde) - DIA), base };
}

/** O dia em que a OS saiu da carteira: o fim da manutenção da encerrada, mas nunca antes da abertura
 *  (a lançada depois do serviço sai no dia em que entrou). Em aberto, ou encerrada sem data: "". */
export const saidaDe = (o) => (o.sit === "F" && o.fim ? (o.abertura && o.fim < o.abertura ? o.abertura : o.fim) : "");

/** Em aberto no fim do dia `d`: entrou até ele e não saiu até ele. */
export const emAberto = (o, d) => !!o.abertura && o.abertura <= d && !(o.sit === "F" && (!o.fim || saidaDe(o) <= d));

/** As OS em aberto num dia do passado. */
export const abertasEm = (todas, dia) => todas.filter((o) => emAberto(o, dia));

/**
 * O movimento da carteira num período (11/11/2026). `de`–`ate`: o período; `base`: a data do export (o
 * que vem depois dela não tem dado, e o período para nela). Devolve:
 *   inicial  — em aberto na véspera do período;
 *   entradas — abertas no período (as que seguem abertas: `novasAbertas`; as que já saíram: `saidasNovas`);
 *   saidas   — encerradas no período: as que já estavam na carteira (`saidasAntigas`) e as que entraram e
 *              saíram nele (`saidasNovas`); `lancadasDepois` delas tinham o fim antes da abertura;
 *   final    — em aberto no último dia (`antigasAbertas` + `novasAbertas`);
 *   esperado = inicial + entradas − saidas, e `diferenca` = final − esperado (a conferência).
 * As OS sem data de abertura e as encerradas sem data de fim não entram: vêm contadas à parte.
 */
export function movimento(todas, { de, ate, base }) {
  const fim = ate < base ? ate : base, vespera = diaAntes(de);
  const x = { de, ate: fim, vespera, inicial: 0, entradas: 0, saidas: 0, saidasAntigas: 0, saidasNovas: 0, lancadasDepois: 0,
    final: 0, antigasAbertas: 0, novasAbertas: 0, semAbertura: 0, semFim: 0, divergentes: [] };
  for (const o of todas) {
    if (!o.abertura) { x.semAbertura++; continue; }
    if (o.sit === "F" && !o.fim) { x.semFim++; continue; }
    if (o.abertura > fim) continue;
    const s = saidaDe(o), entrou = o.abertura >= de;
    if (emAberto(o, vespera)) x.inicial++;
    if (entrou) x.entradas++;
    if (s && s >= de && s <= fim) {
      x.saidas++;
      if (entrou) x.saidasNovas++; else x.saidasAntigas++;
      if (o.fim < o.abertura) x.lancadasDepois++;
    }
    const fica = emAberto(o, fim);
    if (fica) { x.final++; if (entrou) x.novasAbertas++; else x.antigasAbertas++; }
    // cada OS: estava + entrou − saiu = fica. Se não, a conta dela não fecha — e a OS vai para a lista
    if ((emAberto(o, vespera) ? 1 : 0) + (entrou ? 1 : 0) - (s && s >= de && s <= fim ? 1 : 0) !== (fica ? 1 : 0)) x.divergentes.push(o);
  }
  x.esperado = x.inicial + x.entradas - x.saidas;
  x.diferenca = x.final - x.esperado;
  x.saldo = x.entradas - x.saidas;
  x.variacao = x.final - x.inicial;
  x.variacaoPct = fracao(x.variacao, x.inicial);
  x.taxaEncerramento = fracao(x.saidas, x.entradas);
  return x;
}

/**
 * Os indicadores de um período. `todas`: as OS com os filtros (menos o período).
 * Cada número vem com o que entrou na conta, para o cartão dizer "x de y".
 */
export function indicadores(todas, { desde, ate, base }) {
  const ateReal = ate < base ? ate : base;
  const no = (d) => !!d && d >= desde && d <= ateReal;
  const mov = movimento(todas, { de: desde, ate, base });
  const abertas = todas.filter((o) => o.sit !== "F");                      // hoje: idade, executante, previsão
  const fechadas = todas.filter((o) => o.sit === "F" && no(saidaDe(o)));
  const entraram = todas.filter((o) => no(o.abertura));
  const semanas = diasDe({ desde, ate, base }) / 7;

  // carteira e ritmo: a carteira é a do fim do período (a de hoje, se o período chega até hoje)
  const ritmo = semanas ? fechadas.length / semanas : null;                 // fechadas por semana
  const backlogSemanas = ritmo ? mov.final / ritmo : null;                   // semanas para zerar no ritmo do período
  const atendimento = fracao(fechadas.length, entraram.length);              // fechadas ÷ entraram

  // prazo
  const diasF = fechadas.map((o) => o.dias).filter((d) => d != null);
  const ate7 = diasF.filter((d) => d <= 7).length;
  const diasA = abertas.map((o) => o.dias).filter((d) => d != null);
  const v90 = diasA.filter((d) => d > 90).length;
  // aderência: as programadas (com executante) para uma semana que já acabou, finalizadas até o domingo dela
  const elegiveis = todas.filter((o) => no(o.progEm) && contaComoProgramada(o) && domingoDe(o.progEm) < base);
  const cumpridas = elegiveis.filter((o) => o.sit === "F" && o.fim && o.fim <= domingoDe(o.progEm)).length;
  const equipe = abertas.filter((o) => o.grupo === "I");
  const vencidas = equipe.filter((o) => o.prevEstado === "vencida").length;

  // planejamento e mão de obra
  const prev = fechadas.filter((o) => o.tipo === "Preventiva").length;
  const progP = fechadas.filter((o) => o.classe === "P").length, progN = fechadas.filter((o) => o.classe === "N").length;
  const comExec = abertas.filter((o) => o.grupo !== "S").length;
  const liberadas = todas.filter((o) => no(o.liberada) && o.abertura && o.liberada >= o.abertura);
  const esperaLib = liberadas.map((o) => Math.round((t(o.liberada) - t(o.abertura)) / DIA));
  const horas = fechadas.reduce((s, o) => s + (o.horas || 0), 0);
  const comHoras = fechadas.filter((o) => o.horas > 0);
  const depois = fechadas.filter((o) => o.lancDepois > 0).length;

  return {
    periodo: { desde, ate: ateReal, dias: diasDe({ desde, ate, base }), semanas },
    carteira: mov.final, noComeco: mov.inicial, aguardando: abertas.filter((o) => o.sit === "P").length,
    fechadas: fechadas.length, entraram: entraram.length, saldo: entraram.length - fechadas.length,
    ritmo, backlogSemanas, atendimento,
    tempoMediana: mediana(diasF), tempoMedia: media(diasF), ate7: fracao(ate7, diasF.length), nAte7: ate7,
    idadeMediana: mediana(diasA), mais90: fracao(v90, diasA.length), nMais90: v90,
    aderencia: fracao(cumpridas, elegiveis.length), cumpridas, programadas: elegiveis.length,
    vencida: fracao(vencidas, equipe.length), nVencidas: vencidas, nEquipe: equipe.length,
    preventiva: fracao(prev, fechadas.length), nPreventivas: prev,
    programado: fracao(progP, progP + progN), nProgP: progP, nProgN: progN,
    cobertura: fracao(comExec, abertas.length), nComExec: comExec,
    esperaLiberacao: mediana(esperaLib), nLiberadas: liberadas.length,
    horas: Math.round(horas * 10) / 10, horasPorOS: comHoras.length ? Math.round((horas / comHoras.length) * 10) / 10 : null,
    abertasDepois: fracao(depois, fechadas.length), nDepois: depois,
  };
}

/** Por semana (ou mês, ou dia): o tempo para fechar e a aderência de cada pedaço do período. */
export function porBalde(todas, baldes, base) {
  return baldes.map((b) => {
    const fechou = todas.filter((o) => { const s = saidaDe(o); return s && s >= b.de && s <= b.ate; }).map((o) => o.dias).filter((d) => d != null);
    const prog = todas.filter((o) => o.progEm && o.progEm >= b.de && o.progEm <= b.ate && contaComoProgramada(o) && domingoDe(o.progEm) < base);
    const ok = prog.filter((o) => o.sit === "F" && o.fim && o.fim <= domingoDe(o.progEm)).length;
    return { ...b, fechadas: fechou.length, tempo: mediana(fechou), programadas: prog.length, cumpridas: ok, aderencia: fracao(ok, prog.length) };
  });
}

/** Programada (11/11/2026, pedido do Mateus): tem a data programada (P. In. Man.) e quem execute — alguém da
 *  equipe ou terceiro na STL. A OS sem executante (grupo "S") não conta como programada em conta nenhuma: é
 *  contada à parte (`semExec`) e, se for encerrada no período, é extra programação. */
export const contaComoProgramada = (o) => !!o.progEm && o.grupo !== "S";

/** Programadas × finalizadas de um período (10/11/2026; 11/11/2026): `{ de, ate, fechAte? }`.
 *  Programadas: a data programada (P. In. Man.) dentro do período e com executante. Delas:
 *    executadas — com o fim real da manutenção (R. Fim Man.) na STJ: as encerradas e as abertas que já o têm
 *                 (`execAbertas`: serviço feito, OS ainda não encerrada no Protheus);
 *    encerradas — Término = Sim: as no prazo (fim até `fechAte`, que é o `ate` — ou o domingo, na semana
 *                 cortada pelo fim do mês) e as depois; `ab`: as que seguem abertas.
 *  Finalizadas no período: todas as que saíram da carteira nele (`saidaDe`) — as da programação dele e as
 *  extra programação (programadas para outro período, ou sem data programada).
 */
export function progFin(lista, { de, ate, fechAte = ate }) {
  const x = { n: 0, prazo: 0, depois: 0, ab: 0, exec: 0, execAbertas: 0, fin: 0, finProg: 0, finFora: 0, semExec: 0 };
  for (const o of lista) {
    const naData = !!o.progEm && o.progEm >= de && o.progEm <= ate, prog = naData && contaComoProgramada(o);
    if (naData && !prog) x.semExec++;
    if (prog) {
      x.n++;
      if (o.sit !== "F") { x.ab++; if (o.fimReal) { x.exec++; x.execAbertas++; } }
      else { x.exec++; if (o.fim <= fechAte) x.prazo++; else x.depois++; }
    }
    const s = saidaDe(o);
    if (s && s >= de && s <= ate) {
      x.fin++;
      if (prog) x.finProg++; else x.finFora++;
    }
  }
  return x;
}

// ── as atualizações do Protheus (11/11/2026) ─────────────────────────────────
// Cada atualização grava uma cópia do dia no bucket (dias/AAAA-MM-DD.json.gz). Aqui, as contas para
// comparar duas delas. Trabalham com o bloco D do painel (D.os: as listas de js/os/montar.js).

/** As OS de um bloco D, só o que a conferência usa: chave "filial|OS" → { os, filial, frota, sit, abertura, fim }. */
export function osDoBloco(D) {
  const m = new Map();
  for (const a of D.os) m.set(a[1] + "|" + a[0], { os: a[0], filial: a[1], frota: a[2], sit: a[6], abertura: a[5], fim: a[7] });
  return m;
}

/**
 * De uma atualização (A) para outra mais nova (B): a carteira em aberto em cada uma e o que a fez mudar.
 *   backlogB = backlogA + novas (em aberto em B, não estavam em A) + reabertas (encerradas em A, em aberto em B)
 *              − encerradas (em aberto em A, encerradas em B) − canceladas − sumiram (em aberto em A, fora de B)
 * Cada OS conta uma vez e a soma fecha por construção: a `diferenca` só não é zero se a conta tiver erro.
 * Canceladas só se distinguem das que sumiram quando B traz a lista delas (D.canceladas, desde 11/11/2026).
 * Também: as que mudaram de situação sem sair da carteira (liberadas; voltaram a aguardar), as que mudaram
 * de data, as novas que já entraram encerradas e as novas com abertura antiga (incluídas com data de antes).
 */
export function compararAtualizacoes(A, B) {
  const a = osDoBloco(A), b = osDoBloco(B);
  const canc = new Set((B.canceladas || []).map((c) => c[1] + "|" + c[0]));
  const aberta = (o) => o.sit !== "F";
  const r = { baseA: A.base, baseB: B.base, totalA: a.size, totalB: b.size, backlogA: 0, backlogB: 0,
    novas: [], novasEncerradas: [], reabertas: [], encerradas: [], canceladas: [], sumiram: [], sumiramEncerradas: [],
    liberadas: [], voltaramAguardar: [], datasMudaram: [] };
  for (const [k, x] of a) {
    if (aberta(x)) r.backlogA++;
    const y = b.get(k);
    if (!y) { (aberta(x) ? (canc.has(k) ? r.canceladas : r.sumiram) : r.sumiramEncerradas).push(x); continue; }
    if (aberta(x) && !aberta(y)) r.encerradas.push(y);
    else if (!aberta(x) && aberta(y)) r.reabertas.push(y);
    else if (aberta(x) && x.sit !== y.sit) (y.sit === "A" ? r.liberadas : r.voltaramAguardar).push(y);
    if (x.abertura !== y.abertura || (x.fim && y.fim && x.fim !== y.fim)) r.datasMudaram.push({ ...y, antes: { abertura: x.abertura, fim: x.fim } });
  }
  for (const [k, y] of b) {
    if (aberta(y)) r.backlogB++;
    if (!a.has(k)) (aberta(y) ? r.novas : r.novasEncerradas).push(y);
  }
  r.novasAntigas = r.novas.filter((o) => o.abertura && o.abertura < A.base);
  r.esperado = r.backlogA + r.novas.length + r.reabertas.length - r.encerradas.length - r.canceladas.length - r.sumiram.length;
  r.diferenca = r.backlogB - r.esperado;
  r.variacao = r.backlogB - r.backlogA;
  return r;
}

/**
 * O backlog que a atualização X registrou no dia dela × o backlog daquele mesmo dia refeito hoje (com H, a
 * atualização mais nova). A diferença é o que mudou depois com data de antes, OS por OS:
 *   saíram (estavam em aberto em X, não no refeito): encerradas no próprio dia, depois do export;
 *     encerradas com data de fim anterior ao dia (lançadas depois); sumiram do export (canceladas ou
 *     excluídas); outras (a data de abertura mudou);
 *   entraram (no refeito, não em X): abertas no próprio dia, depois do export; incluídas depois com
 *     abertura anterior; reabertas; outras (a data de abertura mudou).
 * registrado − saíram + entraram = reconstruído, sempre: cada OS cai em um lado só.
 */
export function registradoReconstruido(X, H) {
  const dia = X.base, x = osDoBloco(X), h = osDoBloco(H);
  const regX = new Set(), recX = new Set();
  for (const [k, o] of x) if (emAberto(o, dia)) regX.add(k);
  for (const [k, o] of h) if (emAberto(o, dia)) recX.add(k);
  const r = { dia, baseH: H.base, registrado: regX.size, reconstruido: recX.size,
    encerradasNoDia: [], encerradasAntes: [], sumiram: [], saiuOutras: [], abertasNoDia: [], incluidasAntes: [], reabertas: [], entrouOutras: [] };
  for (const k of regX) {
    if (recX.has(k)) continue;
    const o = h.get(k);
    if (!o) r.sumiram.push(x.get(k));
    else if (o.sit === "F" && saidaDe(o) && saidaDe(o) <= dia) (saidaDe(o) === dia ? r.encerradasNoDia : r.encerradasAntes).push(o);
    else r.saiuOutras.push(o);
  }
  for (const k of recX) {
    if (regX.has(k)) continue;
    const o = h.get(k), ox = x.get(k);
    if (!ox) (o.abertura === dia ? r.abertasNoDia : r.incluidasAntes).push(o);
    else if (ox.sit === "F") r.reabertas.push(o);
    else r.entrouOutras.push(o);
  }
  r.saiu = r.encerradasNoDia.length + r.encerradasAntes.length + r.sumiram.length + r.saiuOutras.length;
  r.entrou = r.abertasNoDia.length + r.incluidasAntes.length + r.reabertas.length + r.entrouOutras.length;
  r.diferenca = r.reconstruido - r.registrado;
  return r;
}
