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
const pessoas = await import("../js/pessoas.js");
const nuvem = await import("../js/nuvem.js");

// Entrar, nos testes, sem um Supabase de verdade: finge a sessão e a cópia
// local da tabela `pessoas` — que é exatamente o caminho que o site percorre
// quando o celular está sem sinal. Testar por aí exercita o código real em vez
// de um atalho que só existe no teste.
const ELENCO = [
  { email: "mateus@makroteste.com.br", nome: "Mateus", papel: "pcm" },
  { email: "lucas@makroteste.com.br", nome: "Lucas", papel: "pcm" },
  { email: "pedro@makroteste.com.br", nome: "Pedro", papel: "operacao" },
  { email: "joao.victor@makroteste.com.br", nome: "João Victor", papel: "operacao" },
];
async function entrarComo(nome) {
  const p = ELENCO.find(x => x.nome === nome);
  await dados.gravarMeta("elenco", ELENCO);
  await dados.gravarMeta("sessao", {
    access_token: "token-de-teste", refresh_token: "r",
    expira_em: Date.now() + 3600e3, email: p.email, nome: p.nome,
  });
  await nuvem.carregarConfig();
  await pessoas.carregar();
}

// Nenhum teste fala com a rede. O `js/config.js` aponta para o projeto de
// verdade, e `aplicar()` tenta subir em segundo plano — sem este bloqueio,
// rodar os testes mandaria evento de mentira para o banco da equipe.
globalThis.fetch = async () => { throw new Error("rede bloqueada nos testes"); };

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

await dados.abrir();
await entrarComo("Mateus");
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
  "/root/.claude/uploads/3a385572-107b-54f9-9b46-4352cfa98089/6f140278-Programacao_Servicos_Makro_83_1.xlsx";
let abas = null;
try {
  abas = await pl.ler(arquivoFalso(caminho, await readFile(caminho)));
} catch (e) {
  console.log(`  (pulando: não achei a planilha em ${caminho})`);
}

if (abas) {
  ok("reconheceu a planilha da Makro", imp.ehPlanilhaMakro(abas));
  const { atividades, avisos, clientes } = imp.lerPlanilhaMakro(abas, 2026);
  igual("754 atividades", atividades.length, 754);
  igual("341 com data de conclusão", atividades.filter(x => x.concluida_em).length, 341);
  igual("31 canceladas", atividades.filter(x => x.cancelada).length, 31);
  // 263 é o mesmo número que a aba Hoje da planilha dele mostra em "na carteira".
  igual("263 na carteira",
    atividades.filter(x => !x.semana && !x.concluida_em && !x.cancelada).length, 263);
  // 434, e não as 459 células preenchidas: 25 delas dizem "ABRIR OS", que é
  // recado e não ordem — o indicador de cobertura da planilha as contava.
  igual("362 com OS", atividades.filter(x => x.os).length, 362);
  igual("2 recados de 'abrir OS' separados",
    avisos.filter(x => x.tipo === "os_a_abrir").length, 2);
  ok("toda OS ficou com seis dígitos",
    atividades.every(x => [x.os, ...x.os_outras].every(o => !o || o.length === 6)));
  igual("754 IDs, todos únicos", new Set(atividades.map(x => x.id)).size, 754);
  igual("640,5 HH somados",
    Math.round(atividades.reduce((s, x) => s + x.hh, 0) * 10) / 10, 640.5);
  igual("66 na oficina terceirizada",
    atividades.filter(x => x.oficina === "Terceirizada").length, 66);
  igual("25 categorias de HH",
    new Set(atividades.map(x => x.categoria_hh).filter(Boolean)).size, 25);
  igual("173 com motivo escrito", atividades.filter(x => x.motivo).length, 173);
  igual("64 frotas", new Set(atividades.map(x => x.frota).filter(Boolean)).size, 64);
  ok("achou o cliente de alguma frota", clientes.size > 0);
  console.log(`  · avisos de 'marcada sem data': ${avisos.length}`);

  // A carga inteira entra pelo log, como na tela — do zero, para o número
  // bater com o da planilha e não com o que os testes de cima deixaram.
  await dados.apagarTudo();
  await ev.carregar();
  await ev.aplicar(
    atividades.map(x => ev.criar(x, "planilha", caminho.split("/").pop())),
    { silencioso: true });
  igual("as 754 entraram pelo log", ev.lista().length, 754);
  const c2 = ev.conferir();
  ok("com a carga real, a fita continua fechando", c2.ok);

  // ── backup ida e volta ────────────────────────────────────────────────────
  titulo("backup.js — exportar, apagar, importar");
  const antes = bk.assinatura();
  const arquivo = JSON.parse(JSON.stringify(await bk.exportar()));
  await bk.restaurar(arquivo);
  igual("o backup volta idêntico", bk.assinatura() === antes, true);
  igual("e com as mesmas atividades", ev.lista().length, 754);

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


  // ── movimentações ─────────────────────────────────────────────────────────
  titulo("importar.js — movimentações");
  const { movimentacoes, divergencias } = imp.lerMovimentacoes(abas);
  igual("51 movimentações", movimentacoes.length, 51);
  const pt = modelo.pontualidade(movimentacoes, "2026-10-08");
  igual("33 entregues, 17 no prazo", [pt.entregues, pt.no_prazo], [33, 17]);
  igual("2 voltaram sem ninguém ter prometido data", pt.sem_promessa, 2);
  igual("18 ainda fora", pt.aguardando + pt.atrasadas, 18);
  igual("e a conta fecha com as 51",
    pt.entregues + pt.aguardando + pt.atrasadas, 51);
  ok("conta dias de frota perdidos", pt.dias_perdidos > 0);
  // A planilha traz a situação DIGITADA. Em vez de confiar ou descartar calado,
  // o importador lista o que discorda das datas — e essa lista não pode sumir.
  ok("lista o que a coluna digitada diz diferente das datas", divergencias.length > 0);
  console.log(`  · divergências entre a situação digitada e as datas: ${divergencias.length}`);

  const m1 = { ...modelo.moldeMovimentacao(), frota: "F-1",
    prometida_para: "2026-10-01", chegou_em: "2026-10-03" };
  igual("chegou depois do prometido", modelo.situacaoMovimentacao(m1), "Entregue com atraso");
  igual("e o atraso é de 2 dias", modelo.atrasoMovimentacao(m1), 2);
  const m2 = { ...modelo.moldeMovimentacao(), prometida_para: "2026-10-01" };
  igual("não voltou e o prazo passou", modelo.situacaoMovimentacao(m2, "2026-10-08"), "ATRASADA");
  igual("o atraso cresce contra hoje", modelo.atrasoMovimentacao(m2, "2026-10-08"), 7);

  // ── preventivas ───────────────────────────────────────────────────────────
  titulo("importar.js — preventivas e o aperto de mão");
  const { preventivas, mes } = imp.lerPreventivas(abas);
  igual("37 preventivas", preventivas.length, 37);
  igual("do mês Out-26", mes, "Out-26");
  igual("6 com 'disponível agora' separado da data",
    preventivas.filter(p => p.disponivel_agora).length, 6);
  igual("13 com data da operação",
    preventivas.filter(p => p.disponivel_em).length, 13);
  const espera = preventivas.filter(modelo.preventivaAberta)
    .reduce((m, p) => { const q = modelo.esperandoQuem(p) || "—"; m[q] = (m[q] || 0) + 1; return m; }, {});
  console.log("  · esperando:", JSON.stringify(espera));
  ok("a bola está dividida entre as duas áreas", espera["Operação"] > 0 && espera.PCM > 0);

  const p0 = { ...modelo.moldePreventiva(), frota: "F-9", vence: "2026-10-20" };
  igual("sem resposta da operação, a bola é dela", modelo.esperandoQuem(p0), "Operação");
  const p1 = { ...p0, disponivel_agora: true };
  igual("respondida, a bola passa para o PCM", modelo.esperandoQuem(p1), "PCM");
  const p2 = { ...p1, dia_parada: "2026-10-15" };
  igual("com parada marcada, ninguém está travando", modelo.esperandoQuem(p2), "");
  igual("e a situação é parada marcada", modelo.situacaoPreventiva(p2, "2026-10-08"), "Parada marcada");

  // ── reimportar não duplica ────────────────────────────────────────────────
  titulo("eventos.js — reimportar a mesma planilha");
  const antesDeReimportar = ev.lista().length;
  await ev.aplicar([
    ...atividades.map(x => ev.criar(x, "planilha", "de novo", "atividade")),
    ...movimentacoes.map(x => ev.criar(x, "planilha", "de novo", "movimentacao")),
    ...preventivas.map(x => ev.criar(x, "planilha", "de novo", "preventiva")),
  ], { silencioso: true });
  igual("continua com as mesmas atividades", ev.lista().length, antesDeReimportar);
  igual("e com as mesmas movimentações", ev.lista("movimentacao").length, 51);
  igual("e com as mesmas preventivas", ev.lista("preventiva").length, 37);
  ok("a fita continua fechando depois de reimportar", ev.conferir().ok);

  // ── quem pode o quê ───────────────────────────────────────────────────────
  titulo("pessoas.js — o que a operação faz e o que não faz");
  await entrarComo("Pedro");
  igual("Pedro é operação", pessoas.papel(), "operacao");

  const umaAberta = ev.lista().find(x => x.semana && !x.concluida_em && !x.cancelada);
  let barrou = "";
  try { ev.reprogramar(umaAberta, { ano: 2026, semana: 45, dia: "Seg", dias: 1 }, "qualquer"); }
  catch (e) { barrou = e.message; }
  ok("a operação não reprograma a oficina", !!barrou, barrou);
  let barrou2 = "";
  try { ev.concluir(umaAberta, "2026-10-08"); } catch (e) { barrou2 = e.message; }
  ok("nem dá baixa em serviço", !!barrou2, barrou2);

  const movAberta = ev.lista("movimentacao").find(modelo.movimentacaoAberta);
  await ev.aplicar(ev.chegou(movAberta, "2026-10-08"));
  igual("mas aponta a chegada da frota",
    ev.porId(movAberta.id, "movimentacao").chegou_em, "2026-10-08");
  igual("e o registro guarda que foi o Pedro",
    ev.historicoDe(movAberta.id)[0].autor, "Pedro");

  const prevSemData = ev.lista("preventiva").find(x => modelo.esperandoQuem(x) === "Operação");
  await ev.aplicar(ev.informarDisponibilidade(prevSemData, "agora"));
  igual("e informa quando a frota fica livre",
    modelo.esperandoQuem(ev.porId(prevSemData.id, "preventiva")), "PCM");
  let barrou3 = "";
  try { ev.marcarParada(ev.porId(prevSemData.id, "preventiva"), "2026-10-20"); }
  catch (e) { barrou3 = e.message; }
  ok("mas não marca o dia da parada", !!barrou3, barrou3);

  await entrarComo("Mateus");
  await ev.aplicar(ev.marcarParada(ev.porId(prevSemData.id, "preventiva"), "2026-10-20"));
  igual("o PCM marca, e aí ninguém está travando",
    modelo.esperandoQuem(ev.porId(prevSemData.id, "preventiva")), "");
  ok("a fita fecha com os três tipos de objeto dentro", ev.conferir().ok);

  // ── de quem é o atraso ────────────────────────────────────────────────────
  titulo("modelo.js — o atraso tem endereço");
  igual("peça não chegou é de suprimentos",
    modelo.areaDoMotivo("Peça não chegou"), "Suprimentos");
  igual("frota não chegou é da operação",
    modelo.areaDoMotivo("Frota não chegou na oficina"), "Operação");
  const ar = modelo.atrasoPorArea(ev.lista());
  ok("as áreas aparecem com contagem", Object.keys(ar.por).length >= 3,
    JSON.stringify(Object.keys(ar.por)));
  console.log("  · atraso por área:",
    JSON.stringify(Object.fromEntries(Object.entries(ar.por).map(([k, v]) => [k, v.total]))));

  // ── aderência e vazão são perguntas diferentes ───────────────────────────
  titulo("modelo.js — do que planejei × do que saiu");
  const ad41 = modelo.aderencia(ev.lista(), 2026, 41);
  const fn41 = modelo.fechadasNaSemana(ev.lista(), 2026, 41);
  const fn40 = modelo.fechadasNaSemana(ev.lista(), 2026, 40);
  console.log(`  · semana 41: aderência ${ad41.pct}% (${ad41.concluidas}/${ad41.programadas}), ` +
    `fechados na semana ${fn41.total}`);
  console.log(`  · semana 40: fechados na semana ${fn40.total}, ` +
    `sendo ${fn40.extras} extras e ${fn40.de_outras_semanas} de semanas anteriores`);
  ok("a vazão conta o extra que a aderência deixa de fora", fn40.extras > 0);
  ok("e enxerga o atrasado que fechou fora da semana dele", fn40.de_outras_semanas > 0);
  ok("aderência e vazão dão números diferentes na mesma semana",
    fn40.total !== ad41.concluidas);

  // ── carga em HH ───────────────────────────────────────────────────────────
  titulo("modelo.js — HH mede carga, não prazo");
  const cg = modelo.cargaHH(ev.lista(), 2026, 41);
  ok("a semana 41 tem HH somado", cg.total > 0, JSON.stringify(cg));
  ok("a terceirizada fica fora do total da equipe",
    cg.total === Math.round((cg.feito + cg.aberto) * 10) / 10,
    `${cg.total} ≠ ${cg.feito} + ${cg.aberto}`);
  ok("e diz quantas atividades estão sem HH estimado",
    Number.isInteger(cg.sem_estimativa) && cg.sem_estimativa <= cg.atividades,
    `${cg.sem_estimativa} de ${cg.atividades}`);
  const cg36 = modelo.cargaHH(ev.lista(), 2026, 36);
  ok("numa semana antiga, há atividade sem HH estimado", cg36.sem_estimativa > 0,
    JSON.stringify(cg36));
}

// ── nunca ficar trancado para fora ──────────────────────────────────────────
// Um problema de nuvem chegou a trancar a porta de um site que funciona sem
// nuvem: com o endereço no código, a única entrada era a senha do Supabase, e
// projeto fora do ar ou provedor desligado significava não entrar de jeito
// nenhum. Estas verificações cobrem as duas metades do conserto.
titulo("config.js e pessoas.js — nunca ficar trancado para fora");
const cfg = await import("../js/config.js");
igual("quem digita o e-mail entra com ele",
  cfg.emailDe("mateusedvaoli@gmail.com"), "mateusedvaoli@gmail.com");
igual("e o e-mail digitado com maiúscula e espaço também",
  cfg.emailDe("  Mateus@Gmail.com "), "mateus@gmail.com");
// A primeira versão inventava pedro@makro.local para quem digitasse "Pedro".
// O Supabase recusa domínio de teste, e foi isso que barrou a equipe.
igual("nome não vira e-mail inventado", cfg.emailDe("Pedro"), "");
ok("o domínio que barrou a equipe é reconhecido como de teste",
  cfg.dominioDeTeste("pedro@makro.local") && cfg.dominioDeTeste("a@b.test") &&
  cfg.dominioDeTeste("a@example.com"));
ok("e e-mail de verdade não é", !cfg.dominioDeTeste("lucas.souza@makroengenharia.com") &&
  !cfg.dominioDeTeste("mateusedvaoli@gmail.com"));

// Pelo nome, só num aparelho que já conhece a equipe — e sem adivinhar.
await dados.gravarMeta("elenco", [...ELENCO,
  { email: "mateus@makro.local", nome: "Mateus", papel: "pcm" },     // sobra morta
  { email: "lucas@outro.com.br", nome: "Lucas", papel: "pcm" }]);   // dois e-mails
igual("pelo nome acha o e-mail, ignorando sobra com domínio de teste",
  await pessoas.emailPorNome("mateus"), "mateus@makroteste.com.br");
igual("acento não atrapalha", await pessoas.emailPorNome("joao victor"),
  "joao.victor@makroteste.com.br");
igual("nome com dois e-mails não adivinha: pede o e-mail",
  await pessoas.emailPorNome("Lucas"), "");
igual("nome que o aparelho não conhece também não", await pessoas.emailPorNome("Fulano"), "");
await dados.gravarMeta("elenco", ELENCO);

const antesDaFila = await ev.autoresNaFila();
const naFila = (lista, n) => (lista.find(a => a.autor === n) || { quantos: 0 }).quantos;
const pedroAntes = naFila(antesDaFila, "Pedro");

await nuvem.sair();                 // é este o estado de um projeto fora do ar
await pessoas.carregar();
ok("sem sessão e sem ninguém escolhido, não há quem", !pessoas.quem());

await pessoas.entrarLocal("Pedro");
ok("quem escolhe o nome entra, mesmo sem banco", pessoas.local());
igual("e o papel vem da lista de sempre", pessoas.papel(), "operacao");
ok("a operação continua não programando a oficina", !pessoas.pode("programar"));
ok("mas aponta movimentação como sempre", pessoas.pode("movimentar"));

const movLocal = await ev.aplicar(ev.pedirMovimentacao({
  frota: "F-LOCAL", motivo_mov: "teste do modo local" }));
igual("o lançamento feito sem senha é assinado por quem o fez",
  movLocal[0].autor, "Pedro");
igual("e fica na fila, esperando a senha dele",
  naFila(await ev.autoresNaFila(), "Pedro"), pedroAntes + 1);

const tentativa = await ev.sincronizar();
ok("a fila não sobe sem senha, e a resposta diz por quê e de quem é",
  tentativa.subiram === 0 && /senha/i.test(tentativa.erro) &&
  tentativa.esperando.some(a => a.autor === "Pedro"), JSON.stringify(tentativa));

await pessoas.carregar();
ok("ao reabrir o site, continua sendo a mesma pessoa",
  pessoas.local() && pessoas.nome() === "Pedro");
igual("e o nome guardado é de quem a senha será pedida",
  await pessoas.nomeLocalGuardado(), "Pedro");

let recusouLocal = "";
try { await pessoas.entrarLocal("Fulano"); } catch (e) { recusouLocal = e.message; }
ok("nome de fora da equipe não entra nem local", !!recusouLocal, recusouLocal);

await pessoas.sair();
ok("sair apaga a escolha deste aparelho",
  !pessoas.quem() && !(await pessoas.nomeLocalGuardado()));

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
