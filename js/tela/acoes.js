// As ações de cada item, num lugar só.
//
// Toda tela mostra o mesmo "⋯" ao lado de um item — atividade, movimentação ou
// preventiva — e ele abre as mesmas opções. Quais aparecem depende de duas
// coisas: o estado do item (não dá para reabrir o que está aberto) e o papel de
// quem está olhando (a operação não exclui; o PCM não aprova o que ele mesmo
// concluiu). Mexer em um lugar muda em todos.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { el, caixa, campo, confirmar, erro, avisar } from "../ui.js";
import { concluir, reprogramar, devolverParaCarteira, justificar } from "./comum.js";
import { concluirMov, aprovar, devolver, prometerData, cancelarMov } from "./movimentacoes.js";
import { informarDisponibilidade, marcarParada, darPorFeita, passarParaOMesSeguinte,
  cancelarPrev, andamento, reabrirPrev } from "./preventivas.js";

export function menuDe(tipo, id, ctx) {
  const item = ev.porId(id, tipo);
  if (!item) return;
  if (tipo === "atividade") return menuAtividade(item, ctx);
  if (tipo === "movimentacao") return menuMovimentacao(item, ctx);
  return menuPreventiva(item, ctx);
}

/** A lista de opções numa caixa: cada uma devolve a sua chave. */
function escolher(titulo, opcoes, nota = "") {
  return caixa({
    titulo,
    corpo: ({ fechar }) => el("div", { class: "menu-acoes" },
      nota ? el("p", { class: "nada", style: "margin-top:0" }, nota) : null,
      opcoes.map(o => el("button", { type: "button",
        class: "opcao-acao" + (o.perigo ? " perigo" : ""),
        onclick: () => fechar(o.chave) },
        el("b", {}, o.rotulo),
        o.explica ? el("small", {}, o.explica) : null))),
    acoes: [{ rotulo: "Fechar", valor: "" }],
  });
}

/** Pergunta antes de algo que some ou que volta atrás, e só então grava. */
async function gravarCom(titulo, texto, criar, rotuloSim, sucesso) {
  if (!await confirmar(titulo, texto, rotuloSim)) return false;
  try {
    await ev.aplicar(criar());
    avisar(sucesso);
    return true;
  } catch (e) { erro(e.message); return false; }
}

// ── atividade (OS) ──────────────────────────────────────────────────────────

export async function menuAtividade(a, ctx) {
  const pode = p => pessoas.pode(p);
  const aberta = M.aberta(a);
  const op = [];
  if ((aberta || a.feita_sem_data) && pode("baixar")) {
    op.push({ chave: "concluir", rotulo: a.feita_sem_data ? "Dar a data" : "Dar baixa",
      explica: a.feita_sem_data ? "a planilha marca feita, mas sem o dia" : "marca como feita, com a data em que saiu" });
  }
  if (aberta && pode("programar")) {
    op.push({ chave: "programar", rotulo: a.semana ? "Reprogramar" : "Programar",
      explica: a.semana ? "muda a semana ou o dia — pede o motivo" : "põe numa semana e num dia" });
  }
  if (aberta && a.semana && pode("programar")) {
    op.push({ chave: "tirar", rotulo: "Tirar da programação",
      explica: "volta para a carteira, sem semana — pede o motivo" });
  }
  if (M.feita(a) && !a.feita_sem_data && pode("baixar")) {
    op.push({ chave: "reabrir", rotulo: "Reabrir", explica: "a data de conclusão sai" });
  }
  if (pode("editar_atividade") && !a.cancelada) {
    op.push({ chave: "justificar", rotulo: a.motivo ? "Mudar justificativa" : "Justificar",
      explica: "por que atrasou e quem atrasou" });
  }
  if (pode("editar_atividade") && aberta) {
    op.push({ chave: "cancelar", rotulo: "Cancelar", perigo: true,
      explica: "não vai ser feita — sai da aderência em vez de contar como feita" });
  }
  if (pode("editar_atividade") && a.cancelada) {
    op.push({ chave: "restaurar", rotulo: "Desfazer o cancelamento" });
  }
  if (pode("editar_atividade")) {
    op.push({ chave: "excluir", rotulo: "Excluir da lista", perigo: true,
      explica: "some das telas; o registro fica e dá para desfazer" });
  }
  if (!op.length) return;

  const r = await escolher(`${a.frota || "Atividade"} · ${a.atividade || ""}`.trim(), op);
  if (r === "concluir") return concluir(a, ctx);
  if (r === "programar") return reprogramar(a, ctx);
  if (r === "tirar") return devolverParaCarteira(a, ctx);
  if (r === "justificar") return justificar(a, "atividade");
  if (r === "reabrir") return gravarCom("Reabrir",
    "A data de conclusão sai e a atividade volta a pesar na aderência.",
    () => ev.reabrir(a), "Reabrir", "Reaberta.");
  if (r === "restaurar") return gravarCom("Desfazer o cancelamento", "A atividade volta a contar.",
    () => ev.restaurar(a), "Desfazer", "Cancelamento desfeito.");
  if (r === "excluir") return gravarCom("Excluir da lista",
    "A atividade some das telas. O registro dela fica no histórico, e dá para desfazer pelo Registro.",
    () => ev.excluir(a, "", "atividade"), "Excluir", "Excluída.");
  if (r === "cancelar") return cancelarAtividade(a);
}

async function cancelarAtividade(a) {
  const motivo = el("input", { type: "text", placeholder: "por que não vai ser feita" });
  const conf = await caixa({
    titulo: "Cancelar a atividade",
    corpo: el("div", {},
      el("p", {}, "Cancelada não é concluída: sai da aderência em vez de contar como feita."),
      campo("Motivo", motivo)),
    acoes: [{ rotulo: "Voltar", valor: false },
      { rotulo: "Cancelar a atividade", classe: "perigo", valor: true }],
  });
  if (conf !== true) return;
  try { await ev.aplicar(ev.cancelar(a, motivo.value.trim())); avisar("Cancelada."); }
  catch (e) { erro(e.message); }
}

// ── movimentação ────────────────────────────────────────────────────────────

export async function menuMovimentacao(m, ctx) {
  const pode = p => pessoas.pode(p);
  const aberta = M.movimentacaoAberta(m);
  const op = [];
  if (aberta && pode("movimentar")) {
    op.push({ chave: "concluir", rotulo: "Concluir", explica: "a frota voltou ou o serviço saiu" });
    op.push({ chave: "prazo", rotulo: m.prometida_para ? "Mudar o prazo" : "Dar o prazo" });
  }
  if (!m.cancelada && pode("movimentar") && (M.atrasoMovimentacao(m) > 0 || m.motivo_atraso || m.justificativa)) {
    op.push({ chave: "justificar", rotulo: m.motivo_atraso ? "Mudar justificativa" : "Justificar",
      explica: "por que atrasou e quem atrasou" });
  }
  if (m.chegou_em && !m.cancelada && pode("aprovar")) {
    if (!m.aprovada) op.push({ chave: "aprovar", rotulo: "Aprovar" });
    op.push({ chave: "devolver", rotulo: "Devolver para a operação", perigo: true,
      explica: "o PCM não confere — volta em aberto, com o motivo" });
  }
  if (aberta && !m.cancelada && pode("movimentar")) {
    op.push({ chave: "cancelar", rotulo: "Cancelar a movimentação", perigo: true,
      explica: "não vai acontecer — pede o motivo" });
  }
  if (pode("editar_atividade")) {
    op.push({ chave: "excluir", rotulo: "Excluir", perigo: true,
      explica: "some das telas; o registro fica e dá para desfazer" });
  }
  if (!op.length) return;

  const r = await escolher(`${m.frota || "Movimentação"} · ${m.destino || ""}`.trim(), op);
  if (r === "concluir") return concluirMov(m);
  if (r === "prazo") return prometerData(m);
  if (r === "justificar") return justificar(m, "movimentacao");
  if (r === "aprovar") return aprovar(m);
  if (r === "devolver") return devolver(m);
  if (r === "cancelar") return cancelarMov(m);
  if (r === "excluir") return gravarCom("Excluir",
    "A movimentação some das telas. O registro dela fica, e dá para desfazer pelo Registro.",
    () => ev.excluir(m, "", "movimentacao"), "Excluir", "Excluída.");
}

// ── preventiva ──────────────────────────────────────────────────────────────

export async function menuPreventiva(p, ctx) {
  const pode = x => pessoas.pode(x);
  const aberta = M.preventivaAberta(p);
  const op = [];
  if (aberta && pode("disponibilidade")) {
    op.push({ chave: "disponivel", rotulo: "Disponibilidade", explica: "quando a frota fica livre" });
  }
  if (aberta && pode("parada")) {
    op.push({ chave: "parada", rotulo: "Marcar a parada", explica: "o dia em que a frota para" });
    op.push({ chave: "andamento", rotulo: p.em_andamento ? "Tirar de em andamento" : "Em andamento" });
    op.push({ chave: "feita", rotulo: "Realizada", explica: "a preventiva saiu — com a data" });
    op.push({ chave: "mes", rotulo: "Passar para o mês seguinte", explica: "sai da conta deste mês, com o motivo" });
    op.push({ chave: "cancelar", rotulo: "Cancelar", perigo: true, explica: "não vai ser feita neste mapa" });
  }
  if (!aberta && !p.fora && pode("parada")) {
    op.push({ chave: "reabrir", rotulo: "Reabrir", explica: "volta para o mapa" });
  }
  if (pode("editar_atividade")) {
    op.push({ chave: "excluir", rotulo: "Excluir do mapa", perigo: true,
      explica: "some das telas; o registro fica e dá para desfazer" });
  }
  if (!op.length) return;

  const r = await escolher(`${p.frota || "Preventiva"} · ${p.plano || ""}`.trim(), op);
  if (r === "disponivel") return informarDisponibilidade(p);
  if (r === "parada") return marcarParada(p);
  if (r === "andamento") return andamento(p, !p.em_andamento);
  if (r === "feita") return darPorFeita(p);
  if (r === "mes") return passarParaOMesSeguinte(p);
  if (r === "cancelar") return cancelarPrev(p);
  if (r === "reabrir") return reabrirPrev(p);
  if (r === "excluir") return gravarCom("Excluir do mapa",
    "A preventiva some das telas. O registro dela fica, e dá para desfazer pelo Registro.",
    () => ev.excluir(p, "", "preventiva"), "Excluir", "Excluída.");
}

