// Testes do núcleo, fora do navegador.
//
//     node testes/rodar.js [caminho-da-planilha.xlsx]
//
// Roda em node porque é onde dá para conferir contra a planilha de verdade: um
// teste que só passa com dado inventado não prova que a carga funciona.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..");

// O site carrega a biblioteca de planilhas como script comum; aqui ela é
// injetada no global do mesmo jeito que o navegador faria.
const src = await readFile(resolve(RAIZ, "vendor/xlsx.mini.min.js"), "utf8");
new Function(src + "\nglobalThis.XLSX = XLSX;")();

const texto = await import("../js/texto.js");
const modelo = await import("../js/modelo.js");
const ev = await import("../js/eventos.js");
const imp = await import("../js/importar.js");
const pl = await import("../js/planilha.js");
const bk = await import("../js/backup.js");
const dados = await import("../js/dados.js");

let passou = 0, falhou = 0;
const falhas = [];

function ok(nome, cond, detalhe = "") {
  if (cond) { passou++; console.log(`  ok   ${nome}`); }
  else { falhou++; falhas.push(nome + (detalhe ? ` — ${detalhe}` : "")); console.log(`  FALHA ${nome}${detalhe ? " — " + detalhe : ""}`); }
}
function igual(nome, a, b) {
  ok(nome, JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
}
function titulo(t) { console.log(`\n${t}`); }

// Arquivo fingindo ser o File do navegador.
function arquivoFalso(caminho, bytes) {
  return {
    name: caminho.split("/").pop(),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => Buffer.from(bytes).toString("utf8"),
  };
}

// ── identidade de atividade ─────────────────────────────────────────────────
titulo("texto.js — a mesma atividade escrita de dois jeitos");

ok("'Realizar troca dos pneus' == 'Trocar pneus'",
  texto.mesmaAtividade("F-1", "Realizar troca dos pneus", "F-1", "Trocar pneus"));
ok("'Substituir amortecedor' == 'Trocar amortecedor'",
  texto.mesmaAtividade("F-1", "Substituir amortecedor", "F-1", "Trocar amortecedor"));
ok("lona LD ≠ lona LE",
  !texto.mesmaAtividade("F-1", "Substituir lona de freio dianteira LD",
    "F-1", "Substituir lona de freio dianteira LE"));
ok("2º eixo ≠ 3º eixo",
  !texto.mesmaAtividade("F-1", "Regular freio do 2 eixo", "F-1", "Regular freio do 3 eixo"));
ok("frota diferente nunca é a mesma atividade",
  !texto.mesmaAtividade("F-1", "Trocar pneus", "F-2", "Trocar pneus"));
ok("'recuperar' não é 'substituir'",
  !texto.mesmaAtividade("F-1", "Recuperar para-lama", "F-1", "Substituir para-lama"));
ok("o número de peça entre parênteses não muda a identidade",
  texto.mesmaAtividade("F-1", "Substituir farol LE avariado (peça 21035645)",
    "F-1", "Substituir farol LE avariado"));
igual("o núcleo tira o verbo de enchimento",
  texto.nucleo("Realizar troca de pneus").texto, "Trocar pneus");
igual("mas não quando quebraria a frase",
  texto.nucleo("Realizar lubrificação geral").texto, "Realizar lubrificação geral");

// ── datas e situação ────────────────────────────────────────────────────────
titulo("modelo.js — semana ISO, prazo e situação");

igual("segunda da semana 37 de 2026", modelo.iso(modelo.segundaISO(2026, 37)), "2026-09-07");
igual("semana ISO de 08/09/2026", modelo.semanaISO("2026-09-08"), { ano: 2026, semana: 37 });
igual("virada de ano: 31/12/2026 é semana 53", modelo.semanaISO("2026-12-31"), { ano: 2026, semana: 53 });
igual("01/01/2027 ainda é semana 53 de 2026", modelo.semanaISO("2027-01-01"), { ano: 2026, semana: 53 });

const base = { ...modelo.molde(), atividade: "X", frota: "F-1", ano: 2026, semana: 37, dia: "Qua", dias: 1 };
igual("serviço de 1 dia começa e termina no mesmo dia",
  [modelo.inicioDe(base), modelo.prazoDe(base)], ["2026-09-09", "2026-09-09"]);
igual("serviço de 3 dias termina dois dias depois",
  modelo.prazoDe({ ...base, dias: 3 }), "2026-09-11");
igual("antes de começar, Programada", modelo.situacaoDe(base, "2026-09-08"), "Programada");
igual("no último dia, Fecha hoje", modelo.situacaoDe(base, "2026-09-09"), "Fecha hoje");
igual("passou do prazo sem data, VENCIDA", modelo.situacaoDe(base, "2026-09-10"), "VENCIDA");
igual("concluída dentro do prazo",
  modelo.situacaoDe({ ...base, concluida_em: "2026-09-09" }), "Concluída");
igual("concluída depois do prazo",
  modelo.situacaoDe({ ...base, concluida_em: "2026-09-12" }), "Concluída com atraso");
igual("sem semana, está na carteira",
  modelo.situacaoDe({ ...base, semana: null, ano: null }, "2026-09-09"), "Na carteira");

// ── o log ───────────────────────────────────────────────────────────────────
titulo("eventos.js — o registro é o estado");

await ev.carregar();
const [criada] = await ev.aplicar(ev.criar({
  frota: "F-999", atividade: "Trocar pneus", servico: "Pneus", tipo: "Corretiva",
}));
const id = criada.alvo;
let a = ev.porId(id);
ok("criar põe a atividade na carteira", modelo.situacaoDe(a) === "Na carteira");

await ev.aplicar(ev.reprogramar(a, { ano: 2026, semana: 37, dia: "Qua", dias: 2 }));
a = ev.porId(id);
igual("primeira programação não conta como reprogramação",
  [a.semana, a.semana_orig, a.reprogramacoes], [37, 37, 0]);
igual("o evento gravado foi 'programada'", ev.historicoDe(id)[0].tipo, "programada");

let recusou = false;
try { ev.reprogramar(a, { ano: 2026, semana: 38, dia: "Seg", dias: 2 }, ""); }
catch (e) { recusou = true; }
ok("reprogramar sem motivo é recusado", recusou);

await ev.aplicar(ev.reprogramar(a, { ano: 2026, semana: 38, dia: "Seg", dias: 2 }, "Falta de peça"));
a = ev.porId(id);
igual("reprogramou: semana nova, original preservada, contador em 1",
  [a.semana, a.semana_orig, a.reprogramacoes, a.motivo], [38, 37, 1, "Falta de peça"]);
const h = ev.historicoDe(id)[0];
igual("o evento guarda de onde e para onde",
  [h.dados.de.semana, h.dados.para.semana], [37, 38]);

let recusouEdicao = false;
try { ev.editar(a, { semana: 40 }); } catch (e) { recusouEdicao = true; }
ok("editar não consegue mexer na semana pelas costas", recusouEdicao);

// A semana 38 começa em 14/09; com 2 dias, o prazo é 15/09.
await ev.aplicar(ev.concluir(a, "2026-09-15"));
a = ev.porId(id);
igual("concluída no prazo", modelo.situacaoDe(a), "Concluída");
await ev.aplicar(ev.concluir(a, "2026-09-25"));
igual("concluída depois do prazo", modelo.situacaoDe(ev.porId(id)), "Concluída com atraso");

const c = ev.conferir();
ok("tocar a fita de novo dá o mesmo estado", c.ok,
  JSON.stringify(c.divergencias.slice(0, 1)));

// ── a planilha de verdade ───────────────────────────────────────────────────
titulo("importar.js — a planilha da programação");

const caminho = process.argv[2] ||
  "/root/.claude/uploads/3a385572-107b-54f9-9b46-4352cfa98089/79ecac08-Programacao_Servicos_Makro_26.xlsx";
let abas = null;
try {
  abas = await pl.ler(arquivoFalso(caminho, await readFile(caminho)));
} catch (e) {
  console.log(`  (pulando: não achei a planilha em ${caminho})`);
}

if (abas) {
  ok("reconheceu a planilha da Makro", imp.ehPlanilhaMakro(abas));
  const { atividades, avisos, clientes } = imp.lerPlanilhaMakro(abas, 2026);
  igual("867 atividades", atividades.length, 867);
  igual("194 com data de conclusão", atividades.filter(x => x.concluida_em).length, 194);
  igual("11 canceladas", atividades.filter(x => x.cancelada).length, 11);
  igual("619 na carteira, sem semana", atividades.filter(x => !x.semana).length, 619);
  // 434, e não as 459 células preenchidas: 25 delas dizem "ABRIR OS", que é
  // recado e não ordem — o indicador de cobertura da planilha as contava.
  igual("434 com OS de verdade", atividades.filter(x => x.os).length, 434);
  igual("25 recados de 'abrir OS' separados",
    avisos.filter(x => x.tipo === "os_a_abrir").length, 25);
  ok("toda OS ficou com seis dígitos",
    atividades.every(x => [x.os, ...x.os_outras].every(o => !o || o.length === 6)));
  ok("a atividade que cobre três OS guardou as três",
    atividades.some(x => x.os_outras.length === 2));
  igual("77 frotas", new Set(atividades.map(x => x.frota).filter(Boolean)).size, 77);
  ok("achou o cliente de alguma frota", clientes.size > 0);
  console.log(`  · avisos de 'marcada sem data': ${avisos.length}`);

  // A carga inteira entra pelo log, como na tela — do zero, para o número
  // bater com o da planilha e não com o que os testes de cima deixaram.
  await dados.apagarTudo();
  await ev.carregar();
  await ev.aplicar(
    atividades.map(x => ev.criar(x, "planilha", caminho.split("/").pop())),
    { silencioso: true });
  igual("as 867 entraram pelo log", ev.lista().length, 867);
  const c2 = ev.conferir();
  ok("com a carga real, a fita continua fechando", c2.ok);

  // ── backup ida e volta ────────────────────────────────────────────────────
  titulo("backup.js — exportar, apagar, importar");
  const antes = bk.assinatura();
  const arquivo = JSON.parse(JSON.stringify(await bk.exportar()));
  await bk.restaurar(arquivo);
  igual("o backup volta idêntico", bk.assinatura() === antes, true);
  igual("e com as mesmas atividades", ev.lista().length, 867);

  // ── Protheus ──────────────────────────────────────────────────────────────
  titulo("importar.js — cruzamento com a base do Protheus");
  const atuais = ev.lista();
  // Uma OS que está aberta e cobre uma atividade só: é o caso limpo de baixa.
  const porOS = new Map();
  for (const x of atuais) if (x.os) porOS.set(x.os, (porOS.get(x.os) || 0) + 1);
  const comOS = atuais.find(x => x.os && !x.concluida_em && !x.cancelada &&
    porOS.get(x.os) === 1);
  const semOS = atuais.find(x => !x.os && !x.concluida_em && !x.cancelada &&
    x.atividade && x.frota);

  const cab = ["Ordem de Serviço", "Equipamento", "Descrição do Serviço",
    "Tipo Manutenção", "Status", "Dt Abertura", "Dt Encerramento"];
  const mapa = imp.sugerirMapa(cab);
  igual("adivinhou as colunas do export", [mapa.os, mapa.frota, mapa.atividade], [0, 1, 2]);

  const linhas = [cab,
    ["999001", "F-000", "Serviço que não existe aqui", "Corretiva", "Aberta", "01/09/2026", ""],
    [comOS.os, comOS.frota, comOS.atividade, "Corretiva", "Encerrada", "01/09/2026", "10/09/2026"],
    [comOS.os === "021188" ? "021189" : "021188", "F-XXX", "Qualquer coisa", "", "Aberta", "", ""],
    ["999002", semOS.frota, semOS.atividade, "Corretiva", "Aberta", "02/09/2026", ""],
    ["", "F-000", "Linha sem OS", "", "", "", ""],
  ];
  const regs = imp.lerProtheus(linhas, 0, mapa);
  const rec = imp.reconciliar(regs, atuais);
  ok("OS desconhecida entra como nova", rec.novas.some(x => x.os === "999001"));
  ok("OS conhecida e encerrada vira proposta de baixa",
    rec.baixas.some(x => x.reg.os === comOS.os));
  ok("mesma atividade sem OS vira proposta de vínculo",
    rec.vincular.some(x => x.reg.os === "999002" && x.atividade.id === semOS.id));
  ok("linha sem OS é separada e não some calada", rec.sem_os.length === 1);
  const div = rec.divergentes.length;
  console.log(`  · divergências de frota encontradas: ${div}`);
}

// ── CSV ─────────────────────────────────────────────────────────────────────
titulo("planilha.js — CSV");
igual("ponto e vírgula é reconhecido",
  pl.lerCSV("a;b;c\n1;2;3"), [["a", "b", "c"], ["1", "2", "3"]]);
igual("aspas protegem o separador",
  pl.lerCSV('a,b\n"x, y",2'), [["a", "b"], ["x, y", "2"]]);
igual("data brasileira vira ISO", pl.paraISO("26/08/2026"), "2026-08-26");
igual("data ISO fica ISO", pl.paraISO("2026-08-26"), "2026-08-26");
igual("OS curta ganha os zeros", imp.normalizarOS("7157"), "007157");
igual("OS de seis dígitos não muda", imp.normalizarOS("021188"), "021188");

console.log(`\n${passou} passaram, ${falhou} falharam`);
if (falhou) { for (const f of falhas) console.log(`  × ${f}`); process.exit(1); }
