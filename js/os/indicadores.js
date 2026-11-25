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

/** O dia em que o serviço terminou (19/11/2026): a saída da encerrada; da aberta, o fim real da manutenção
 *  lançado na STL. Sem nenhum dos dois: "". A mesma régua da programação e da aderência pelo plano. */
export const terminouEm = (o) => (o.sit === "F" ? saidaDe(o) : o.fimReal || "");

/** A OS em aberto com a data de abertura depois da data do export (24/11/2026): está aberta no Protheus, mas pela regra
 *  da carteira só entra no backlog no dia da abertura (um "Dt. Original" posto para a frente). Não muda conta
 *  nenhuma: é o aviso quando "Abertas agora" fica maior que o backlog do dia. */
export const abreDepois = (o, base) => o.sit !== "F" && !!o.abertura && o.abertura > base;

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

/** Programada (11/11/2026, pedido do Mateus): tem a data programada (P. In. Man. ou, desde 19/11/2026, uma
 *  previsão da STL: `programadaEntre`) e quem execute — alguém da equipe ou terceiro na STL. A OS sem executante
 *  (grupo "S") não conta como programada em conta nenhuma: é contada à parte (`semExec`) e, se for encerrada no
 *  período, é extra programação. */
export const contaComoProgramada = (o) => (!!o.progEm || !!(o.prevs && o.prevs.length)) && o.grupo !== "S";

/** A OS tem data programada no período (19/11/2026, escolha do Mateus): a data programada da STJ (P. In. Man.) ou a
 *  de uma previsão (PLAN) de mão de obra na STL (`prevs`: as datas previstas de cada pessoa na OS). Na Makro a
 *  programação entra quase toda pela STL; a P. In. Man., quando ninguém mexe, é o dia da abertura. */
export const programadaEntre = (o, de, ate) => (!!o.progEm && o.progEm >= de && o.progEm <= ate) ||
  !!(o.prevs && o.prevs.some((d) => d >= de && d <= ate));

/** Programadas × finalizadas de um período (10/11/2026; 11/11/2026): `{ de, ate, fechAte? }`.
 *  Programadas: a data programada (P. In. Man. ou previsão da STL: `programadaEntre`) dentro do período e com
 *  executante. Delas:
 *    executadas — terminaram dentro do período (19/11/2026, pedido do Mateus; `terminouEm` até `fechAte`):
 *                 as encerradas nele e as abertas com o fim real lançado nele (`execAbertas`: serviço feito,
 *                 OS ainda não encerrada no Protheus);
 *    encerradas — Término = Sim: as no prazo (fim até `fechAte`, que é o `ate` — ou o domingo, na semana
 *                 cortada pelo fim do mês) e as depois; `ab`: as que seguem abertas.
 *  A que já tinha terminado antes do período (o fim lançado depois, com a data de antes) fica fora da conta,
 *  à parte (`antes`), como na aderência pelo plano de segunda: não foi programada e feita nele.
 *  Finalizadas no período: todas as que saíram da carteira nele (`saidaDe`) — as da programação dele e as
 *  extra programação (programadas para outro período, ou sem data programada).
 */
export function progFin(lista, { de, ate, fechAte = ate }) {
  const x = { n: 0, prazo: 0, depois: 0, ab: 0, exec: 0, execAbertas: 0, antes: 0, fin: 0, finProg: 0, finFora: 0, semExec: 0 };
  for (const o of lista) {
    const naData = programadaEntre(o, de, ate), prog = naData && contaComoProgramada(o);
    if (naData && !prog) x.semExec++;
    const f = prog ? terminouEm(o) : "";
    if (prog && f && f < de) x.antes++;
    else if (prog) {
      x.n++;
      const noPeriodo = !!f && f <= fechAte;
      if (o.sit !== "F") { x.ab++; if (o.fimReal && noPeriodo) { x.exec++; x.execAbertas++; } }
      else if (noPeriodo) { x.exec++; x.prazo++; }
      else x.depois++;
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

/** A chave de uma OS: filial e número sem os zeros da frente (a mesma do js/os/montar.js). */
const semZeros = (s) => String(s ?? "").trim().replace(/^0+(?=\d)/, "");
export const chaveOS = (filial, os) => semZeros(filial) + "|" + semZeros(os);

/** As OS de um bloco D, só o que a conferência usa: chave "filial|OS" → { os, filial, frota, sit, abertura, fim }. */
export function osDoBloco(D) {
  const m = new Map();
  for (const a of D.os) m.set(chaveOS(a[1], a[0]), { os: a[0], filial: a[1], frota: a[2], sit: a[6], abertura: a[5], fim: a[7] });
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
  const canc = new Set((B.canceladas || []).map((c) => chaveOS(c[1], c[0])));
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

// ── a aderência semanal pelo plano de segunda (19/11/2026, pedido do Mateus) ───────────────────────────
// O plano da semana é o que estava no painel na segunda-feira: as OS com a data programada (P. In. Man.) na semana
// e executante (alguém da equipe ou terceiro na STL), na cópia publicada na segunda. O que passou a ter a data na
// semana depois (a OS aberta durante ela vem com a data programada igual à abertura; outras ganham a data ou o
// executante depois) conta à parte, como incluída na semana. Cumprida: terminou dentro da semana — encerrada com o
// fim nela, ou aberta com o fim real da manutenção lançado nela. Corretivas e preventivas, cada uma com a sua conta.

/** A cópia que vale como plano da semana que começa na segunda `seg`: a primeira publicada na segunda; sem nenhuma
 *  na segunda, a última da semana anterior; sem nenhuma, a primeira da própria semana. `copias`: [{ dia, hora }]
 *  (o dia AAAA-MM-DD e a hora HH:MM da publicação, no horário local), em qualquer ordem. Devolve
 *  `{ copia, quando }` ("segunda", "antes" ou "depois") ou null. */
export function copiaDaSemana(copias, seg) {
  const dom = iso(t(seg) + 6 * DIA), semAntes = iso(t(seg) - 7 * DIA);
  const l = copias.filter((c) => c && c.dia).sort((a, b) => (a.dia + " " + (a.hora || "")).localeCompare(b.dia + " " + (b.hora || "")));
  const naSeg = l.find((c) => c.dia === seg);
  if (naSeg) return { copia: naSeg, quando: "segunda" };
  const antes = l.filter((c) => c.dia < seg && c.dia >= semAntes).pop();
  if (antes) return { copia: antes, quando: "antes" };
  const depois = l.find((c) => c.dia > seg && c.dia <= dom);
  return depois ? { copia: depois, quando: "depois" } : null;
}

/** As OS de uma cópia (o bloco D dela) com a data programada na semana, com ou sem executante na cópia, menos as
 *  que já tinham terminado antes da semana começar. */
function programadasDaCopia(D, { de, ate }, comExecutante) {
  // quem está na OS e as datas previstas (PLAN) de cada um: [índice, horas, horas previstas, prevista para, apontada em]
  const comGente = new Set(), prevs = new Map();
  for (const l of Object.values(D.exec || {})) for (const x of l) {
    comGente.add(x[0]);
    if (x[3]) { if (!prevs.has(x[0])) prevs.set(x[0], []); prevs.get(x[0]).push(x[3]); }
  }
  const lista = [];
  const na = (d) => !!d && d >= de && d <= ate;
  D.os.forEach((a, i) => {
    // (19/11/2026) a data que põe a OS na semana: a P. In. Man. ou uma previsão da STL (programadaEntre)
    const prog = na(a[19]) ? a[19] : (prevs.get(i) || []).filter(na).sort()[0] || "";
    if (!prog) return;
    if ((a[9] === "S" || a[17] === "S" || comGente.has(i)) !== comExecutante) return;
    const fim = a[6] === "F" ? saidaDe({ sit: "F", abertura: a[5], fim: a[7] }) : a[22] || "";
    if (fim && fim < de) return;
    lista.push({ k: chaveOS(a[1], a[0]), os: a[0], filial: a[1], frota: a[2], tipo: a[8] === "P" ? "P" : "C", progEm: prog });
  });
  return lista;
}
/** O plano de uma semana numa cópia: as OS com a data programada na semana e executante na cópia. */
export const planoDaCopia = (D, semana) => programadasDaCopia(D, semana, true);
/** Na mesma cópia, as com a data programada na semana e ninguém na STL (19/11/2026): ficaram fora do plano por
 *  falta de executante — a mesma forma do plano. */
export const semExecutanteDaCopia = (D, semana) => programadasDaCopia(D, semana, false);

// ── o plano guardado na publicação (19/11/2026, pedido do Mateus) ──
// Os Indicadores somam a aderência de várias semanas, e cada uma pedia baixar a cópia inteira do painel (~600 KB).
// Na publicação, a linha da versão no índice (meta.importacoes) leva, curto, o plano que ela pode ser chamada a dar:
// o da semana dela (vale se for a primeira cópia da semana) e o da seguinte (se for a última) — `podarPlanos` tira o
// resto. É o mesmo planoDaCopia sobre o mesmo D: o número não muda. Sem o plano guardado (as cópias de antes disto),
// os Indicadores baixam a cópia, como antes; o cartão da Programação baixa sempre (usa também as sem executante e a
// lista de frotas da cópia).

/** O dia, no horário daqui, de um instante: "AAAA-MM-DD" ("" se não for data) — o mesmo das cópias (copiaDaSemana). */
export const diaLocal = (x) => {
  const d = new Date(x);
  if (!x || isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
/** A segunda-feira da semana de um dia ("AAAA-MM-DD"). */
export const segundaDe = (d) => iso(t(d) - ((new Date(t(d)).getUTCDay() + 6) % 7) * DIA);
const curto = (l) => l.map((p) => [p.k, p.frota, p.tipo]);
/** Os planos de uma cópia publicada no dia `dia` (no horário daqui), curtos: { "<segunda>": [[chave, frota, tipo], …] },
 *  da semana dela e da seguinte. */
export function planosDaCopia(D, dia) {
  const seg = segundaDe(dia), prox = iso(t(seg) + 7 * DIA);
  const de = (s) => ({ de: s, ate: iso(t(s) + 6 * DIA) });
  return { [seg]: curto(planoDaCopia(D, de(seg))), [prox]: curto(planoDaCopia(D, de(prox))) };
}
/** O plano guardado de volta na forma do planoDaCopia (o que a aderência usa: chave, frota e tipo). */
export const planoGuardado = (l) => (Array.isArray(l) ? l.map(([k, frota, tipo]) => ({ k, frota, tipo })) : null);
/** Poda os planos guardados no índice: o da semana fica só na primeira cópia dela; o da seguinte, só na última — as
 *  outras nunca são o plano de semana nenhuma (copiaDaSemana). As voltas não são cópia. Devolve as linhas, sem mexer
 *  em nada além de `planos`. */
export function podarPlanos(indice) {
  const semanaDe = (l) => (l && l.id && l.tipo !== "volta" && diaLocal(l.publicado_em) ? segundaDe(diaLocal(l.publicado_em)) : "");
  const copias = indice.filter((l) => semanaDe(l)).sort((a, b) => String(a.publicado_em).localeCompare(String(b.publicado_em)));
  const primeira = new Map(), ultima = new Map();
  for (const l of copias) { const s = semanaDe(l); if (!primeira.has(s)) primeira.set(s, l); ultima.set(s, l); }
  return indice.map((l) => {
    if (!l || !l.planos) return l;
    const { planos, ...resto } = l, s = semanaDe(l), prox = s ? iso(t(s) + 7 * DIA) : "", fica = {};
    if (s && primeira.get(s) === l && planos[s]) fica[s] = planos[s];
    if (s && ultima.get(s) === l && planos[prox]) fica[prox] = planos[prox];
    return Object.keys(fica).length ? { ...resto, planos: fica } : resto;
  });
}

/**
 * A aderência de uma semana pelo plano dela. `plano`: planoDaCopia (já com os filtros da tela); `atuais`: Map chave →
 * a OS de hoje ({ sit, abertura, fim, fimReal, progEm, grupo, tipo }), com os mesmos filtros; `canceladas`: as chaves
 * das canceladas de hoje; `base`: a data do export de hoje — a semana em curso conta até ela. `tipo`: "C" ou "P".
 *   conta      — o que entra na conta: o plano menos as canceladas depois, as que saíram do painel e as que se
 *                descobriu terem terminado antes da semana (o fim lançado depois, com data de antes);
 *   cumpridas  — terminaram dentro da semana;  depois — terminaram depois do domingo;
 *   naoFeitas  — a semana acabou e não terminaram (`remarcadas`: a data programada de hoje é depois da semana);
 *   pendentes  — a semana está em curso e ainda não terminaram;
 *   incluidas  — hoje programadas para a semana (data nela e executante) e fora do plano (`incluidasFeitas`: já terminaram nela);
 *                com `frotas` (as da lista do painel na cópia), só as dessas frotas;
 *   aderencia  — cumpridas ÷ conta.
 */
export function aderenciaDoPlano(plano, atuais, { de, ate, base, canceladas = new Set(), tipo = "C", frotas = null }) {
  const fimSem = ate < base ? ate : base, passou = ate < base;
  const terminou = terminouEm;
  const x = { plano: 0, conta: 0, cumpridas: 0, depois: 0, naoFeitas: 0, remarcadas: 0, pendentes: 0, canceladas: 0, fora: 0, antes: 0,
    incluidas: 0, incluidasFeitas: 0, aderencia: null, passou,
    listas: { cumpridas: [], depois: [], naoFeitas: [], pendentes: [], incluidas: [], canceladas: [], antes: [] } };
  const noPlano = new Set();
  for (const p of plano) {
    if (p.tipo !== tipo) continue;
    x.plano++;
    noPlano.add(p.k);
    const o = atuais.get(p.k);
    if (!o) { if (canceladas.has(p.k)) { x.canceladas++; x.listas.canceladas.push(p.k); } else x.fora++; continue; }
    const f = terminou(o);
    if (f && f < de) { x.antes++; x.listas.antes.push(p.k); continue; }
    x.conta++;
    if (f && f <= fimSem) { x.cumpridas++; x.listas.cumpridas.push(p.k); }
    else if (f && f > ate) { x.depois++; x.listas.depois.push(p.k); }
    else if (passou) { x.naoFeitas++; x.listas.naoFeitas.push(p.k); if (o.progEm && o.progEm > ate) x.remarcadas++; }
    else { x.pendentes++; x.listas.pendentes.push(p.k); }
  }
  for (const [k, o] of atuais) {
    if (noPlano.has(k) || o.tipo !== (tipo === "P" ? "Preventiva" : "Corretiva")) continue;
    // a frota que ainda não estava na lista do painel na segunda: não tinha como estar no plano (nem é incluída)
    if (frotas && frotas.size && !frotas.has(o.frota)) continue;
    if (!programadaEntre(o, de, ate) || !contaComoProgramada(o)) continue;
    const f = terminou(o);
    if (f && f < de) continue;
    x.incluidas++;
    x.listas.incluidas.push(k);
    if (f && f <= fimSem) x.incluidasFeitas++;
  }
  x.aderencia = fracao(x.cumpridas, x.conta);
  return x;
}
