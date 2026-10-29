// A planilha das preventivas — o pedido do PCM em 29/10/2026: a aba funcionar
// "como uma planilha/agenda dividida em blocos": disponibilidade, parada,
// realização do serviço e fechamento, com as observações e o registro das
// reprogramações e das mudanças de disponibilidade, e o porquê de cada uma.
//
// Cada frota do plano numa linha, na ordem da agenda (a próxima data primeiro).
// As colunas vêm em quatro blocos, cada um de alguém:
//   1 Disponibilidade — a operação diz quando a frota fica livre;
//   2 Parada — o PCM marca o dia; mudar o dia é reprogramar, com o motivo;
//   3 Realização do serviço — a frota entra na oficina e o serviço sai;
//   4 Fechamento — a OS encerrada no Protheus, e como terminou contra o vencimento.
// A célula vazia tem o botão que a preenche (para quem pode); a preenchida
// abre a mesma caixa para mudar — é por ela que a mudança se conta e o motivo
// é pedido. O registro de cada frota abre embaixo da linha. No celular, a
// linha vira um cartão com os quatro blocos. "Baixar a planilha" leva tudo
// para o Excel, com o registro numa segunda aba.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { el, br, brCurto, chip, cliqueLimpo, vazio, avisar, erro } from "../ui.js";
import { busca as semAcento } from "../texto.js";
import { natural } from "./grade.js";
import { botaoMais } from "./comum.js";
import { informarDisponibilidade, marcarParada, registrarEntregaPrev, darPorFeita, fecharOSPrev,
  abrirFichaPrev, descreverMudancaPrev, linhaMudanca, campoOSPrev, rotuloMes, linhaDoMes, tabelaFora, TIPO_MUDANCA } from "./preventivas.js";

export const BLOCOS = [
  { id: "disp", n: 1, nome: "Disponibilidade", quem: "operação" },
  { id: "parada", n: 2, nome: "Parada", quem: "PCM" },
  { id: "real", n: 3, nome: "Realização do serviço", quem: "oficina" },
  { id: "fech", n: 4, nome: "Fechamento", quem: "PCM" },
];

// O filtro de cima: em que pé está cada frota. As quatro primeiras são o
// bloco que falta preencher.
const FILTROS = [
  ["", "Todas", () => true],
  ["disp", "Sem disponibilidade", p => M.passoPreventiva(p) === "liberar"],
  ["parada", "Disponível, sem parada", p => M.passoPreventiva(p) === "parada"],
  ["chegada", "Parada marcada", p => M.passoPreventiva(p) === "chegada"],
  ["oficina", "Na oficina", p => M.passoPreventiva(p) === "baixa"],
  ["fechar", "Realizada, OS a fechar", p => M.preventivaFeita(p) && !p.fechada_em],
  ["fechada", "Fechadas", p => !!p.fechada_em],
  ["fora", "Adiadas e canceladas", p => p.adiada || p.cancelada],
  ["mudou", "Com reprogramação", p => p.reprog_parada > 0 || p.reprog_liberacao > 0 || p.adiada],
];

const ORDENS = [["agenda", "Agenda"], ["frota", "Frota"], ["vence", "Vencimento"]];

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
const curto = (s, n = 70) => s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;

// ── as células ──────────────────────────────────────────────────────────────
// Cada uma devolve o que mostrar: o valor, a linha de baixo, o botão (quando
// a célula está vazia e a pessoa pode preencher) e se está com problema. A
// tabela e o cartão do celular usam as mesmas.

function botao(rot, fn, title = "") {
  return el("button", { type: "button", class: "mini primario-leve pl-b", title: title || rot,
    onclick: e => { e.stopPropagation(); fn(); } }, rot);
}

/** O valor preenchido, que abre a caixa de mudar quando a pessoa pode. */
function valor(texto, fn, title) {
  return fn ? el("button", { type: "button", class: "pl-v", title, onclick: e => { e.stopPropagation(); fn(); } }, texto)
    : el("span", { class: "pl-v so" }, texto);
}

function celDisp(p, ref, reg) {
  const aberta = M.preventivaAberta(p);
  const pode = aberta && pessoas.pode("disponibilidade");
  const lib = p.disponivel_agora ? "Agora" : p.disponivel_em ? brCurto(p.disponivel_em) : "";
  const conflito = M.situacaoPreventiva(p, ref) === "Conflito: Operação depois do prazo";
  const data = lib ? valor(lib, pode ? () => informarDisponibilidade(p) : null, pode ? "Mudar a liberação (pede o motivo)" : "")
    : pode ? botao("Informar", () => informarDisponibilidade(p), "Informar quando a frota fica disponível")
    : el("span", { class: "pl-nada" }, aberta ? "aguardando" : "—");
  const n = p.reprog_liberacao || reg.lib.length;
  const motivos = porque(reg.lib);
  const mudou = n ? el("div", { class: "pl-mud", title: reg.lib.map(m => `${m.texto}${m.e.motivo ? " — " + m.e.motivo : ""}`).join("\n") },
    el("span", { class: "pl-n" }, `↻ ${n}×`),
    el("span", { class: "pl-pq" }, motivos.length ? curto(motivos[motivos.length - 1]) : "sem o motivo")) : el("span", { class: "pl-nada" }, "—");
  return { data, mudou, alerta: conflito, sub: conflito ? "depois do vencimento" : "" };
}

function celParada(p, ref, reg) {
  const aberta = M.preventivaAberta(p);
  const pode = aberta && pessoas.pode("parada");
  const s = M.situacaoPreventiva(p, ref);
  const alerta = s === "Programada depois do prazo" || (s === "Parada passou, sem baixa" && !p.entregue_em);
  const temLib = p.disponivel_agora || p.disponivel_em;
  const data = p.dia_parada ? valor(brCurto(p.dia_parada), pode ? () => marcarParada(p) : null, pode ? "Reprogramar a parada (pede o motivo)" : "")
    : pode && temLib ? botao("Marcar", () => marcarParada(p), "Marcar o dia da parada")
    : el("span", { class: "pl-nada" }, aberta ? (temLib ? "a marcar" : "—") : "—");
  const n = p.reprog_parada || reg.parada.length;
  const motivos = porque(reg.parada);
  const mudou = n ? el("div", { class: "pl-mud", title: reg.parada.map(m => `${m.texto}${m.e.motivo ? " — " + m.e.motivo : ""}`).join("\n") },
    el("span", { class: "pl-n" }, `↻ ${n}×`), p.parada_orig && p.parada_orig !== p.dia_parada ? el("span", { class: "pl-orig" }, `1ª ${brCurto(p.parada_orig)}`) : null,
    el("span", { class: "pl-pq" }, motivos.length ? curto(motivos[motivos.length - 1]) : "sem o motivo")) : el("span", { class: "pl-nada" }, "—");
  return { data, mudou, alerta, sub: s === "Programada depois do prazo" ? "depois do vencimento"
    : alerta ? "a frota não chegou" : p.dia_parada === ref && aberta ? "hoje" : "" };
}

function celReal(p, ref) {
  const pcm = pessoas.pode("parada");
  const aberta = M.preventivaAberta(p);
  const n = M.atrasoEntrega(p, ref);
  let entrada;
  if (p.entregue_em) entrada = el("div", {}, valor(brCurto(p.entregue_em), pcm && !p.cancelada ? () => registrarEntregaPrev(p) : null, "Corrigir a entrada"),
    n ? el("span", { class: "pl-atraso", title: [p.motivo_entrega, p.quem_atrasou_entrega && "quem atrasou: " + p.quem_atrasou_entrega].filter(Boolean).join(" · ") },
      `+${n} d`) : null);
  else if (M.entregaAtrasando(p, ref)) entrada = el("div", {}, el("span", { class: "pl-atraso forte" }, `não chegou · +${n} d`),
    pcm ? botao("Chegou", () => registrarEntregaPrev(p), "Anotar o dia em que a frota entrou na oficina") : null);
  else if (p.em_andamento) entrada = el("span", { class: "pl-v so" }, "na oficina");
  else if (aberta && pcm && p.dia_parada && p.dia_parada <= ref) entrada = botao("Chegou", () => registrarEntregaPrev(p), "Anotar o dia em que a frota entrou na oficina");
  else entrada = el("span", { class: "pl-nada" }, "—");
  const subEntrada = p.entregue_em && n && p.motivo_entrega ? curto(p.motivo_entrega, 50) : "";

  let feita;
  if (p.realizada_em) feita = valor(brCurto(p.realizada_em), pcm && !p.fechada_em ? () => darPorFeita(p) : null, "Corrigir a data da realização");
  else if (p.realizada_sem_data) feita = pcm ? botao("Informar a data", () => darPorFeita(p)) : el("span", { class: "pl-v so" }, "sem a data");
  else if (aberta && pcm && (p.entregue_em || p.em_andamento)) feita = botao("Dar baixa", () => darPorFeita(p), "O serviço terminou: dar a baixa");
  else feita = el("span", { class: "pl-nada" }, p.em_andamento ? "em execução" : "—");
  const dias = M.diasNaOficina(p, ref);
  const subFeita = [p.onde_fazer, p.hh ? `${String(p.hh).replace(".", ",")} HH` : "",
    dias != null ? `${dias} dia${dias === 1 ? "" : "s"} na oficina` : ""].filter(Boolean).join(" · ");
  return { entrada, subEntrada, alerta: M.entregaAtrasando(p, ref), feita, subFeita };
}

function celFech(p, ref) {
  const pcm = pessoas.pode("preventiva_feita");
  const os = p.os ? el("span", { class: "pl-v so os" }, "OS " + p.os) : pcm && !p.cancelada && !p.excluida ? campoOSPrev(p) : el("span", { class: "pl-nada" }, "sem OS");
  const fechada = p.fechada_em ? el("div", { class: "pl-fechou" }, "fechada ", valor(brCurto(p.fechada_em), pcm ? () => fecharOSPrev(p) : null, "Corrigir o dia do fechamento"))
    : M.preventivaFeita(p) && pcm ? botao("Fechar OS", () => fecharOSPrev(p), "A OS foi encerrada no Protheus")
    : M.preventivaFeita(p) ? el("span", { class: "pl-nada" }, "a fechar") : null;
  const r = M.resultadoPreventiva(p, ref);
  const res = el("div", {}, chip(r.texto, r.classe), r.motivo ? el("div", { class: "pl-pq", title: r.motivo }, curto(r.motivo, 60)) : null);
  return { os, fechada, res };
}

function celFrota(p, ref, ctx, bReg = null) {
  const lim = M.venceEfetivo(p);
  const venc = M.preventivaVencida(p, ref);
  return el("div", { class: "pl-frota" },
    el("div", { class: "pl-f1" }, el("b", {}, p.frota || "—"), el("span", { class: "pl-f-acoes" }, bReg, botaoMais("preventiva", p.id, ctx))),
    el("div", { class: "pl-f2" }, [p.plano || "preventiva", p.qtd > 1 ? `${p.qtd}×` : ""].filter(Boolean).join(" · ")),
    el("div", { class: "pl-f3" + (venc ? " venceu" : "") }, lim ? `${venc ? "venceu" : "vence"} ${brCurto(lim)}` : "sem vencimento"),
    [p.equipamento, p.local].filter(Boolean).length ? el("div", { class: "pl-f4", title: [p.equipamento, p.local].filter(Boolean).join(" · ") },
      [p.equipamento, p.local].filter(Boolean).join(" · ")) : null);
}

function obsDe(p) {
  const partes = [p.obs, p.fora && p.por_que_fora ? "fora do plano: " + p.por_que_fora : ""].filter(Boolean);
  return partes.length ? el("div", { class: "pl-obs", title: partes.join("\n") }, partes.join(" · ")) : el("span", { class: "pl-nada" }, "—");
}

function listaRegistro(reg) {
  const l = [...reg.hist].reverse();
  return l.length ? el("div", { class: "pl-reg" }, l.map(m => linhaMudanca(m)))
    : el("p", { class: "nada" }, "Nada registrado ainda além da inclusão no plano.");
}

// ── a tabela (computador) ───────────────────────────────────────────────────

const COLS = 10;

function cabecalho() {
  const b = (x, span) => el("th", { colspan: String(span), class: `pl-bloco b-${x.id}`, scope: "colgroup" },
    el("span", { class: "pl-bn" }, String(x.n)), x.nome, el("small", {}, x.quem));
  const s = (t, cls = "") => el("th", { class: "pl-sub " + cls, scope: "col" }, t);
  return el("thead", {},
    el("tr", {}, el("th", { rowspan: "2", class: "pl-fixa pl-cab-frota", scope: "col" }, "Frota"),
      b(BLOCOS[0], 2), b(BLOCOS[1], 2), b(BLOCOS[2], 2), b(BLOCOS[3], 2),
      el("th", { rowspan: "2", class: "pl-cab-obs", scope: "col" }, "Observações")),
    el("tr", {}, s("Data", "b-disp ini"), s("Mudanças · por quê", "b-disp"),
      s("Programada", "b-parada ini"), s("Reprogramações · por quê", "b-parada"),
      s("Entrada na oficina", "b-real ini"), s("Realizada em", "b-real"),
      s("OS · fechamento", "b-fech ini"), s("Resultado", "b-fech")));
}

function linhaTabela(p, ref, ctx, abertos, repintar) {
  const reg = registroDe(p);
  const d = celDisp(p, ref, reg), pa = celParada(p, ref, reg), r = celReal(p, ref), f = celFech(p, ref);
  const sub = t => t ? el("div", { class: "pl-sub-l" }, t) : null;
  const aberto = abertos.has(p.id);
  const nReg = reg.hist.length;
  const bReg = el("button", { type: "button", class: "pl-breg" + (aberto ? " on" : ""), "aria-expanded": aberto ? "true" : "false",
    title: (aberto ? "Fechar o registro" : "Ver o registro desta frota") + ` · ${nReg} lançamento${nReg === 1 ? "" : "s"}`,
    onclick: e => { e.stopPropagation(); aberto ? abertos.delete(p.id) : abertos.add(p.id); repintar(); } },
    aberto ? "▾" : "▸", ` ${nReg}`);
  const tr = el("tr", { class: "pl-lin" + (M.preventivaAberta(p) ? "" : " pl-fim") + (M.preventivaVencida(p, ref) ? " pl-venc" : ""),
    dataset: { id: p.id }, onclick: cliqueLimpo(() => abrirFichaPrev(p.id, ctx)) },
    el("td", { class: "pl-fixa" }, celFrota(p, ref, ctx, bReg)),
    el("td", { class: "b-disp ini" + (d.alerta ? " alerta" : "") }, d.data, sub(d.sub)),
    el("td", { class: "b-disp" }, d.mudou),
    el("td", { class: "b-parada ini" + (pa.alerta ? " alerta" : "") }, pa.data, sub(pa.sub)),
    el("td", { class: "b-parada" }, pa.mudou),
    el("td", { class: "b-real ini" + (r.alerta ? " alerta" : "") }, r.entrada, sub(r.subEntrada)),
    el("td", { class: "b-real" }, r.feita, sub(r.subFeita)),
    el("td", { class: "b-fech ini", onclick: e => e.stopPropagation() }, f.os, f.fechada),
    el("td", { class: "b-fech" }, f.res),
    el("td", { class: "pl-c-obs" }, obsDe(p)));
  if (!aberto) return [tr];
  return [tr, el("tr", { class: "pl-reg-lin", dataset: { id: p.id } },
    el("td", { colspan: String(COLS) }, el("div", { class: "pl-reg-caixa" },
      el("div", { class: "pl-reg-tit" }, el("b", {}, `Registro · ${p.frota}`),
        el("span", { class: "seg" }, ` · ${nReg} lançamento${nReg === 1 ? "" : "s"}, do mais novo para o mais antigo`)),
      listaRegistro(reg))))];
}

// ── o cartão (celular) ──────────────────────────────────────────────────────

function cartao(p, ref, ctx, abertos, repintar) {
  const reg = registroDe(p);
  const d = celDisp(p, ref, reg), pa = celParada(p, ref, reg), r = celReal(p, ref), f = celFech(p, ref);
  const bloco = (x, alerta, ...linhas) => el("div", { class: `pl-cb b-${x.id}` + (alerta ? " alerta" : "") },
    el("div", { class: "pl-cb-tit" }, el("span", { class: "pl-bn" }, String(x.n)), x.nome), ...linhas.filter(Boolean));
  const par = (rot, v, s) => el("div", { class: "pl-par" }, el("small", {}, rot), v, s ? el("div", { class: "pl-sub-l" }, s) : null);
  const aberto = abertos.has(p.id);
  return el("div", { class: "pl-cartao" + (M.preventivaAberta(p) ? "" : " pl-fim"), dataset: { id: p.id },
    onclick: cliqueLimpo(() => abrirFichaPrev(p.id, ctx)) },
    celFrota(p, ref, ctx),
    el("div", { class: "pl-cb-grade" },
      bloco(BLOCOS[0], d.alerta, par("Data", d.data, d.sub), par("Mudanças", d.mudou)),
      bloco(BLOCOS[1], pa.alerta, par("Programada", pa.data, pa.sub), par("Reprogramações", pa.mudou)),
      bloco(BLOCOS[2], r.alerta, par("Entrada", r.entrada, r.subEntrada), par("Realizada", r.feita, r.subFeita)),
      el("div", { onclick: e => e.stopPropagation(), class: "pl-cb-wrap" },
        bloco(BLOCOS[3], false, par("OS · fechamento", el("div", {}, f.os, f.fechada)), par("Resultado", f.res)))),
    p.obs || p.por_que_fora ? el("div", { class: "pl-cobs" }, el("small", {}, "Observações"), obsDe(p)) : null,
    el("button", { type: "button", class: "pl-breg larga" + (aberto ? " on" : ""), "aria-expanded": aberto ? "true" : "false",
      onclick: e => { e.stopPropagation(); aberto ? abertos.delete(p.id) : abertos.add(p.id); repintar(); } },
      `${aberto ? "▾" : "▸"} Registro · ${reg.hist.length}`),
    aberto ? listaRegistro(reg) : null);
}

// ── a vista ────────────────────────────────────────────────────────────────

/** Pinta a vista Planilha em `corpo`. `estado` é o da aba (busca, mês) e
 *  guarda o filtro, a ordem e os registros abertos. */
export function pintarPlanilha(corpo, { doMes, ref, ctx, estado, repintar }) {
  if (!estado.plAbertos) estado.plAbertos = new Set();
  const plano = doMes.filter(p => !p.fora && !p.excluida);
  const fora = doMes.filter(p => p.fora && !p.excluida).sort((a, b) => natural(a.frota, b.frota));
  const q = semAcento(String(estado.busca || "").trim());
  const achou = p => !q || semAcento([p.frota, p.equipamento, p.local, p.plano, p.os, p.obs, p.motivo, p.motivo_parada,
    p.motivo_entrega].join(" ")).includes(q);
  const buscadas = plano.filter(achou);
  const filtro = FILTROS.find(f => f[0] === (estado.plFiltro || "")) || FILTROS[0];
  const ordem = estado.plOrdem || "agenda";
  const cmp = ordem === "frota" ? (a, b) => natural(a.frota, b.frota)
    : ordem === "vence" ? (a, b) => String(M.venceEfetivo(a) || "9").localeCompare(String(M.venceEfetivo(b) || "9")) || natural(a.frota, b.frota)
    : ordemAgenda(ref);
  const visiveis = buscadas.filter(filtro[2]).sort(cmp);

  corpo.append(linhaDoMes(M.resumoPreventivas(doMes, ref), estado.mes, ref));

  // a faixa: em que pé está cada frota, e o filtro num toque
  corpo.append(el("div", { class: "faixa-sit pl-faixa" }, FILTROS.map(([id, rot, f]) => {
    const n = buscadas.filter(f).length;
    if (id && !n) return null;
    return el("button", { type: "button", class: "fsit" + ((estado.plFiltro || "") === id ? " on" : ""), dataset: { f: id },
      onclick: () => { estado.plFiltro = (estado.plFiltro || "") === id ? "" : id; repintar(); } }, el("b", {}, String(n)), " ", rot);
  })));

  const sel = el("select", { class: "pl-ordem", "aria-label": "Ordenar", onchange: () => { estado.plOrdem = sel.value; repintar(); } },
    ORDENS.map(([v, t]) => el("option", { value: v, selected: v === ordem }, t)));
  const todosAbertos = visiveis.length && visiveis.every(p => estado.plAbertos.has(p.id));
  corpo.append(el("div", { class: "pl-barra" },
    el("label", { class: "pl-ordem-rot" }, "Ordenar por ", sel),
    el("button", { type: "button", class: "mini", onclick: () => {
      if (todosAbertos) visiveis.forEach(p => estado.plAbertos.delete(p.id)); else visiveis.forEach(p => estado.plAbertos.add(p.id));
      repintar(); } }, todosAbertos ? "Fechar os registros" : "Abrir todos os registros"),
    el("div", { class: "espaco" }),
    el("span", { class: "pl-leg" }, "Toque na data para mudar · ↻ conta as mudanças, com o porquê"),
    el("button", { type: "button", class: "mini", title: "A planilha do mês em Excel, com o registro numa segunda aba",
      onclick: () => baixarPlanilha(doMes, estado.mes, ref) }, "Baixar a planilha")));

  if (!visiveis.length) {
    corpo.append(vazio(q ? "Nada com esta busca." : `Nenhuma frota em "${filtro[1]}".`));
  } else {
    const abertos = estado.plAbertos;
    corpo.append(el("div", { class: "pl-rolagem" }, el("table", { class: "pl-tabela" },
      el("colgroup", {}, ["frota", "data", "mud", "data", "mud", "real", "real", "os", "res", "obs"].map(c => el("col", { class: "c-" + c }))),
      cabecalho(),
      el("tbody", {}, visiveis.flatMap(p => linhaTabela(p, ref, ctx, abertos, repintar))))),
    el("div", { class: "pl-cartoes" }, visiveis.map(p => cartao(p, ref, ctx, abertos, repintar))));
  }

  if (fora.length && !estado.plFiltro) {
    const det = el("details", { class: "outros", open: estado.foraAberto },
      el("summary", {}, `Fora do plano de ${rotuloMes(estado.mes).split("/")[0]} · ${fora.length} frota${fora.length === 1 ? "" : "s"} · não entram na contagem`),
      tabelaFora(fora.filter(achou), ctx));
    det.addEventListener("toggle", () => { estado.foraAberto = det.open; });
    corpo.append(det);
  }
}

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
