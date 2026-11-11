// A carteira de OS do Protheus (STJ + STL), montada no navegador (05/11/2026).
//
// É o montar.py e o pagina.py do painel de OS, trazidos para cá com as mesmas
// regras: quem atualiza é o Mateus, soltando no site a STJ e a STL do dia, e
// nada disso passa pelo repositório (que é público) — os dados ficam só no
// Supabase, num lugar que só o acesso dele lê.
//
// Entra: as tabelas da STJ e da STL (cada parte do export é uma tabela) e a
// base histórica (o que os exports de hoje, só de 2026, não trazem mais).
// Sai: o mesmo bloco de dados que o painel sempre usou.
//
// Duas regras que vêm do Protheus:
//   - as colunas de usuário guardam o CPF de quem mexeu na OS. Só UMA é lida:
//     a de quem abriu ("Usr Inclusao"), pedido do Mateus em 10/11/2026 para o
//     painel dizer quem abriu cada OS. Ela vai só para o painel (o bucket
//     privado), nunca para o repositório; as outras ("Usuário Alt.", "Usr
//     Altera", "Usuário Ini.", "Usuário Fim") continuam sem ser lidas;
//   - na observação (texto livre), CPF e telefone digitados viram "[nº omitido]".

// ── a leitura de cada valor, igual à do montar.py ────────────────────────────

/** A chave de uma OS (11/11/2026): filial e número sem os zeros da frente. O Excel guarda o número como número
 *  e come os zeros ("012345" vira 12345); a base histórica os guarda. Sem isto, a mesma OS seria duas. */
const semZeros = (s) => s.replace(/^0+(?=\d)/, "");
export const chaveOS = (filial, os) => semZeros(txt(filial)) + "|" + semZeros(txt(os));

/** O texto da célula, com os espaços juntados. Zero é "0"; vazio é "". */
export function txt(v) {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).replace(/_x000D_/g, " ").split(/\s+/).filter(Boolean).join(" ");
}

const doisDig = (n) => String(n).padStart(2, "0");

/** A data em AAAA-MM-DD. Do Excel vem como data; da base histórica e do .csv,
 *  em texto (dd/mm/aaaa, dd/mm/aa ou AAAA-MM-DD). O resto não é data: "". */
export function iso(v) {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    return `${v.getFullYear()}-${doisDig(v.getMonth() + 1)}-${doisDig(v.getDate())}`;
  }
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return valida(+m[3], +m[2], +m[1]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(s);
  // como o Python: 00–68 é 20xx, 69–99 é 19xx
  if (m) return valida(+m[3] + (+m[3] <= 68 ? 2000 : 1900), +m[2], +m[1]);
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return valida(+m[1], +m[2], +m[3]);
  return "";
}
function valida(a, mes, d) {
  if (mes < 1 || mes > 12 || d < 1) return "";
  const fim = new Date(Date.UTC(a, mes, 0)).getUTCDate();
  if (d > fim || a < 1) return "";
  return `${String(a).padStart(4, "0")}-${doisDig(mes)}-${doisDig(d)}`;
}

/** O número: do Excel já vem número; em texto, a vírgula é a decimal (1.234,5). */
export function num(v) {
  if (typeof v === "number") return v;
  let t = String(v ?? "").trim();
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) && /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t) ? n : 0;
}

// a observação é texto livre: CPF, telefone ou outro número de documento que
// alguém digitou nela não sai do Protheus. (\b do Python é Unicode: letra
// acentuada colada ao número também conta como palavra.)
const B = "(?<![\\p{L}\\p{N}_])", E = "(?![\\p{L}\\p{N}_])";
const DOC = new RegExp(`${B}\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}${E}|${B}\\d{11}${E}|\\(\\d{2}\\)\\s?9?\\d{4}-?\\d{4}|${B}9\\d{4}-\\d{4}${E}`, "gu");
export const semDoc = (t) => t.replace(DOC, "[nº omitido]");

export const frota = (bem) => (/^\d+$/.test(bem) ? "F-" + bem.replace(/^0+/, "") : bem);
const MINUSC = new Set(["da", "de", "do", "das", "dos", "e"]);
const cap = (p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
export const nome = (s) => s.split(/\s+/).filter(Boolean).map((p) => (MINUSC.has(p.toLowerCase()) ? p.toLowerCase() : cap(p))).join(" ");
export const frase = (s) => s.slice(0, 1).toUpperCase() + s.slice(1).toLowerCase();
const semAcento = (s) => s.normalize("NFD").replace(/\p{Mn}/gu, "");

/** [nome, classe] da "Categoria OS" (texto livre): P programada, N não
 *  programada, O outra, S sem categoria. As siglas sem legenda ficam "Outra". */
export function categoria(v) {
  const bruto = txt(v);
  const t = semAcento(bruto).toLowerCase().split(/\s+/).filter(Boolean).join(" ");
  if (!t) return ["Sem categoria", "S"];
  if (t.includes("program") || t.includes("prgram")) return ["Programada", "P"];
  if (t === "pv" || t === "preventiva") return ["Preventiva (PV)", "P"];
  if (t.startsWith("eme") || t.includes("emergenc")) return ["Emergencial", "N"];
  if (t.startsWith("oportun")) return ["Oportunidade", "N"];
  if (t === "dano critico") return ["Dano crítico", "N"];
  if (t === "dano nao critico") return ["Dano não crítico", "N"];
  if (t === "corretiva") return ["Corretiva", "N"];
  if (t === "reforma") return ["Reforma", "O"];
  if (t === "preditiva") return ["Preditiva", "O"];
  if (t === "pneu" || t === "pneus" || t === "borracharia") return ["Pneu e borracharia", "O"];
  if (t.startsWith("inspe")) return ["Inspeção", "O"];
  return ["Outra: " + bruto.toUpperCase(), "O"];
}

// ── as tabelas ───────────────────────────────────────────────────────────────

/** A tabela de uma parte do export: o cabeçalho (achado nas 20 primeiras
 *  linhas, pela coluna Filial — o export às vezes vem com título em cima) e as
 *  linhas. Nome repetido no cabeçalho: o 1º é a data, o 2º a hora. */
export function tabela(linhas, nomeArq = "") {
  let i = 0;
  for (; i < Math.min(20, linhas.length); i++) {
    const c = (linhas[i] || []).map((x) => (x === null || x === undefined ? "" : String(x).trim()));
    if (c.includes("Filial")) break;
  }
  if (i >= Math.min(20, linhas.length)) throw new Error(`${nomeArq || "arquivo"}: não achei o cabeçalho (a coluna Filial) nas primeiras linhas.`);
  const cab = linhas[i].map((x) => (x === null || x === undefined ? "" : String(x).trim()));
  return { nome: nomeArq, cab, linhas: linhas.slice(i + 1) };
}

/** As colunas pelo nome, para ler cada linha: `g(nome, k)` e `g.tem(nome)`. */
/** A coluna de quem abriu a OS, pelo nome do export: "Usr Inclusao", "Usuário Inclusão", "Usr. Incl."…
 *  (11/11/2026: sem acento, ponto nem espaço, começa por usr/usu/usuario e "incl"). As outras colunas de
 *  usuário (alteração, início, fim) não casam e continuam sem ser lidas. */
const soLetras = (c) => String(c).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
const colunaDeQuemAbriu = (cab) => cab.find((c) => /^(usr|usu|usuario)incl/.test(soLetras(c))) || "";
/** O CPF de quem abriu, como se lê: 000.000.000-00 (o Excel às vezes come o zero da frente).
 *  O que não for CPF (um login) vem como está. */
export function quemAbriu(v) {
  const s = txt(v);
  const d = s.replace(/\D/g, "");
  if (/^\d{10,11}$/.test(d) && d.length === s.replace(/[.\-\s]/g, "").length) {
    const c = d.padStart(11, "0");
    return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
  }
  return s.slice(0, 40);
}

function leitor(t) {
  const pos = new Map();
  t.cab.forEach((n, i) => { if (!pos.has(n)) pos.set(n, []); pos.get(n).push(i); });
  const tem = (n) => pos.has(n);
  return function* linhas() {
    for (const row of t.linhas) {
      if (!row || !row.some((v) => v !== null && v !== undefined && v !== "" && v !== 0 && v !== false)) continue;
      const g = (n, k = 0) => { const p = pos.get(n); if (!p || p.length <= k) return null; const v = row[p[k]]; return v === undefined ? null : v; };
      g.tem = tem;
      yield g;
    }
  };
}

/** A tabela de um .xlsx, pelo SheetJS (o mesmo do site: vendor/xlsx.mini.min.js). */
export function tabelaDoExcel(XLSX, dados, nomeArq) {
  const wb = XLSX.read(dados, { type: dados instanceof ArrayBuffer ? "array" : "buffer", cellDates: true, dense: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return tabela(XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false }), nomeArq);
}

/** A tabela de um .csv (o export de texto do Protheus: título na 1ª linha,
 *  ; ou , de separador). Os valores ficam em texto, como no montar.py. */
export function tabelaDoCSV(texto, nomeArq) {
  const L = texto.replace(/^﻿/, "").split(/\r\n|\n|\r/);
  const iCab = L.slice(0, 20).findIndex((x) => x.includes("Filial"));
  const sep = iCab >= 0 && (L[iCab].split(";").length > L[iCab].split(",").length) ? ";" : ",";
  return tabela(lerCSV(L.slice(Math.max(0, iCab)).join("\n"), sep), nomeArq);
}
function lerCSV(s, sep) {
  const out = []; let row = [], cel = "", aspas = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (aspas) {
      if (c === '"') { if (s[i + 1] === '"') { cel += '"'; i++; } else aspas = false; } else cel += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { row.push(cel); cel = ""; }
    else if (c === "\n") { row.push(cel); out.push(row); row = []; cel = ""; }
    else cel += c;
  }
  if (cel || row.length) { row.push(cel); out.push(row); }
  return out;
}

/** Que export é: STJ (as OS) ou STL (a mão de obra). */
export function tipoDaTabela(t) {
  const c = new Set(t.cab);
  if (c.has("Tipo Insumo") && c.has("Ordem")) return "STL";
  if (c.has("Ordem Serv.") && c.has("Bem")) return "STJ";
  return "";
}

export const COLUNAS = {
  STJ: ["Bem", "Nome do Bem", "Nome Serviço", "Ordem Serv.", "Término", "Situação", "R. Fim Man."],
  STL: ["Filial", "Ordem", "Tipo", "Tipo Insumo", "Código", "Nome Insumo", "Quantidade"],
};

// ── a montagem (montar.py) ───────────────────────────────────────────────────

/**
 * @param stj  as tabelas da STJ, a de hoje primeiro (a OS que vier em duas vale a primeira)
 * @param stl  as tabelas da STL (hoje e a histórica)
 * @param frotas os bens do PCM ("0433"…)
 * @param base a data do export (AAAA-MM-DD)
 * @param desde a partir de quando entram as finalizadas (o painel usa 2024-01-01)
 * @param ult0 o último dia de cada pessoa na STL antiga, que não vem mais
 */
export function montar({ stj, stl, frotas, base, desde = "2024-01-01", ult0 = {} }) {
  for (const t of stj) { const f = COLUNAS.STJ.filter((c) => !t.cab.includes(c)); if (f.length) throw new Error(`${t.nome}: faltam as colunas ${f.join(", ")} — peça o export com elas (todas as filiais).`); }
  for (const t of stl) { const f = COLUNAS.STL.filter((c) => !t.cab.includes(c)); if (f.length) throw new Error(`${t.nome}: faltam as colunas ${f.join(", ")}.`); }
  const nossas = new Set(frotas.map((n) => String(n).padStart(4, "0")));
  const osRows = [], nomesBem = new Map(), vistas = new Set(), canceladas = [];
  const colAbriu = new Map(stj.map((t) => [t, colunaDeQuemAbriu(t.cab)]));
  // o funil do Protheus ao painel (11/11/2026): cada linha lida e por que ficou de fora
  const aud = { linhasHoje: 0, linhasHist: 0, foraDaLista: 0, repetidasHoje: 0, repetidasHist: 0, canceladas: 0, semFim: 0, antesDe: 0 };
  let nStj = 0, repetidas = 0;
  for (const t of stj) for (const g of leitor(t)()) {
    nStj++;
    if (t.historica) aud.linhasHist++; else aud.linhasHoje++;
    const bem = txt(g("Bem")), equip = txt(g("Nome do Bem"));
    if (!nossas.has(bem)) { aud.foraDaLista++; continue; }
    const k = chaveOS(g("Filial"), g("Ordem Serv."));
    // a de hoje vem primeiro: repetida na base histórica é a mesma OS, que o export de hoje já trouxe
    if (vistas.has(k)) { repetidas++; if (t.historica) aud.repetidasHist++; else aud.repetidasHoje++; continue; }
    vistas.add(k);
    if (equip) nomesBem.set(bem, frase(equip));
    const sit = txt(g("Situação")), term = txt(g("Término"));
    if (sit === "Cancelado") {
      aud.canceladas++;
      canceladas.push({ filial: txt(g("Filial")), os: txt(g("Ordem Serv.")), frota: frota(bem), abertura: iso(g("Dt. Original")) });
      continue;
    }
    const fim = iso(g("R. Fim Man."));
    let st;
    if (term === "Sim") {
      if (!fim) { aud.semFim++; continue; }          // encerrada sem a data do fim: não há como saber quando saiu
      if (fim < desde) { aud.antesDe++; continue; }
      st = "Finalizada";
    } else st = sit === "Liberado" ? "Aberta" : "Pendente";
    const plano = txt(g("Plano Manut."));
    const [cat, classe] = g.tem("Categoria OS") ? categoria(g("Categoria OS")) : ["Sem categoria", "S"];
    osRows.push({ filial: txt(g("Filial")), os: txt(g("Ordem Serv.")), frota: frota(bem), bem,
      equipamento: frase(equip), servico: frase(txt(g("Nome Serviço"))),
      tipo: plano && plano !== "000000" ? "Preventiva" : "Corretiva",
      situacao: st, abertura: iso(g("Dt. Original")), finalizada_em: st === "Finalizada" ? fim : "",
      terceiro: txt(g("Terceiro")) === "Sim" ? "Sim" : "Não",
      categoria: cat, classe, liberada_em: g.tem("Dt.Liberacao") ? iso(g("Dt.Liberacao")) : "",
      obs: g.tem("Obs O.S") ? semDoc(txt(g("Obs O.S"))).slice(0, 500) : "", servico_cod: txt(g("Serviço")),
      contador: ["0", "1"].includes(txt(g("Contador"))) ? "" : txt(g("Contador")),
      ccusto: txt(g("Centro Custo")), inicio_man: iso(g("R. In. Man.")),
      prog_em: g.tem("P. In. Man.") ? iso(g("P. In. Man.")) : "",
      aberta_por: colAbriu.get(t) ? quemAbriu(g(colAbriu.get(t))) : "",
      // a OS que só veio da base histórica tem a situação do dia em que ela foi feita
      origem: t.historica ? "H" : "",
      // o fim real da manutenção da OS ainda aberta: serviço feito, OS não encerrada no Protheus
      fim_real: st === "Finalizada" ? "" : fim });
  }
  aud.consideradas = osRows.length;
  // quem abriu (11/11/2026): o nome da coluna achada na STJ de hoje, as partes que vieram sem ela e quantas OS têm
  const stjHoje = stj.filter((t) => !t.historica);
  aud.colunaQuemAbriu = stjHoje.map((t) => colAbriu.get(t)).find(Boolean) || "";
  aud.stjSemQuemAbriu = stjHoje.filter((t) => !colAbriu.get(t)).map((t) => t.nome);
  aud.comQuemAbriu = osRows.filter((r) => r.aberta_por).length;
  aud.daBaseHistorica = osRows.filter((r) => r.origem === "H").length;
  aud.abertasDaBaseHistorica = osRows.filter((r) => r.origem === "H" && r.situacao !== "Finalizada").length;
  aud.desde = desde;
  const chaves = new Set(osRows.map((r) => chaveOS(r.filial, r.os)));
  const gente = new Map();              // "filial|os" -> Map(código -> pessoa)
  const tercStl = new Set(), espec = new Map();
  const ultimo = new Map(Object.entries(ult0).map(([n, u]) => [n, { real: u.real || "", plan: u.plan || "" }]));
  let nStl = 0;
  for (const t of stl) for (const g of leitor(t)()) {
    nStl++;
    const ti = txt(g("Tipo Insumo"));
    const k = chaveOS(g("Filial"), g("Ordem"));
    if ((ti === "Terceiro" || ti === "Especialidade") && chaves.has(k)) {
      if (ti === "Terceiro") tercStl.add(k);
      else { if (!espec.has(k)) espec.set(k, new Set()); espec.get(k).add(frase(txt(g("Nome Insumo"))) || txt(g("Código"))); }
      continue;
    }
    if (ti !== "Mão de Obra") continue;
    // quem ainda trabalha: o último dia de cada pessoa na STL inteira, em qualquer OS
    const cod = txt(g("Código"));
    const quem = nome(txt(g("Nome Insumo"))) || `Funcionário ${cod}`;
    const diaU = iso(g("Data Início"));
    if (diaU && diaU <= base) {
      if (!ultimo.has(quem)) ultimo.set(quem, { real: "", plan: "" });
      const u = ultimo.get(quem), j = txt(g("Tipo")) === "REAL" ? "real" : "plan";
      if (diaU > u[j]) u[j] = diaU;
    }
    if (!chaves.has(k)) continue;
    if (!gente.has(k)) gente.set(k, new Map());
    const ps = gente.get(k);
    if (!ps.has(cod)) ps.set(cod, { nome: quem, real: false, h: 0, hp: 0, prevEm: "", realEm: "" });
    const e = ps.get(cod);
    const dia = diaU;
    if (txt(g("Tipo")) === "REAL") {
      e.real = true; e.h += num(g("Quantidade"));
      if (dia && (!e.realEm || dia < e.realEm)) e.realEm = dia;
    } else {
      e.hp += num(g("Quantidade"));
      if (dia && (!e.prevEm || dia < e.prevEm)) e.prevEm = dia;
    }
  }
  const r2 = (x) => Math.round(x * 100) / 100;
  const execRows = [];
  for (const k of [...gente.keys()].sort()) for (const e of gente.get(k).values()) {
    const [filial, os] = k.split("|");
    execRows.push({ filial, os, executante: e.nome, apontado: e.real ? "Sim" : "Não", horas: r2(e.h), horas_previstas: r2(e.hp),
      prevista_para: e.prevEm, apontada_em: e.realEm });
  }
  for (const r of osRows) {
    const k = chaveOS(r.filial, r.os), ps = gente.get(k);
    r.executantes = ps ? [...new Set([...ps.values()].map((e) => e.nome))].sort().join("; ") : "";
    r.terceiro_stl = tercStl.has(k) ? "Sim" : "Não";
    r.especialidade = espec.has(k) ? [...espec.get(k)].filter(Boolean).sort().join("; ") : "";
  }
  const frotasRows = [...nossas].map((b) => ({ frota: frota(b), bem: b, equipamento: nomesBem.get(b) || "" }))
    .sort((a, b) => (/^\d+$/.test(a.bem) ? Number(a.bem) : 1e9) - (/^\d+$/.test(b.bem) ? Number(b.bem) : 1e9));
  aud.linhasSTL = nStl;
  return { osRows, execRows, frotasRows, ultimo: Object.fromEntries(ultimo), base, nStj, nStl, repetidas, canceladas, auditoria: aud };
}

// ── o bloco de dados do painel (pagina.py) ───────────────────────────────────

const SIT = { Aberta: "A", Pendente: "P", Finalizada: "F" };
const ORDEM_CLASSE = "PNOS";
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** O que o painel lê: as OS em listas curtas e quem está em cada uma. */
export function dadosDoPainel(m, extra = {}) {
  const lista = [...m.osRows].sort((a, b) => cmp(a.frota, b.frota) || cmp(a.os, b.os));
  const equip = [...new Set(lista.map((r) => r.equipamento))].sort(cmp);
  const eq = new Map(equip.map((e, i) => [e, i]));
  const classe = new Map();
  for (const r of lista) classe.set(r.categoria || "Sem categoria", r.classe || "S");
  const cats = [...classe.keys()].sort((a, b) => ORDEM_CLASSE.indexOf(classe.get(a)) - ORDEM_CLASSE.indexOf(classe.get(b)) || cmp(a, b));
  const ic = new Map(cats.map((c, i) => [c, i]));
  const indice = new Map(lista.map((r, i) => [chaveOS(r.filial, r.os), i]));
  const quem = new Map();
  for (const e of m.execRows) {
    const i = indice.get(chaveOS(e.filial, e.os));
    if (i === undefined) continue;
    if (!quem.has(e.executante)) quem.set(e.executante, new Map());
    const l = quem.get(e.executante);
    if (!l.has(i)) l.set(i, [0, 0, "", ""]);            // horas apontadas, horas previstas, prevista para, apontada em
    const x = l.get(i);
    x[0] = Math.round((x[0] + (e.horas || 0)) * 100) / 100;
    x[1] = Math.round((x[1] + (e.horas_previstas || 0)) * 100) / 100;
    for (const [j, campo] of [[2, "prevista_para"], [3, "apontada_em"]]) if (e[campo] && (!x[j] || e[campo] < x[j])) x[j] = e[campo];
  }
  const nomes = [...quem.keys()].sort(cmp);
  const D = {
    base: m.base,
    ...extra,
    // [os, filial, frota, equipamento, serviço, abertura, situação A/P/F, fim, tipo C/P, Terceiro na STJ S/N,
    //  índice da categoria, liberada em, observação, código do serviço, contador, centro de custo, início da manutenção,
    //  insumo Terceiro na STL S/N, especialidade prevista na STL, programada para (P. In. Man. da STJ),
    //  aberta por (o CPF da Usr Inclusao), origem ("H": só veio da base histórica), fim real da manutenção da aberta]
    os: lista.map((r) => [r.os, r.filial, r.frota, eq.get(r.equipamento), r.servico, r.abertura, SIT[r.situacao],
      r.finalizada_em, r.tipo === "Preventiva" ? "P" : "C", r.terceiro === "Sim" ? "S" : "N",
      ic.get(r.categoria || "Sem categoria"), r.liberada_em || "", r.obs || "", r.servico_cod || "",
      r.contador || "", r.ccusto || "", r.inicio_man || "", r.terceiro_stl === "Sim" ? "S" : "N", r.especialidade || "", r.prog_em || "", r.aberta_por || "", r.origem || "", r.fim_real || ""]),
    cats,
    classe: cats.map((c) => classe.get(c)),
    equip,
    // nome -> [[índice da OS, horas apontadas, horas previstas, prevista para, apontada em], ...]
    exec: Object.fromEntries(nomes.map((n) => [n, [...quem.get(n).entries()].sort((a, b) => a[0] - b[0]).map(([i, x]) => [i, ...x])])),
    frotas_lista: m.frotasRows.map((f) => f.frota),
    // as canceladas (fora da carteira): [OS, filial, frota, abertura]; e o funil do Protheus ao painel
    canceladas: (m.canceladas || []).map((c) => [c.os, c.filial, c.frota, c.abertura]),
    auditoria: m.auditoria || null,
    // nome -> [último dia que apontou (REAL), último dia previsto (PLAN)], em toda a STL
    ult: Object.fromEntries(nomes.map((n) => [n, [(m.ultimo[n] || {}).real || "", (m.ultimo[n] || {}).plan || ""]])),
  };
  return D;
}

// ── conferir: o que mudou desde a base anterior (comparar_bases.py) ─────────

/** Antes de gravar: o que sumiu, fechou, abriu, e se alguma OS perdeu o
 *  executante (sinal de STL faltando parte). `antes` e `agora`: blocos D. */
export function comparar(antes, agora) {
  const chave = (a) => chaveOS(a[1], a[0]);
  const ka = new Map((antes ? antes.os : []).map((a, i) => [chave(a), [a, i]]));
  const kb = new Map(agora.os.map((a, i) => [chave(a), [a, i]]));
  const aberta = (a) => a[6] !== "F";
  const quemDe = (D) => { const q = new Map(); for (const l of Object.values(D.exec)) for (const [i] of l) q.set(i, (q.get(i) || 0) + 1); return q; };
  const qa = antes ? quemDe(antes) : new Map(), qb = quemDe(agora);
  const sumiram = [], fecharam = [], novas = [], perdeu = [];
  let reabertas = 0;
  for (const [k, [a, i]] of ka) {
    const b = kb.get(k);
    if (!b) { sumiram.push(a); continue; }
    if (aberta(a) && !aberta(b[0])) fecharam.push(b[0]);
    if (!aberta(a) && aberta(b[0])) reabertas++;
    if (qa.get(i) && !qb.get(b[1])) perdeu.push(b[0]);
  }
  for (const [k, [b]] of kb) if (!ka.has(k) && aberta(b)) novas.push(b);
  const conta = (D) => { const c = { A: 0, P: 0, F: 0 }; for (const a of D.os) c[a[6]]++; return c; };
  return { antes: antes ? { base: antes.base, n: antes.os.length, ...conta(antes) } : null, agora: { base: agora.base, n: agora.os.length, ...conta(agora) },
    sumiram, sumiramAbertas: sumiram.filter(aberta), fecharam, novas, reabertas, perdeuExecutante: perdeu, perdeuAbertas: perdeu.filter(aberta) };
}

// ── a base histórica ─────────────────────────────────────────────────────────

/** A base histórica: a STJ e a STL de antes do corte, a lista de frotas, o
 *  último dia de cada pessoa na STL antiga e os "principais do PCM" (nomes que
 *  não entram no código). Vem uma vez (arquivo .json.gz). */
export function lerSemente(obj) {
  if (!obj || obj.versao !== 1 || !obj.stj || !obj.stl || !Array.isArray(obj.frotas)) throw new Error("Este arquivo não é a base histórica do painel de OS.");
  return { corte: obj.corte, ate: obj.ate, feitoEm: obj.feito_em, frotas: obj.frotas, ult: obj.ult || {},
    principais: Array.isArray(obj.principais) ? obj.principais : [],
    stj: { nome: "STJ histórica", historica: true, cab: obj.stj.cab.map((c) => String(c).trim()), linhas: obj.stj.linhas },
    stl: { nome: "STL histórica", cab: obj.stl.cab.map((c) => String(c).trim()), linhas: obj.stl.linhas } };
}

/** O dia mais antigo e o mais novo de abertura (Dt. Original) numa STJ: para
 *  conferir que o export de hoje cobre o que a base histórica não cobre. */
export function janelaDaSTJ(t) {
  let de = "", ate = "";
  for (const g of leitor(t)()) {
    const d = iso(g("Dt. Original"));
    if (!d) continue;
    if (!de || d < de) de = d;
    if (!ate || d > ate) ate = d;
  }
  return { de, ate };
}
