// O site tem de dar o MESMO número que a planilha.
//
//     node testes/resultados.mjs [caminho-da-planilha.xlsx]
//
// Importa a planilha do jeito que a tela Importar importa e confere, linha por
// linha, cada número das abas Resultados e Semana contra o valor que a própria
// planilha calculou e deixou gravado no arquivo. Nada aqui é número escrito à
// mão: se a planilha mudar, o teste muda junto — e se o site divergir dela, ele
// aponta qual linha.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = await readFile(resolve(RAIZ, "vendor/xlsx.mini.min.js"), "utf8");
new Function(src + "\nglobalThis.XLSX = XLSX;")();
globalThis.fetch = async () => { throw new Error("rede bloqueada nos testes"); };

const M = await import("../js/modelo.js");
const ev = await import("../js/eventos.js");
const imp = await import("../js/importar.js");
const pl = await import("../js/planilha.js");
const dados = await import("../js/dados.js");

const caminho = process.argv[2] ||
  "/root/.claude/uploads/3a385572-107b-54f9-9b46-4352cfa98089/f239cce9-Programacao_Servicos_Makro_83_2.xlsx";

let passou = 0, falhou = 0;
const ok = (nome, cond, detalhe = "") => {
  console.log(`  ${cond ? "ok   " : "FALHA"} ${nome}${!cond && detalhe ? " — " + detalhe : ""}`);
  cond ? passou++ : falhou++;
};

let bytes;
try { bytes = await readFile(caminho); }
catch (e) { console.log(`(pulando: não achei ${caminho})`); process.exit(0); }
const abas = await pl.ler({
  name: caminho.split("/").pop(),
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
});
const aba = n => (abas.find(a => a.nome === n) || {}).linhas;
const res = aba("Resultados"), sem = aba("Semana"), hoje = aba("Hoje");
if (!res || !sem || !hoje) { console.log("(pulando: a planilha não tem Resultados/Semana/Hoje)"); process.exit(0); }

// A célula como a planilha deixou: "B13" → linha 13, coluna B.
const celula = (linhas, ref) => {
  const [, col, lin] = /^([A-Z]+)(\d+)$/.exec(ref);
  const c = [...col].reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return (linhas[Number(lin) - 1] || [])[c];
};
const isoDe = v => v instanceof Date
  ? new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())).toISOString().slice(0, 10)
  : String(v).slice(0, 10);

const semana = Number(celula(res, "B3"));
const ref = isoDe(celula(hoje, "L1"));            // o "hoje" com que a planilha calculou
const ano = Number(celula(sem, "J3")) || 2026;

await dados.abrir();
await dados.apagarTudo();
await ev.carregar();
const { atividades, avisos } = imp.lerPlanilhaMakro(abas, ano);
// A ÚNICA diferença de propósito: célula de OS escrita "ABRIR OS" é recado, não
// ordem de serviço. A planilha conta como "com OS" (a célula não está vazia); o
// site não. Contamos quantas são para o teste dizer isso em vez de esconder.
const recados = avisos.filter(x => x.tipo === "os_a_abrir").length;
await ev.aplicar(atividades.map(x => ev.criar(x, "planilha", "teste")), { silencioso: true });
const ats = ev.lista();

console.log(`\nResultados da semana ${semana}/${ano}, como a planilha calculou em ${ref}`);
const r = M.resultados(ats, ano, semana, ref);

// [célula, campo, rótulo] — na ordem em que aparecem na aba Resultados.
const LINHAS = [
  ["B13", "plano", "Atividades do plano"],
  ["B14", "extra", "Extra programação"],
  ["B15", "concluidas_plano", "Concluídas do plano"],
  ["B16", "total", "Total interno"],
  ["B17", "extras_concluidas", "Extras concluídas"],
  ["B18", "concluidas", "Total concluído"],
  ["B20", "aderencia", "Aderência à programação"],
  ["B21", "cumprimento", "Cumprimento geral"],
  ["B22", "parte_extra", "Quanto da semana foi extra"],
  ["B23", "no_prazo", "Concluídas no prazo"],
  ["B24", "pontualidade", "Pontualidade"],
  ["B25", "aderencia_original", "Aderência ao plano original"],
  ["B26", "sairam", "Saíram desta semana"],
  ["B27", "vencidas", "Vencidas"],
  ["B28", "reprogramadas", "Atividades reprogramadas"],
  ["B29", "atraso_medio", "Atraso médio, quando atrasa"],
  ["B31", "por_dia", "Diária — atividades por dia útil"],
  ["B32", "saiu_por_dia", "Diária do que saiu"],
  ["B33", "hh", "Soma das estimativas"],
  ["B35", "terceirizada", "Em empresa terceirizada"],
  ["B36", "canceladas", "Canceladas"],
  ["B37", "carteira", "Na carteira, sem dia"],
  ["B39", "corretiva", "Corretiva na semana"],
  ["B40", "preventiva", "Preventiva na semana"],
  ["B41", "inspecao", "Inspeção na semana"],
  ["B42", "pct_preventiva", "% preventiva na semana"],
  ["B43", "corretiva_acervo", "Corretiva no acervo"],
  ["B44", "preventiva_acervo", "Preventiva no acervo"],
  ["B45", "pct_preventiva_acervo", "% preventiva no acervo"],
  ["B47", "com_os", "Com OS na semana"],
  ["B48", "sem_os", "Sem OS na semana"],
  ["B49", "cobertura_os", "Cobertura na semana"],
  ["B50", "com_os_acervo", "Com OS no acervo"],
  ["B51", "sem_os_acervo", "Sem OS no acervo"],
  ["B52", "cobertura_os_acervo", "Cobertura no acervo"],
];

const perto = (a, b) => {
  const x = a == null || a === "" ? null : Number(a);
  const y = b == null || b === "" ? null : Number(b);
  if (x == null || y == null) return (x ?? 0) === (y ?? 0);
  return Math.abs(x - y) < 0.0005;
};
const mostra = v => v == null ? "—" : (Number.isInteger(v) ? String(v) : Number(v).toFixed(4));

// No acervo, o "com OS" da planilha inclui as células de recado.
const ajuste = {
  com_os_acervo: v => v - recados,
  sem_os_acervo: v => v + recados,
  cobertura_os_acervo: () => r.com_os_acervo / (r.com_os_acervo + r.sem_os_acervo),
};

for (const [cel, campo, rot] of LINHAS) {
  const lido = celula(res, cel);
  const planilha = ajuste[campo] ? ajuste[campo](Number(lido)) : lido;
  const nota = ajuste[campo] ? ` (planilha ${mostra(lido)}, menos ${recados} "ABRIR OS")` : "";
  ok(`${rot.padEnd(36)} planilha ${mostra(planilha).padStart(7)} · site ${mostra(r[campo])}${nota}`,
    perto(planilha, r[campo]), `${cel}`);
}

console.log(`\nSemana em HH`);
const h = M.semanaEmHH(ats, ano, semana);
for (const [cel, campo, rot] of [
  ["A10", "hh_plano", "HH programado"],
  ["C10", "aderencia_hh", "Aderência em HH"],
  ["A13", "hh_extra", "HH extra"],
  ["C13", "hh_plano_feito", "HH concluído do plano"],
]) {
  const planilha = celula(sem, cel);
  ok(`${rot.padEnd(36)} planilha ${mostra(planilha).padStart(7)} · site ${mostra(h[campo])}`,
    perto(planilha, h[campo]), cel);
}

// Carga por pessoa: só quem a planilha lista com HH na semana.
for (let lin = 18; lin <= 31; lin++) {
  const nome = celula(sem, `A${lin}`);
  const totalPlanilha = Number(celula(sem, `H${lin}`)) || 0;
  if (!nome || !totalPlanilha) continue;
  const p = h.carga.find(x => x.nome === nome);
  ok(`HH de ${String(nome).padEnd(29)} planilha ${mostra(totalPlanilha).padStart(7)} · site ${mostra(p && p.total)}`,
    p && Math.abs(p.total - totalPlanilha) < 0.05, `A${lin}`);
}

// ── a aba Preventivas ───────────────────────────────────────────────────────
const abaPrev = abas.find(a => /^Preventivas/.test(a.nome));
if (abaPrev) {
  console.log(`\n${abaPrev.nome}`);
  const { preventivas, fora } = imp.lerPreventivas(abas);
  const rp = M.resumoPreventivas([...preventivas, ...fora], ref);
  const linhas = abaPrev.linhas;
  for (const [cel, campo, rot] of [
    ["A4", "preventivas", "Preventivas a fazer no mês"],
    ["C4", "frotas", "Frotas"],
    ["E4", "com_data", "Com data da operação"],
    ["G4", "sem_data", "Sem data da operação"],
    ["I4", "parada_marcada", "Parada marcada"],
    ["K4", "conflitos", "Conflitos de data"],
    ["M4", "vencidas", "Vencidas"],
    ["O4", "realizadas", "Realizadas"],
    ["Q4", "hh", "HH previsto"],
  ]) {
    const planilha = celula(linhas, cel);
    ok(`${rot.padEnd(36)} planilha ${mostra(planilha).padStart(7)} · site ${mostra(rp[campo])}`,
      perto(planilha, rp[campo]), cel);
  }
  // A coluna Situação, linha a linha.
  const iCab = linhas.findIndex(L => (L || [])[0] === "Frota");
  const cs = (linhas[iCab] || []).findIndex(t => String(t || "").trim() === "Situação");
  const diferentes = preventivas.filter(p => {
    const L = linhas.find(x => x && x[0] === p.frota);
    return L && L[cs] !== M.situacaoPreventiva(p, ref);
  });
  ok(`Situação igual nas ${preventivas.length} linhas do plano`, !diferentes.length,
    diferentes.map(p => p.frota).join(", "));
}

// ── a aba Movimentações ─────────────────────────────────────────────────────
const abaMov = abas.find(a => a.nome === "Movimentações");
if (abaMov) {
  console.log(`\nMovimentações`);
  const { movimentacoes } = imp.lerMovimentacoes(abas);
  const pt = M.pontualidade(movimentacoes, ref);
  for (const [cel, campo, rot] of [
    ["A4", "total", "Movimentações"],
    ["C4", "concluidas", "Concluídas (entregues)"],
    ["D4", "no_prazo", "No prazo"],
    ["E4", "pct", "Pontualidade da operação"],
    ["G4", "atraso_medio", "Atraso médio"],
    ["I4", "dias_perdidos", "Dias perdidos"],
  ]) {
    const planilha = celula(abaMov.linhas, cel);
    ok(`${rot.padEnd(36)} planilha ${mostra(planilha).padStart(7)} · site ${mostra(pt[campo])}`,
      perto(planilha, pt[campo]), cel);
  }
}

console.log(`\n${passou} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);
