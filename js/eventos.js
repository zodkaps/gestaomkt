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
  mov_chegou: "movimentação concluída",
  mov_aprovada: "movimentação aprovada",
  mov_devolvida: "movimentação devolvida",
  mov_cancelada: "movimentação cancelada",
  prev_disponivel: "disponibilidade informada",
  prev_parada: "dia da parada marcado",
  prev_andamento: "preventiva em andamento",
  prev_realizada: "preventiva realizada",
  prev_adiada: "preventiva passada para o mês seguinte",
  prev_cancelada: "preventiva cancelada",
  prev_reaberta: "preventiva reaberta",
};

export const ALVOS = ["atividade", "movimentacao", "preventiva"];

// Campos da aprovação de movimentação: só os eventos de concluir, aprovar e
// devolver mexem neles.
const DA_APROVACAO = ["aprovada", "aprovada_por", "aprovada_em", "concluida_por"];

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
    // Aprovação de movimentação só entra por `mov_aprovada`, que só o PCM
    // grava. Movimentação criada à mão nasce sem aprovação, diga o que disser.
    if (tipoAlvo === "movimentacao" && ev.tipo === "criada") {
      for (const k of DA_APROVACAO) delete daPlanilha[k];
    }
    const novo = { ...base, ...(antes || {}), ...daPlanilha, id: ev.alvo,
      criada_em: (antes && antes.criada_em) || ev.ts };
    // Movimentação importada antes de existir a aprovação: o que a planilha diz
    // que foi concluído é registro do próprio PCM — conta como aprovado.
    if (tipoAlvo === "movimentacao" && ev.tipo === "importada" && !("aprovada" in d) &&
        !doSite.chegou_em) {
      novo.aprovada = !!novo.chegou_em;
    }
    m.set(ev.alvo, novo);
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
    case "editada": {
      const para = { ...(d.para || {}) };
      // Editar não aprova: senão bastaria um "editada" com aprovada = true
      // para pular o PCM.
      if (ev.alvo_tipo === "movimentacao") for (const k of DA_APROVACAO) delete para[k];
      Object.assign(a, para);
      break;
    }
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
      // Concluir não é aprovar: fica esperando o PCM conferir.
      a.chegou_em = d.em || "";
      a.concluida_por = ev.autor || "";
      a.aprovada = false;
      a.devolvida = false;
      break;
    case "mov_aprovada":
      a.aprovada = true;
      a.aprovada_por = ev.autor || "";
      a.aprovada_em = (ev.ts || "").slice(0, 10);
      break;
    case "mov_devolvida":
      // O PCM conferiu e não foi bem assim: volta a ficar em aberto, com o
      // porquê à vista de quem tinha concluído.
      a.chegou_em = "";
      a.aprovada = false;
      a.devolvida = true;
      a.motivo_devolucao = ev.motivo || "";
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
      a.realizada_sem_data = false;
      a.em_andamento = false;
      if (d.os) a.os = d.os;
      break;
    case "prev_andamento":
      a.em_andamento = d.sim !== false;
      break;
    case "prev_adiada":
      a.adiada = true;
      a.motivo = ev.motivo || a.motivo;
      break;
    case "prev_cancelada":
      a.cancelada = true;
      a.motivo = ev.motivo || a.motivo;
      break;
    case "prev_reaberta":
      // Desfaz a baixa, o adiamento ou o cancelamento: volta para o mapa.
      a.realizada_em = "";
      a.realizada_sem_data = false;
      a.adiada = false;
      a.cancelada = false;
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
  await recarregar();
  avisar();
  return estado;
}

// Reler a fita do disco tem um `await` no meio, e duas releituras podiam se
// cruzar: a consulta ao banco começava a ler ANTES de uma baixa ser gravada,
// terminava DEPOIS, e aplicava a cópia velha por cima da nova — a baixa estava
// gravada, mas sumia da tela até a próxima mudança. Cada releitura ganha um
// número; uma que começou antes nunca passa por cima de uma que começou
// depois (a que começou depois já viu tudo o que foi gravado antes dela).
let releituras = 0, ultimaAplicada = 0;
async function recarregar() {
  const minha = ++releituras;
  const lido = await dados.lerEventos();
  if (minha < ultimaAplicada) return false;
  ultimaAplicada = minha;
  log = lido;
  refazer();
  return true;
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
      if (await recarregar()) avisar();
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
  if (await recarregar()) avisar();
  return n;
}

// ── escrever ────────────────────────────────────────────────────────────────

/** A única porta de escrita. Tudo que muda qualquer coisa passa por aqui. */
export async function aplicar(evs, { silencioso = false } = {}) {
  // Uma operação pode devolver mais de um evento (concluir e aprovar, quando é
  // o PCM que conclui): a lista é achatada antes de gravar.
  const lista = (Array.isArray(evs) ? evs : [evs]).flat().filter(Boolean).map(ev => ({
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
  await recarregar();
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

/** Concluir a movimentação. Quando é a operação, fica esperando o PCM
 *  aprovar; quando é o próprio PCM, ele já está conferindo — vai aprovada. */
export function chegou(m, em) {
  pessoas.exigir("movimentar");
  if (!em) throw new Error("Concluir exige a data.");
  const feito = { tipo: "mov_chegou", alvo: m.id, alvo_tipo: "movimentacao", dados: { em } };
  if (!pessoas.pode("aprovar")) return feito;
  return [feito, { tipo: "mov_aprovada", alvo: m.id, alvo_tipo: "movimentacao" }];
}
export const concluirMovimentacao = chegou;

export function aprovarMovimentacao(m) {
  pessoas.exigir("aprovar");
  if (!m.chegou_em) throw new Error("Só se aprova o que já foi concluído.");
  return { tipo: "mov_aprovada", alvo: m.id, alvo_tipo: "movimentacao" };
}

export function devolverMovimentacao(m, motivo) {
  pessoas.exigir("aprovar");
  if (!String(motivo || "").trim()) throw new Error("Devolver exige o motivo.");
  return { tipo: "mov_devolvida", alvo: m.id, alvo_tipo: "movimentacao", motivo };
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

export function preventivaEmAndamento(p, sim = true) {
  pessoas.exigir("parada");
  return { tipo: "prev_andamento", alvo: p.id, alvo_tipo: "preventiva", dados: { sim } };
}

export function cancelarPreventiva(p, motivo) {
  pessoas.exigir("parada");
  if (!String(motivo || "").trim()) throw new Error("Cancelar exige motivo.");
  return { tipo: "prev_cancelada", alvo: p.id, alvo_tipo: "preventiva", motivo };
}

export function reabrirPreventiva(p) {
  pessoas.exigir("parada");
  return { tipo: "prev_reaberta", alvo: p.id, alvo_tipo: "preventiva" };
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
