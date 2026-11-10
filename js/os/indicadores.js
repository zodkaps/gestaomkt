// Os indicadores de PCM do painel de OS (09/11/2026).
//
// Só contas, sem tela: recebem as OS já montadas pelo painel (js/os/painel.js
// — `abertura`, `sit`, `fim`, `dias`, `tipo`, `classe`, `grupo`, `progEm`,
// `liberada`, `horas`, `prevEstado`, `lancDepois`) e um período, e devolvem os
// números. Ficam aqui, separados, para o teste (testes/rodar.js) conferir cada
// fórmula com dado inventado — e para a fórmula escrita no cartão ser a mesma
// que a conta.
//
// O período vale para o que é fluxo (o que entrou, o que fechou, o que estava
// programado); a carteira é sempre a de hoje (a data do export, `base`).
// Nada aqui inventa meta: o número e a regra; quem decide se está bom é o PCM.

const DIA = 864e5;
const t = (iso) => Date.parse(iso + "T00:00:00Z");
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
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

/** O período de mesmo tamanho logo antes: para comparar. */
export function anterior({ desde, ate, base }) {
  const fim = ate < base ? ate : base;
  const n = Math.round((t(fim) - t(desde)) / DIA) + 1;
  return { desde: iso(t(desde) - n * DIA), ate: iso(t(desde) - DIA), base };
}

/** As OS abertas num dia do passado: abertas até ele e não finalizadas até ele. */
export const abertasEm = (todas, dia) => todas.filter((o) => o.abertura && o.abertura <= dia && (o.sit !== "F" || (o.fim && o.fim > dia)));

/**
 * Os indicadores de um período. `todas`: as OS com os filtros (menos o período).
 * Cada número vem com o que entrou na conta, para o cartão dizer "x de y".
 */
export function indicadores(todas, { desde, ate, base }) {
  const ateReal = ate < base ? ate : base;
  const no = (d) => !!d && d >= desde && d <= ateReal;
  const abertas = todas.filter((o) => o.sit !== "F");
  const fechadas = todas.filter((o) => o.sit === "F" && no(o.fim));
  const entraram = todas.filter((o) => no(o.abertura));
  const semanas = diasDe({ desde, ate, base }) / 7;

  // carteira e ritmo
  const ritmo = semanas ? fechadas.length / semanas : null;                 // fechadas por semana
  const backlogSemanas = ritmo ? abertas.length / ritmo : null;              // semanas para zerar no ritmo do período
  const atendimento = fracao(fechadas.length, entraram.length);              // fechadas ÷ entraram
  const noComeco = abertasEm(todas, iso(t(desde) - DIA)).length;            // a carteira na véspera do período

  // prazo
  const diasF = fechadas.map((o) => o.dias).filter((d) => d != null);
  const ate7 = diasF.filter((d) => d <= 7).length;
  const diasA = abertas.map((o) => o.dias).filter((d) => d != null);
  const v90 = diasA.filter((d) => d > 90).length;
  // aderência: as programadas para uma semana que já acabou, finalizadas até o domingo dela
  const elegiveis = todas.filter((o) => no(o.progEm) && domingoDe(o.progEm) < base);
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
    carteira: abertas.length, noComeco, aguardando: abertas.filter((o) => o.sit === "P").length,
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
    const fechou = todas.filter((o) => o.sit === "F" && o.fim && o.fim >= b.de && o.fim <= b.ate).map((o) => o.dias).filter((d) => d != null);
    const prog = todas.filter((o) => o.progEm && o.progEm >= b.de && o.progEm <= b.ate && domingoDe(o.progEm) < base);
    const ok = prog.filter((o) => o.sit === "F" && o.fim && o.fim <= domingoDe(o.progEm)).length;
    return { ...b, fechadas: fechou.length, tempo: mediana(fechou), programadas: prog.length, cumpridas: ok, aderencia: fracao(ok, prog.length) };
  });
}

/** Programadas × finalizadas de um período (10/11/2026): `{ de, ate, fechAte? }`.
 *  Programadas: a data programada (P. In. Man.) dentro do período; delas, as fechadas no período (fim até
 *  `fechAte`, que é o `ate` — ou o domingo, na semana cortada pelo fim do mês), as fechadas depois e as
 *  ainda abertas. Finalizadas: todas com o fim dentro do período — as da programação dele e as extra
 *  programação ("de fora": programadas para outro período, ou sem data programada).
 */
export function progFin(lista, { de, ate, fechAte = ate }) {
  const x = { n: 0, prazo: 0, depois: 0, ab: 0, fin: 0, finProg: 0, finFora: 0 };
  for (const o of lista) {
    const prog = !!o.progEm && o.progEm >= de && o.progEm <= ate;
    if (prog) {
      x.n++;
      if (o.sit !== "F") x.ab++;
      else if (o.fim <= fechAte) x.prazo++;
      else x.depois++;
    }
    if (o.sit === "F" && o.fim && o.fim >= de && o.fim <= ate) {
      x.fin++;
      if (prog) x.finProg++; else x.finFora++;
    }
  }
  return x;
}
