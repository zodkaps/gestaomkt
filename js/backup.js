// A cópia de segurança.
//
// Dado no navegador é dado em UM navegador: limpar os dados do site apaga
// tudo, e nenhum aviso de tela devolve isso depois. O backup é a única coisa
// que separa "controle da oficina" de "perdi setembro inteiro" — por isso ele
// é a fita de eventos inteira, e não um resumo: com ela dá para reconstruir o
// estado e continuar tendo o histórico de cada reprogramação.

import * as dados from "./dados.js";
import * as ev from "./eventos.js";

export const VERSAO = 1;

/** Só os eventos, em texto estável. É contra isto que se compara se dois
 *  backups têm o mesmo conteúdo — a data de geração muda a cada exportação e
 *  faria dois arquivos iguais parecerem diferentes. */
export function assinatura() {
  return JSON.stringify(ev.log.map(({ seq, ...resto }) => resto));
}

export async function exportar() {
  return {
    formato: "mkt-programacao",
    versao: VERSAO,
    gerado_em: new Date().toISOString(),
    eventos: ev.log.map(({ seq, ...resto }) => resto),
    preferencias: {
      mapa_protheus: await dados.lerMeta("mapa_protheus", null),
      cabecalho_protheus: await dados.lerMeta("cabecalho_protheus", null),
    },
  };
}

export function nomeDoArquivo() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `makro-programacao-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

/** Troca o conteúdo pelo do arquivo. Recusa arquivo que não é backup daqui:
 *  restaurar lixo por cima do trabalho de meses é pior do que não restaurar. */
export async function restaurar(obj) {
  if (!obj || obj.formato !== "mkt-programacao" || !Array.isArray(obj.eventos)) {
    throw new Error("Este arquivo não é um backup da programação.");
  }
  if (obj.versao > VERSAO) {
    throw new Error("Este backup veio de uma versão mais nova do site.");
  }
  for (const e of obj.eventos) {
    if (!e || !e.tipo || !e.alvo) throw new Error("O backup tem evento sem tipo ou sem alvo.");
  }
  await dados.trocarEventos(obj.eventos);
  if (obj.preferencias) {
    for (const [k, v] of Object.entries(obj.preferencias)) {
      if (v != null) await dados.gravarMeta(k, v);
    }
  }
  await ev.carregar();
  return ev.lista().length;
}

// ── lembrar de fazer ────────────────────────────────────────────────────────

export async function marcarFeito() {
  await dados.gravarMeta("ultimo_backup", new Date().toISOString());
}

/** Quantos dias desde a última cópia, e quantos eventos entraram depois dela.
 *  O segundo número é o que importa: uma semana sem backup e sem mexer em nada
 *  não é risco nenhum; dois dias com trezentas baixas lançadas é. */
export async function estado() {
  const quando = await dados.lerMeta("ultimo_backup", null);
  if (!quando) return { nunca: true, dias: null, desde: ev.log.length };
  const dias = Math.floor((Date.now() - new Date(quando)) / 86400000);
  const desde = ev.log.filter(e => e.ts > quando).length;
  return { nunca: false, quando, dias, desde };
}

export function baixar(obj, nome) {
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Exportação em CSV para quem quer abrir no Excel. É uma fotografia, não um
 *  backup: não traz o histórico e não volta para cá. */
export function csv(atividades, situacaoDe, prazoDe) {
  const cab = ["OS", "Frota", "Cliente", "Serviço", "Atividade", "Tipo", "Origem",
    "Prioridade", "Semana", "Dia", "Dias", "Início", "Prazo", "Concluída em",
    "Situação", "Semana orig.", "Reprogramações", "Motivo", "Executantes", "Obs."];
  const esc = v => {
    const s = String(v == null ? "" : v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const linhas = [cab.join(";")];
  for (const a of atividades) {
    linhas.push([a.os, a.frota, a.cliente, a.servico, a.atividade, a.tipo, a.origem,
      a.prioridade, a.semana, a.dia, a.dias, "", prazoDe(a), a.concluida_em,
      situacaoDe(a), a.semana_orig, a.reprogramacoes, a.motivo,
      (a.executantes || []).join(", "), a.obs].map(esc).join(";"));
  }
  return "﻿" + linhas.join("\r\n");
}
