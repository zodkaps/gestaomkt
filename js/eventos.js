// O registro é o estado.
//
// "Qualquer modificação fica registrada" pode ser feito de dois jeitos. O
// frágil é ter uma tabela de atividades e, ao lado, um log que alguém lembra de
// escrever — e que um dia deixa de bater com a realidade. O que não desvia é o
// log ser a única forma de escrever: as atividades são o resultado de tocar a
// fita desde o começo, e não existe função que mude uma atividade sem passar
// por aqui.
//
// Daí `conferir()`: toca a fita de novo, do zero, e compara com o que está na
// memória. Se der diferente, alguém escreveu por fora — e é bug, não opinião.

import * as dados from "./dados.js";
import { molde } from "./modelo.js";

export const TIPOS = {
  criada: "criada à mão",
  importada: "importada",
  editada: "editada",
  programada: "programada",
  reprogramada: "reprogramada",
  concluida: "concluída",
  reaberta: "reaberta",
  cancelada: "cancelada",
  restaurada: "restaurada",
  excluida: "excluída",
};

// Campos que, mudados, contam como reprogramação e por isso exigem motivo.
const DE_PROGRAMACAO = ["semana", "ano", "dia", "dias"];

export let log = [];
export let atividades = new Map();

const ouvintes = new Set();
export function ouvir(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }
function avisar() { for (const fn of ouvintes) fn(); }

export function novoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── a dobra ─────────────────────────────────────────────────────────────────
// Um evento por vez, sempre na mesma ordem, sempre com o mesmo resultado.

export function dobrar(mapa, ev) {
  const d = ev.dados || {};
  if (ev.tipo === "criada" || ev.tipo === "importada") {
    mapa.set(ev.alvo, { ...molde(), ...d, id: ev.alvo, criada_em: ev.ts });
    return mapa;
  }
  const a = mapa.get(ev.alvo);
  if (!a) return mapa;                 // evento órfão: fita truncada, segue
  switch (ev.tipo) {
    case "editada":
      Object.assign(a, d.para || {});
      break;
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
      break;
    case "reaberta":
      a.concluida_em = "";
      break;
    case "cancelada":
      a.cancelada = true;
      a.motivo = ev.motivo || a.motivo;
      break;
    case "restaurada":
      a.cancelada = false;
      break;
    case "excluida":
      a.excluida = true;
      break;
  }
  return mapa;
}

/** Toca a fita inteira e devolve o estado. É a definição do estado, não uma
 *  otimização dele. */
export function reconstruir(fita = log) {
  const m = new Map();
  for (const ev of fita) dobrar(m, ev);
  return m;
}

/** Reconstrói do zero e compara com o que está na memória. Devolve as
 *  divergências — vazio quer dizer que ninguém escreveu por fora. */
export function conferir() {
  const refeito = reconstruir(log);
  const divergencias = [];
  const ids = new Set([...atividades.keys(), ...refeito.keys()]);
  for (const id of ids) {
    const a = atividades.get(id), b = refeito.get(id);
    const ta = a ? JSON.stringify(ordenado(a)) : null;
    const tb = b ? JSON.stringify(ordenado(b)) : null;
    if (ta !== tb) divergencias.push({ id, memoria: a, refeito: b });
  }
  return { ok: divergencias.length === 0, divergencias, total: ids.size };
}

function ordenado(o) {
  const r = {};
  for (const k of Object.keys(o).sort()) r[k] = o[k];
  return r;
}

// ── escrever ────────────────────────────────────────────────────────────────

export async function carregar() {
  await dados.abrir();
  log = await dados.lerEventos();
  log.sort((a, b) => a.seq - b.seq);
  atividades = reconstruir(log);
  avisar();
  return atividades;
}

/** A única porta de escrita. Tudo o que muda uma atividade passa por aqui. */
export async function aplicar(evs, { silencioso = false } = {}) {
  const lista = (Array.isArray(evs) ? evs : [evs]).map(ev => ({
    id: novoId(),
    ts: new Date().toISOString(),
    origem: "manual",
    motivo: "",
    dados: {},
    ...ev,
  }));
  await dados.gravarEventos(lista);
  for (const ev of lista) { log.push(ev); dobrar(atividades, ev); }
  if (!silencioso) avisar();
  return lista;
}

export function forcarAviso() { avisar(); }

// ── as operações, com as regras que importam ────────────────────────────────

export function criar(campos, origem = "manual", fonte = "") {
  const id = novoId();
  return { tipo: origem === "manual" ? "criada" : "importada", alvo: id, origem,
    dados: { ...campos, fonte } };
}

/** Marcar uma atividade para outra semana ou outro dia.
 *
 *  A primeira vez é PROGRAMAR e não pede nada. Da segunda em diante é
 *  REPROGRAMAR e o motivo é obrigatório — é a única regra de negócio que o
 *  sistema impõe, porque é o número pelo qual PCM responde. Quem chama sem
 *  motivo leva um erro, não um registro incompleto. */
export function reprogramar(a, para, motivo = "") {
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
    alvo: a.id,
    motivo: jaEstava ? motivo : "",
    dados: { de, para: { ...para } },
  };
}

/** Tirar da semana e devolver para a carteira também é reprogramação. */
export function devolverParaCarteira(a, motivo) {
  return reprogramar(a, { semana: null, ano: null, dia: "", dias: a.dias }, motivo);
}

export function concluir(a, em) {
  if (!em) throw new Error("Concluir exige a data.");
  return { tipo: "concluida", alvo: a.id, dados: { em } };
}

export function reabrir(a, motivo = "") {
  return { tipo: "reaberta", alvo: a.id, motivo };
}

export function cancelar(a, motivo) {
  if (!String(motivo || "").trim()) throw new Error("Cancelar exige motivo.");
  return { tipo: "cancelada", alvo: a.id, motivo };
}

export function restaurar(a) {
  return { tipo: "restaurada", alvo: a.id };
}

/** Excluir não apaga: marca. O que aconteceu continua no histórico, porque a
 *  pergunta "por que isto sumiu da carteira?" aparece meses depois. */
export function excluir(a, motivo = "") {
  return { tipo: "excluida", alvo: a.id, motivo };
}

/** Edição comum de campos. Só entra no log o que realmente mudou — evento que
 *  registra "trocou X por X" enche o histórico e esconde o que importa. */
export function editar(a, campos) {
  const de = {}, para = {};
  for (const [k, v] of Object.entries(campos)) {
    const antes = a[k] ?? null;
    const depois = v ?? null;
    if (JSON.stringify(antes) === JSON.stringify(depois)) continue;
    de[k] = antes; para[k] = depois;
  }
  if (!Object.keys(para).length) return null;
  // Mexer em semana/dia/dias pela edição comum passaria por cima da exigência
  // de motivo. Quem quer mudar programação usa reprogramar().
  for (const k of DE_PROGRAMACAO) {
    if (k in para) throw new Error("Programação se muda por reprogramar(), não por editar().");
  }
  return { tipo: "editada", alvo: a.id, dados: { de, para } };
}

// ── leitura ─────────────────────────────────────────────────────────────────

export function lista() {
  return [...atividades.values()].filter(a => !a.excluida);
}

export function porId(id) { return atividades.get(id); }

/** O histórico de uma atividade, do mais novo para o mais velho. */
export function historicoDe(id) {
  return log.filter(ev => ev.alvo === id).slice().reverse();
}
