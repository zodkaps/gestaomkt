// O que ficou no aparelho de antes da sincronização, e o que foi lançado nele.
//
// Até 08/10 o site era só do navegador: a planilha era importada ali, com ids
// inventados na hora. Quando a sincronização chegou, a planilha foi importada
// de novo no banco, com o id da própria planilha (A-0205…). No navegador que
// já tinha a importação antiga, os dois conjuntos conviviam e cada atividade
// aparecia duas vezes. A fita agora deixa o antigo de fora (`eventos.js`,
// `recarregar`); aqui se acha o que foi lançado DEPOIS nas cópias antigas — a
// baixa, a justificativa, a exclusão, que foram para o banco apontando para
// uma atividade que o banco não tem — e a atividade certa de cada uma, para o
// lançamento ir para ela. Nada é levado sem a pessoa confirmar.

import * as ev from "./eventos.js";
import * as M from "./modelo.js";
import { chave } from "./texto.js";

const LEVA = new Set(["concluida", "justificada", "excluida", "cancelada", "reaberta",
  "programada", "reprogramada"]);

const soLetras = f => String(f || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Os lançamentos da fita que caíram numa cópia antiga: o alvo só existe no
 *  legado. Cada um vem com a cópia (como estava) e a atividade certa, quando
 *  há exatamente uma: a mesma frota e a mesma atividade (a chave do
 *  importador); faltando, a mesma OS na mesma frota. `feito` diz se a certa
 *  já está como o lançamento a deixaria — aí não há o que levar. */
export function lancamentosEmCopias(legado = ev.legado, fita = ev.log, atual = ev.estado.atividade) {
  if (!legado.length) return [];
  const copias = ev.reconstruir(legado).atividade;
  const reais = [...atual.values()].filter(a => !a.excluida && (a.atividade || a.frota));
  const porChave = new Map();
  for (const a of reais) {
    const k = chave(soLetras(a.frota), a.atividade || "");
    if (!porChave.has(k)) porChave.set(k, []);
    porChave.get(k).push(a);
  }
  const r = [];
  for (const e of fita) {
    if ((e.alvo_tipo || "atividade") !== "atividade" || !LEVA.has(e.tipo)) continue;
    if (atual.has(e.alvo) || !copias.has(e.alvo)) continue;
    const copia = copias.get(e.alvo);
    let candidatas = porChave.get(chave(soLetras(copia.frota), copia.atividade || "")) || [];
    let por = "atividade";
    if (!candidatas.length && copia.os) {
      candidatas = reais.filter(a => a.os === copia.os && soLetras(a.frota) === soLetras(copia.frota));
      por = "OS";
    }
    const certa = candidatas.length === 1 ? atual.get(candidatas[0].id) : null;
    r.push({ e, copia, certa, por: certa ? por : "",
      porque: certa ? "" : candidatas.length > 1 ? `${candidatas.length} parecidas — escolha na tela` : "não achei a atividade no banco",
      feito: certa ? jaEsta(e, certa) : false });
  }
  return r;
}

function paraDe(e) {
  const d = e.dados || {};
  return d.para || d;
}

/** A atividade certa já está como o lançamento a deixaria? */
function jaEsta(e, a) {
  const d = e.dados || {};
  switch (e.tipo) {
    case "concluida": return M.feita(a) && !!a.concluida_em;
    case "justificada": return String(a.motivo || "").trim() === String(d.motivo || "").trim();
    case "excluida": return !!a.excluida;
    case "cancelada": return !!a.cancelada;
    case "reaberta": return M.aberta(a);
    case "programada": case "reprogramada": {
      const p = paraDe(e);
      return (a.semana ?? null) === (p.semana ?? null) && (a.ano ?? null) === (p.ano ?? null) && (a.dia || "") === (p.dia || "");
    }
    default: return false;
  }
}

/** Os lançamentos para a atividade certa, na ordem em que foram feitos na
 *  cópia. Feitos com as mesmas funções de sempre — as mesmas regras e
 *  permissões —, sobre o estado da certa já com os anteriores aplicados. */
export function levarParaAsCertas(itens) {
  const r = [];
  const agora = new Map();
  for (const it of [...itens].sort((x, y) => String(x.e.ts).localeCompare(String(y.e.ts)))) {
    if (!it.certa || it.feito) continue;
    const a = agora.get(it.certa.id) || { ...it.certa };
    if (jaEsta(it.e, a)) continue;
    const d = it.e.dados || {};
    let novo = null;
    switch (it.e.tipo) {
      case "concluida": novo = ev.concluir(a, d.em); a.concluida_em = d.em; a.feita_sem_data = false; break;
      case "justificada": novo = ev.justificar(a, d, "atividade"); a.motivo = String(d.motivo || "").trim(); break;
      case "excluida": novo = ev.excluir(a, it.e.motivo || ""); a.excluida = true; break;
      case "cancelada": novo = ev.cancelar(a, it.e.motivo || "Lançado numa cópia antiga deste aparelho"); a.cancelada = true; break;
      case "reaberta": novo = ev.reabrir(a, it.e.motivo || ""); a.concluida_em = ""; a.feita_sem_data = false; break;
      case "programada": case "reprogramada": {
        const p = paraDe(it.e);
        novo = ev.reprogramar(a, { ano: p.ano ?? null, semana: p.semana ?? null, dia: p.dia || "", dias: p.dias ?? a.dias, hh: p.hh ?? a.hh },
          it.e.motivo || "Lançado numa cópia antiga deste aparelho");
        Object.assign(a, { ano: p.ano ?? null, semana: p.semana ?? null, dia: p.dia || "" });
        break;
      }
    }
    agora.set(a.id, a);
    if (novo) r.push(novo);
  }
  return r;
}

/** Em palavras, para a lista da tela. */
export function descrever(e) {
  const d = e.dados || {};
  const br = iso => iso ? String(iso).split("-").reverse().join("/") : "";
  switch (e.tipo) {
    case "concluida": return `baixa em ${br(d.em)}`;
    case "justificada": return `justificativa: ${d.motivo || d.texto || ""}${d.quem ? " (" + d.quem + ")" : ""}`;
    case "excluida": return "exclusão";
    case "cancelada": return `cancelamento${e.motivo ? ": " + e.motivo : ""}`;
    case "reaberta": return "reabertura";
    default: {
      const p = paraDe(e);
      return p.semana ? `programada para a semana ${p.semana}${p.dia ? " · " + p.dia : ""}` : "retirada da programação";
    }
  }
}
