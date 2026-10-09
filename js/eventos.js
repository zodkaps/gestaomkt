// O registro é o estado.
//
// "Qualquer modificação fica registrada" pode ser feito de dois jeitos. O
// frágil é ter tabelas que alguém edita e, ao lado, um log que alguém lembra de
// escrever — e que um dia deixa de bater com a realidade. O que não desvia é o
// log ser a única forma de escrever: atividades, movimentações e preventivas
// são o resultado de tocar a fita desde o começo, e não existe função que mude
// nada disso sem passar por aqui.
//
// Daí `conferir()`: toca a fita de novo, do zero, e compara com o que está na
// memória. Se der diferente, alguém escreveu por fora — e é bug, não opinião.
//
// Com quatro pessoas, cada evento carrega QUEM o lançou. Dois lançamentos na
// mesma coisa não dão conflito: dão dois eventos, ambos no registro, e o estado
// é o mais recente. É por isso que ninguém vai perguntar "qual versão é a boa".

import * as dados from "./dados.js";
import * as nuvem from "./nuvem.js";
import * as pessoas from "./pessoas.js";
import { molde, moldeMovimentacao, moldePreventiva } from "./modelo.js";

export const TIPOS = {
  criada: "criada à mão",
  importada: "importada",
  editada: "editada",
  excluida: "excluída",
  programada: "programada",
  reprogramada: "reprogramada",
  concluida: "concluída",
  reaberta: "reaberta",
  cancelada: "cancelada",
  restaurada: "restaurada",
  mov_prometida: "movimentação prometida",
  mov_chegou: "frota chegou",
  mov_cancelada: "movimentação cancelada",
  prev_disponivel: "disponibilidade informada",
  prev_parada: "dia da parada marcado",
  prev_realizada: "preventiva realizada",
  prev_adiada: "preventiva adiada",
};

export const ALVOS = ["atividade", "movimentacao", "preventiva"];

// Campos que, mudados, contam como reprogramação e por isso exigem motivo.
const DE_PROGRAMACAO = ["semana", "ano", "dia", "dias", "hh"];

const MOLDES = {
  atividade: molde,
  movimentacao: moldeMovimentacao,
  preventiva: moldePreventiva,
};

export let log = [];
export const estado = {
  atividade: new Map(),
  movimentacao: new Map(),
  preventiva: new Map(),
};

const ouvintes = new Set();
export function ouvir(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }

// Uma mudança costuma avisar duas ou três vezes seguidas: o lançamento, depois
// a subida para o banco, depois a volta da consulta. Cada aviso repintava a
// tela inteira. Agora os avisos do mesmo instante viram UMA repintura, no
// próximo quadro — e quem está olhando vê a linha mudar, não a tela piscar.
let marcado = false;
function avisar() {
  if (marcado) return;
  marcado = true;
  const rodar = () => {
    marcado = false;
    for (const fn of ouvintes) {
      try { fn(); } catch (e) { console.error(e); }
    }
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(rodar);
  else queueMicrotask(rodar);
}
export function forcarAviso() { avisar(); }

export function novoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// A fita é dobrada por instante, e dois eventos no MESMO milissegundo
// desempatavam por um id aleatório — ou seja, a ordem mudava a cada leitura.
// Dar baixa e corrigir a data em seguida podia acabar gravando a data velha.
// Aqui o relógio deste aparelho nunca anda para trás nem repete: se o instante
// já foi usado, o próximo evento ganha o milissegundo seguinte.
let ultimoTs = 0;
export function agora() {
  const t = Math.max(Date.now(), ultimoTs + 1);
  ultimoTs = t;
  return new Date(t).toISOString();
}

// ── a dobra ─────────────────────────────────────────────────────────────────
// Um evento por vez, sempre na mesma ordem, sempre com o mesmo resultado.

export function dobrar(mapas, ev) {
  const tipoAlvo = ev.alvo_tipo || "atividade";
  const m = mapas[tipoAlvo];
  if (!m) return mapas;
  const d = ev.dados || {};

  if (ev.tipo === "criada" || ev.tipo === "importada") {
    const base = (MOLDES[tipoAlvo] || molde)();
    const antes = m.get(ev.alvo);
    // Reimportar a mesma linha ATUALIZA em vez de criar outra: a planilha
    // passou a carregar ID estável, e é isso que deixa planilha e site
    // conviverem durante a transição sem duplicar 754 atividades.
    //
    // Mas o que foi lançado NO SITE vale mais que a planilha. Sem isto,
    // reimportar passava por cima de tudo: a chegada da frota apontada aqui, a
    // baixa dada aqui, a reprogramação feita aqui — a planilha não sabe delas e
    // a importação mais recente vencia, apagando o trabalho de quem lançou. Os
    // campos que algum lançamento do site mexeu ficam como estão; o resto a
    // planilha atualiza.
    const doSite = (antes && antes._site) || {};
    const daPlanilha = {};
    for (const [k, v] of Object.entries(d)) if (!doSite[k]) daPlanilha[k] = v;
    m.set(ev.alvo, { ...base, ...(antes || {}), ...daPlanilha, id: ev.alvo,
      criada_em: (antes && antes.criada_em) || ev.ts });
    return mapas;
  }

  const a = m.get(ev.alvo);
  if (!a) return mapas;                 // evento órfão: fita truncada, segue

  // Anota o que este lançamento do site mudou, campo a campo, para uma
  // reimportação depois não desfazer.
  const anterior = { ...a };
  aplicarNoAlvo(a, ev, d);
  for (const k of Object.keys(a)) {
    if (k !== "_site" && a[k] !== anterior[k]) a._site = { ...(a._site || {}), [k]: true };
  }
  return mapas;
}

function aplicarNoAlvo(a, ev, d) {
  switch (ev.tipo) {
    case "editada":
      Object.assign(a, d.para || {});
      break;
    case "excluida":
      a.excluida = true;
      break;

    // ── atividade ──
    case "programada":
      Object.assign(a, d.para || {});
      // A semana original é a da PRIMEIRA programação e nunca mais muda: é
      // contra ela que se mede o quanto uma atividade foi empurrada.
      if (a.semana_orig == null) a.semana_orig = a.semana;
      break;
    case "reprogramada":
      Object.assign(a, d.para || {});
      if (a.semana_orig == null) a.semana_orig = (d.de || {}).semana ?? null;
      a.motivo = ev.motivo || "";
      a.reprogramacoes = (a.reprogramacoes || 0) + 1;
      break;
    case "concluida":
      a.concluida_em = d.em || "";
      a.feita_sem_data = false;          // a data chegou: deixa de ser "sem data"
      break;
    case "reaberta":
      a.concluida_em = "";
      a.feita_sem_data = false;
      break;
    case "cancelada":
      a.cancelada = true;
      a.motivo = ev.motivo || a.motivo;
      break;
    case "restaurada":
      a.cancelada = false;
      break;

    // ── movimentação ──
    case "mov_prometida":
      a.prometida_para = d.para || "";
      a.quem_prometeu = d.quem || a.quem_prometeu;
      break;
    case "mov_chegou":
      a.chegou_em = d.em || "";
      break;
    case "mov_cancelada":
      a.cancelada = true;
      a.motivo = ev.motivo || a.motivo;
      break;

    // ── preventiva ──
    case "prev_disponivel":
      // "agora" e uma data são respostas diferentes à mesma pergunta, e na
      // planilha moram na mesma coluna — o que impede qualquer ordenação.
      a.disponivel_agora = d.quando === "agora";
      a.disponivel_em = d.quando === "agora" ? "" : (d.quando || "");
      break;
    case "prev_parada":
      a.dia_parada = d.dia || "";
      if (d.onde) a.onde_fazer = d.onde;
      break;
    case "prev_realizada":
      a.realizada_em = d.em || "";
      if (d.os) a.os = d.os;
      break;
    case "prev_adiada":
      a.adiada = true;
      a.motivo = ev.motivo || a.motivo;
      break;
  }
}

/** Toca a fita inteira e devolve o estado. É a definição do estado, não uma
 *  otimização dele. */
export function reconstruir(fita = log) {
  const m = { atividade: new Map(), movimentacao: new Map(), preventiva: new Map() };
  for (const ev of fita) dobrar(m, ev);
  return m;
}

/** Reconstrói do zero e compara com o que está na memória. */
export function conferir() {
  const refeito = reconstruir(log);
  const divergencias = [];
  let total = 0;
  for (const tipo of ALVOS) {
    const ids = new Set([...estado[tipo].keys(), ...refeito[tipo].keys()]);
    total += ids.size;
    for (const id of ids) {
      const a = estado[tipo].get(id), b = refeito[tipo].get(id);
      const ta = a ? JSON.stringify(ordenado(a)) : null;
      const tb = b ? JSON.stringify(ordenado(b)) : null;
      if (ta !== tb) divergencias.push({ tipo, id, memoria: a, refeito: b });
    }
  }
  return { ok: divergencias.length === 0, divergencias, total };
}

function ordenado(o) {
  const r = {};
  for (const k of Object.keys(o).sort()) r[k] = o[k];
  return r;
}

// ── carregar e sincronizar ──────────────────────────────────────────────────

export async function carregar() {
  await dados.abrir();
  log = await dados.lerEventos();
  refazer();
  avisar();
  return estado;
}

function refazer() {
  const m = reconstruir(log);
  for (const t of ALVOS) {
    estado[t].clear();
    for (const [k, v] of m[t]) estado[t].set(k, v);
  }
}

/** Sobe o que está na fila e desce o que é novo. Devolve o que mexeu. */
export async function sincronizar() {
  if (!nuvem.ligada()) return { subiram: 0, desceram: 0, erro: "", esperando: [] };
  if (!nuvem.autenticado()) {
    return { subiram: 0, desceram: 0, esperando: await autoresNaFila(),
      erro: "Sem senha não há como escrever no banco — entre para a fila subir." };
  }
  let subiram = 0, desceram = 0, erro = "";
  try {
    const fila = await dados.pendentes();
    // Sobe só o que é DESTE autor. A política do banco recusa lançamento
    // assinado por outra pessoa, e o envio é um lote só: um evento do Pedro no
    // meio faria o lote inteiro do Mateus voltar, e a fila travaria para os
    // dois. O que é de outro espera quem assinou entrar neste aparelho.
    const meu = pessoas.nome();
    const minhas = fila.filter(e => e.autor === meu);
    if (minhas.length) {
      await nuvem.enviar(minhas);
      await dados.marcarEnviados(minhas.map(e => e.id));
      subiram = minhas.length;
    }
    const desde = await dados.lerMeta("nuvem_seq", 0);
    const novos = await nuvem.baixarDesde(desde);
    if (novos.length) {
      await dados.gravarMeta("nuvem_seq", novos[novos.length - 1].seq);
      desceram = await dados.mesclarDaNuvem(novos);
    }
    if (subiram || desceram) {
      log = await dados.lerEventos();
      refazer();
      avisar();
    }
  } catch (e) {
    erro = e.message;
  }
  return { subiram, desceram, erro, esperando: await autoresNaFila() };
}

/** Quem assinou o que ainda não subiu. A faixa precisa disso para dizer de
 *  quem é a fila: "3 lançamentos do Pedro" é acionável; "3 lançamentos" não. */
export async function autoresNaFila() {
  const conta = new Map();
  for (const e of await dados.pendentes()) {
    conta.set(e.autor, (conta.get(e.autor) || 0) + 1);
  }
  return [...conta].map(([autor, quantos]) => ({ autor, quantos }))
    .sort((a, b) => b.quantos - a.quantos);
}

/** Recebe o que a consulta periódica trouxe. */
export async function receber(novos) {
  const n = await dados.mesclarDaNuvem(novos);
  if (!n) return 0;
  log = await dados.lerEventos();
  refazer();
  avisar();
  return n;
}

// ── escrever ────────────────────────────────────────────────────────────────

/** A única porta de escrita. Tudo que muda qualquer coisa passa por aqui. */
export async function aplicar(evs, { silencioso = false } = {}) {
  const lista = (Array.isArray(evs) ? evs : [evs]).filter(Boolean).map(ev => ({
    id: novoId(),
    ts: agora(),
    autor: pessoas.nome() || "—",
    alvo_tipo: "atividade",
    origem: "manual",
    motivo: "",
    dados: {},
    ...ev,
  }));
  if (!lista.length) return lista;

  await dados.gravarEventos(lista);
  log = await dados.lerEventos();
  refazer();
  if (!silencioso) avisar();

  // Sobe em segundo plano: a tela não espera a rede para mostrar o que a
  // pessoa acabou de fazer. Se falhar, fica na fila e vai na próxima.
  if (nuvem.ligada()) sincronizar().catch(() => {});
  return lista;
}

// ── as operações: atividade ─────────────────────────────────────────────────

export function criar(campos, origem = "manual", fonte = "", alvoTipo = "atividade") {
  const id = campos.id || novoId();
  const { id: _, ...resto } = campos;
  return { tipo: origem === "manual" ? "criada" : "importada", alvo: id,
    alvo_tipo: alvoTipo, origem, dados: { ...resto, fonte } };
}

/** Marcar uma atividade para outra semana ou outro dia.
 *
 *  A primeira vez é PROGRAMAR e não pede nada. Da segunda em diante é
 *  REPROGRAMAR e o motivo é obrigatório — é a única regra de negócio que o
 *  sistema impõe, porque é o número pelo qual PCM responde. */
export function reprogramar(a, para, motivo = "") {
  pessoas.exigir("programar");
  const de = {};
  for (const k of DE_PROGRAMACAO) de[k] = a[k] ?? null;
  const mudou = DE_PROGRAMACAO.some(k => (para[k] ?? null) !== (a[k] ?? null));
  if (!mudou) return null;

  const jaEstava = a.semana != null;
  if (jaEstava && !String(motivo).trim()) {
    throw new Error("Reprogramar exige motivo.");
  }
  return {
    tipo: jaEstava ? "reprogramada" : "programada",
    alvo: a.id, alvo_tipo: "atividade",
    motivo: jaEstava ? motivo : "",
    dados: { de, para: { ...para } },
  };
}

export function devolverParaCarteira(a, motivo) {
  return reprogramar(a, { semana: null, ano: null, dia: "", hh: a.hh }, motivo);
}

export function concluir(a, em) {
  pessoas.exigir("baixar");
  if (!em) throw new Error("Concluir exige a data.");
  return { tipo: "concluida", alvo: a.id, alvo_tipo: "atividade", dados: { em } };
}

export function reabrir(a, motivo = "") {
  pessoas.exigir("baixar");
  return { tipo: "reaberta", alvo: a.id, alvo_tipo: "atividade", motivo };
}

export function cancelar(a, motivo) {
  pessoas.exigir("editar_atividade");
  if (!String(motivo || "").trim()) throw new Error("Cancelar exige motivo.");
  return { tipo: "cancelada", alvo: a.id, alvo_tipo: "atividade", motivo };
}

export function restaurar(a) {
  pessoas.exigir("editar_atividade");
  return { tipo: "restaurada", alvo: a.id, alvo_tipo: "atividade" };
}

export function excluir(a, motivo = "", alvoTipo = "atividade") {
  pessoas.exigir(alvoTipo === "atividade" ? "editar_atividade" : "movimentar");
  return { tipo: "excluida", alvo: a.id, alvo_tipo: alvoTipo, motivo };
}

/** Edição comum de campos. Só entra no log o que realmente mudou. */
export function editar(a, campos, alvoTipo = "atividade") {
  if (alvoTipo === "atividade") pessoas.exigir("editar_atividade");
  else pessoas.exigir("movimentar");
  const de = {}, para = {};
  for (const [k, v] of Object.entries(campos)) {
    const antes = a[k] ?? null;
    const depois = v ?? null;
    if (JSON.stringify(antes) === JSON.stringify(depois)) continue;
    de[k] = antes; para[k] = depois;
  }
  if (!Object.keys(para).length) return null;
  // Mexer em semana/dia/HH pela edição comum passaria por cima da exigência de
  // motivo. Quem quer mudar programação usa reprogramar().
  if (alvoTipo === "atividade") {
    for (const k of DE_PROGRAMACAO) {
      if (k in para) throw new Error("Programação se muda por reprogramar(), não por editar().");
    }
  }
  return { tipo: "editada", alvo: a.id, alvo_tipo: alvoTipo, dados: { de, para } };
}

// ── as operações: movimentação ──────────────────────────────────────────────
// Pedir é do PCM; prometer e apontar a chegada é da operação. Os dois lados
// podem lançar, porque os dois lados vivem a movimentação.

export function pedirMovimentacao(campos) {
  pessoas.exigir("movimentar");
  return criar(campos, "manual", "", "movimentacao");
}

export function prometer(m, para, quem = "Operação") {
  pessoas.exigir("movimentar");
  if (!para) throw new Error("Prometer exige a data.");
  return { tipo: "mov_prometida", alvo: m.id, alvo_tipo: "movimentacao",
    dados: { para, quem } };
}

export function chegou(m, em) {
  pessoas.exigir("movimentar");
  if (!em) throw new Error("Apontar a chegada exige a data.");
  return { tipo: "mov_chegou", alvo: m.id, alvo_tipo: "movimentacao", dados: { em } };
}

export function cancelarMovimentacao(m, motivo) {
  pessoas.exigir("movimentar");
  if (!String(motivo || "").trim()) throw new Error("Cancelar exige motivo.");
  return { tipo: "mov_cancelada", alvo: m.id, alvo_tipo: "movimentacao", motivo };
}

// ── as operações: preventiva ────────────────────────────────────────────────

export function criarPreventiva(campos) {
  pessoas.exigir("parada");
  return criar(campos, "manual", "", "preventiva");
}

/** A operação diz quando o caminhão fica livre. "agora" é resposta válida. */
export function informarDisponibilidade(p, quando) {
  pessoas.exigir("disponibilidade");
  if (!quando) throw new Error("Diga 'agora' ou uma data.");
  return { tipo: "prev_disponivel", alvo: p.id, alvo_tipo: "preventiva",
    dados: { quando } };
}

/** O PCM marca o dia em que o caminhão para. */
export function marcarParada(p, dia, onde = "") {
  pessoas.exigir("parada");
  if (!dia) throw new Error("Marcar a parada exige o dia.");
  return { tipo: "prev_parada", alvo: p.id, alvo_tipo: "preventiva",
    dados: { dia, onde } };
}

export function preventivaFeita(p, em, os = "") {
  pessoas.exigir("preventiva_feita");
  if (!em) throw new Error("Exige a data em que foi feita.");
  return { tipo: "prev_realizada", alvo: p.id, alvo_tipo: "preventiva",
    dados: { em, os } };
}

export function adiarPreventiva(p, motivo) {
  pessoas.exigir("parada");
  if (!String(motivo || "").trim()) throw new Error("Adiar exige motivo.");
  return { tipo: "prev_adiada", alvo: p.id, alvo_tipo: "preventiva", motivo };
}

// ── leitura ─────────────────────────────────────────────────────────────────

export function lista(tipo = "atividade") {
  return [...estado[tipo].values()].filter(a => !a.excluida);
}

export function porId(id, tipo = "atividade") { return estado[tipo].get(id); }

export function achar(id) {
  for (const t of ALVOS) if (estado[t].has(id)) return { tipo: t, item: estado[t].get(id) };
  return null;
}

/** O histórico de um item, do mais novo para o mais velho. */
export function historicoDe(id) {
  return log.filter(ev => ev.alvo === id).slice().reverse();
}

// Compatibilidade com as telas que já existem e falam só de atividades.
export const atividades = estado.atividade;
