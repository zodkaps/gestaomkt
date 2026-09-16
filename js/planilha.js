// Ler arquivo de planilha, sem saber o que ele significa.
//
// Este módulo só transforma XLSX ou CSV em linhas. Quem decide o que cada
// coluna quer dizer é o `importar.js` — a separação existe porque o formato do
// export do Protheus pode mudar sem que a leitura de arquivo mude nada.

/** Devolve [{ nome, linhas: [[célula, …], …] }] para cada aba. */
export async function ler(arquivo) {
  const nome = (arquivo.name || "").toLowerCase();
  if (nome.endsWith(".csv") || nome.endsWith(".txt") || nome.endsWith(".tsv")) {
    return [{ nome: arquivo.name, linhas: lerCSV(await arquivo.text()) }];
  }
  if (!globalThis.XLSX) throw new Error("A biblioteca de planilhas não carregou.");
  const buf = await arquivo.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  return wb.SheetNames.map(n => ({
    nome: n,
    linhas: XLSX.utils.sheet_to_json(wb.Sheets[n],
      { header: 1, raw: true, cellDates: true, defval: null, blankrows: true }),
  }));
}

/** CSV com vírgula ou ponto e vírgula, aspas e quebra de linha dentro do campo.
 *  O separador é adivinhado pela primeira linha: export brasileiro costuma vir
 *  com ponto e vírgula, e supor vírgula transformaria a linha inteira em uma
 *  coluna só. */
export function lerCSV(texto) {
  const t = texto.replace(/^﻿/, "");
  const primeira = t.slice(0, t.indexOf("\n") + 1 || t.length);
  const sep = (primeira.split(";").length > primeira.split(",").length) ? ";" : ",";
  const linhas = [];
  let campo = "", linha = [], aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++; } else aspas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') { aspas = true; continue; }
    if (c === sep) { linha.push(campo); campo = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; continue; }
    campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.map(l => l.map(v => (v === "" ? null : v)));
}

/** Onde está o cabeçalho. A planilha da programação tem título e subtítulo
 *  antes dele, então a primeira linha quase nunca é a certa; a linha com mais
 *  células preenchidas, entre as dez primeiras, é. */
export function acharCabecalho(linhas) {
  let melhor = 0, qtd = -1;
  for (let i = 0; i < Math.min(10, linhas.length); i++) {
    const n = (linhas[i] || []).filter(v => v != null && String(v).trim()).length;
    if (n > qtd) { qtd = n; melhor = i; }
  }
  return melhor;
}

export function texto(v) {
  if (v == null) return "";
  if (v instanceof Date) return paraISO(v);
  // Planilha do Google devolve OS como número: 21344.0 tem de virar "21344",
  // senão a casa decimal entra colada no campo.
  if (typeof v === "number" && Number.isInteger(v)) return String(v);
  return String(v).trim();
}

export function numero(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", ".").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Data em qualquer formato que um export cospe: objeto de data, serial do
 *  Excel, dd/mm/aaaa, aaaa-mm-dd. Devolve "AAAA-MM-DD" ou "". */
export function paraISO(v) {
  if (v == null || v === "") return "";
  if (v instanceof Date) {
    // Componentes locais de propósito: a biblioteca monta a data no fuso do
    // navegador, e converter para UTC aqui puxaria o dia 26 para o dia 25.
    const p = n => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  if (typeof v === "number") {                       // serial do Excel
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(s);
  if (m) {
    const ano = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return "";
}
