// O que decidir agora.
//
// O painel não para nos números: diz o que fazer com eles. Cada regra aqui olha
// o estado e devolve uma decisão com o porquê escrito — as datas que levaram a
// ela —, para que a sugestão possa ser conferida e, se for o caso, ignorada.
// Nenhuma regra grava nada; os botões só abrem a ação de sempre.
//
// Três níveis: 1 urgente (já venceu, ou a parada passou sem baixa), 2 atenção
// (vai vencer, ou depende de alguém responder), 3 oportunidade (dá para
// aproveitar uma parada para limpar a carteira da frota).
//
// Funções puras sobre listas: os testes chamam com dados montados à mão.

import * as M from "./modelo.js";

const br = iso => iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "—";
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const util = iso => { const d = M.data(iso).getUTCDay(); return d >= 1 && d <= 5; };
const proximoUtil = iso => { let d = iso; while (!util(d)) d = M.somaDias(d, 1); return d; };

/** Quando a parada vence: "venceu há 3 dias", "vence hoje", "vence em 5 dias". */
function prazoTexto(lim, ref) {
  if (!lim) return "sem vencimento";
  const n = M.difDias(ref, lim);
  if (n < 0) return `venceu há ${plural(-n, "dia", "dias")} (${br(lim)})`;
  if (n === 0) return `vence hoje (${br(lim)})`;
  return `vence em ${plural(n, "dia", "dias")} (${br(lim)})`;
}

function paradasPorDia(prevs) {
  const porDia = new Map();
  for (const x of prevs) if (x.dia_parada && M.preventivaAberta(x)) porDia.set(x.dia_parada, (porDia.get(x.dia_parada) || 0) + 1);
  return porDia;
}

/** O primeiro dia útil a partir da liberação com menos de duas paradas já
 *  marcadas, nos próximos dez dias úteis; se todos estiverem cheios, o primeiro. */
export function sugerirParada(p, prevs, ref, ocupados = null) {
  const desde = proximoUtil([ref, p.disponivel_agora ? ref : (p.disponivel_em || ref)].sort().pop());
  const porDia = ocupados || paradasPorDia(prevs);
  let d = desde;
  for (let i = 0; i < 10; i++) {
    if ((porDia.get(d) || 0) < 2) return d;
    d = proximoUtil(M.somaDias(d, 1));
  }
  return desde;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "Out-26" → "2026-10". */
export function mesDoPlano(m) {
  const [nome, aa] = String(m || "").split("-");
  const i = MESES.indexOf(String(nome || "").toLowerCase().slice(0, 3));
  return i < 0 || !aa ? "" : `20${aa}-${String(i + 1).padStart(2, "0")}`;
}
/** "2026-10-13" → "Out-26", o nome de mês que a aba da planilha usa. */
export function mesDaData(iso) {
  const i = Number(iso.slice(5, 7)) - 1;
  return MESES[i][0].toUpperCase() + MESES[i].slice(1) + "-" + iso.slice(2, 4);
}

/** O plano de preventivas que vale hoje: o do mês corrente; sem ele, o mais
 *  recente. Devolve o mês ("Out-26") e as preventivas dele. */
export function planoVigente(prevs, ref) {
  const atual = mesDaData(ref);
  const meses = [...new Set(prevs.map(p => p.mes).filter(Boolean))];
  const mes = meses.includes(atual) ? atual
    : meses.sort((a, b) => mesDoPlano(a).localeCompare(mesDoPlano(b))).pop() || "";
  return { mes, prevs: prevs.filter(p => p.mes === mes) };
}

// ── preventivas ─────────────────────────────────────────────────────────────

export function decisoesPreventivas(prevs, ats, ref) {
  const r = [];
  const plano = prevs.filter(p => !p.excluida && !p.fora);
  const abertas = plano.filter(M.preventivaAberta);
  const carteiraDa = frota => ats.filter(a => a.frota === frota && M.aberta(a) && !a.semana).length;

  // As que esperam o PCM ganham a sugestão na ordem do vencimento, e cada
  // sugestão ocupa o dia — senão todas cairiam no mesmo primeiro dia livre.
  const ocupados = paradasPorDia(plano);
  const sugestao = new Map();
  for (const p of abertas.filter(x => M.esperandoQuem(x, ref) === "PCM" && !x.dia_parada &&
    !M.situacaoPreventiva(x, ref).startsWith("Conflito"))
    .sort((a, b) => String(M.venceEfetivo(a) || "9").localeCompare(String(M.venceEfetivo(b) || "9")))) {
    const d = sugerirParada(p, plano, ref, ocupados);
    sugestao.set(p.id, d);
    ocupados.set(d, (ocupados.get(d) || 0) + 1);
  }

  const semLiberacao = [];
  for (const p of abertas) {
    const s = M.situacaoPreventiva(p, ref);
    const lim = M.venceEfetivo(p);
    const falta = lim ? M.difDias(ref, lim) : null;
    const base = { area: "Preventivas", frota: p.frota, id: p.id, vence: lim || "" };

    if (s === "Parada passou, sem baixa") {
      r.push({ ...base, nivel: 1, grupo: "parada_passou", titulo: `Dar a baixa ou reprogramar a parada da ${p.frota}`,
        detalhe: `A parada era ${br(p.dia_parada)} e não há registro de realização.`,
        acoes: [{ rotulo: "Realizada", prev: "realizada", id: p.id }, { rotulo: "Reprogramar", prev: "parada", id: p.id }] });
    } else if (s.startsWith("Conflito")) {
      r.push({ ...base, nivel: 1, grupo: "conflito", titulo: `Liberação depois do prazo: ${p.frota}`,
        detalhe: `A operação libera em ${br(p.disponivel_em)}, e a preventiva ${prazoTexto(lim, ref)}. ` +
          "Negociar a liberação antes do prazo, ou adiar com o motivo.",
        acoes: [{ rotulo: "Programar a parada", prev: "parada", id: p.id }, { rotulo: "Adiar", prev: "adiar", id: p.id }] });
    } else if (s === "Programada depois do prazo") {
      r.push({ ...base, nivel: 1, grupo: "antecipar", titulo: `Antecipar a parada da ${p.frota}`,
        detalhe: `Parada em ${br(p.dia_parada)}, mas a preventiva ${prazoTexto(lim, ref)}.`,
        acoes: [{ rotulo: "Reprogramar", prev: "parada", id: p.id }] });
    } else if (M.esperandoQuem(p, ref) === "PCM") {
      const sug = sugestao.get(p.id) || sugerirParada(p, plano, ref);
      const nivel = falta != null && falta <= 7 ? 1 : 2;
      r.push({ ...base, nivel, grupo: "programar", titulo: `Programar a parada da ${p.frota}`,
        detalhe: `Liberada ${p.disponivel_agora ? "agora" : "a partir de " + br(p.disponivel_em)}; ` +
          `${prazoTexto(lim, ref)}. Sugestão: ${br(sug)} (primeiro dia útil com menos de duas paradas).`,
        acoes: [{ rotulo: `Programar para ${br(sug)}`, prev: "parada", id: p.id, sugestao: sug }] });
    } else if (M.esperandoQuem(p, ref) === "Operação") {
      semLiberacao.push(p);
    }

    // Oportunidade: a frota vai parar — dá para limpar a carteira dela junto.
    if (p.dia_parada && p.dia_parada >= ref) {
      const n = carteiraDa(p.frota);
      if (n) r.push({ ...base, nivel: 3, grupo: "aproveitar", titulo: `Aproveitar a parada da ${p.frota} (${br(p.dia_parada)})`,
        detalhe: `A frota tem ${plural(n, "pendência", "pendências")} na carteira, sem semana. ` +
          "Programá-las para o mesmo dia economiza uma parada.",
        acoes: [{ rotulo: "Ver as pendências", ir: ["programacao", `m=carteira&f=${encodeURIComponent(p.frota)}`] }] });
    }
  }

  if (semLiberacao.length) {
    const urgentes = semLiberacao.filter(p => { const l = M.venceEfetivo(p); return l && M.difDias(ref, l) <= 5; });
    const ordem = semLiberacao.slice().sort((a, b) => String(M.venceEfetivo(a) || "9").localeCompare(String(M.venceEfetivo(b) || "9")));
    const texto = "Preventivas aguardando a liberação da frota:\n" +
      ordem.map(p => `• ${p.frota}${p.plano ? " (" + p.plano + ")" : ""} — ${prazoTexto(M.venceEfetivo(p), ref)}`).join("\n") +
      "\nPor favor, informem quando cada uma fica disponível.";
    r.push({ area: "Preventivas", nivel: urgentes.length ? 1 : 2, vence: M.venceEfetivo(ordem[0]) || "",
      titulo: `Cobrar a operação: ${plural(semLiberacao.length, "frota sem liberação", "frotas sem liberação")}`,
      detalhe: (urgentes.length ? `${plural(urgentes.length, "vence", "vencem")} em até 5 dias ou já ${urgentes.length === 1 ? "venceu" : "venceram"}: ` +
        urgentes.map(p => p.frota).join(", ") + ". " : "") + "Sem a liberação o PCM não consegue programar a parada.",
      acoes: [{ rotulo: "Copiar a cobrança", copiar: texto }, { rotulo: "Ver", ir: ["preventivas", ""] }] });
  }

  // Concentração: muitas paradas no mesmo dia.
  const porDia = new Map();
  for (const p of abertas) if (p.dia_parada && p.dia_parada >= ref) {
    if (!porDia.has(p.dia_parada)) porDia.set(p.dia_parada, []);
    porDia.get(p.dia_parada).push(p);
  }
  for (const [dia, l] of [...porDia].sort()) {
    if (l.length < 3) continue;
    const hh = l.reduce((s, p) => s + (Number(p.hh) || 0), 0);
    r.push({ area: "Preventivas", nivel: 2, titulo: `${br(dia)} tem ${l.length} paradas programadas`,
      detalhe: `${l.map(p => p.frota).join(", ")}${hh ? ` · ${String(Math.round(hh * 10) / 10).replace(".", ",")} HH previstos` : ""}. ` +
        "Conferir se a oficina comporta, ou espalhar para outro dia.", acoes: [] });
  }

  // O ritmo do mês: quanto já saiu contra quanto do mês já passou. Só para o
  // plano do mês corrente — o de um mês fechado não tem mais calendário.
  const valem = plano.filter(p => !p.adiada && !p.cancelada);
  if (valem.length && plano.every(p => mesDoPlano(p.mes) === ref.slice(0, 7))) {
    const qtd = l => l.reduce((t, p) => t + (Number(p.qtd) || 1), 0);
    const total = qtd(valem);
    const feitas = qtd(valem.filter(M.preventivaFeita));
    const [ano, mes] = ref.split("-").map(Number);
    const diasMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const passou = Number(ref.slice(8, 10)) / diasMes;
    const pctFeito = feitas / total;
    if (passou - pctFeito >= 0.2) {
      r.push({ area: "Preventivas", nivel: 2, titulo: "O plano do mês está atrás do calendário",
        detalhe: `${Math.round(pctFeito * 100)}% realizadas (${feitas} de ${total} preventivas) com ${Math.round(passou * 100)}% do mês passado. ` +
          `Faltam ${total - feitas} em ${diasMes - Number(ref.slice(8, 10))} dias.`, acoes: [] });
    }
  }
  // Do mais urgente para a oportunidade; no mesmo nível, o prazo mais curto
  // primeiro (o que não tem prazo vai para o fim do nível).
  return r.sort((a, b) => a.nivel - b.nivel || String(a.vence || "9").localeCompare(String(b.vence || "9")));
}

// ── programação (atividades) ────────────────────────────────────────────────

export function decisoesProgramacao(ats, ref) {
  const r = [];
  const vivas = ats.filter(a => !a.excluida && !a.cancelada && (a.atividade || a.frota));
  const vencidas = vivas.filter(a => M.situacaoDe(a, ref) === "VENCIDA");
  if (vencidas.length) {
    const sem = vencidas.filter(a => !a.motivo && !a.quem_atrasou).length;
    r.push({ area: "Programação", nivel: 1, titulo: `${plural(vencidas.length, "atividade vencida", "atividades vencidas")}`,
      detalhe: (sem ? `${sem} sem justificativa. ` : "Todas justificadas. ") +
        "Dar a baixa do que saiu — dá para marcar várias e dar baixa de uma vez — e reprogramar com motivo o que não saiu.",
      acoes: [{ rotulo: "Ver as vencidas", ir: ["programacao", "m=abertas&sit=VENCIDA"] }] });
  }
  const hoje = vivas.filter(a => M.situacaoDe(a, ref) === "Fecha hoje");
  if (hoje.length) {
    r.push({ area: "Programação", nivel: 2, titulo: `${plural(hoje.length, "atividade vence", "atividades vencem")} hoje`,
      detalhe: `${[...new Set(hoje.map(a => a.frota))].slice(0, 8).join(", ")}.`,
      acoes: [{ rotulo: "Abrir Hoje", ir: ["hoje", ""] }] });
  }
  const { ano, semana } = M.semanaISO(ref);
  const daSemana = vivas.filter(a => a.semana === semana && a.ano === ano && M.aberta(a));
  const semOS = daSemana.filter(a => !a.os).length;
  if (semOS) {
    r.push({ area: "Programação", nivel: 2, titulo: `${plural(semOS, "atividade", "atividades")} da semana sem OS`,
      detalhe: "Sem a OS o Protheus não registra o serviço. Lançar na própria linha, com Enter.",
      acoes: [{ rotulo: "Lançar as OS", ir: ["programacao", `s=${semana}&a=${ano}&os=sem`] }] });
  }
  const hh = M.semanaEmHH(ats, ano, semana);
  for (const p of hh.carga.filter(x => x.ocupacao > 1)) {
    r.push({ area: "Programação", nivel: 2, titulo: `${p.nome} com ${Math.round(p.ocupacao * 100)}% da capacidade`,
      detalhe: `${String(Math.round(p.total * 10) / 10).replace(".", ",")} HH na semana, para ${String(Math.round(p.capacidade * 10) / 10).replace(".", ",")} de capacidade. ` +
        "Redistribuir ou mudar o dia de alguma atividade.",
      acoes: [{ rotulo: "Abrir a Semana", ir: ["semana", ""] }] });
  }
  return r;
}

// ── movimentação ────────────────────────────────────────────────────────────

export function decisoesMovimentacao(movs, ref, { podeAprovar = true } = {}) {
  const r = [];
  const vivas = movs.filter(m => !m.excluida);
  const atrasadas = vivas.filter(m => M.situacaoMovimentacao(m, ref) === "Atrasada");
  if (atrasadas.length) {
    r.push({ area: "Movimentação", nivel: 1, titulo: `${plural(atrasadas.length, "movimentação atrasada", "movimentações atrasadas")}`,
      detalhe: `${atrasadas.map(m => m.frota).slice(0, 10).join(", ")}. Cobrar a operação — a imagem da lista vai direto para o grupo.`,
      acoes: [{ rotulo: "Abrir Movimentação", ir: ["movimentacoes", ""] }] });
  }
  const aprovar = vivas.filter(M.movimentacaoParaAprovar);
  if (aprovar.length && podeAprovar) {
    r.push({ area: "Movimentação", nivel: 2, titulo: `${plural(aprovar.length, "movimentação", "movimentações")} aguardando a sua aprovação`,
      detalhe: "A operação concluiu; falta o PCM conferir.",
      acoes: [{ rotulo: "Aprovar", ir: ["movimentacoes", ""] }] });
  }
  const hoje = vivas.filter(m => M.situacaoMovimentacao(m, ref) === "Vence hoje");
  if (hoje.length) {
    r.push({ area: "Movimentação", nivel: 2, titulo: `${plural(hoje.length, "movimentação vence", "movimentações vencem")} hoje`,
      detalhe: `${hoje.map(m => m.frota).join(", ")}.`, acoes: [{ rotulo: "Abrir Movimentação", ir: ["movimentacoes", ""] }] });
  }
  return r;
}

/** Tudo junto, do mais urgente para a oportunidade. */
export function todas({ ats, movs, prevs, ref, podeAprovar = true }) {
  return [...decisoesPreventivas(prevs, ats, ref), ...decisoesProgramacao(ats, ref),
    ...decisoesMovimentacao(movs, ref, { podeAprovar })].sort((a, b) => a.nivel - b.nivel);
}

// ── para o Painel geral: o mesmo tipo de decisão, de várias frotas, numa linha ─

const GRUPOS = {
  programar: n => `Programar a parada de ${n} preventivas liberadas`,
  parada_passou: n => `${n} paradas passaram sem baixa`,
  conflito: n => `${n} preventivas com a liberação depois do prazo`,
  antecipar: n => `${n} paradas marcadas depois do prazo`,
  aproveitar: n => `${n} paradas para aproveitar e limpar a carteira`,
};

/** Junta as decisões do mesmo grupo quando são `min` ou mais: no Painel geral,
 *  onze "Programar a parada da F-…" tomariam a lista inteira e esconderiam as
 *  outras áreas. A linha que junta fica onde estava a primeira do grupo (a
 *  mais urgente, porque a lista vem ordenada) e leva ao painel de preventivas,
 *  onde cada uma tem o seu botão. */
export function resumir(ds, min = 3) {
  const porGrupo = new Map();
  for (const d of ds) if (d.grupo && GRUPOS[d.grupo]) {
    if (!porGrupo.has(d.grupo)) porGrupo.set(d.grupo, []);
    porGrupo.get(d.grupo).push(d);
  }
  const feitos = new Set();
  const r = [];
  for (const d of ds) {
    const l = d.grupo && porGrupo.get(d.grupo);
    if (!l || l.length < min) { r.push(d); continue; }
    if (feitos.has(d.grupo)) continue;
    feitos.add(d.grupo);
    const nivel = Math.min(...l.map(x => x.nivel));
    const urgentes = l.filter(x => x.nivel === 1).length;
    const frotas = l.map(x => x.frota);
    r.push({ area: d.area, nivel, grupo: d.grupo, juntas: l.length, titulo: GRUPOS[d.grupo](l.length),
      detalhe: (urgentes && urgentes < l.length ? `${plural(urgentes, "urgente", "urgentes")}. ` : "") +
        frotas.slice(0, 8).join(", ") + (frotas.length > 8 ? ` e mais ${frotas.length - 8}` : "") +
        ". Cada uma, com o porquê e o botão, no painel de preventivas.",
      acoes: [{ rotulo: "Abrir no painel de preventivas", ir: ["preventivas", "v=painel"] }] });
  }
  return r;
}
