// Atualizar o painel de OS com o Protheus (05/11/2026).
//
// O Mateus solta aqui a STJ e a STL do dia (as partes _1, _2… juntas). O site
// lê os arquivos neste computador, monta o painel com as mesmas regras do
// montar.py (js/os/montar.js), mostra o que mudou desde o painel anterior — o
// que fechou, o que abriu, o que sumiu do export e se alguma OS perdeu o
// executante — e só grava no bucket privado quando ele confere e clica.
//
// Os exports de hoje trazem só 2026; o que veio antes (OS de 2024 e 2025 e a
// mão de obra delas) é a base histórica: um arquivo que vem uma vez só e fica
// guardado no bucket, como historico.json.gz.

import * as nuvem from "../nuvem.js";
import * as M from "./montar.js";
import { carregarXLSX } from "../planilha.js";

const BUCKET = "painel-os";
const DESDE = "2024-01-01";          // as finalizadas entram desde aqui (o painel sempre usou)
const nf = new Intl.NumberFormat("pt-BR");
const br = (iso) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "");
const plural = (n, um, varios) => `${nf.format(n)} ${n === 1 ? um : varios}`;
const pausa = () => new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const maisDias = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "on") for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k === "text") e.textContent = v;
    else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) e.append(f);
  return e;
}

// ── compactar e o bucket ─────────────────────────────────────────────────────

async function gz(obj) {
  const s = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Blob([await new Response(s).arrayBuffer()], { type: "application/gzip" });
}
async function deGz(blob) {
  const s = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(s).text());
}
/** Um JSON compactado do bucket privado; `null` se ainda não existe. */
export async function baixarJSON(caminho) {
  const b = await nuvem.baixarArquivo(BUCKET, caminho);
  return b ? deGz(b) : null;
}
/** O que há na raiz do bucket: nome → { versão (quando mudou e o tamanho) }. */
export async function arquivosDoPainel() {
  const l = await nuvem.listarArquivos(BUCKET, "");
  return new Map((Array.isArray(l) ? l : []).filter((x) => x && x.name && x.id !== null)
    .map((x) => [x.name, { versao: `${x.updated_at || x.created_at || ""}|${(x.metadata && x.metadata.size) || ""}` }]));
}

// ── ler os arquivos ──────────────────────────────────────────────────────────

/** Um arquivo solto: a STJ, a STL (em .xlsx ou .csv) ou a base histórica. */
async function lerArquivo(f) {
  const nome = f.name, baixo = nome.toLowerCase();
  if (baixo.endsWith(".gz") || baixo.endsWith(".json")) {
    let obj;
    try { obj = baixo.endsWith(".gz") ? await deGz(f) : JSON.parse(await f.text()); }
    catch (e) { throw new Error("não é um arquivo que o painel conheça"); }
    const sem = M.lerSemente(obj);
    return { nome, tipo: "HIST", semente: sem, arquivo: f, linhas: sem.stj.linhas.length + sem.stl.linhas.length };
  }
  let t;
  if (baixo.endsWith(".csv")) {
    const bytes = await f.arrayBuffer();
    let texto = new TextDecoder("utf-8").decode(bytes);
    if (texto.includes("�")) texto = new TextDecoder("windows-1252").decode(bytes);
    t = M.tabelaDoCSV(texto, nome);
  } else {
    const XLSX = await carregarXLSX();
    t = M.tabelaDoExcel(XLSX, await f.arrayBuffer(), nome);
  }
  const tipo = M.tipoDaTabela(t);
  if (!tipo) throw new Error("não parece a STJ nem a STL (faltam as colunas Ordem Serv./Bem ou Tipo Insumo)");
  const falta = M.COLUNAS[tipo].filter((c) => !t.cab.includes(c));
  if (falta.length) throw new Error(`faltam as colunas ${falta.join(", ")} — peça o export com elas (todas as filiais)`);
  const n = t.linhas.filter((r) => r && r.some((v) => v !== null && v !== undefined && v !== "")).length;
  return { nome, tipo, tabela: t, linhas: n };
}

// ── a caixa ──────────────────────────────────────────────────────────────────

/** Abre a caixa de atualizar. `atual()`: o painel aberto agora (para comparar);
 *  `aoGravar(pacote)`: depois de gravar; `raiz`: onde está a caixa (a área do painel no site). */
export function abrirImportar({ atual, aoGravar, raiz = document }) {
  const dlg = raiz.querySelector("#os-importar");
  const lidos = [];                 // { nome, tipo, tabela | semente, linhas, arquivo }
  let pacote = null, sementeGuardada = undefined;
  const status = el("div", { class: "imp-status", "aria-live": "polite" });
  const lista = el("ul", { class: "imp-arqs" });
  const resumo = el("div", { class: "imp-resumo" });
  const data = el("input", { type: "date", id: "imp-data", value: hojeLocal() });
  const entrada = el("input", { type: "file", id: "imp-arq", multiple: true, accept: ".xlsx,.xls,.csv,.gz,.json", class: "imp-entrada" });
  const gravar = el("button", { type: "button", class: "botao prim", disabled: true, text: "Gravar no painel" });
  const aviso = el("span", { class: "imp-aviso", "aria-live": "polite" });
  const zona = el("label", { class: "imp-zona", for: "imp-arq" },
    el("b", { text: "Solte aqui os arquivos" }), el("span", {}, "ou ", el("u", { text: "escolha no computador" })),
    el("small", { text: "A STJ e a STL de hoje (.xlsx ou .csv, todas as partes). Na primeira vez, junto, a base histórica (historico-os.json.gz)." }), entrada);

  const pintarLista = () => lista.replaceChildren(...lidos.map((x, i) => el("li", { class: x.erro ? "erro" : "" },
    el("span", { class: "imp-tipo t-" + (x.tipo || "x"), text: x.erro ? "!" : x.tipo === "HIST" ? "Histórico" : x.tipo }),
    el("span", { class: "imp-nome" }, el("b", { text: x.nome }), el("small", { text: x.erro ? x.erro : x.tipo === "HIST" ? `base histórica de ${br(x.semente.feitoEm)} · ${nf.format(x.linhas)} linhas` : plural(x.linhas, "linha", "linhas") + (x.linhas >= 49990 ? " · o Protheus parte o export em 50 mil: confira se veio a parte seguinte" : "") })),
    el("button", { type: "button", class: "imp-tira", "aria-label": "Tirar " + x.nome, text: "×", on: { click: () => { lidos.splice(i, 1); pintarLista(); montarAgora(); } } }))));

  async function adicionar(arquivos) {
    for (const f of arquivos) {
      if (lidos.some((x) => x.nome === f.name && x.tamanho === f.size)) continue;
      status.textContent = `Lendo ${f.name}…` + (f.size > 3e6 ? " (arquivo grande: alguns segundos)" : "");
      await pausa();
      try { lidos.push({ ...(await lerArquivo(f)), tamanho: f.size }); }
      catch (e) { lidos.push({ nome: f.name, tamanho: f.size, erro: e.message }); }
      pintarLista();
    }
    status.textContent = "";
    await montarAgora();
  }

  async function semente() {
    const daqui = lidos.find((x) => x.tipo === "HIST");
    if (daqui) return daqui.semente;
    if (sementeGuardada === undefined) {
      status.textContent = "Buscando a base histórica guardada…";
      try { const obj = (await arquivosDoPainel()).has("historico.json.gz") ? await baixarJSON("historico.json.gz") : null; sementeGuardada = obj ? M.lerSemente(obj) : null; }
      catch (e) { sementeGuardada = null; }
      status.textContent = "";
    }
    return sementeGuardada;
  }

  async function montarAgora() {
    pacote = null; gravar.disabled = true; resumo.replaceChildren(); aviso.textContent = "";
    const stj = lidos.filter((x) => x.tipo === "STJ"), stl = lidos.filter((x) => x.tipo === "STL");
    if (!stj.length || !stl.length) {
      if (lidos.length) resumo.append(el("p", { class: "nota", text: `Falta ${!stj.length && !stl.length ? "a STJ e a STL" : !stj.length ? "a STJ" : "a STL"} de hoje.` }));
      return;
    }
    const sem = await semente();
    if (!sem) {
      resumo.append(el("p", { class: "imp-alerta", text: "Falta a base histórica: o arquivo historico-os.json.gz (o que veio antes de 2026). É só uma vez — solte ele junto com a STJ e a STL." }));
      return;
    }
    const base = data.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) { resumo.append(el("p", { class: "imp-alerta", text: "Escolha a data do export." })); return; }
    // o export de hoje tem de cobrir o que a base histórica não cobre
    const jan = stj.map((x) => M.janelaDaSTJ(x.tabela)).reduce((a, b) => ({ de: !a.de || (b.de && b.de < a.de) ? b.de : a.de, ate: a.ate > b.ate ? a.ate : b.ate }), { de: "", ate: "" });
    const bloqueios = [], avisos = [];
    if (jan.de && jan.de > maisDias(sem.corte, 31)) bloqueios.push(`A STJ começa em ${br(jan.de)}, mas a base histórica só vai até ${br(maisDias(sem.corte, -1))}: as OS do meio ficariam de fora. Exporte a STJ desde ${br(sem.corte)}.`);
    status.textContent = "Montando o painel…";
    await pausa();
    let m, D;
    try {
      m = M.montar({ stj: [...stj.map((x) => x.tabela), sem.stj], stl: [...stl.map((x) => x.tabela), sem.stl], frotas: sem.frotas, base, desde: DESDE, ult0: sem.ult });
      D = M.dadosDoPainel(m, sem.principais.length ? { principais: sem.principais } : {});
    } catch (e) { status.textContent = ""; resumo.append(el("p", { class: "imp-alerta", text: e.message })); return; }
    status.textContent = "";
    const antes = atual();
    const c = M.comparar(antes, D);
    if (antes && base < antes.base) avisos.push(`A data do export (${br(base)}) é anterior à do painel aberto (${br(antes.base)}).`);
    if (c.perdeuExecutante.length) avisos.push(`${plural(c.perdeuExecutante.length, "OS que tinha executante ficou", "OS que tinham executante ficaram")} sem ninguém (${nf.format(c.perdeuAbertas.length)} abertas) — sinal de que falta parte da STL. Confira as partes antes de gravar.`);
    if (m.repetidas) avisos.push(`${plural(m.repetidas, "OS veio", "OS vieram")} repetida(s) entre as partes: contou uma vez só.`);
    const g = c.agora;
    const linhaOS = (a) => el("li", {}, el("b", { text: `${a[2]} · OS ${a[0]}` }), ` ${a[4]} · ${({ A: "liberada", P: "aguardando liberação", F: "finalizada" })[a[6]]} · aberta em ${br(a[5])}`);
    resumo.append(...[
      el("div", { class: "imp-num" },
        el("div", {}, el("small", { text: `Protheus de ${br(base)}` }), el("b", { text: nf.format(g.A + g.P) }), el("span", { text: `abertas · ${nf.format(g.A)} liberadas, ${nf.format(g.P)} aguardando` })),
        el("div", {}, el("small", { text: antes ? `Desde ${br(antes.base)}` : "Primeira carga" }), el("b", { text: antes ? nf.format(c.fecharam.length) : nf.format(g.F) }), el("span", { text: antes ? "fecharam" : "finalizadas desde 2024" })),
        antes ? el("div", {}, el("small", { text: `Desde ${br(antes.base)}` }), el("b", { text: nf.format(c.novas.length) }), el("span", { text: "abertas novas" + (c.reabertas ? ` · ${nf.format(c.reabertas)} reabertas` : "") })) : null,
        el("div", {}, el("small", { text: "No painel" }), el("b", { text: nf.format(g.n) }), el("span", { text: `OS em ${plural(D.frotas_lista.length, "frota", "frotas")}` }))),
      antes && c.sumiram.length ? el("details", { class: "imp-sumiram" },
        el("summary", { text: `${plural(c.sumiram.length, "OS não veio", "OS não vieram")} no export de hoje (${nf.format(c.sumiramAbertas.length)} abertas) — podem ter sido excluídas ou canceladas no Protheus` }),
        el("ul", {}, ...c.sumiram.slice(0, 30).map(linhaOS)), c.sumiram.length > 30 ? el("p", { class: "nota", text: `e mais ${nf.format(c.sumiram.length - 30)}` }) : null) : null,
      antes && !(c.perdeuExecutante.length && c.sumiram.length) ? el("p", { class: "nota", text: [c.perdeuExecutante.length ? "" : "Nenhuma OS perdeu o executante.", c.sumiram.length ? "" : "Nenhuma OS sumiu do export."].filter(Boolean).join(" ") }) : null,
      ...bloqueios.map((t) => el("p", { class: "imp-alerta", text: t })),
      ...avisos.map((t) => el("p", { class: "imp-cuidado", text: t }))].filter(Boolean));
    if (bloqueios.length) return;
    const arquivos = lidos.filter((x) => !x.erro).map((x) => ({ nome: x.nome, tipo: x.tipo, linhas: x.linhas }));
    pacote = { versao: 1, meta: { gerado_em: new Date().toISOString(), base, arquivos, resumo: g }, D, semente: lidos.find((x) => x.tipo === "HIST") || null };
    gravar.disabled = false;
  }

  gravar.addEventListener("click", async () => {
    if (!pacote) return;
    gravar.disabled = true;
    try {
      const { semente: sem, ...p } = pacote;
      if (sem) { aviso.textContent = "Guardando a base histórica…"; await nuvem.subirArquivo(BUCKET, "historico.json.gz", sem.arquivo.name.toLowerCase().endsWith(".gz") ? new Blob([await sem.arquivo.arrayBuffer()], { type: "application/gzip" }) : await gz(JSON.parse(await sem.arquivo.text()))); }
      aviso.textContent = "Gravando o painel…";
      const blob = await gz(p);
      await nuvem.subirArquivo(BUCKET, `dias/${p.meta.base}.json.gz`, blob);
      await nuvem.subirArquivo(BUCKET, "atual.json.gz", blob);
      aviso.textContent = "Gravado. Abrindo o painel novo…";
      await aoGravar(p);
    } catch (e) {
      aviso.textContent = "Não gravou: " + e.message;
      gravar.disabled = false;
    }
  });

  entrada.addEventListener("change", () => { adicionar([...entrada.files]); entrada.value = ""; });
  data.addEventListener("change", () => montarAgora());
  zona.addEventListener("dragover", (e) => { e.preventDefault(); zona.classList.add("sobre"); });
  zona.addEventListener("dragleave", () => zona.classList.remove("sobre"));
  zona.addEventListener("drop", (e) => { e.preventDefault(); zona.classList.remove("sobre"); adicionar([...e.dataTransfer.files]); });

  dlg.replaceChildren(
    el("div", { class: "imp-cab" }, el("h2", { id: "imp-tit", text: "Atualizar com o Protheus" }),
      el("button", { type: "button", class: "botao mini", text: "Fechar", on: { click: () => dlg.close() } })),
    el("p", { class: "nota", text: "O site lê os arquivos aqui, neste computador, com as mesmas regras do painel. Nada é gravado até você conferir o resumo e clicar em Gravar — e o que se grava fica no Supabase, só para o seu acesso." }),
    zona,
    el("label", { class: "imp-data" }, "Data do export ", data),
    lista, status, resumo,
    el("div", { class: "imp-acoes" }, gravar, aviso));
  if (!dlg.open) dlg.showModal();
}
