// As contas da tela Registro, fora da tela para dar para testar: o dia de cada
// lançamento, o filtro e o resumo de um dia.

import { TIPOS } from "./eventos.js";
import { busca as semAcento, filtroDeFrota } from "./texto.js";

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
 *  `f`: { busca, tipo, alvo, autor, origem, frota, frotas, de, ate }. A frota é
 *  a digitada, qualquer uma (ver `filtroDeFrota`); `frotas`, as conhecidas,
 *  dizem quando o digitado é uma frota inteira. O tipo
 *  "_baixas" junta as três baixas (ver BAIXAS). A origem
 *  "painel" é a marca da decisão, não a coluna origem. `achar(id)` devolve
 *  { item, tipo } — é de onde vêm frota, OS e atividade para a busca. */
export function filtrarRegistro(log, f, achar) {
  const q = semAcento(String(f.busca || "").trim());
  const fr = filtroDeFrota(f.frota, f.frotas || []);
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
    if (!fr.vazio || q) {
      const achado = achar(e.alvo);
      const a = achado && achado.item;
      if (!fr.vazio && (!a || !fr.bate(a.frota))) return false;
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

// ── o tamanho da fita no banco ──────────────────────────────────────────────
//
// O plano grátis do Supabase passa a só leitura quando os dados passam de
// 500 MB. Cada lançamento ocupa ~860 bytes na tabela, contando os índices
// (medido no banco em 14/10/2026: 1.285 lançamentos, 1,08 MB). A conta usa
// 900 para sobrar.

export const BYTES_POR_LANCAMENTO = 900;
export const LIMITE_PLANO_GRATIS = 500 * 1024 * 1024;

/** Quanto a fita ocupa, a que ritmo cresce e em quantos anos chega ao limite.
 *  O ritmo é o dos lançamentos do dia a dia nos últimos 30 dias: importar a
 *  planilha ou o Protheus é de uma vez só e, contado como ritmo, assustaria à
 *  toa. Com menos de uma semana de uso (`cedo`), o ritmo ainda não diz nada. */
export function tamanhoDaFita(log, agora = new Date()) {
  const n = log.length;
  const bytes = n * BYTES_POR_LANCAMENTO;
  const fim = agora.getTime();
  const doDia = log.filter(e => !["planilha", "protheus"].includes(e.origem));
  const inicio = doDia.length ? Math.max(new Date(doDia[0].ts).getTime(), fim - 30 * 864e5) : fim;
  const dias = Math.max(1, (fim - inicio) / 864e5);
  const recentes = doDia.filter(e => new Date(e.ts).getTime() >= inicio).length;
  const porDia = recentes / dias;
  const anos = porDia ? (LIMITE_PLANO_GRATIS - bytes) / (porDia * BYTES_POR_LANCAMENTO * 365) : Infinity;
  return { lancamentos: n, bytes, pct: bytes / LIMITE_PLANO_GRATIS, porDia, anos, dias: Math.round(dias), cedo: dias < 7 };
}
