// Colar inspeção ou TOP: a mensagem do WhatsApp, o e-mail ou o PDF viram
// pendências na carteira da frota, depois de a pessoa conferir.
//
// O texto é lido por `js/pendencias.js`. Aqui fica a conferência: a frota, de
// onde veio (inspeção, TOP) e o dia, cada pendência com a caixinha, o texto
// para corrigir e a prioridade — e, marcadas e desligadas, as que a frota já
// tem em aberto. A conversa que ficou de fora aparece embaixo, para pôr de
// volta o que for pendência. Só grava quando a pessoa aperta Lançar.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { el, limpar, caixa, campo, selecao, comSugestoes, chip, avisar, erro, br } from "../ui.js";
import { frotas, camposDeProgramacao, eventosDeProgramar } from "./comum.js";
import { lerPendencias, resolverFrota, marcarDuplicadas, obsDaOrigem } from "../pendencias.js";
import { planoVigente } from "../decisoes.js";
import { rotuloMes } from "./preventivas.js";

const FONTES = ["Inspeção", "TOP", "Outro"];

/** O texto de um PDF, linha por linha. A biblioteca só carrega aqui — quem
 *  nunca solta um PDF não baixa nada. PDF escaneado (só imagem) não tem texto. */
export async function textoDoPDF(arquivo) {
  const pdfjs = await import("../../vendor/pdfjs/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("../../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
  const linhas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pagina = await doc.getPage(i);
    const { items } = await pagina.getTextContent();
    let linha = "", y = null, fim = null;
    for (const it of items) {
      if (typeof it.str !== "string") continue;
      const [, , , , x, yy] = it.transform;
      if (y !== null && Math.abs(yy - y) > 2) { if (linha.trim()) linhas.push(linha); linha = ""; fim = null; }
      // pedaços da mesma linha: o espaço entre eles volta quando há distância
      if (linha && fim !== null && x - fim > 1 && !/\s$/.test(linha) && !/^\s/.test(it.str)) linha += " ";
      linha += it.str;
      y = yy; fim = x + (it.width || 0);
      if (it.hasEOL) { if (linha.trim()) linhas.push(linha); linha = ""; y = null; fim = null; }
    }
    if (linha.trim()) linhas.push(linha);
  }
  return linhas.join("\n");
}

/** A caixa. `frota`: a da tela de onde se abriu; `arquivo`: um PDF ou TXT já
 *  escolhido (a área de soltar da tela Importar). Devolve quantas lançou. */
export async function colarPendencias(ctx, { frota = "", texto = "", arquivo = null } = {}) {
  if (!pessoas.pode("programar")) { erro("Lançar pendências na carteira é do PCM."); return 0; }
  const hoje = M.hoje();
  const conhecidas = frotas();
  const comum = { prioridade: "", oficina: "Interna" };
  let blocos = [];

  const eTexto = el("textarea", { class: "colar-texto", rows: 7, value: texto,
    placeholder: "Cole aqui a mensagem da inspeção ou do TOP — por exemplo:\n433\n- Soldar trinca no lastro dianteiro LD;\n- Substituir lonas de freio do segundo eixo LE;",
    oninput: () => { clearTimeout(eTexto._t); eTexto._t = setTimeout(ler, 200); } });
  const eArquivo = el("input", { type: "file", accept: ".pdf,.txt,application/pdf,text/plain", style: "display:none",
    onchange: () => eArquivo.files[0] && abrirArquivo(eArquivo.files[0]) });
  const situacaoArq = el("span", { class: "sub colar-arq" });
  const previa = el("div", { class: "colar-previa" });
  const ePrio = selecao([{ v: "", t: "sem prioridade" }, "P1", "P2", "P3"], "", { "aria-label": "Prioridade de todas",
    onchange: () => { comum.prioridade = ePrio.value; for (const b of blocos) for (const it of b.itens) it.prioridade = ePrio.value; pintar(); } });
  const eOficina = selecao(["Interna", "Terceirizada"], "Interna", { "aria-label": "Oficina de todas",
    onchange: () => { comum.oficina = eOficina.value; } });

  // Onde entram: na carteira (o de sempre) ou já programadas — no dia, na
  // semana ou no dia da parada da preventiva.
  let destino = "carteira";
  let campos = null;
  const quando = el("div", { class: "colar-quando", hidden: true });
  const segDestino = el("div", { class: "segmentos", role: "group", "aria-label": "Onde entram" },
    [["carteira", "Na carteira"], ["programar", "Programar"]].map(([v, t]) => el("button", {
      type: "button", class: "seg-op" + (v === destino ? " on" : ""), dataset: { destino: v },
      onclick: () => {
        destino = v;
        for (const b of segDestino.children) b.classList.toggle("on", b.dataset.destino === v);
        if (v === "programar") {
          campos = camposDeProgramacao({ frotas: [...new Set(blocos.map(b => b.frota).filter(Boolean))] });
          limpar(quando).append(campos.elemento);
        }
        quando.hidden = v !== "programar";
        pintarBotao();
      } }, t)));

  const corpo = el("div", { class: "colar" },
    el("p", { class: "nota" }, "Cole a mensagem (WhatsApp, e-mail) ou escolha o PDF. O site separa as pendências da conversa; " +
      "confira, corrija o que precisar e lance. As que a frota já tem em aberto vêm desmarcadas."),
    eTexto,
    el("div", { class: "colar-linha" },
      el("button", { type: "button", onclick: () => eArquivo.click() }, "Escolher PDF ou TXT"), eArquivo, situacaoArq,
      el("div", { class: "espaco" }),
      el("label", { class: "agrupar" }, "Prioridade de todas ", ePrio),
      el("label", { class: "agrupar" }, "Oficina ", eOficina)),
    el("div", { class: "colar-linha" }, el("span", { class: "agrupar" }, "Onde entram"), segDestino),
    quando,
    previa);

  // Enter num campo da prévia confirma o campo, não lança tudo (o Enter da
  // caixa aperta o botão azul).
  previa.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if (e.target.blur) e.target.blur(); }
  });

  // arrastar o PDF para cima da caixa também vale
  corpo.addEventListener("dragover", e => { e.preventDefault(); corpo.classList.add("sobre"); });
  corpo.addEventListener("dragleave", () => corpo.classList.remove("sobre"));
  corpo.addEventListener("drop", e => {
    e.preventDefault(); corpo.classList.remove("sobre");
    const f = e.dataTransfer.files[0];
    if (f) abrirArquivo(f);
  });

  async function abrirArquivo(f) {
    situacaoArq.textContent = `lendo ${f.name}…`;
    try {
      const t = /\.pdf$/i.test(f.name) || f.type === "application/pdf" ? await textoDoPDF(f) : await f.text();
      if (!t.trim()) {
        situacaoArq.textContent = "";
        erro("Este PDF é imagem (escaneado) e não tem texto para ler. Copie o texto, ou mande o PDF para o Claude.");
        return;
      }
      eTexto.value = t;
      situacaoArq.textContent = f.name;
      ler();
    } catch (x) {
      situacaoArq.textContent = "";
      erro("Não consegui ler o arquivo: " + x.message);
    }
  }

  function ler() {
    const lidos = lerPendencias(eTexto.value, { frotas: conhecidas, frotaPadrao: frota, ref: hoje });
    blocos = lidos.map(b => ({ ...b, fonte: b.fonte || "Inspeção", dia: b.dia || hoje,
      itens: b.itens.map(it => ({ ...it, prioridade: it.alerta ? "P1" : comum.prioridade })) }));
    duplicadas();
    pintar();
  }

  function duplicadas() {
    const abertas = ev.lista().filter(M.aberta);
    for (const b of blocos) {
      const marcadas = marcarDuplicadas(b.frota, b.itens, abertas);
      b.itens = marcadas.map((it, i) => ({ ...it,
        marcado: b.itens[i].marcado != null && !b._frotaMudou ? b.itens[i].marcado : !(it.duplicada || it.parecida || it.repetida) }));
      b._frotaMudou = false;
    }
  }

  const quantas = () => blocos.reduce((s, b) => s + b.itens.filter(i => i.marcado && i.texto.trim()).length, 0);

  function pintarBotao() {
    const n = quantas();
    const bt = corpo.closest(".caixa") && corpo.closest(".caixa").querySelector("footer button.primario");
    const onde = destino === "programar" ? "e programar" : "na carteira";
    if (bt) { bt.textContent = n ? `Lançar ${n} ${onde}` : `Lançar ${onde}`; bt.disabled = !n; }
  }

  function pintar() {
    limpar(previa);
    if (!eTexto.value.trim()) { pintarBotao(); return; }
    if (!blocos.length) {
      previa.append(el("p", { class: "nada" }, "Não achei pendência nesse texto. Cada pendência numa linha, de preferência com \"-\" na frente."));
      pintarBotao();
      return;
    }
    const prevs = planoVigente(ev.lista("preventiva").filter(p => !p.excluida), hoje);
    for (const b of blocos) previa.append(pintarBloco(b, prevs));
    pintarBotao();
  }

  function pintarBloco(b, prevs) {
    const eFrota = el("input", { value: b.frota, placeholder: "F-000", class: "colar-frota",
      onchange: () => {
        const v = eFrota.value.trim();
        const num = v.replace(/^f\s*-?\s*/i, "");
        const r = resolverFrota(num, conhecidas);
        b.frota = conhecidas.includes(v) ? v : r.frota || v;
        b.nova = !conhecidas.includes(b.frota);
        b._frotaMudou = true;
        duplicadas(); pintar();
      } });
    const eFonte = selecao(FONTES, b.fonte, { onchange: () => { b.fonte = eFonte.value; } });
    const eDia = el("input", { type: "date", value: b.dia, onchange: () => { b.dia = eDia.value || hoje; } });

    // a preventiva do mês desta frota: a parada é a hora de fazer as pendências
    const p = b.frota ? prevs.prevs.find(x => x.frota === b.frota && !x.fora) : null;
    let avisoPrev = null;
    if (p) {
      const sit = M.situacaoPreventiva(p, hoje);
      avisoPrev = el("p", { class: "colar-prev" }, chip("Preventiva", "prev"), " ",
        `${b.frota} tem preventiva no plano de ${rotuloMes(prevs.mes).split("/")[0]}: ${M.rotulo(sit)}` +
        (p.dia_parada && M.preventivaAberta(p) ? `, parada em ${br(p.dia_parada)} — dá para programar junto.`
          : M.preventivaAberta(p) ? ", ainda sem dia de parada." : "."));
    } else if (b.temPreventiva && b.frota) {
      avisoPrev = el("p", { class: "colar-prev" }, `A mensagem fala em preventiva, mas ${b.frota} não está no plano de ` +
        `${prevs.mes ? rotuloMes(prevs.mes).split("/")[0] : "este mês"}.`);
    }

    const linhas = b.itens.map((it, i) => {
      const cx = el("input", { type: "checkbox", checked: it.marcado, "aria-label": "Lançar esta",
        onchange: () => { it.marcado = cx.checked; pintarBotao(); } });
      const tx = el("input", { value: it.texto, class: "colar-item", "aria-label": "Pendência",
        oninput: () => { it.texto = tx.value; pintarBotao(); } });
      const pr = selecao([{ v: "", t: "—" }, "P1", "P2", "P3"], it.prioridade, { "aria-label": "Prioridade",
        onchange: () => { it.prioridade = pr.value; } });
      const tags = [];
      if (it.duplicada) {
        const d = it.duplicada;
        tags.push(el("span", { class: "chip hoje", title: `"${d.atividade}" — ${M.rotulo(M.situacaoDe(d))}` },
          d.semana ? `já programada · sem ${d.semana}${d.dia ? " " + d.dia : ""}` : "já está na carteira"));
      }
      if (it.parecida && !it.duplicada) {
        const d = it.parecida;
        tags.push(el("span", { class: "chip hoje", title: `Parece a mesma que "${d.atividade}" — ${M.rotulo(M.situacaoDe(d))}` },
          `parecida com uma ${d.semana ? `da sem ${d.semana}` : "da carteira"}: “${d.atividade.length > 38 ? d.atividade.slice(0, 36) + "…" : d.atividade}”`));
      }
      if (it.repetida) tags.push(chip("repetida na mensagem", "hoje"));
      if (it.dividida) tags.push(el("span", { class: "chip", title: "Vinha grudada com outra na mesma linha; o site separou" }, "separada da linha"));
      if (it.alerta) tags.push(chip("⚠ urgente: P1", "vencida"));
      if (it.top) tags.push(chip("TOP"));
      if (it.os) tags.push(chip("OS " + it.os, "os"));
      return el("tr", { class: it.marcado ? "" : "fora", dataset: { i } },
        el("td", { class: "c-sel" }, cx), el("td", {}, tx), el("td", {}, pr), el("td", { class: "colar-tags" }, tags));
    });

    const fora = b.ignoradas.length ? el("details", { class: "colar-fora" },
      el("summary", {}, b.ignoradas.length === 1 ? "1 linha ficou de fora (conversa, títulos)"
        : `${b.ignoradas.length} linhas ficaram de fora (conversa, títulos)`),
      el("ul", {}, b.ignoradas.map((l, k) => el("li", {}, el("span", {}, l), " ",
        el("button", { type: "button", class: "mini", onclick: () => {
          b.ignoradas.splice(k, 1);
          b.itens.push({ texto: l.replace(/^[*\s]+|[*\s;.\-]+$/g, ""), alerta: false, top: false, os: "", dividida: false,
            prioridade: comum.prioridade, marcado: true });
          duplicadas(); pintar();
        } }, "+ é pendência"))))) : null;

    return el("section", { class: "colar-bloco", dataset: { frota: b.frota } },
      el("div", { class: "colar-cab" },
        campo("Frota", comSugestoes(eFrota, conhecidas, "dl-colar-" + Math.random().toString(36).slice(2, 7))),
        campo("De onde veio", eFonte),
        campo("Dia", eDia),
        el("div", { class: "colar-conta" },
          b.nova && b.frota ? chip("frota nova no site", "hoje") : null,
          el("b", {}, String(b.itens.length)), ` pendência${b.itens.length === 1 ? "" : "s"}`)),
      avisoPrev,
      b.situacao ? el("p", { class: "colar-prev" }, chip(b.situacao, /restri/i.test(b.situacao) ? "hoje" : "")) : null,
      b.motivos.length ? el("p", { class: "colar-prev colar-motivos" }, chip("não liberado", "vencida"), " por: ",
        el("b", {}, b.motivos.join(" · ")), " — são das pendências abaixo; vale pôr P1.") : null,
      b.notas.length ? el("p", { class: "colar-prev" }, "Observação: ", b.notas.join(" · ")) : null,
      b.itens.length ? el("div", { class: "tabela-rolagem" }, el("table", { class: "tabela colar-tabela" },
        el("tbody", {}, linhas))) : el("p", { class: "nada" }, "Nenhuma pendência nesta frota."),
      fora);
  }

  function eventos() {
    const r = [];
    for (const b of blocos) {
      const marcados = b.itens.filter(i => i.marcado && i.texto.trim());
      if (!marcados.length) continue;
      if (!b.frota.trim()) throw new Error("Falta a frota de " + marcados.length + " pendência(s).");
      for (const it of marcados) {
        const fonte = it.top && b.fonte !== "TOP" ? "TOP" : b.fonte;
        r.push(ev.criar({ ...M.molde(), id: undefined, frota: b.frota.trim(), atividade: it.texto.trim(),
          os: it.os || "", tipo: "Corretiva", origem: "Programada", oficina: comum.oficina,
          prioridade: it.prioridade || "", obs: obsDaOrigem(fonte, b.dia) },
        "manual", `${fonte} de ${br(b.dia)}, colada no site`));
      }
    }
    if (!r.length) throw new Error("Nenhuma pendência marcada.");
    // Programar já: cada uma nasce e é programada no mesmo lote (a primeira
    // programação não pede motivo), com a equipe, se veio.
    if (destino === "programar" && campos) {
      const equipe = campos.equipe();
      for (const c of r.slice()) {
        const a = { ...M.molde(), ...c.dados, id: c.alvo };
        r.push(...eventosDeProgramar(a, { ...campos.para(a.frota), hh: a.hh }, equipe));
      }
    }
    return r;
  }

  const espera = caixa({ titulo: "Colar inspeção ou TOP", corpo, largura: "880px",
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Lançar na carteira", classe: "primario", acao: eventos }] });
  if (texto) ler(); else pintar();
  requestAnimationFrame(pintarBotao);
  if (arquivo) abrirArquivo(arquivo);
  setTimeout(() => eTexto.focus(), 50);

  const r = await espera;
  if (!r) return 0;
  await ev.aplicar(r);
  const criadas = r.filter(e => e.tipo === "criada");
  const porFrota = [...new Set(criadas.map(e => e.dados.frota))];
  const n = criadas.length;
  avisar(destino === "programar" && campos
    ? `${n} pendência${n === 1 ? "" : "s"} de ${porFrota.join(", ")} lançada${n === 1 ? "" : "s"} e programada${n === 1 ? "" : "s"} para ${campos.rotulo()}.`
    : `${n} pendência${n === 1 ? "" : "s"} lançada${n === 1 ? "" : "s"} na carteira de ${porFrota.join(", ")}.`);
  return n;
}
