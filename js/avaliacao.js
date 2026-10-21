// A avaliação da operação: as contas, sem tela.
//
// Três atrasos contam, os mesmos que o PCM definiu em 21/10/2026:
//   movimentação — concluída depois da data que a operação prometeu;
//   entrega      — a frota chegou na oficina depois do dia combinado para a
//                  preventiva (a parada que o PCM marcou);
//   liberação    — a operação remarcou para mais tarde a liberação que tinha
//                  informado (antecipar não é atraso).
// Cada um vira uma "ocorrência": o que era para ser, o que foi, quantos dias,
// o porquê e quem atrasou. A tela só agrupa e desenha. O que ainda está
// atrasando agora (prometida que passou, parada que passou sem a frota)
// aparece à parte, contando contra hoje.

import * as M from "./modelo.js";

export const TIPOS_OCORRENCIA = {
  mov: "Movimentação",
  entrega: "Entrega para a preventiva",
  liberacao: "Liberação remarcada",
};

const diaDoTs = ts => String(ts || "").slice(0, 10);
const noPeriodo = (d, de, ate) => !!d && (!de || d >= de) && (!ate || d <= ate);
const tituloMov = m => [m.acao, m.destino].filter(Boolean).join(" · ") || m.para_que || "movimentação";

/** As ocorrências do período, de todos os tipos. `de`/`ate` em ISO; vazios
 *  valem tudo. Só entra o que foi feito no período: concluída, entregue ou
 *  remarcada entre `de` e `ate`. */
export function ocorrencias({ movs = [], prevs = [], log = [], de = "", ate = "" }) {
  const r = [];
  for (const m of movs) {
    if (m.excluida || m.cancelada || !m.chegou_em || !noPeriodo(m.chegou_em, de, ate)) continue;
    const dias = m.prometida_para ? Math.max(0, M.difDias(m.prometida_para, m.chegou_em) || 0) : 0;
    r.push({ tipo: "mov", id: m.id, frota: m.frota || "", quando: m.chegou_em, combinado: m.prometida_para || "",
      feito: m.chegou_em, dias, atrasou: dias > 0, semPrazo: !m.prometida_para,
      motivo: m.motivo_atraso || m.justificativa || "", quem: m.quem_atrasou || "",
      oque: tituloMov(m), categoria: M.nomeCategoriaMov(M.categoriaMov(m)), aprovada: !!m.aprovada });
  }
  for (const p of prevs) {
    if (p.excluida || !p.entregue_em || !noPeriodo(p.entregue_em, de, ate)) continue;
    const dias = M.atrasoEntrega(p);
    r.push({ tipo: "entrega", id: p.id, frota: p.frota || "", quando: p.entregue_em, combinado: p.entrega_combinada || "",
      feito: p.entregue_em, dias, atrasou: dias > 0, semPrazo: !p.entrega_combinada,
      motivo: p.motivo_entrega || "", quem: p.quem_atrasou_entrega || "",
      oque: `Preventiva ${p.plano || ""}`.trim() });
  }
  const prevPorId = new Map(prevs.map(p => [p.id, p]));
  for (const e of log) {
    if (e.alvo_tipo !== "preventiva" || e.tipo !== "prev_disponivel") continue;
    const d = e.dados || {};
    const antes = d.de || "", depois = d.quando || "";
    // remarcar para mais tarde: de "agora" para uma data, ou de uma data para outra depois
    const adiou = antes && depois && antes !== depois &&
      (antes === "agora" ? depois !== "agora" : depois !== "agora" && depois > antes);
    const quando = diaDoTs(e.ts);
    if (!adiou || !noPeriodo(quando, de, ate)) continue;
    const p = prevPorId.get(e.alvo);
    if (!p || p.excluida) continue;
    const de_ = antes === "agora" ? quando : antes;
    r.push({ tipo: "liberacao", id: p.id, evento: e.id, frota: p.frota || "", quando, combinado: antes, feito: depois,
      dias: Math.max(0, M.difDias(de_, depois) || 0), atrasou: true, semPrazo: false,
      motivo: String(e.motivo || "").trim(), quem: "Operação", autor: e.autor || "",
      oque: `Preventiva ${p.plano || ""}`.trim() });
  }
  return r.sort((a, b) => b.quando.localeCompare(a.quando) || a.frota.localeCompare(b.frota, "pt-BR", { numeric: true }));
}

/** O que está atrasando agora: a movimentação cuja data prometida passou e a
 *  frota que não chegou para a parada. Conta os dias contra hoje. */
export function atrasandoAgora({ movs = [], prevs = [], ref = M.hoje() }) {
  const r = [];
  for (const m of movs) {
    if (!M.movimentacaoAberta(m) || M.situacaoMovimentacao(m, ref) !== "Atrasada") continue;
    r.push({ tipo: "mov", id: m.id, frota: m.frota || "", combinado: m.prometida_para, dias: M.atrasoMovimentacao(m, ref),
      motivo: m.motivo_atraso || m.justificativa || "", quem: m.quem_atrasou || "", oque: tituloMov(m) });
  }
  for (const p of prevs) {
    if (p.excluida || !M.entregaAtrasando(p, ref)) continue;
    r.push({ tipo: "entrega", id: p.id, frota: p.frota || "", combinado: M.combinadoEntrega(p), dias: M.atrasoEntrega(p, ref),
      motivo: "", quem: "", oque: `Preventiva ${p.plano || ""}`.trim() });
  }
  return r.sort((a, b) => b.dias - a.dias || a.frota.localeCompare(b.frota, "pt-BR", { numeric: true }));
}

/** Os atrasos que ninguém justificou: movimentação concluída ou atrasando sem
 *  o porquê, e frota entregue depois do combinado sem o porquê. A liberação
 *  remarcada já nasce com o motivo (o site exige). */
export function semJustificativa(movs = [], prevs = [], _log = [], ref = M.hoje()) {
  const r = [];
  for (const m of movs) {
    if (m.excluida || !M.movimentacaoSemJustificativa(m, ref)) continue;
    r.push({ tipo: "mov", id: m.id, frota: m.frota || "", dias: M.atrasoMovimentacao(m, ref), oque: tituloMov(m),
      quando: m.chegou_em || "", combinado: m.prometida_para || "" });
  }
  for (const p of prevs) {
    if (p.excluida || !p.entregue_em || p.motivo_entrega || M.atrasoEntrega(p) <= 0) continue;
    r.push({ tipo: "entrega", id: p.id, frota: p.frota || "", dias: M.atrasoEntrega(p), oque: `Preventiva ${p.plano || ""}`.trim(),
      quando: p.entregue_em, combinado: p.entrega_combinada || "" });
  }
  return r.sort((a, b) => b.dias - a.dias);
}

/** Os números do alto da tela. `pct` é a parte no prazo das que têm prazo:
 *  sem data prometida não dá para dizer se atrasou, e ficam de fora da conta
 *  (aparecem à parte, em `sem_prazo`). */
export function resumo(ocs, agora = []) {
  const de = t => ocs.filter(o => o.tipo === t);
  const parte = l => {
    const comPrazo = l.filter(o => !o.semPrazo);
    const atrasadas = comPrazo.filter(o => o.atrasou);
    const dias = atrasadas.reduce((s, o) => s + o.dias, 0);
    return { total: l.length, com_prazo: comPrazo.length, no_prazo: comPrazo.length - atrasadas.length,
      atrasadas: atrasadas.length, sem_prazo: l.length - comPrazo.length,
      pct: comPrazo.length ? (comPrazo.length - atrasadas.length) / comPrazo.length : null,
      atraso_medio: atrasadas.length ? dias / atrasadas.length : 0, dias };
  };
  const lib = de("liberacao");
  return {
    mov: parte(de("mov")),
    entrega: parte(de("entrega")),
    liberacao: { remarcadas: lib.length, frotas: new Set(lib.map(o => o.frota)).size,
      dias: lib.reduce((s, o) => s + o.dias, 0) },
    agora: { total: agora.length, movs: agora.filter(o => o.tipo === "mov").length,
      entregas: agora.filter(o => o.tipo === "entrega").length, dias: agora.reduce((s, o) => s + o.dias, 0) },
    // todos os atrasos do período, dos três tipos
    atrasos: ocs.filter(o => o.atrasou).length,
    dias_perdidos: ocs.filter(o => o.atrasou).reduce((s, o) => s + o.dias, 0),
  };
}

/** Semana a semana (segunda a domingo), no prazo × com atraso, das
 *  movimentações e das entregas. */
export function porSemana(ocs, de, ate) {
  if (!de || !ate) return [];
  const semanas = [];
  for (let d = M.somaDias(de, -((M.data(de).getUTCDay() + 6) % 7)); d <= ate; d = M.somaDias(d, 7)) {
    const w = M.semanaISO(d);
    semanas.push({ ini: d, fim: M.somaDias(d, 6), rotulo: "S" + w.semana, no_prazo: 0, atrasadas: 0, liberacoes: 0 });
  }
  for (const o of ocs) {
    const s = semanas.find(x => o.quando >= x.ini && o.quando <= x.fim);
    if (!s) continue;
    if (o.tipo === "liberacao") s.liberacoes++;
    else if (!o.semPrazo) s[o.atrasou ? "atrasadas" : "no_prazo"]++;
  }
  return semanas;
}

const chaveTexto = t => String(t || "").trim().toLowerCase();

/** Agrupa os atrasos por um campo de texto (motivo, quem), somando por tipo.
 *  Vazio vira `vazio` ("não informado"). A grafia mais usada dá o nome. */
export function agruparAtrasos(ocs, campo, vazio = "Não informado") {
  const g = new Map();
  for (const o of ocs) {
    if (!o.atrasou) continue;
    const texto = String(o[campo] || "").trim() || vazio;
    const k = chaveTexto(texto);
    if (!g.has(k)) g.set(k, { rotulo: texto, grafias: new Map(), mov: 0, entrega: 0, liberacao: 0, dias: 0, total: 0 });
    const x = g.get(k);
    x.grafias.set(texto, (x.grafias.get(texto) || 0) + 1);
    x[o.tipo]++;
    x.total++;
    x.dias += o.dias;
  }
  return [...g.values()].map(x => ({ ...x, rotulo: [...x.grafias].sort((a, b) => b[1] - a[1])[0][0] }))
    .sort((a, b) => b.total - a.total || b.dias - a.dias || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/** Por frota: quantos atrasos de cada tipo e os dias somados. */
export function porFrota(ocs) {
  const g = new Map();
  for (const o of ocs) {
    if (!g.has(o.frota)) g.set(o.frota, { frota: o.frota, total: 0, atrasos: 0, mov: 0, entrega: 0, liberacao: 0, dias: 0 });
    const x = g.get(o.frota);
    x.total++;
    if (!o.atrasou) continue;
    x.atrasos++;
    x[o.tipo]++;
    x.dias += o.dias;
  }
  return [...g.values()].sort((a, b) => b.atrasos - a.atrasos || b.dias - a.dias || a.frota.localeCompare(b.frota, "pt-BR", { numeric: true }));
}

/** Movimentações por categoria: no prazo × com atraso (as sem prazo à parte). */
export function porCategoria(ocs) {
  const g = new Map();
  for (const o of ocs) {
    if (o.tipo !== "mov") continue;
    if (!g.has(o.categoria)) g.set(o.categoria, { categoria: o.categoria, no_prazo: 0, atrasadas: 0, sem_prazo: 0, dias: 0 });
    const x = g.get(o.categoria);
    if (o.semPrazo) x.sem_prazo++;
    else if (o.atrasou) { x.atrasadas++; x.dias += o.dias; } else x.no_prazo++;
  }
  return [...g.values()].sort((a, b) => b.atrasadas - a.atrasadas || (b.no_prazo + b.atrasadas) - (a.no_prazo + a.atrasadas));
}

/** Quantos dias de atraso, em faixas: um atraso de um dia não é um de duas
 *  semanas. */
export const FAIXAS_ATRASO = [["1 dia", 1, 1], ["2 a 3 dias", 2, 3], ["4 a 7 dias", 4, 7], ["8 a 15 dias", 8, 15], ["Mais de 15", 16, Infinity]];
export function porFaixa(ocs) {
  return FAIXAS_ATRASO.map(([rotulo, min, max]) => {
    const l = ocs.filter(o => o.atrasou && o.dias >= min && o.dias <= max);
    return { rotulo, mov: l.filter(o => o.tipo === "mov").length, entrega: l.filter(o => o.tipo === "entrega").length,
      liberacao: l.filter(o => o.tipo === "liberacao").length, total: l.length };
  });
}

/** Os períodos da tela, contados a partir de hoje. */
export function periodos(ref = M.hoje()) {
  const [a, m] = ref.split("-").map(Number);
  const inicioMes = `${a}-${String(m).padStart(2, "0")}-01`;
  const fimMesPassado = M.somaDias(inicioMes, -1);
  const inicioMesPassado = fimMesPassado.slice(0, 8) + "01";
  const segunda = M.somaDias(ref, -((M.data(ref).getUTCDay() + 6) % 7));
  return [
    { id: "mes", rotulo: "Este mês", de: inicioMes, ate: ref },
    { id: "mes-passado", rotulo: "Mês passado", de: inicioMesPassado, ate: fimMesPassado },
    { id: "4s", rotulo: "4 semanas", de: M.somaDias(segunda, -21), ate: ref },
    { id: "12s", rotulo: "12 semanas", de: M.somaDias(segunda, -77), ate: ref },
    { id: "ano", rotulo: String(a), de: `${a}-01-01`, ate: ref },
  ];
}
