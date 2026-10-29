// O Excel das preventivas do mês: a aba Plano, uma linha por frota com as
// datas em quatro blocos — disponibilidade, parada, realização do serviço e
// fechamento — e as observações, e a aba Registro, uma linha por lançamento,
// com o porquê de cada reprogramação e mudança de liberação. É uma fotografia
// do mês para mandar ou arquivar; a tela continua sendo a do passo a passo.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import { avisar, erro } from "../ui.js";
import { natural } from "./grade.js";
import { descreverMudancaPrev, rotuloMes, TIPO_MUDANCA } from "./preventivas.js";

/** A data que põe a frota na agenda: a parada, senão a liberação, senão o
 *  vencimento. A realizada vai pelo dia em que saiu. */
export function dataDaAgenda(p, ref = M.hoje()) {
  if (M.preventivaFeita(p)) return p.realizada_em || "";
  return p.dia_parada || p.disponivel_em || (p.disponivel_agora ? ref : "") || M.venceEfetivo(p) || "";
}

/** A ordem da agenda: o que está em aberto pela próxima data; depois as
 *  realizadas; por último as adiadas e canceladas. */
export function ordemAgenda(ref = M.hoje()) {
  const grupo = p => M.preventivaAberta(p) ? 0 : M.preventivaFeita(p) ? 1 : 2;
  return (a, b) => grupo(a) - grupo(b) ||
    String(dataDaAgenda(a, ref) || "9").localeCompare(String(dataDaAgenda(b, ref) || "9")) || natural(a.frota, b.frota);
}

/** O registro da frota em palavras, do mais antigo ao mais novo, e o que
 *  dele vai para as células: as mudanças de liberação e as reprogramações da
 *  parada, cada uma com o porquê. */
export function registroDe(p) {
  const hist = ev.mudancasDe(p.id, "preventiva").map(descreverMudancaPrev).filter(Boolean);
  const mudou = t => hist.filter(m => m.e.tipo === t && m.tipo === "reprogramacao");
  return { hist, lib: mudou("prev_disponivel"), parada: mudou("prev_parada") };
}

const porque = l => l.map(m => String(m.e.motivo || "").trim()).filter(Boolean);
// ── baixar a planilha ──────────────────────────────────────────────────────
// Os mesmos blocos, em Excel: a aba Plano (uma linha por frota) e a aba
// Registro (uma linha por lançamento, com o porquê). É uma fotografia do mês.

const dataXL = iso => iso ? new Date(`${iso}T12:00:00`) : "";

export function linhasDaPlanilha(doMes, ref = M.hoje()) {
  const plano = doMes.filter(p => !p.excluida).sort((a, b) => (a.fora - b.fora) || ordemAgenda(ref)(a, b));
  const cab1 = ["Frota", "Equipamento", "Local", "Preventivas", "Qtd.", "Vencimento",
    "1 · DISPONIBILIDADE (operação)", "", "", "2 · PARADA (PCM)", "", "", "",
    "3 · REALIZAÇÃO DO SERVIÇO", "", "", "", "", "4 · FECHAMENTO", "", "", "", "Observações"];
  const cab2 = ["", "", "", "", "", "",
    "Data", "Mudanças", "Por que mudou (a última)",
    "Programada", "Primeira data", "Reprogramações", "Por que reprogramou (a última)",
    "Entrada na oficina", "Dias de atraso na entrega", "Por que atrasou", "Realizada em", "Onde fazer",
    "OS", "OS fechada em", "Resultado", "Por que (adiada ou cancelada)", ""];
  const linhas = plano.map(p => {
    const reg = registroDe(p);
    const ult = l => { const m = porque(l); return m.length ? m[m.length - 1] : ""; };
    const r = M.resultadoPreventiva(p, ref);
    return [p.frota, p.equipamento || "", p.local || "", p.plano || "", Number(p.qtd) || 1, dataXL(M.venceEfetivo(p)),
      p.disponivel_agora ? "agora" : dataXL(p.disponivel_em), p.reprog_liberacao || reg.lib.length || "", ult(reg.lib),
      dataXL(p.dia_parada), p.parada_orig && p.parada_orig !== p.dia_parada ? dataXL(p.parada_orig) : "", p.reprog_parada || reg.parada.length || "", ult(reg.parada),
      dataXL(p.entregue_em), M.atrasoEntrega(p, ref) || "", p.motivo_entrega || "", p.realizada_sem_data && !p.realizada_em ? "sem a data" : dataXL(p.realizada_em), p.onde_fazer || "",
      p.os || "", dataXL(p.fechada_em), p.fora ? "fora do plano" : r.texto, r.motivo || "",
      [p.obs, p.fora ? p.por_que_fora : ""].filter(Boolean).join(" · ")];
  });
  const registro = [["Frota", "Quando", "Quem", "Tipo", "O que mudou", "Por quê", "Detalhes"]];
  for (const p of plano) for (const m of registroDe(p).hist) {
    registro.push([p.frota, new Date(m.e.ts), m.e.autor || "", (TIPO_MUDANCA[m.tipo] || [m.tipo])[0], m.texto, m.e.motivo || "", m.detalhes.join(" · ")]);
  }
  return { cab1, cab2, linhas, registro };
}

export function baixarPlanilha(doMes, mes, ref = M.hoje()) {
  if (!globalThis.XLSX) { erro("A biblioteca de planilhas não carregou."); return; }
  const { cab1, cab2, linhas, registro } = linhasDaPlanilha(doMes, ref);
  const ws = XLSX.utils.aoa_to_sheet([cab1, cab2, ...linhas], { cellDates: true, dateNF: "dd/mm/yyyy" });
  // os blocos no cabeçalho, como na tela
  const junta = (c1, c2, r1 = 0, r2 = 0) => ({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
  ws["!merges"] = [0, 1, 2, 3, 4, 5, 22].map(c => junta(c, c, 0, 1)).concat([junta(6, 8), junta(9, 12), junta(13, 17), junta(18, 21)]);
  ws["!cols"] = [10, 14, 14, 18, 5, 11, 11, 9, 30, 11, 11, 9, 30, 12, 9, 26, 11, 10, 9, 12, 24, 26, 40].map(w => ({ wch: w }));
  for (const k of Object.keys(ws)) if (k[0] !== "!" && ws[k].t === "d") ws[k].z = "dd/mm/yyyy";
  const wr = XLSX.utils.aoa_to_sheet(registro, { cellDates: true });
  for (const k of Object.keys(wr)) if (k[0] !== "!" && wr[k].t === "d") wr[k].z = "dd/mm/yyyy hh:mm";
  wr["!cols"] = [10, 16, 14, 14, 50, 40, 40].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Plano");
  XLSX.utils.book_append_sheet(wb, wr, "Registro");
  const nome = `Preventivas ${rotuloMes(mes).replace("/", " ")}.xlsx`;
  try {
    XLSX.writeFile(wb, nome);
    avisar(`Planilha baixada: ${nome}.`);
  } catch (e) { erro("Não deu para gerar a planilha: " + e.message); }
}
