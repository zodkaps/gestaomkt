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
/** As cópias de cada dia (dias/AAAA-MM-DD.json.gz): o que há para comparar uma atualização com outra. */
export async function diasGuardados() {
  const l = await nuvem.listarArquivos(BUCKET, "dias");
  return (Array.isArray(l) ? l : []).map((x) => x && x.name && /^(\d{4}-\d{2}-\d{2})\.json\.gz$/.exec(x.name)).filter(Boolean)
    .map((m) => m[1]).sort();
}
/** A cópia de um dia: o pacote gravado (meta e D). */
export const baixarDia = (dia) => baixarJSON(`dias/${dia}.json.gz`);

// ── o índice das atualizações (11/11/2026) ───────────────────────────────────
// Uma linha por gravação: o dia do export, quando gravou e as contagens — para a auditoria mostrar o
// histórico sem baixar todas as cópias. A cópia de cada dia (dias/) segue sendo o registro completo.
const INDICE = "importacoes.json.gz";
export async function lerImportacoes() {
  try { const l = await baixarJSON(INDICE); return Array.isArray(l) ? l : []; } catch (e) { return []; }
}
/** A linha do índice de um pacote gravado. `c`: a comparação com o painel anterior (M.comparar). */
export function linhaDaImportacao(p, c = null) {
  const n = { A: 0, P: 0, F: 0 };
  for (const a of p.D.os) n[a[6]]++;
  return { base: p.meta.base, gerado_em: p.meta.gerado_em, total: p.D.os.length, abertas: n.A + n.P, liberadas: n.A, aguardando: n.P, encerradas: n.F,
    canceladas: (p.D.canceladas || []).length, desde: c && c.antes ? c.antes.base : "",
    novas: c && c.antes ? c.novas.length : null, fecharam: c && c.antes ? c.fecharam.length : null, reabertas: c && c.antes ? c.reabertas : null,
    sumiramAbertas: c && c.antes ? c.sumiramAbertas.length : null };
}
async function registrarImportacao(linha) {
  const l = (await lerImportacoes()).filter((x) => x.base !== linha.base);   // o mesmo dia gravado de novo: vale o último
  l.push(linha);
  l.sort((a, b) => (a.base < b.base ? -1 : a.base > b.base ? 1 : 0));
  await nuvem.subirArquivo(BUCKET, INDICE, await gz(l));
}

/** O caminho das linhas da STJ de hoje até o painel (11/11/2026): quantas vieram, quantas ficaram de fora e por
 *  quê, quantas entraram (corretivas e preventivas) — no total e por filial — e os bens fora da lista do PCM. */
export function funilDaSTJ(a, desde) {
  if (!a || !a.porFilial) return null;
  const fil = Object.entries(a.porFilial).sort((x, y) => y[1].linhas - x[1].linhas);
  const soma = (k) => fil.reduce((s, [, x]) => s + x[k], 0);
  const linha = (rot, v) => el("li", {}, el("span", { text: rot }), el("b", { text: nf.format(v) }));
  const noPainel = soma("corretivas") + soma("preventivas");
  return el("details", { class: "imp-funil", open: true },
    el("summary", { text: `Da STJ de hoje: ${nf.format(soma("linhas"))} linhas → ${nf.format(noPainel)} OS no painel` }),
    el("ul", { class: "imp-funil-conta" },
      linha("Linhas da STJ de hoje", soma("linhas")),
      linha(`− de bens fora da lista do PCM (${plural(a.foraBensTotal || 0, "bem", "bens")})`, soma("fora")),
      linha("− canceladas", soma("canceladas")),
      linha("− repetidas", soma("repetidas")),
      linha("− encerradas sem a data de fim", soma("semFim")),
      linha(`− encerradas antes de ${br(desde)}`, soma("antesDe")),
      linha(`= no painel: ${nf.format(soma("corretivas"))} corretivas (a carteira) e ${nf.format(soma("preventivas"))} preventivas`, noPainel),
      linha("+ da base histórica (OS de antes de 2026)", a.daBaseHistorica || 0)),
    fil.length > 1 ? el("table", { class: "imp-funil-tab" },
      el("thead", {}, el("tr", {}, ...["Filial", "Linhas da STJ", "Bens fora da lista", "Canceladas", "Outras saídas", "No painel"].map((x) => el("th", { text: x })))),
      el("tbody", {}, ...fil.map(([f, x]) => el("tr", {}, el("td", { text: f }), ...[x.linhas, x.fora, x.canceladas, x.repetidas + x.semFim + x.antesDe, x.corretivas + x.preventivas]
        .map((v) => el("td", { text: nf.format(v) })))))) : null,
    a.foraBens && a.foraBens.length ? el("p", { class: "imp-funil-bens", text: "Bens fora da lista do PCM (os com mais OS): " +
      a.foraBens.slice(0, 12).map((b) => `${b.bem}${b.nome ? " " + b.nome.toLowerCase() : ""} (${nf.format(b.n)})`).join(" · ") +
      (a.foraBensTotal > 12 ? ` · e mais ${plural(a.foraBensTotal - 12, "bem", "bens")}` : "") + ". Para entrarem no painel, eles precisam estar na lista de frotas do PCM." }) : null);
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
      D = M.dadosDoPainel(m, { ...(sem.principais.length ? { principais: sem.principais } : {}),
        historica: { feito_em: sem.feitoEm || "", corte: sem.corte || "", ate: sem.ate || "" } });
    } catch (e) { status.textContent = ""; resumo.append(el("p", { class: "imp-alerta", text: e.message })); return; }
    status.textContent = "";
    const antes = atual();
    const c = M.comparar(antes, D);
    if (antes && base < antes.base) avisos.push(`A data do export (${br(base)}) é anterior à do painel aberto (${br(antes.base)}).`);
    if (c.perdeuExecutante.length) avisos.push(`${plural(c.perdeuExecutante.length, "OS que tinha executante ficou", "OS que tinham executante ficaram")} sem ninguém (${nf.format(c.perdeuAbertas.length)} abertas) — sinal de que falta parte da STL. Confira as partes antes de gravar.`);
    // repetida entre as partes de hoje é aviso; a mesma OS na base histórica é o esperado (vale a de hoje)
    const rep = m.auditoria ? m.auditoria.repetidasHoje : m.repetidas;
    if (rep) avisos.push(`${plural(rep, "OS veio", "OS vieram")} repetida(s) entre as partes de hoje: contou uma vez só.`);
    // quem abriu a OS (11/11/2026): sem a coluna Usr Inclusao, o painel fica sem o CPF de quem abriu
    const qa = m.auditoria;
    if (qa && qa.stjSemQuemAbriu && qa.stjSemQuemAbriu.length) {
      avisos.push(`${qa.stjSemQuemAbriu.join(", ")}: sem a coluna Usr Inclusao (quem abriu a OS). Sem ela o painel não mostra o CPF de quem abriu — exporte a STJ com essa coluna.`);
    } else if (qa && qa.colunaQuemAbriu && !qa.comQuemAbriu) avisos.push(`A coluna ${qa.colunaQuemAbriu} veio vazia: o painel fica sem quem abriu as OS.`);
    // (11/11/2026) a OS em aberto que só a base histórica tem fica com a situação do dia em que ela foi feita
    if (qa && qa.abertasDaBaseHistorica) {
      const n = qa.abertasDaBaseHistorica, quando = sem.feitoEm ? br(String(sem.feitoEm).slice(0, 10)) : "quando ela foi feita";
      avisos.push(`${plural(n, "OS em aberto vem", "OS em aberto vêm")} só da base histórica (situação de ${quando}): a STJ de hoje não ${n === 1 ? "a" : "as"} trouxe. ` +
        `Se alguma foi encerrada depois, o painel ainda a conta em aberto — para atualizá-las, exporte a STJ e a STL desde ${br(DESDE)}.`);
    }
    // (11/11/2026) de onde vem cada número: as linhas da STJ de hoje, o que ficou de fora e por quê, por filial
    const funil = funilDaSTJ(m.auditoria, DESDE);
    const g = c.agora;
    // (11/11/2026) as preventivas ficam fora da carteira: o resumo conta as corretivas e diz as preventivas à parte
    const pv = { A: 0, P: 0, F: 0, n: 0 };
    for (const a of D.os) if (a[8] === "P") { pv[a[6]]++; pv.n++; }
    const linhaOS = (a) => el("li", {}, el("b", { text: `${a[2]} · OS ${a[0]}` }), ` ${a[4]} · ${({ A: "liberada", P: "aguardando liberação", F: "finalizada" })[a[6]]} · aberta em ${br(a[5])}`);
    resumo.append(...[
      el("div", { class: "imp-num" },
        el("div", {}, el("small", { text: `Protheus de ${br(base)}` }), el("b", { text: nf.format(g.A + g.P - pv.A - pv.P) }), el("span", { text: `abertas · ${nf.format(g.A - pv.A)} liberadas, ${nf.format(g.P - pv.P)} aguardando` +
          (pv.A + pv.P ? ` · + ${plural(pv.A + pv.P, "preventiva aberta", "preventivas abertas")} à parte` : "") })),
        el("div", {}, el("small", { text: antes ? `Desde ${br(antes.base)}` : "Primeira carga" }), el("b", { text: antes ? nf.format(c.fecharam.length) : nf.format(g.F) }), el("span", { text: antes ? "fecharam" : "finalizadas desde 2024" })),
        antes ? el("div", {}, el("small", { text: `Desde ${br(antes.base)}` }), el("b", { text: nf.format(c.novas.length) }), el("span", { text: "abertas novas" + (c.reabertas ? ` · ${nf.format(c.reabertas)} reabertas` : "") })) : null,
        el("div", {}, el("small", { text: "No painel" }), el("b", { text: nf.format(g.n - pv.n) }), el("span", { text: `OS em ${plural(D.frotas_lista.length, "frota", "frotas")}` + (pv.n ? ` · + ${plural(pv.n, "preventiva", "preventivas")} à parte` : "") }))),
      funil,
      antes && c.sumiram.length ? el("details", { class: "imp-sumiram" },
        el("summary", { text: `${plural(c.sumiram.length, "OS não veio", "OS não vieram")} no export de hoje (${nf.format(c.sumiramAbertas.length)} abertas) — podem ter sido excluídas ou canceladas no Protheus` }),
        el("ul", {}, ...c.sumiram.slice(0, 30).map(linhaOS)), c.sumiram.length > 30 ? el("p", { class: "nota", text: `e mais ${nf.format(c.sumiram.length - 30)}` }) : null) : null,
      antes && !(c.perdeuExecutante.length && c.sumiram.length) ? el("p", { class: "nota", text: [c.perdeuExecutante.length ? "" : "Nenhuma OS perdeu o executante.", c.sumiram.length ? "" : "Nenhuma OS sumiu do export."].filter(Boolean).join(" ") }) : null,
      ...bloqueios.map((t) => el("p", { class: "imp-alerta", text: t })),
      ...avisos.map((t) => el("p", { class: "imp-cuidado", text: t }))].filter(Boolean));
    if (bloqueios.length) return;
    const arquivos = lidos.filter((x) => !x.erro).map((x) => ({ nome: x.nome, tipo: x.tipo, linhas: x.linhas }));
    pacote = { versao: 1, meta: { gerado_em: new Date().toISOString(), base, arquivos, resumo: g }, D, semente: lidos.find((x) => x.tipo === "HIST") || null, comparacao: c };
    gravar.disabled = false;
  }

  gravar.addEventListener("click", async () => {
    if (!pacote) return;
    gravar.disabled = true;
    try {
      const { semente: sem, comparacao, ...p } = pacote;
      if (sem) { aviso.textContent = "Guardando a base histórica…"; await nuvem.subirArquivo(BUCKET, "historico.json.gz", sem.arquivo.name.toLowerCase().endsWith(".gz") ? new Blob([await sem.arquivo.arrayBuffer()], { type: "application/gzip" }) : await gz(JSON.parse(await sem.arquivo.text()))); }
      aviso.textContent = "Gravando o painel…";
      const blob = await gz(p);
      await nuvem.subirArquivo(BUCKET, `dias/${p.meta.base}.json.gz`, blob);
      await nuvem.subirArquivo(BUCKET, "atual.json.gz", blob);
      // o índice das atualizações: se não der, o painel já está gravado (a cópia do dia é o registro)
      try { await registrarImportacao(linhaDaImportacao(p, comparacao)); } catch (e) { console.warn("índice das atualizações:", e); }
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
