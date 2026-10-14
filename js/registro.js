// As contas da tela Registro, fora da tela para dar para testar: o dia de cada
// lançamento, o filtro e o resumo de um dia.

import { TIPOS } from "./eventos.js";
import { busca as semAcento } from "./texto.js";

/** O que conta como baixa no resumo: atividade, preventiva e movimentação. */
export const BAIXAS = new Set(["concluida", "prev_realizada", "mov_chegou"]);

/** O dia do lançamento no relógio de quem olha. `ts` é UTC: às 21h em
 *  Mossoró já é o dia seguinte em UTC, e o lançamento da noite caía no dia
 *  errado. */
export function diaDe(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Saiu de uma decisão do Painel (ver `ev.porDecisao`). */
export const pelaDecisao = e => !!(e.dados && e.dados.via && e.dados.via.decisao);

/** Os lançamentos que passam nos filtros, do mais novo para o mais velho.
 *  `f`: { busca, tipo, alvo, autor, origem, frota, de, ate }. O tipo
 *  "_baixas" junta as três baixas (ver BAIXAS). A origem
 *  "painel" é a marca da decisão, não a coluna origem. `achar(id)` devolve
 *  { item, tipo } — é de onde vêm frota, OS e atividade para a busca. */
export function filtrarRegistro(log, f, achar) {
  const q = semAcento(String(f.busca || "").trim());
  return log.filter(e => {
    if (f.tipo === "_baixas") { if (!BAIXAS.has(e.tipo)) return false; }
    else if (f.tipo && e.tipo !== f.tipo) return false;
    if (f.alvo && (e.alvo_tipo || "atividade") !== f.alvo) return false;
    if (f.autor && (e.autor || "") !== f.autor) return false;
    if (f.origem === "painel") { if (!pelaDecisao(e)) return false; }
    else if (f.origem && (e.origem || "manual") !== f.origem) return false;
    if (f.de || f.ate) {
      const d = diaDe(e.ts);
      if (f.de && d < f.de) return false;
      if (f.ate && d > f.ate) return false;
    }
    if (f.frota || q) {
      const achado = achar(e.alvo);
      const a = achado && achado.item;
      if (f.frota && (!a || a.frota !== f.frota)) return false;
      if (q) {
        const alvo = semAcento([a && a.frota, a && a.os, a && a.atividade, a && a.acao, a && a.destino,
          a && a.plano, e.motivo, e.tipo, TIPOS[e.tipo], e.origem, e.autor,
          pelaDecisao(e) ? e.dados.via.decisao : ""].filter(Boolean).join(" "));
        if (!alvo.includes(q)) return false;
      }
    }
    return true;
  }).reverse();
}

/** Os números de um dia: quantos, de que tipo, de quem, e quantos saíram
 *  do Painel. As listas vêm da maior para a menor. */
export function resumoDoDia(log, dia) {
  const doDia = log.filter(e => diaDe(e.ts) === dia);
  const conta = chave => {
    const m = new Map();
    for (const e of doDia) { const k = chave(e); m.set(k, (m.get(k) || 0) + 1); }
    return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "pt-BR"));
  };
  return {
    total: doDia.length,
    baixas: doDia.filter(e => BAIXAS.has(e.tipo)).length,
    reprogramacoes: doDia.filter(e => e.tipo === "reprogramada").length,
    novas: doDia.filter(e => e.tipo === "criada").length,
    painel: doDia.filter(pelaDecisao).length,
    porTipo: conta(e => e.tipo),
    porPessoa: conta(e => e.autor || "—"),
  };
}
