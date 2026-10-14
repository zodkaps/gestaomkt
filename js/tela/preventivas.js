// Preventivas — a aba "Preventivas" da planilha, no site.
//
// Uma linha por frota, os mesmos números no alto (preventivas a fazer, frotas,
// com e sem data da operação, parada marcada, conflitos, vencidas, realizadas,
// HH) e a mesma Situação colorida, calculada pela mesma fórmula
// (`M.situacaoPreventiva`, conferida linha a linha em testes/resultados.mjs).
//
// O que o site acrescenta é a separação: uma preventiva só anda quando duas
// áreas respondem coisas diferentes — a operação diz QUANDO o caminhão fica
// livre, o PCM diz QUE DIA ele para. Por isso a tela é dividida por de quem é
// a bola, e não por frota: a pergunta que destrava é "o que está parado
// esperando mim?". O que já saiu (realizada, mês seguinte, cancelada) e o
// quadro "fora do plano" ficam em seções próprias, fora do caminho.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { el, limpar, br, brCurto, chip, caixa, campo, selecao, comSugestoes,
  avisar, erro, vazio, cliqueLimpo, confirmar, medidor, fecharCaixa } from "../ui.js";
import { busca as semAcento } from "../texto.js";
import { natural } from "./grade.js";
import { botaoMais, frotas as frotasDasAtividades } from "./comum.js";
import { mesDaData, mesDoPlano, decisoesPreventivas } from "../decisoes.js";
import { cartaoGrafico, graficoBarras, graficoColunas, graficoLinhas, graficoRosca } from "../graficos.js";
import { listaDecisoes } from "./decidir.js";
import { conciliacao, descrever as descreverLigacao, eventosDaConciliacao } from "../vinculo.js";

// ── o cartão (celular, e a tela Para você) ──────────────────────────────────

export function cartaoPrev(p, ctx, { acoes = [] } = {}) {
  const s = M.situacaoPreventiva(p);
  const esperando = M.esperandoQuem(p);
  const tags = [chip(M.rotulo(s), M.corDe(s))];
  if (esperando) tags.push(chip(esperando === "Operação" ? "aguardando a operação" : "aguardando o PCM", esperando === "Operação" ? "hoje" : "andando"));
  if (M.preventivaVencida(p)) tags.push(chip("vencida", "vencida"));
  if (p.os) tags.push(chip("OS " + p.os, "os"));
  if (p.pendencias > 0) tags.push(chip(`${p.pendencias} pendência${p.pendencias === 1 ? "" : "s"} na carteira`));
  if (p.onde_fazer === "Terceiro") tags.push(chip("terceiro"));

  const sub = [];
  if (p.plano) sub.push(p.plano + (p.qtd > 1 ? ` (${p.qtd})` : ""));
  if (p.equipamento) sub.push(p.equipamento);
  if (p.local) sub.push(p.local);
  if (M.venceEfetivo(p)) sub.push("vence " + brCurto(M.venceEfetivo(p)));
  if (p.disponivel_agora) sub.push("disponível agora");
  else if (p.disponivel_em) sub.push("liberação " + brCurto(p.disponivel_em));
  if (p.dia_parada) sub.push("parada " + brCurto(p.dia_parada));

  return el("div", { class: `at ${M.corDe(s)}${M.preventivaFeita(p) ? " feito" : ""}`, dataset: { id: p.id } },
    el("div", { class: "meio", style: "cursor:pointer",
      onclick: cliqueLimpo(() => abrirFichaPrev(p.id, ctx)) },
      el("div", { class: "tit" }, p.frota),
      sub.length ? el("div", { class: "sub" }, sub.join(" · ")) : null,
      el("div", { class: "tags" }, tags)),
    el("div", { class: "acoes" }, [...acoes, botaoMais("preventiva", p.id, ctx)].filter(Boolean)));
}

// ── as respostas ────────────────────────────────────────────────────────────

export async function informarDisponibilidade(p) {
  const eQuando = el("input", { type: "date", value: p.disponivel_em || M.hoje() });
  let escolha = p.disponivel_agora ? "agora" : "data";
  const bAgora = el("button", {}, "Disponível agora");
  const bData = el("button", {}, "Disponível a partir de…");
  const linhaData = el("div", {}, campo("A partir de", eQuando));
  const trocar = v => {
    escolha = v;
    bAgora.className = v === "agora" ? "primario" : "";
    bData.className = v === "data" ? "primario" : "";
    linhaData.style.display = v === "data" ? "" : "none";
  };
  bAgora.onclick = () => trocar("agora");
  bData.onclick = () => trocar("data");
  trocar(escolha);

  const lim = M.venceEfetivo(p);
  const antes = p.disponivel_agora ? "agora" : (p.disponivel_em ? br(p.disponivel_em) : "");
  const eMotivo = el("input", { type: "text", placeholder: "ex.: a frota saiu para viagem e volta sexta" });
  const r = await caixa({
    titulo: "Quando esta frota fica disponível para a manutenção?",
    corpo: el("div", {},
      el("p", {}, el("b", {}, p.frota), p.plano ? ` · ${p.plano}` : "",
        lim ? ` · vence ${br(lim)}` : ""),
      el("p", { class: "nada" }, antes
        ? `Hoje a liberação informada é: ${antes}. Mudar fica no registro, com o motivo.`
        : "A manutenção só programa a parada depois desta informação."),
      el("div", { style: "display:flex;gap:8px;margin-bottom:12px" }, bAgora, bData),
      linhaData,
      antes ? campo("Motivo da mudança (opcional)", eMotivo) : null),
    // O lançamento se monta no botão: se faltar algo, a caixa fica aberta com
    // o aviso, sem perder o que já foi escolhido.
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Responder", classe: "primario",
        acao: () => ev.informarDisponibilidade(p, escolha === "agora" ? "agora" : eQuando.value, eMotivo.value) }],
  });
  if (!r) return false;
  const quando = r.dados.quando;
  try {
    await ev.aplicar(r);
    avisar(`${p.frota}: ${quando === "agora" ? "disponível agora" : "disponível a partir de " + br(quando)}.`);
    return true;
  } catch (e) { erro(e.message); return false; }
}

/** Os motivos de reprogramação de preventiva escritos por último — à mão
 *  para o caso que se repete, sem lista pronta. */
function motivosRecentesPrev(max = 4) {
  const vistos = new Map();
  for (let i = ev.log.length - 1; i >= 0 && vistos.size < max; i--) {
    const e = ev.log[i];
    if (e.alvo_tipo !== "preventiva" || !["prev_parada", "prev_adiada", "prev_disponivel"].includes(e.tipo)) continue;
    const m = String(e.motivo || "").trim();
    if (m && !vistos.has(m.toLowerCase())) vistos.set(m.toLowerCase(), m);
  }
  return [...vistos.values()];
}

export async function marcarParada(p, { sugestao = "" } = {}) {
  const reprograma = !!p.dia_parada;
  const eDia = el("input", { type: "date", value: sugestao || p.dia_parada ||
    (p.disponivel_agora ? M.hoje() : p.disponivel_em || M.hoje()) });
  const eOnde = selecao([{ v: "", t: "— local de execução —" }, "Interna", "Terceiro"], p.onde_fazer || "");
  const eMotivo = el("input", { type: "text", placeholder: "ex.: frota em viagem, oficina cheia, peça não chegou" });
  const livre = p.disponivel_agora ? "agora" : (p.disponivel_em ? br(p.disponivel_em) : null);
  const lim = M.venceEfetivo(p);
  const recentes = reprograma ? motivosRecentesPrev() : [];

  const r = await caixa({
    titulo: reprograma ? "Reprogramar a parada" : "Programar a parada",
    corpo: el("div", {},
      el("p", {}, el("b", {}, p.frota), p.plano ? ` · ${p.plano}` : "",
        lim ? ` · vence ${br(lim)}` : ""),
      reprograma ? el("p", { class: "nada" }, `Hoje a parada está em ${br(p.dia_parada)}` +
        (p.reprog_parada ? ` · já reprogramada ${p.reprog_parada}× (a primeira data era ${br(p.parada_orig)})` : "") + ".") : null,
      livre
        ? el("p", { class: "nada" }, `Liberação informada pela operação: ${livre}.`)
        : el("p", { style: "color:var(--hoje)" },
          "⚠ A operação ainda não informou a liberação desta frota. " +
          "Programar sem essa informação é arriscado."),
      p.pendencias > 0
        ? el("p", { class: "nada" },
          `Há ${p.pendencias} pendência(s) na carteira desta frota — é possível ` +
          "aproveitar a parada para executá-las.")
        : null,
      campo("Dia da parada", eDia),
      campo("Onde fazer", eOnde),
      reprograma ? campo("Motivo da reprogramação", eMotivo,
        "Obrigatório se o dia mudar. Fica no registro e conta na reprogramação do mês.") : null,
      recentes.length ? el("div", { class: "motivos-rapidos" },
        el("span", { class: "seg" }, "Usados por último:"),
        recentes.map(m => el("button", { type: "button", class: "motivo-rapido",
          onclick: () => { eMotivo.value = m; eMotivo.focus(); } }, m))) : null),
    // Sem motivo para mudar o dia, a caixa não fecha: o aviso aparece e o dia
    // escolhido continua lá.
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: reprograma ? "Reprogramar" : "Marcar", classe: "primario",
        acao: () => ev.marcarParada(p, eDia.value, eOnde.value, eMotivo.value) }],
  });
  if (!r) return false;
  try {
    await ev.aplicar(r);
    avisar(`${p.frota}: parada ${reprograma && eDia.value !== p.dia_parada ? "reprogramada" : "programada"} para ${br(eDia.value)}.`);
    return true;
  } catch (e) { erro(e.message); return false; }
}

// ── ligar à Programação o que existia antes ─────────────────────────────────

export async function ligarAProgramacao(prevs) {
  const todos = conciliacao(prevs);
  const itens = todos.filter(it => it.passos.length);
  const avisos = todos.filter(it => !it.passos.length);
  if (!itens.length) { avisar("Tudo já está ligado à Programação."); return false; }
  const linha = it => el("tr", {}, el("td", {}, el("b", {}, it.p.frota)),
    el("td", {}, it.p.plano || "—"), el("td", {}, descreverLigacao(it)));
  const r = await caixa({
    titulo: "Ligar as preventivas à Programação",
    largura: "820px",
    corpo: el("div", {},
      el("p", {}, "A preventiva do plano e a OS preventiva da oficina passam a ser uma coisa só: a parada marcada ",
        "entra no dia da Programação, e a baixa num lado registra a realização no outro. Para as que já existiam:"),
      el("div", { class: "tabela-rolagem" }, el("table", { class: "tabela" },
        el("thead", {}, el("tr", {}, el("th", {}, "Frota"), el("th", {}, "Preventiva"), el("th", {}, "O que acontece"))),
        el("tbody", {}, itens.map(linha)))),
      avisos.length ? el("p", { class: "nada" }, `${avisos.length} só com aviso (nada é mudado): ` +
        avisos.map(it => `${it.p.frota} — ${it.aviso}`).join("; ") + ".") : null),
    acoes: [{ rotulo: "Agora não", valor: false },
      { rotulo: `Ligar ${itens.length}`, classe: "primario", acao: () => eventosDaConciliacao(itens) }],
  });
  if (!r) return false;
  await ev.aplicar(r);
  avisar(`${itens.length} preventiva${itens.length === 1 ? "" : "s"} ligada${itens.length === 1 ? "" : "s"} à Programação.`);
  return true;
}

// ── incluir uma frota no plano, e editar ────────────────────────────────────

const PLANOS_COMUNS = ["1 ano", "15 mil km", "30 mil km", "500 h"];

function formularioPreventiva(p, mesPadrao) {
  const todas = ev.lista("preventiva");
  const unicos = f => [...new Set(todas.map(f).filter(Boolean))].sort(natural);
  const frotasConhecidas = [...new Set([...frotasDasAtividades(), ...unicos(x => x.frota)])].sort(natural);
  const meses = [...new Set([mesPadrao, mesDaData(M.hoje()), ...todas.map(x => x.mes).filter(Boolean)])];
  const c = {
    frota: el("input", { value: p ? p.frota : "", placeholder: "ex.: F-745", autocomplete: "off" }),
    mes: selecao(meses, p ? p.mes : mesPadrao),
    plano: el("input", { value: p ? p.plano : "", placeholder: "ex.: 15 mil km, 1 ano" }),
    qtd: el("input", { type: "number", min: 1, value: p ? p.qtd || 1 : 1 }),
    vence: el("input", { type: "date", value: p ? p.vence : "" }),
    prazo_service: el("input", { type: "date", value: p ? p.prazo_service : "" }),
    equipamento: el("input", { value: p ? p.equipamento : "", placeholder: "ex.: Cavalo, Carga seca" }),
    local: el("input", { value: p ? p.local : "", placeholder: "ex.: Matriz" }),
    onde_fazer: selecao([{ v: "", t: "— a definir —" }, "Interna", "Terceiro"], p ? p.onde_fazer : ""),
    hh: el("input", { type: "number", min: 0, step: "0.5", value: p ? p.hh || "" : "" }),
    os: el("input", { value: p ? p.os : "", inputmode: "numeric", placeholder: "se já tiver" }),
    obs: el("textarea", { rows: 2 }, p ? p.obs : ""),
  };
  const no = el("div", { class: "form-prev" },
    el("div", { class: "dupla" },
      campo("Frota", comSugestoes(c.frota, frotasConhecidas, "dl-prev-frotas")),
      campo("Mês do plano", c.mes)),
    el("div", { class: "dupla" },
      campo("Preventivas", comSugestoes(c.plano, [...new Set([...unicos(x => x.plano), ...PLANOS_COMUNS])], "dl-prev-planos")),
      campo("Quantidade", c.qtd)),
    el("div", { class: "dupla" },
      campo("Vencimento", c.vence), campo("Prazo do Service", c.prazo_service, "se houver — passa a valer no lugar do vencimento")),
    el("div", { class: "dupla" },
      campo("Equipamento", comSugestoes(c.equipamento, unicos(x => x.equipamento), "dl-prev-equip")),
      campo("Local", comSugestoes(c.local, unicos(x => x.local), "dl-prev-local"))),
    el("div", { class: "tripla" }, campo("Onde fazer", c.onde_fazer), campo("HH previsto", c.hh), campo("OS", c.os)),
    campo("Observação", c.obs));
  const valores = () => {
    const os = c.os.value.replace(/\D+/g, "");
    return {
      frota: c.frota.value.trim(), mes: c.mes.value, plano: c.plano.value.trim(),
      qtd: Math.max(1, Number(c.qtd.value) || 1), vence: c.vence.value, prazo_service: c.prazo_service.value,
      equipamento: c.equipamento.value.trim(), local: c.local.value.trim(), onde_fazer: c.onde_fazer.value,
      hh: Number(String(c.hh.value).replace(",", ".")) || 0, os: os ? os.padStart(6, "0") : "", obs: c.obs.value.trim(),
    };
  };
  return { no, valores };
}

/** "+ Incluir frota": uma preventiva nova no plano do mês, lançada no site. */
export async function incluirPreventiva(mesPadrao) {
  const f = formularioPreventiva(null, mesPadrao || mesDaData(M.hoje()));
  const r = await caixa({ titulo: "Incluir frota no plano de preventivas", largura: "620px",
    corpo: el("div", {}, el("p", { class: "nada", style: "margin-top:0" },
      "A frota entra no plano do mês escolhido, aguardando a liberação da operação. " +
      "Fica no registro como incluída no site — e uma reimportação da planilha não a tira."), f.no),
    acoes: [{ rotulo: "Cancelar", valor: false }, { rotulo: "Incluir", classe: "primario", acao: () => {
      const v = f.valores();
      return { v, e: ev.novaPreventiva({ ...M.moldePreventiva(), ...v, id: undefined }) };
    } }] });
  if (!r) return null;
  const { v } = r;
  const ja = ev.lista("preventiva").filter(x => x.mes === v.mes && !x.fora &&
    x.frota.replace(/\W/g, "").toLowerCase() === v.frota.replace(/\W/g, "").toLowerCase());
  if (ja.length && !await confirmar("Esta frota já está no plano",
    `${v.frota} já tem ${ja.length === 1 ? "uma preventiva" : ja.length + " preventivas"} em ${v.mes} ` +
    `(${ja.map(x => x.plano || "sem plano").join(", ")}). Incluir outra mesmo assim?`, "Incluir mesmo assim")) return null;
  try {
    const [e] = await ev.aplicar(r.e);
    avisar(`${v.frota} incluída no plano de ${v.mes}.`);
    return e.alvo;
  } catch (x) { erro(x.message); return null; }
}

export async function editarPreventiva(p) {
  const f = formularioPreventiva(p, p.mes);
  const r = await caixa({ titulo: `Editar a preventiva · ${p.frota}`, largura: "620px",
    corpo: el("div", {}, el("p", { class: "nada", style: "margin-top:0" },
      "Parada, liberação e realização têm botão próprio — é por eles que a reprogramação se conta."), f.no),
    acoes: [{ rotulo: "Cancelar", valor: false }, { rotulo: "Salvar", classe: "primario", acao: () => {
      const v = f.valores();
      if (!v.frota) throw new Error("Falta a frota.");
      return { v, e: ev.editar(p, v, "preventiva") };
    } }] });
  if (!r) return false;
  const { v, e } = r;
  if (!e) { avisar("Nada mudou."); return false; }
  try {
    await ev.aplicar(e);
    avisar(`${v.frota}: preventiva atualizada.`);
    return true;
  } catch (x) { erro(x.message); return false; }
}

// ── o que cada lançamento mudou ─────────────────────────────────────────────

const LIB = a => !a ? "" : a.disponivel_agora ? "agora" : (a.disponivel_em ? brCurto(a.disponivel_em) : "");
const CAMPOS_PREV = {
  frota: ["frota"], plano: ["preventivas"], qtd: ["quantidade"], vence: ["vencimento", "data"],
  prazo_service: ["prazo do Service", "data"], dia_parada: ["parada", "data"], onde_fazer: ["onde fazer"],
  equipamento: ["equipamento"], local: ["local"], os: ["OS"], hh: ["HH"], realizada_em: ["realizada em", "data"],
  em_andamento: ["em andamento", "sim"], fora: ["fora do plano", "sim"], obs: ["observação"], mes: ["mês do plano"],
};
const valorCampo = (v, tipo) => v == null || v === "" ? "—"
  : tipo === "data" ? brCurto(v) : tipo === "sim" ? (v ? "sim" : "não") : String(v);

/** Um lançamento de preventiva em palavras: o tipo (para filtrar), a frase e
 *  o antes → depois do que mudou. Reimportação que não mudou nada não aparece. */
export function descreverMudancaPrev(m) {
  const { e, antes, depois, mudou } = m;
  const d = e.dados || {};
  const detalhes = (pular = []) => mudou
    .filter(x => CAMPOS_PREV[x.campo] && !pular.includes(x.campo))
    .map(x => `${CAMPOS_PREV[x.campo][0]}: ${valorCampo(x.de, CAMPOS_PREV[x.campo][1])} → ${valorCampo(x.para, CAMPOS_PREV[x.campo][1])}`);
  const r = (tipo, texto, det = []) => ({ tipo, texto, detalhes: det, e, depois });
  switch (e.tipo) {
    case "criada": return r("inclusao", `incluiu no plano${depois && depois.plano ? " (" + depois.plano + ")" : ""}` +
      (depois && M.venceEfetivo(depois) ? ` · vence ${brCurto(M.venceEfetivo(depois))}` : ""));
    case "importada": {
      if (!antes) return r("inclusao", "veio da planilha" + (depois && depois.fora ? " (fora do plano)" : ""));
      const det = detalhes();
      return det.length ? r("edicao", "a planilha atualizou", det) : null;
    }
    case "prev_disponivel": {
      const de = LIB(antes), para = LIB(depois);
      return de ? r("reprogramacao", `mudou a liberação: ${de} → ${para}`)
        : r("liberacao", `informou a liberação: ${para}`);
    }
    case "prev_parada": {
      const de = antes && antes.dia_parada, para = depois && depois.dia_parada;
      if (de && para && de !== para) return r("reprogramacao", `reprogramou a parada: ${brCurto(de)} → ${brCurto(para)}`, detalhes(["dia_parada"]));
      return r("parada", `programou a parada para ${brCurto(para)}`, detalhes(["dia_parada"]));
    }
    case "prev_adiada": return r("reprogramacao", "adiou para o próximo mês");
    case "prev_realizada": return r("realizacao", `registrou a realização em ${brCurto(d.em)}`, detalhes(["realizada_em", "em_andamento"]));
    case "prev_andamento": return r("andamento", d.sim === false ? "retirou de em andamento" : "marcou em andamento");
    case "prev_cancelada": return r("cancelamento", "cancelou");
    case "prev_reaberta": return r("reabertura", "reabriu");
    case "excluida": return r("cancelamento", "excluiu do plano");
    case "reincluida": return r("reabertura", "desfez a exclusão");
    case "editada": return r("edicao", "editou", detalhes());
    default: return r("edicao", ev.TIPOS[e.tipo] || e.tipo, detalhes());
  }
}

export async function darPorFeita(p) {
  const eData = el("input", { type: "date", value: M.hoje() });
  const eOS = el("input", { value: p.os, inputmode: "numeric", placeholder: "OS no Protheus" });
  const r = await caixa({
    titulo: "Preventiva realizada",
    corpo: el("div", {},
      el("p", {}, el("b", {}, p.frota), p.plano ? ` · ${p.plano}` : ""),
      campo("Realizada em", eData), campo("OS", eOS)),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Confirmar", classe: "primario", acao: () => {
        const os = eOS.value.replace(/\D+/g, "");
        return ev.preventivaFeita(p, eData.value, os ? os.padStart(6, "0") : "");
      } }],
  });
  if (!r) return;
  try {
    await ev.aplicar(r);
    avisar(`${p.frota}: preventiva realizada.`);
  } catch (e) { erro(e.message); }
}

export async function passarParaOMesSeguinte(p) {
  const livre = el("input", { placeholder: "motivo do adiamento" });
  const r = await caixa({
    titulo: "Adiar para o próximo mês",
    corpo: el("div", {},
      el("p", {}, el("b", {}, p.frota), " sai da contagem deste mês (é o Status ",
        el("b", {}, "Reprogramada"), " da planilha) e o motivo fica registrado."),
      campo("Motivo", livre)),
    acoes: [{ rotulo: "Voltar", valor: false },
      { rotulo: "Passar", classe: "perigo", acao: () => ev.adiarPreventiva(p, livre.value.trim()) }],
  });
  if (!r) return;
  try {
    await ev.aplicar(r);
    avisar(`${p.frota}: adiada para o próximo mês.`);
  } catch (x) { erro(x.message); }
}

export async function cancelarPrev(p) {
  const motivo = el("input", { placeholder: "motivo da não execução" });
  const r = await caixa({
    titulo: "Cancelar a preventiva",
    corpo: el("div", {}, el("p", {}, el("b", {}, p.frota), " sai da contagem do mês."),
      campo("Motivo", motivo)),
    acoes: [{ rotulo: "Voltar", valor: false },
      { rotulo: "Cancelar a preventiva", classe: "perigo", acao: () => ev.cancelarPreventiva(p, motivo.value.trim()) }],
  });
  if (!r) return;
  try {
    await ev.aplicar(r);
    avisar(`${p.frota}: cancelada.`);
  } catch (x) { erro(x.message); }
}

export async function andamento(p, sim) {
  try {
    await ev.aplicar(ev.preventivaEmAndamento(p, sim));
    avisar(sim ? `${p.frota}: em andamento.` : `${p.frota}: não está mais em andamento.`);
  } catch (x) { erro(x.message); }
}

export async function reabrirPrev(p) {
  try {
    await ev.aplicar(ev.reabrirPreventiva(p));
    avisar(`${p.frota} voltou para o plano.`);
  } catch (x) { erro(x.message); }
}

const TIPO_MUDANCA = {
  inclusao: ["Inclusão", ""], liberacao: ["Liberação", "andando"], parada: ["Parada", "andando"],
  reprogramacao: ["Reprogramação", "hoje"], realizacao: ["Realização", "ok"], andamento: ["Andamento", ""],
  cancelamento: ["Cancelamento", "vencida"], reabertura: ["Reabertura", ""], edicao: ["Edição", ""],
};

function linhaMudanca(m, comFrota = false) {
  const e = m.e;
  const [rot, cor] = TIPO_MUDANCA[m.tipo] || ["Mudança", ""];
  const quando = new Date(e.ts);
  return el("div", { class: "evento mudanca" },
    el("div", { class: "qdo" }, brCurto(e.ts.slice(0, 10)),
      el("small", {}, quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))),
    el("div", { class: "oq" },
      chip(rot, "tipo-mud " + cor), " ",
      comFrota && m.depois ? el("b", {}, m.depois.frota + " · ") : null,
      el("span", { class: "autor" }, (e.autor || "—") + " "), m.texto,
      e.origem === "claude" ? el("span", { class: "tag claude" }, " pedido ao Claude") : null,
      m.detalhes.length ? el("div", { class: "mud-det" }, m.detalhes.join(" · ")) : null,
      e.motivo ? el("div", { class: "mot" }, "motivo: " + e.motivo) : null));
}

export async function abrirFichaPrev(id, ctx) {
  const p = ev.porId(id, "preventiva");
  if (!p) return;
  const s = M.situacaoPreventiva(p);
  const linha = (r, v) => v ? el("tr", {}, el("th", {}, r), el("td", {}, v)) : null;
  const hist = ev.mudancasDe(id, "preventiva").map(descreverMudancaPrev).filter(Boolean).reverse();

  const corpo = el("div", {},
    el("table", { class: "tabela" },
      linha("Situação", el("span", {}, chip(M.rotulo(s), M.corDe(s)),
        M.preventivaVencida(p) ? chip("vencida", "vencida") : null)),
      linha("Aguardando", ({ "Operação": "a operação", PCM: "o PCM" })[M.esperandoQuem(p)] || null),
      linha("Frota", p.frota),
      linha("Equipamento", [p.equipamento, p.local].filter(Boolean).join(" · ")),
      linha("Preventivas", p.plano ? `${p.plano}${p.qtd > 1 ? ` (${p.qtd})` : ""}` : null),
      linha("Vencimento (plano)", p.vence ? br(p.vence) : null),
      linha("Prazo do Service", p.prazo_service ? br(p.prazo_service) : p.prazo_service_texto),
      linha("Liberação (operação)", p.disponivel_agora ? "agora" : (p.disponivel_em ? br(p.disponivel_em) : null)),
      linha("Dia da parada (PCM)", p.dia_parada ? br(p.dia_parada) : null),
      linha("Reprogramações da parada", p.reprog_parada
        ? `${p.reprog_parada}× · a primeira data era ${br(p.parada_orig)}` +
          (p.motivo_parada ? ` · último motivo: ${p.motivo_parada}` : "") : null),
      linha("Liberação alterada", p.reprog_liberacao ? `${p.reprog_liberacao}×` : null),
      linha("Onde fazer", p.onde_fazer),
      linha("OS", p.os),
      linha("Na Programação", (() => {
        const a = ev.atividadeDaPreventiva(p);
        if (!a) return M.preventivaAberta(p) ? el("span", { class: "nada" }, "ainda não — entra no dia da parada, quando ela for marcada") : null;
        const s2 = M.situacaoDe(a);
        return el("span", {}, chip(M.rotulo(s2), M.corDe(s2)), " ",
          a.semana ? `semana ${a.semana}${a.dia ? " · " + a.dia : ""}` : "na carteira", a.os ? ` · OS ${a.os}` : "", " ",
          el("button", { class: "mini", onclick: () => { fecharCaixa(); ctx && ctx.ir("programacao",
            a.semana ? `s=${a.semana}&a=${a.ano}&f=${encodeURIComponent(a.frota)}` : `m=carteira&f=${encodeURIComponent(a.frota)}`); } },
            "Abrir na Programação"));
      })()),
      linha("HH previsto", p.hh ? String(p.hh).replace(".", ",") : null),
      linha("Pendências na carteira", p.pendencias ? String(p.pendencias) : null),
      linha("Realizada em", p.realizada_em ? br(p.realizada_em)
        : p.realizada_sem_data ? "marcada Realizada na planilha, sem a data" : null),
      linha("Por que está fora", p.por_que_fora),
      linha("Se não for realizada, motivo", p.motivo),
      linha("Observação", p.obs)),
    el("h2", { class: "mini" }, `Registro de mudanças · ${hist.length}`),
    el("div", {}, hist.map(linhaMudanca)));

  const acoes = [];
  const pcm = pessoas.pode("parada");
  if (pcm && !p.excluida) acoes.push({ rotulo: "Editar", acao: async () => { await editarPreventiva(p); } });
  if (M.preventivaAberta(p)) {
    if (pessoas.pode("disponibilidade")) {
      acoes.push({ rotulo: "Disponibilidade", acao: async () => { await informarDisponibilidade(p); } });
    }
    if (pcm) {
      acoes.push({ rotulo: p.dia_parada ? "Reprogramar a parada" : "Programar parada", classe: "primario",
        acao: async () => { await marcarParada(p); } });
      acoes.push(p.em_andamento
        ? { rotulo: "Não está em andamento", acao: async () => { await andamento(p, false); } }
        : { rotulo: "Em andamento", acao: async () => { await andamento(p, true); } });
      acoes.push({ rotulo: "Realizada", acao: async () => { await darPorFeita(p); } });
      acoes.push({ rotulo: "Adiar para o próximo mês", acao: async () => { await passarParaOMesSeguinte(p); } });
      acoes.push({ rotulo: "Cancelar", classe: "perigo", acao: async () => { await cancelarPrev(p); } });
    }
  } else if (pcm && !p.fora) {
    if (p.realizada_sem_data) {
      acoes.push({ rotulo: "Informar a data", classe: "primario", acao: async () => { await darPorFeita(p); } });
    }
    acoes.push({ rotulo: "Reabrir", acao: async () => { await reabrirPrev(p); } });
  }
  await caixa({ titulo: p.frota || "Preventiva", corpo, acoes, largura: "640px" });
}

// ── a tabela de uma seção ───────────────────────────────────────────────────

const data = (iso, cls = "") => iso
  ? el("span", { class: cls }, brCurto(iso)) : el("span", { class: "seg" }, "—");

function botaoDaLinha(p, ref) {
  const quem = M.esperandoQuem(p, ref);
  const s = M.situacaoPreventiva(p, ref);
  const parar = fn => e => { e.stopPropagation(); fn(); };
  if (quem === "Operação" && pessoas.pode("disponibilidade")) {
    return el("button", { class: "mini acao-op", onclick: parar(() => informarDisponibilidade(p)) }, "Informar");
  }
  if (!pessoas.pode("parada")) return "";
  if (s === "Disponível: marcar a parada" || s === "Com data: marcar a parada" ||
    s.startsWith("Conflito")) {
    return el("button", { class: "mini acao-pcm", title: "Programar a parada",
      onclick: parar(() => marcarParada(p)) }, "Programar");
  }
  if (s === "Programada" || s === "Programada depois do prazo" ||
    s === "Em andamento" || s === "Parada passou, sem baixa") {
    return el("button", { class: "mini baixa", onclick: parar(() => darPorFeita(p)) }, "Realizada");
  }
  if (p.realizada_sem_data) {
    return el("button", { class: "mini sem-data", onclick: parar(() => darPorFeita(p)) }, "✓ sem data");
  }
  if (p.realizada_em) return el("span", { class: "feito-em" }, "✓ " + brCurto(p.realizada_em));
  return "";
}

function tabelaPrev(itens, ctx, ref) {
  const cab = el("tr", {},
    el("th", { class: "c-sit" }, "Situação"),
    el("th", { class: "c-fr" }, "Frota"),
    el("th", { class: "c-plano" }, "Preventivas"),
    el("th", { class: "c-dt num" }, "Vence"),
    el("th", { class: "c-dt c-lib num", title: "Data de liberação informada pela operação" }, "Liberação"),
    el("th", { class: "c-dt num", title: "Data da parada, programada pelo PCM" }, "Parada"),
    el("th", { class: "c-onde" }, "Execução"),
    el("th", { class: "c-os" }, "OS"),
    el("th", { class: "c-hh num" }, "HH"),
    el("th", { class: "c-feito" }, ""));
  const corpo = el("tbody", {}, itens.map(p => {
    const s = M.situacaoPreventiva(p, ref);
    const cor = M.corDe(s);
    const venc = M.preventivaVencida(p, ref);
    const lim = M.venceEfetivo(p);
    const conflito = s.startsWith("Conflito");
    const tr = el("tr", {
      class: `lin ${cor}${M.preventivaFeita(p) ? " feita" : ""}` +
        (p.cancelada ? " cancel" : p.adiada ? " adiada" : ""),
      dataset: { id: p.id },
    },
      el("td", { class: "c-sit" }, el("span", { class: "sit " + cor, title: M.rotulo(s) }, M.rotulo(s))),
      el("td", { class: "c-fr" },
        el("div", { class: "fr" }, p.frota),
        el("div", { class: "seg" }, [p.equipamento, p.local].filter(Boolean).join(" · "))),
      el("td", { class: "c-plano" },
        el("div", { class: "t" }, p.plano || el("span", { class: "seg" }, "—"),
          p.qtd > 1 ? el("span", { class: "tag" }, `${p.qtd}×`) : null),
        (p.motivo && !M.preventivaFeita(p)) ? el("div", { class: "porque" }, p.motivo) : null),
      el("td", { class: "c-dt num", title: p.prazo_service ? "prazo do Service" : "vencimento no plano" },
        data(lim, venc ? "venceu" : ""),
        p.prazo_service ? el("div", { class: "seg" }, "Service") : null),
      el("td", { class: "c-dt num" }, p.disponivel_agora
        ? el("span", { class: "agora" }, "Agora")
        : data(p.disponivel_em, conflito ? "venceu" : "")),
      el("td", { class: "c-dt num" }, data(p.dia_parada,
        s === "Parada passou, sem baixa" || s === "Programada depois do prazo" ? "venceu" : ""),
        p.reprog_parada ? el("div", { class: "tag reprog", title: `primeira data ${br(p.parada_orig)}` +
          (p.motivo_parada ? ` · ${p.motivo_parada}` : "") }, `↻ ${p.reprog_parada}×`) : null),
      el("td", { class: "c-onde" }, p.onde_fazer || el("span", { class: "seg" }, "—")),
      el("td", { class: "c-os" }, p.os ? el("span", { class: "os" }, p.os) : el("span", { class: "seg" }, "—"),
        // onde a OS preventiva está na Programação (ligação com o plano)
        (() => {
          const a = ev.atividadeDaPreventiva(p);
          if (!a) return null;
          const t = M.feita(a) ? "com baixa" : a.semana ? `S${a.semana}${a.dia ? " · " + a.dia : ""}` : "carteira";
          return el("small", { class: "na-prog", title: "A OS preventiva na Programação" }, "▸ " + t);
        })()),
      el("td", { class: "c-hh num" }, p.hh ? String(p.hh).replace(".", ",") : el("span", { class: "seg" }, "—")),
      el("td", { class: "c-feito" }, botaoDaLinha(p, ref), botaoMais("preventiva", p.id, ctx)));
    tr.addEventListener("click", cliqueLimpo(() => abrirFichaPrev(p.id, ctx)));
    return tr;
  }));
  const tabela = el("table", { class: "grade prev" }, el("thead", {}, cab), corpo);
  const cartoes = el("div", { class: "lista" }, itens.map(p => {
    const b = botaoDaLinha(p, ref);
    return cartaoPrev(p, ctx, { acoes: b ? [b] : [] });
  }));
  return el("div", { class: "grade-caixa" },
    el("div", { class: "so-tabela" }, tabela),
    el("div", { class: "so-cartao" }, cartoes));
}

function tabelaFora(itens, ctx) {
  return el("div", { class: "rolagem" }, el("table", { class: "tabela fora" },
    el("thead", {}, el("tr", {},
      ["Frota", "Equipamento", "Local", "Preventivas", "Qtd.", "Por que está fora", "Observação"]
        .map((t, i) => el("th", { class: i === 4 ? "num" : "" }, t)))),
    el("tbody", {}, itens.map(p => el("tr", {
      style: "cursor:pointer", onclick: cliqueLimpo(() => abrirFichaPrev(p.id, ctx)) },
      el("td", {}, el("b", {}, p.frota)),
      el("td", {}, p.equipamento || "—"),
      el("td", {}, p.local || "—"),
      el("td", {}, p.plano || "—"),
      el("td", { class: "num" }, String(p.qtd || 1)),
      el("td", {}, p.por_que_fora || "—"),
      el("td", { class: "seg" }, p.obs || ""))))));
}

// ── a tela ──────────────────────────────────────────────────────────────────

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const NOME_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
  "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** "Out-26" → 202610, para ordenar os meses. */
export const ordemMes = m => {
  const [nome, aa] = String(m || "").split("-");
  const i = MESES.indexOf(String(nome || "").toLowerCase().slice(0, 3));
  return i < 0 ? 0 : (2000 + Number(aa || 0)) * 100 + i + 1;
};
export const rotuloMes = m => {
  const [nome, aa] = String(m || "").split("-");
  const i = MESES.indexOf(String(nome || "").toLowerCase().slice(0, 3));
  return i < 0 ? (m || "sem mês") : `${NOME_MES[i]}/20${aa}`;
};

// As situações na ordem em que pedem ação.
const ORDEM_SIT = ["Parada passou, sem baixa", "Conflito: Operação depois do prazo",
  "Programada depois do prazo", "Disponível: marcar a parada", "Com data: marcar a parada",
  "Sem data da Operação", "Em andamento", "Programada", "Realizada",
  "Passa para o mês seguinte", "Cancelada"];

const estado = { mes: "", busca: "", situacoes: new Set(), foraAberto: false,
  vista: "plano", tipoMud: "" };

export async function montar(raiz, ctx, params = new URLSearchParams()) {
  if (["plano", "painel", "mudancas"].includes(params.get("v"))) estado.vista = params.get("v");
  const fBusca = el("input", { class: "busca", type: "search", value: estado.busca,
    placeholder: "frota, equipamento, local, OS…",
    oninput: () => { estado.busca = fBusca.value; pintar(); } });
  const fMes = el("select", { onchange: () => { estado.mes = fMes.value; estado.situacoes.clear(); pintar(); } });
  const titulo = el("span", { class: "sub" });
  const corpo = el("div", {});

  // Três jeitos de olhar o mesmo mês: a lista de trabalho, o painel com os
  // números e as decisões, e o registro do que mudou.
  const vistas = el("div", { class: "segmentos" }, [["plano", "Plano"], ["painel", "Painel"], ["mudancas", "Mudanças"]]
    .map(([v, t]) => el("button", { class: "seg-op", dataset: { v },
      onclick: () => { estado.vista = v; pintar(); } }, t)));
  raiz.append(
    el("div", { class: "cabec" }, el("h1", {}, "Preventivas"), titulo, vistas,
      el("div", { class: "espaco" }),
      pessoas.pode("parada") ? el("button", { class: "primario",
        onclick: async () => {
          const id = await incluirPreventiva(estado.mes);
          if (id) { const p = ev.porId(id, "preventiva"); if (p && p.mes) estado.mes = p.mes; estado.vista = "plano"; pintar(); }
        } }, "+ Incluir frota") : null),
    el("div", { class: "filtros" }, fBusca, fMes),
    corpo);

  const kpi = (rot, val, det, cls = "") =>
    el("div", { class: "kpi " + cls },
      el("div", { class: "k-rot" }, rot),
      el("div", { class: "k-val" }, String(val)),
      det ? el("div", { class: "k-det" }, det) : null);

  function pintar() {
    limpar(corpo);
    const ref = M.hoje();
    const todas = ev.lista("preventiva");
    if (!todas.length) {
      corpo.append(vazio("Nenhuma preventiva. Importe a planilha na aba Importar — a aba Preventivas vem junto."));
      fMes.hidden = true;
      return;
    }

    // O mês: o mais recente, a não ser que ele tenha escolhido outro.
    const meses = [...new Set(todas.map(p => p.mes || ""))].sort((a, b) => ordemMes(b) - ordemMes(a));
    if (!meses.includes(estado.mes)) estado.mes = meses[0];
    limpar(fMes);
    for (const m of meses) fMes.append(el("option", { value: m, selected: m === estado.mes }, rotuloMes(m)));
    fMes.hidden = meses.length < 2;
    titulo.textContent = rotuloMes(estado.mes);

    const doMes = todas.filter(p => (p.mes || "") === estado.mes);
    for (const b of vistas.querySelectorAll("[data-v]")) b.classList.toggle("on", b.dataset.v === estado.vista);
    if (estado.vista === "painel") return pintarPainel(doMes, ref);
    if (estado.vista === "mudancas") return pintarMudancas(doMes);
    const plano = doMes.filter(p => !p.fora);
    const fora = doMes.filter(p => p.fora).sort((a, b) => natural(a.frota, b.frota));
    const r = M.resumoPreventivas(doMes, ref);

    // ── os números do alto da aba
    corpo.append(el("div", { class: "kpis" },
      kpi("Preventivas", r.preventivas, `a fazer no mês · ${r.frotas} frotas`),
      kpi("Com liberação", r.com_data, "disponível agora ou com data"),
      kpi("Sem liberação", r.sem_data, "aguardando a operação", r.sem_data ? "hoje" : ""),
      kpi("Parada programada", r.parada_marcada, "data definida pelo PCM", r.parada_marcada ? "andando" : ""),
      kpi("Conflitos de data", r.conflitos, "liberação após o prazo", r.conflitos ? "vencida" : ""),
      kpi("Vencidas", r.vencidas, "pelo plano ou pelo prazo", r.vencidas ? "vencida" : ""),
      kpi("Realizadas", r.realizadas, `${Math.round(r.pct_realizadas * 100)}% do mês`, r.realizadas ? "ok" : ""),
      kpi("HH previsto", String(r.hh).replace(".", ","), "tempos padrão por tipo")));

    // ── o que dá para ligar à Programação (o que existia antes da ligação)
    if (pessoas.pode("parada")) {
      const lig = conciliacao(doMes).filter(it => it.passos.length);
      if (lig.length) corpo.append(el("div", { class: "faixa-ligar" },
        el("span", {}, el("b", {}, `${lig.length} preventiva${lig.length === 1 ? "" : "s"}`),
          " deste mês ainda não conversa" + (lig.length === 1 ? "" : "m") + " com a Programação " +
          "(OS anotada nos dois lados, ou parada marcada sem a OS no dia)."),
        el("button", { class: "primario-leve", onclick: () => ligarAProgramacao(doMes) }, "Ver e ligar")));
    }

    // ── a faixa de situações: conta e filtra
    const conta = new Map();
    for (const p of plano) {
      const s = M.situacaoPreventiva(p, ref);
      conta.set(s, (conta.get(s) || 0) + 1);
    }
    corpo.append(el("div", { class: "faixa-sit" },
      el("button", { class: "fsit todas" + (estado.situacoes.size ? "" : " on"),
        onclick: () => { estado.situacoes.clear(); pintar(); } },
        el("b", {}, String(plano.length)), " Todas"),
      ORDEM_SIT.filter(s => conta.get(s)).map(s => el("button", {
        class: `fsit ${M.corDe(s)}${estado.situacoes.has(s) ? " on" : ""}`,
        onclick: () => {
          estado.situacoes.has(s) ? estado.situacoes.delete(s) : estado.situacoes.add(s);
          pintar();
        },
      }, el("b", {}, String(conta.get(s))), " ", M.rotulo(s)))));

    const q = semAcento(estado.busca.trim());
    const passa = p => {
      if (estado.situacoes.size && !estado.situacoes.has(M.situacaoPreventiva(p, ref))) return false;
      if (q && !semAcento([p.frota, p.equipamento, p.local, p.plano, p.os, p.obs].join(" ")).includes(q)) return false;
      return true;
    };
    const ordem = (a, b) =>
      ORDEM_SIT.indexOf(M.situacaoPreventiva(a, ref)) - ORDEM_SIT.indexOf(M.situacaoPreventiva(b, ref)) ||
      String(M.venceEfetivo(a) || "9").localeCompare(String(M.venceEfetivo(b) || "9")) ||
      natural(a.frota, b.frota);
    const visiveis = plano.filter(passa).sort(ordem);

    const comPCM = visiveis.filter(p => M.esperandoQuem(p, ref) === "PCM");
    const comOp = visiveis.filter(p => M.esperandoQuem(p, ref) === "Operação");
    const andando = visiveis.filter(p => M.preventivaAberta(p) && !M.esperandoQuem(p, ref));
    const fechadas = visiveis.filter(p => !M.preventivaAberta(p));

    const qtd = l => l.reduce((s, p) => s + (Number(p.qtd) || 1), 0);
    const secao = (tit, explica, itens, cls = "") => {
      if (!itens.length) return null;
      return el("section", { class: "sec-prev " + cls },
        el("div", { class: "titulo-secao" }, tit,
          el("span", { class: "n" }, `· ${itens.length} frota${itens.length === 1 ? "" : "s"}, ` +
            `${qtd(itens)} preventiva${qtd(itens) === 1 ? "" : "s"}`)),
        explica ? el("p", { class: "nota" }, explica) : null,
        tabelaPrev(itens, ctx, ref));
    };

    if (!visiveis.length) corpo.append(vazio("Nada com estes filtros."));
    // Seção sem item volta null — e `append(null)` escreve "null" na tela.
    corpo.append(...[
      secao("Aguardando o PCM — programar a parada",
        "A operação já informou a liberação da frota (ou a parada passou e falta a baixa). " +
        "Falta o PCM definir a data da parada.", comPCM, "pcm"),
      secao("Aguardando a operação — informar a liberação da frota",
        "Sem essa informação, a manutenção não consegue programar a parada.", comOp, "op"),
      secao("Em execução — parada programada ou em andamento", "", andando),
      secao("Encerradas no mês — realizadas, adiadas e canceladas",
        "Adiada corresponde ao Status Reprogramada da planilha e não entra na contagem acima.", fechadas),
    ].filter(Boolean));

    if (fora.length && !estado.situacoes.size) {
      const det = el("details", { class: "outros", open: estado.foraAberto },
        el("summary", {}, `Fora do plano de ${rotuloMes(estado.mes).split("/")[0]} · ` +
          `${fora.length} frota${fora.length === 1 ? "" : "s"} · não entram na contagem acima`),
        tabelaFora(fora.filter(p => !q ||
          semAcento([p.frota, p.equipamento, p.local, p.plano, p.obs, p.por_que_fora].join(" ")).includes(q)), ctx));
      det.addEventListener("toggle", () => { estado.foraAberto = det.open; });
      corpo.append(det);
    }
  }

  // ── o painel ─────────────────────────────────────────────────────────────
  function pintarPainel(doMes, ref) {
    const plano = doMes.filter(p => !p.fora && !p.excluida);
    const r = M.resumoPreventivas(doMes, ref);
    const valem = plano.filter(p => !p.adiada && !p.cancelada);
    const feitas = valem.filter(M.preventivaFeita);
    const comData = feitas.filter(p => p.realizada_em && M.venceEfetivo(p));
    const noPrazo = comData.filter(p => p.realizada_em <= M.venceEfetivo(p));
    const esperaOp = plano.filter(p => M.esperandoQuem(p, ref) === "Operação");
    const esperaPCM = plano.filter(p => M.esperandoQuem(p, ref) === "PCM");
    const reprog = plano.reduce((n, p) => n + (p.reprog_parada || 0), 0);
    const adiadas = plano.filter(p => p.adiada).length;
    const hhFeito = Math.round(feitas.reduce((t, p) => t + (Number(p.hh) || 0), 0) * 10) / 10;
    const pc = v => v == null ? "—" : Math.round(v * 100) + "%";
    const irPara = (...sits) => () => { estado.vista = "plano"; estado.situacoes = new Set(sits); pintar(); };

    const kpiClic = (rot, val, det, cls, fazer) => {
      const k = kpi(rot, val, det, cls);
      if (fazer) { k.classList.add("clicavel"); k.title = "Ver na lista"; k.addEventListener("click", fazer); }
      return k;
    };
    corpo.append(el("div", { class: "kpis" },
      kpiClic("Plano do mês", r.preventivas, (() => {
        const n = plano.filter(p => p.fonte === "").length;
        return `${r.frotas} frotas` + (n ? ` · ${n} incluída${n === 1 ? "" : "s"} no site` : "");
      })(), ""),
      kpiClic("Realizadas", pc(r.pct_realizadas), `${r.realizadas} de ${r.preventivas}`, r.realizadas ? "ok" : "", irPara("Realizada")),
      kpiClic("No prazo", pc(comData.length ? noPrazo.length / comData.length : null),
        comData.length ? `${noPrazo.length} de ${comData.length} realizadas até o vencimento` : "nenhuma realizada com data", ""),
      kpiClic("Vencidas", r.vencidas, "abertas com o vencimento passado", r.vencidas ? "vencida" : ""),
      kpiClic("Aguardando a operação", esperaOp.length, "sem a liberação da frota", esperaOp.length ? "hoje" : "", irPara("Sem data da Operação")),
      kpiClic("Aguardando o PCM", esperaPCM.length, "liberadas, sem parada", esperaPCM.length ? "andando" : "",
        irPara("Parada passou, sem baixa", "Conflito: Operação depois do prazo", "Disponível: marcar a parada", "Com data: marcar a parada")),
      kpiClic("Reprogra\u00admações", reprog + adiadas, `${reprog} de parada · ${adiadas} adiada${adiadas === 1 ? "" : "s"}`, reprog + adiadas ? "hoje" : "",
        () => { estado.vista = "mudancas"; estado.tipoMud = "reprogramacao"; pintar(); }),
      kpiClic("HH", String(r.hh).replace(".", ","), `previstos · ${String(hhFeito).replace(".", ",")} realizados`, "")));

    // O ritmo: quanto saiu contra quanto do mês já passou — só no mês corrente.
    const mesISO = mesDoPlano(estado.mes);
    if (mesISO === ref.slice(0, 7)) {
      const [a, m] = mesISO.split("-").map(Number);
      const diasMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
      const passou = Number(ref.slice(8, 10)) / diasMes;
      corpo.append(el("div", { class: "ritmo" },
        el("div", { class: "ritmo-tit" }, "Ritmo do mês"),
        medidor(Math.round(r.pct_realizadas * 100), `realizadas · ${r.realizadas} de ${r.preventivas}`),
        // o mês que passou é tempo, não nota: barra neutra
        Object.assign(medidor(Math.round(passou * 100), `do mês passado · faltam ${diasMes - Number(ref.slice(8, 10))} dias`),
          { className: "medidor neutro" })));
    }

    // ── o que decidir
    const ds = decisoesPreventivas(doMes, ev.lista(), ref);
    corpo.append(el("div", { class: "titulo-secao" }, "O que decidir agora",
      el("span", { class: "n" }, `· ${ds.length} ${ds.length === 1 ? "item" : "itens"}, do mais urgente para a oportunidade`)),
      listaDecisoes(ds, ctx));

    // ── os gráficos
    const grade = el("div", { class: "bi-grade" });
    corpo.append(el("div", { class: "titulo-secao" }, "Os números do mês"), grade);
    const pendurar = (card, desenhar, larga = false) => {
      if (larga) card.classList.add("larga");
      grade.append(card);
      card.querySelector(".g-corpo").append(desenhar(Math.max(280, (card.clientWidth || 600) - 28)));
    };

    // 1. onde está cada preventiva
    // conta pela quantidade de cada linha, como o "Plano do mês" lá em cima
    const qtdDe = p => Number(p.qtd) || 1;
    // e sem as adiadas e canceladas, que saem da contagem do mês — o centro da
    // rosca é o mesmo número do "Plano do mês"
    const conta = new Map();
    for (const p of plano) {
      if (p.adiada || p.cancelada) continue;
      const x = M.situacaoPreventiva(p, ref); conta.set(x, (conta.get(x) || 0) + qtdDe(p));
    }
    const foraDoMes = plano.filter(p => p.adiada || p.cancelada).length;
    const itensSit = ORDEM_SIT.filter(x => conta.get(x)).map(x => ({ rotulo: M.rotulo(x), chave: x,
      valor: conta.get(x), cor: `var(--${M.corDe(x)})` }));
    // Rosca: como o plano do mês se divide. Mais de seis situações, as menores
    // viram "Outras" — a lista completa está a um clique, na vista Plano.
    pendurar(cartaoGrafico("Onde está cada preventiva", "como o plano do mês se divide" +
      (foraDoMes ? ` · ${foraDoMes} adiada${foraDoMes === 1 ? "" : "s"} ou cancelada${foraDoMes === 1 ? "" : "s"} fora` : "") +
      " · clique para ver a lista",
      el("div", { class: "g-corpo" })),
    w => itensSit.length ? graficoRosca({ largura: w, itens: itensSit, aoClicar: it => irPara(it.chave)(),
      centro: { valor: [...conta.values()].reduce((t, n) => t + n, 0), rotulo: "no plano" } })
      : el("p", { class: "nada" }, "Nada no plano."));

    // 2. os vencimentos de cada semana, e se estão cobertos
    const semanaDe = iso => { const w = M.semanaISO(iso); return w.ano * 100 + w.semana; };
    const inicioMes = mesISO ? mesISO + "-01" : ref;
    const comVenc = valem.filter(p => M.venceEfetivo(p));
    const chaves = [...new Set(comVenc.map(p => M.venceEfetivo(p) < inicioMes ? 0 : semanaDe(M.venceEfetivo(p))))].sort((x, y) => x - y);
    const xs = chaves.map(k => k === 0 ? "Antes" : "S" + (k % 100));
    const serieDe = f => chaves.map(k => comVenc.filter(p => (M.venceEfetivo(p) < inicioMes ? 0 : semanaDe(M.venceEfetivo(p))) === k && f(p)).length);
    const series = [
      { nome: "Realizada", cor: "var(--s3)", valores: serieDe(M.preventivaFeita) },
      { nome: "Com parada programada", cor: "var(--s1)", valores: serieDe(p => !M.preventivaFeita(p) && (p.dia_parada || p.em_andamento)) },
      { nome: "Sem parada", cor: "var(--ctx)", valores: serieDe(p => !M.preventivaFeita(p) && !p.dia_parada && !p.em_andamento) },
    ];
    pendurar(cartaoGrafico("Vencimentos por semana", "quantas vencem em cada semana, e se já estão cobertas · \"Antes\" = vencidas antes do mês",
      el("div", { class: "g-corpo" }), { forma: "caixa", legendaDe: series.map(x => ({ nome: x.nome, cor: x.cor })) }),
    w => xs.length ? graficoColunas({ largura: w, xs, series }) : el("p", { class: "nada" }, "Sem vencimentos no plano."));

    // 3. as paradas dos próximos dez dias úteis
    const dias = [];
    for (let d = ref; dias.length < 10; d = M.somaDias(d, 1)) { const w = M.data(d).getUTCDay(); if (w >= 1 && w <= 5) dias.push(d); }
    const paradas = dias.map(d => plano.filter(p => p.dia_parada === d && M.preventivaAberta(p)).length);
    pendurar(cartaoGrafico("Paradas nos próximos dez dias úteis", "quantas frotas param em cada dia — dia com três ou mais pede conferir a oficina",
      el("div", { class: "g-corpo" })),
    w => paradas.some(Boolean) ? graficoColunas({ largura: w, xs: dias.map(d => brCurto(d)),
      series: [{ nome: "Paradas", cor: "var(--s1)", valores: paradas }] })
      : el("p", { class: "nada" }, "Nenhuma parada programada nos próximos dez dias úteis."));

    // 4. por que foi reprogramada, adiada ou cancelada
    const motivos = new Map();
    const TIPOS_M = { parada: ["Parada reprogramada", "var(--s2)"], adiada: ["Adiada", "var(--s4)"],
      cancelada: ["Cancelada", "var(--ctx)"], liberacao: ["Liberação alterada", "var(--s5)"] };
    const ids = new Set(plano.map(p => p.id));
    for (const e of ev.log) {
      if (e.alvo_tipo !== "preventiva" || !ids.has(e.alvo)) continue;
      const d = e.dados || {};
      const t = e.tipo === "prev_parada" && d.de && d.de !== d.dia ? "parada"
        : e.tipo === "prev_adiada" ? "adiada" : e.tipo === "prev_cancelada" ? "cancelada"
        : e.tipo === "prev_disponivel" && d.de && d.de !== d.quando ? "liberacao" : "";
      if (!t) continue;
      const k = String(e.motivo || "sem motivo informado").trim();
      const chave = k.toLowerCase();
      if (!motivos.has(chave)) motivos.set(chave, { rotulo: k, n: {} });
      motivos.get(chave).n[t] = (motivos.get(chave).n[t] || 0) + 1;
    }
    const itensMot = [...motivos.values()].map(x => ({ rotulo: x.rotulo,
      partes: Object.entries(TIPOS_M).map(([t, [nome, cor]]) => ({ nome, cor, valor: x.n[t] || 0 })) }))
      .sort((a, b) => b.partes.reduce((t, x) => t + x.valor, 0) - a.partes.reduce((t, x) => t + x.valor, 0)).slice(0, 10);
    pendurar(cartaoGrafico("Por que mudou", "motivos das reprogramações, adiamentos e cancelamentos do mês",
      el("div", { class: "g-corpo" }), { forma: "caixa",
        legendaDe: Object.values(TIPOS_M).map(([nome, cor]) => ({ nome, cor })) }),
    w => itensMot.length ? graficoBarras({ largura: w, itens: itensMot })
      : el("p", { class: "nada" }, "Nenhuma reprogramação, adiamento ou cancelamento neste mês."));

    // 5. onde se faz
    const ondes = [["Interna", "var(--s1)"], ["Terceiro", "var(--s2)"], ["", "var(--ctx)"]];
    const itensOnde = ondes.map(([o, cor]) => {
      const daqui = valem.filter(p => (p.onde_fazer || "") === o);
      const soma = l => l.reduce((t, p) => t + qtdDe(p), 0);
      const feitas = soma(daqui.filter(M.preventivaFeita));
      return { rotulo: o || "A definir", cor, valor: soma(daqui),
        extra: [{ valor: String(feitas), rotulo: "realizadas" }, { valor: String(soma(daqui) - feitas), rotulo: "em aberto" }] };
    }).filter(x => x.valor);
    pendurar(cartaoGrafico("Onde se faz", "oficina interna, terceiro ou ainda a definir · a dica mostra quantas já saíram",
      el("div", { class: "g-corpo" })),
    w => itensOnde.length ? graficoRosca({ largura: w, itens: itensOnde,
      centro: { valor: itensOnde.reduce((t, it) => t + it.valor, 0), rotulo: "a fazer" } })
      : el("p", { class: "nada" }, "—"));

    // 6. mês a mês, quando já há mais de um
    const meses = [...new Set(ev.lista("preventiva").map(p => p.mes).filter(Boolean))].sort((a, b) => ordemMes(a) - ordemMes(b));
    if (meses.length > 1) {
      const valores = meses.map(mm => M.resumoPreventivas(ev.lista("preventiva").filter(p => p.mes === mm), ref).pct_realizadas);
      pendurar(cartaoGrafico("Realizadas mês a mês", "parte do plano de cada mês que foi realizada", el("div", { class: "g-corpo" })),
      w => graficoLinhas({ largura: w, xs: meses.map(rotuloMes), series: [{ nome: "Realizadas", cor: "var(--s1)", valores }],
        marcado: meses.indexOf(estado.mes) }), true);
    }
  }

  // ── as mudanças do mês ───────────────────────────────────────────────────
  function pintarMudancas(doMes) {
    const todas = [];
    for (const p of doMes) {
      for (const m of ev.mudancasDe(p.id, "preventiva")) {
        const d = descreverMudancaPrev(m);
        if (d) todas.push(d);
      }
    }
    todas.sort((a, b) => b.e.ts.localeCompare(a.e.ts) || String(b.e.id).localeCompare(String(a.e.id)));
    const conta = t => todas.filter(x => x.tipo === t).length;
    const reprogParada = todas.filter(x => x.tipo === "reprogramacao" && x.e.tipo === "prev_parada").length;
    corpo.append(el("p", { class: "nota", style: "margin-top:0" },
      `Neste mês: ${reprogParada} reprogramaç${reprogParada === 1 ? "ão" : "ões"} de parada · ` +
      // as adiadas contam pelo estado, como no painel: a planilha também adia
      // (o Status "Reprogramada"), sem lançamento de adiar no site
      `${doMes.filter(p => p.adiada && !p.excluida && !p.fora).length} adiada(s) · ` +
      `${todas.filter(x => x.tipo === "reprogramacao" && x.e.tipo === "prev_disponivel").length} liberação(ões) alterada(s) · ` +
      `${todas.filter(x => x.e.tipo === "criada").length} frota(s) incluída(s) no site.`));
    const tipos = [["", "Todas"], ["reprogramacao", "Reprogramações"], ["parada", "Paradas"], ["liberacao", "Liberações"],
      ["realizacao", "Realizações"], ["inclusao", "Inclusões"], ["edicao", "Edições"], ["cancelamento", "Cancelamentos"]];
    corpo.append(el("div", { class: "faixa-sit" }, tipos.filter(([t]) => !t || conta(t)).map(([t, rot]) =>
      el("button", { class: "fsit" + (estado.tipoMud === t ? " on" : ""),
        onclick: () => { estado.tipoMud = t; pintar(); } },
        el("b", {}, String(t ? conta(t) : todas.length)), " ", rot))));
    const q = semAcento(estado.busca.trim());
    const visiveis = todas.filter(x => (!estado.tipoMud || x.tipo === estado.tipoMud) &&
      (!q || semAcento([x.depois && x.depois.frota, x.e.autor, x.texto, x.e.motivo, x.detalhes.join(" ")].join(" ")).includes(q)));
    if (!visiveis.length) { corpo.append(vazio("Nenhuma mudança com estes filtros.")); return; }
    corpo.append(el("div", { class: "lista-mudancas" }, visiveis.slice(0, 300).map(m => {
      const n = linhaMudanca(m, true);
      n.style.cursor = "pointer";
      n.addEventListener("click", cliqueLimpo(() => abrirFichaPrev(m.e.alvo, ctx)));
      return n;
    })));
    if (visiveis.length > 300) corpo.append(el("p", { class: "nota" }, `Mostrando as 300 mais recentes de ${visiveis.length}.`));
  }

  pintar();
  return { desmontar: ev.ouvir(pintar) };
}
