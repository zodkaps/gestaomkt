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
// guardado no bucket (historicos/<sha>.json.gz desde 12/11/2026; antes, historico.json.gz).
//
// Publicar (12/11/2026) é por versão: um pacote só, com as OS, a lista de frotas usada, a base histórica usada e
// o índice das atualizações — conferido antes, gravado como versão, conferido depois e só então posto no ar
// (js/os/publicar.js). Falhou no meio: o painel continua na versão anterior, inteira.

import * as nuvem from "../nuvem.js";
import * as M from "./montar.js";
import * as P from "./publicar.js";
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

const { gz, deGz } = P;
/** O bucket do painel, para a publicação (js/os/publicar.js). */
export const ioDoBucket = {
  subir: (caminho, blob, { substituir = true } = {}) => nuvem.subirArquivo(BUCKET, caminho, blob, "application/gzip", { substituir }),
  baixar: (caminho) => nuvem.baixarArquivo(BUCKET, caminho),
  apagar: (caminho) => nuvem.apagarArquivo(BUCKET, caminho),
  versaoNoAr: async () => { const l = await arquivosDoPainel(); return l.has(P.ATUAL) ? l.get(P.ATUAL).versao : ""; },
};
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
const FROTAS = "frotas.json.gz";   // a lista de frotas do PCM colada na atualização (11/11/2026)
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
// (12/11/2026) o importacoes.json.gz e o frotas.json.gz deixaram de ser gravados: o índice e a lista de frotas vão
// dentro do pacote publicado. Os arquivos antigos continuam sendo lidos (as linhas e a lista de antes).

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
      soma("semNumero") ? linha("− sem número de OS (não dá para identificar)", soma("semNumero")) : null,
      linha("− repetidas", soma("repetidas")),
      linha("− encerradas sem a data de fim", soma("semFim")),
      linha(`− encerradas antes de ${br(desde)}`, soma("antesDe")),
      linha(`= no painel: ${nf.format(soma("corretivas"))} corretivas (a carteira) e ${nf.format(soma("preventivas"))} preventivas`, noPainel),
      linha("+ da base histórica (OS de antes de 2026)", a.daBaseHistorica || 0)),
    fil.length > 1 ? el("table", { class: "imp-funil-tab" },
      el("thead", {}, el("tr", {}, ...["Filial", "Linhas da STJ", "Bens fora da lista", "Canceladas", "Outras saídas", "No painel"].map((x) => el("th", { text: x })))),
      el("tbody", {}, ...fil.map(([f, x]) => el("tr", {}, el("td", { text: f }), ...[x.linhas, x.fora, x.canceladas, x.repetidas + x.semFim + x.antesDe + (x.semNumero || 0), x.corretivas + x.preventivas]
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

/** Abre a caixa de atualizar. `atual()`: o painel aberto agora (para comparar); `metaAtual()`: o meta do pacote
 *  publicado (a lista de frotas, a base histórica e o índice que valem); `versaoAberta`: a versão do atual.json.gz
 *  aberta (a publicação confere que ninguém publicou no meio); `quem`: quem publica;
 *  `aoGravar(pacote, resultado)`: depois de publicar; `raiz`: onde está a caixa (a área do painel no site). */
export function abrirImportar({ atual, metaAtual = () => null, versaoAberta = "", quem = "", aoGravar, raiz = document }) {
  const dlg = raiz.querySelector("#os-importar");
  const lidos = [];                 // { nome, tipo, tabela | semente, linhas, arquivo }
  let pacote = null, sementeGuardada = undefined;
  const status = el("div", { class: "imp-status", "aria-live": "polite" });
  const lista = el("ul", { class: "imp-arqs" });
  const resumo = el("div", { class: "imp-resumo" });
  const data = el("input", { type: "date", id: "imp-data", value: hojeLocal() });
  const entrada = el("input", { type: "file", id: "imp-arq", multiple: true, accept: ".xlsx,.xls,.csv,.gz,.json", class: "imp-entrada" });
  const gravar = el("button", { type: "button", class: "botao prim", disabled: true, text: "Publicar no painel" });
  const etapas = el("ol", { class: "imp-etapas", "aria-live": "polite", hidden: true });
  const aviso = el("span", { class: "imp-aviso", "aria-live": "polite" });
  const zona = el("label", { class: "imp-zona", for: "imp-arq" },
    el("b", { text: "Solte aqui os arquivos" }), el("span", {}, "ou ", el("u", { text: "escolha no computador" })),
    el("small", { text: "A STJ e a STL de hoje (.xlsx ou .csv, todas as partes). Na primeira vez, junto, a base histórica (historico-os.json.gz)." }), entrada);

  // as frotas do PCM (11/11/2026): a lista vinha só da base histórica; agora se cola aqui, e ela fica guardada no
  // bucket privado para as próximas atualizações (número de frota não vai para o repositório)
  let frotasGuardadas, frotasNovas = null;
  const frotasInfo = el("span", { class: "imp-frotas-info", text: "…" });
  const frotasCampo = el("textarea", { class: "imp-frotas-campo", rows: 4, "aria-label": "As frotas do PCM",
    placeholder: "Cole os números das frotas do PCM: um por linha, ou separados por espaço ou vírgula" });
  const frotasNota = el("p", { class: "imp-frotas-nota", "aria-live": "polite" });
  const frotasCaixa = el("details", { class: "imp-frotas" }, el("summary", {}, el("b", { text: "Frotas do PCM: " }), frotasInfo),
    frotasCampo, el("div", { class: "imp-acoes" }, el("button", { type: "button", class: "botao mini", text: "Usar esta lista", on: { click: () => usarLista() } }), frotasNota));
  const semZeros = (n) => String(n).replace(/^0+(?=\d)/, "");
  async function frotasEmUso() {
    if (frotasNovas) return { frotas: frotasNovas, de: "colada agora — vale ao publicar" };
    // a lista que vale é a da versão publicada (12/11/2026); antes dela, o frotas.json.gz
    const mp = metaAtual();
    if (mp && Array.isArray(mp.frotas) && mp.frotas.length) return { frotas: mp.frotas, de: "a da versão publicada" };
    if (frotasGuardadas === undefined) {
      try { const l = (await arquivosDoPainel()).has(FROTAS) ? await baixarJSON(FROTAS) : null; frotasGuardadas = l && Array.isArray(l.frotas) ? l : null; }
      catch (e) { frotasGuardadas = null; }
    }
    if (frotasGuardadas) return { frotas: frotasGuardadas.frotas, de: "a lista guardada" + (frotasGuardadas.gravado_em ? ` em ${br(String(frotasGuardadas.gravado_em).slice(0, 10))}` : "") };
    const sem = await semente();
    return sem ? { frotas: sem.frotas, de: "da base histórica" } : null;
  }
  async function pintarFrotas() {
    const f = await frotasEmUso();
    frotasInfo.textContent = f ? `${plural(f.frotas.length, "frota", "frotas")} (${f.de})` : "a lista vem com a base histórica";
    if (f && !frotasCampo.value) frotasCampo.value = f.frotas.map(semZeros).join(" ");
  }
  async function usarLista() {
    const r = M.lerFrotas(frotasCampo.value);
    if (!r.frotas.length) { frotasNota.textContent = "Nenhum número de frota no texto."; return; }
    const antes = await frotasEmUso();
    const A = new Set((antes ? antes.frotas : []).map(semZeros)), B = new Set(r.frotas);
    const entram = r.frotas.filter((n) => !A.has(n)), saem = [...A].filter((n) => !B.has(n));
    frotasNovas = r.frotas;
    frotasNota.textContent = plural(r.frotas.length, "frota", "frotas") + (entram.length ? ` · entram: ${entram.join(", ")}` : "") + (saem.length ? ` · saem: ${saem.join(", ")}` : "") +
      (!entram.length && !saem.length ? " · as mesmas de antes" : "") + (r.repetidas.length ? ` · repetidas na lista (contam uma vez): ${r.repetidas.join(", ")}` : "") +
      (r.ignorados.length ? ` · ignorados: ${r.ignorados.join(", ")}` : "") + ". Vale ao publicar.";
    frotasCampo.value = r.frotas.join(" ");
    await pintarFrotas();
    await montarAgora();
  }

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
      // a que vale é a da versão publicada (12/11/2026); antes dela, o historico.json.gz
      const mp = metaAtual(), ref = mp && mp.historico && mp.historico.arquivo;
      try {
        const obj = ref ? await baixarJSON(ref) : (await arquivosDoPainel()).has("historico.json.gz") ? await baixarJSON("historico.json.gz") : null;
        sementeGuardada = obj ? M.lerSemente(obj) : null;
      } catch (e) { sementeGuardada = null; }
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
    await pintarFrotas();
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
      const fr = await frotasEmUso();
      m = M.montar({ stj: [...stj.map((x) => x.tabela), sem.stj], stl: [...stl.map((x) => x.tabela), sem.stl], frotas: fr ? fr.frotas : sem.frotas, base, desde: DESDE, ult0: sem.ult });
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
    // (12/11/2026) os mesmos dados da versão no ar não se publicam de novo
    const mp = metaAtual(), shaNovo = await P.shaDosDados(D);
    const shaNoAr = mp && mp.sha_dados ? mp.sha_dados : antes ? await P.shaDosDados(antes) : "";
    if (shaNoAr && shaNoAr === shaNovo) {
      resumo.append(el("p", { class: "imp-cuidado", text: `Nada a publicar: estes dados são os mesmos da versão no ar${mp && mp.versao_id ? ` (${P.rotuloDaVersao(mp.versao_id)})` : ""}.` }));
      return;
    }
    const fr = await frotasEmUso();
    pacote = { versao: 2, meta: { gerado_em: new Date().toISOString(), base, arquivos, resumo: g, sha_dados: shaNovo, frotas: fr ? fr.frotas : [] },
      D, semente: lidos.find((x) => x.tipo === "HIST") || null, comparacao: c };
    resumo.append(el("p", { class: "imp-versao" }, el("b", { text: "Ao publicar: " }),
      `o painel passa para os dados do Protheus de ${br(base)}` + (mp && mp.versao_id ? `; a versão no ar (${P.rotuloDaVersao(mp.versao_id)}) fica guardada e dá para voltar a ela pela Auditoria.` : ".")));
    gravar.disabled = false;
  }

  // publicar (12/11/2026): uma versão inteira, conferida antes e depois (js/os/publicar.js)
  let publicando = false;
  gravar.addEventListener("click", async () => {
    if (!pacote || publicando) return;
    publicando = true;
    gravar.disabled = true;
    aviso.className = "imp-aviso";
    aviso.textContent = "Publicando…";
    const mp = metaAtual();
    try {
      const { semente: sem, comparacao, ...p } = pacote;
      const agora = new Date();
      p.meta = { ...p.meta, versao_id: P.idDaVersao(p.meta.base, agora), publicado_em: agora.toISOString(), publicado_por: quem,
        anterior: mp && mp.versao_id ? { id: mp.versao_id, base: mp.base } : null };
      // a base histórica: a nova (se veio) vai pelo conteúdo; senão vale a da versão publicada (ou a antiga)
      let historico = null;
      if (sem) {
        const blob = sem.arquivo.name.toLowerCase().endsWith(".gz") ? new Blob([await sem.arquivo.arrayBuffer()], { type: "application/gzip" }) : await gz(JSON.parse(await sem.arquivo.text()));
        const sha = await P.sha256(blob);
        historico = { blob, sha };
        p.meta.historico = { arquivo: P.arquivoDoHistorico(sha), sha, feito_em: sem.semente.feitoEm || "" };
      } else p.meta.historico = mp && mp.historico ? mp.historico : { arquivo: "historico.json.gz", sha: "", feito_em: (p.D.historica && p.D.historica.feito_em) || "" };
      // o índice das atualizações vai dentro do pacote: as linhas de antes e a desta
      p.meta.importacoes = [...P.mesclarIndice((mp && mp.importacoes) || [], await lerImportacoes()), { ...linhaDaImportacao(p, comparacao), ...P.linhaDaVersao(p) }];
      const r = await P.publicar({ io: ioDoBucket, pacote: p, historico, quem, versaoAberta, etapa: pintarEtapa });
      aviso.className = "imp-aviso ok";
      aviso.textContent = `Publicada a versão ${P.rotuloDaVersao(r.id)} (Protheus de ${br(p.meta.base)}). Abrindo o painel…` + (r.avisos.length ? " " + r.avisos.join(" ") : "");
      await aoGravar(p, r);
    } catch (e) {
      aviso.className = "imp-aviso erro";
      aviso.textContent = P.textoDaFalha(e, mp ? { meta: mp } : null);
      gravar.disabled = false;
    } finally { publicando = false; }
  });
  // cada passo da publicação numa linha: o que está fazendo, o que deu certo e onde parou
  const ROT_ETAPA = { conferir: "Conferir os dados", trava: "Reservar a gravação", "no-ar": "Conferir a versão no ar", historico: "Guardar a base histórica",
    versao: "Gravar a versão nova", copia: "Conferir a cópia gravada", publicar: "Publicar no painel", buscar: "Buscar a versão" };
  function pintarEtapa(nome, estado, texto, erro) {
    if (nome === "fim") return;
    etapas.hidden = false;
    let li = etapas.querySelector(`[data-etapa="${nome}"]`);
    if (!li) { li = el("li", { "data-etapa": nome }); etapas.append(li); }
    li.className = "et-" + estado;
    li.replaceChildren(el("span", { class: "et-ic", "aria-hidden": "true", text: { faz: "…", ok: "✓", erro: "✕", aviso: "!" }[estado] || "" }),
      el("span", { text: ROT_ETAPA[nome] || texto }), erro ? el("small", { text: " — " + ((erro && erro.message) || erro) }) : null);
  }

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
    frotasCaixa, lista, status, resumo,
    el("div", { class: "imp-acoes" }, gravar, aviso), etapas);
  if (!dlg.open) dlg.showModal();
  pintarFrotas().catch(() => {});
}

/** Voltar o painel para uma versão publicada antes (12/11/2026): a caixa diz o que muda, pede a confirmação e
 *  mostra cada passo. `publicada`: { D, meta } no ar agora. */
export function abrirVolta({ linha, publicada, versaoAberta = "", quem = "", aoGravar, raiz = document }) {
  const dlg = raiz.querySelector("#os-importar");
  const etapas = el("ol", { class: "imp-etapas", "aria-live": "polite", hidden: true });
  const aviso = el("p", { class: "imp-aviso", "aria-live": "polite" });
  const ROT = { buscar: "Buscar a versão", conferir: "Conferir os dados", trava: "Reservar a gravação", "no-ar": "Conferir a versão no ar",
    versao: "Gravar a versão nova", copia: "Conferir a cópia gravada", publicar: "Publicar no painel" };
  const pintarEtapa = (nome, estado, texto, erro) => {
    if (nome === "fim") return;
    etapas.hidden = false;
    let li = etapas.querySelector(`[data-etapa="${nome}"]`);
    if (!li) { li = el("li", { "data-etapa": nome }); etapas.append(li); }
    li.className = "et-" + estado;
    li.replaceChildren(el("span", { class: "et-ic", "aria-hidden": "true", text: { faz: "…", ok: "✓", erro: "✕" }[estado] || "" }),
      el("span", { text: ROT[nome] || texto }), erro ? el("small", { text: " — " + ((erro && erro.message) || erro) }) : null);
  };
  const confirmar = el("button", { type: "button", class: "botao prim", text: "Voltar para esta versão" });
  confirmar.addEventListener("click", async () => {
    confirmar.disabled = true;
    aviso.className = "imp-aviso";
    aviso.textContent = "Voltando…";
    try {
      const r = await P.voltarPara({ io: ioDoBucket, id: linha.id, publicada, quem, versaoAberta, etapa: pintarEtapa });
      aviso.className = "imp-aviso ok";
      aviso.textContent = `O painel voltou para os dados da versão ${P.rotuloDaVersao(linha.id)} (publicada como ${P.rotuloDaVersao(r.id)}). Abrindo…`;
      await aoGravar(null, r);
    } catch (e) {
      aviso.className = "imp-aviso erro";
      aviso.textContent = P.textoDaFalha(e, publicada);
      confirmar.disabled = false;
    }
  });
  dlg.replaceChildren(
    el("div", { class: "imp-cab" }, el("h2", { id: "imp-tit", text: `Voltar para a versão ${P.rotuloDaVersao(linha.id)}` }),
      el("button", { type: "button", class: "botao mini", text: "Fechar", on: { click: () => dlg.close() } })),
    el("p", { text: `O painel passa a mostrar os dados do Protheus de ${br(linha.base)} (${nf.format(linha.total || 0)} OS, ${nf.format(linha.abertas || 0)} abertas), ` +
      "para todos que o abrem. A versão no ar agora continua guardada: dá para voltar a ela pela Auditoria." }),
    el("p", { class: "nota", text: "A volta é publicada como uma versão nova (o índice das atualizações registra quem voltou e de onde)." }),
    el("div", { class: "imp-acoes" }, confirmar), aviso, etapas);
  if (!dlg.open) dlg.showModal();
}
