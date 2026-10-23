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
  // As contas da planilha: concluída sem prazo prometido conta como no prazo.
  igual("33 concluídas, 19 no prazo (como a planilha)", [pt.concluidas, pt.no_prazo], [33, 19]);
  igual("48 dias perdidos (como a planilha)", pt.dias_perdidos, 48);
  igual("2 voltaram sem ninguém ter prometido data", pt.sem_promessa, 2);
  igual("18 ainda fora", pt.aguardando + pt.atrasadas, 18);
  igual("e a conta fecha com as 51",
    pt.concluidas + pt.aguardando + pt.atrasadas, 51);
  ok("e os dias das atrasadas em aberto aparecem à parte", pt.dias_correndo > 0);
  // A planilha traz a situação DIGITADA. Em vez de confiar ou descartar calado,
  // o importador lista o que discorda das datas — e essa lista não pode sumir.
  ok("lista o que a coluna digitada diz diferente das datas", divergencias.length > 0);
  console.log(`  · divergências entre a situação digitada e as datas: ${divergencias.length}`);

  ok("o que a planilha diz que chegou entra aprovado (é o registro do PCM)",
    movimentacoes.filter(x => x.chegou_em).every(x => x.aprovada));
  {
    // O banco de hoje tem movimentações importadas antes da aprovação existir:
    // sem o campo, a concluída na planilha também conta como aprovada.
    const velha = { ...movimentacoes.find(x => x.chegou_em) };
    delete velha.aprovada;
    const m0 = ev.reconstruir([{ id: "x1", ts: "2026-10-09T10:00:00Z", tipo: "importada",
      alvo: "M-VELHA", alvo_tipo: "movimentacao", dados: velha }]).movimentacao.get("M-VELHA");
    igual("importação antiga: concluída na planilha aparece Concluída, não 'aguardando'",
      modelo.situacaoMovimentacao(m0).startsWith("Concluída"), true);
  }
  ok("e a troca de nome não vira divergência (Entregue → Concluída)",
    !divergencias.some(d => modelo.situacaoMovNova(d.escrita) === d.calculada));

  const m1 = { ...modelo.moldeMovimentacao(), frota: "F-1",
    prometida_para: "2026-10-01", chegou_em: "2026-10-03" };
  igual("concluída e ainda não conferida", modelo.situacaoMovimentacao(m1), "Aguardando aprovação");
  igual("aprovada depois do prometido", modelo.situacaoMovimentacao({ ...m1, aprovada: true }),
    "Concluída com atraso");
  igual("aprovada no prazo", modelo.situacaoMovimentacao({ ...m1, aprovada: true,
    chegou_em: "2026-10-01" }), "Concluída");
  igual("e o atraso é de 2 dias", modelo.atrasoMovimentacao(m1), 2);
  const m2 = { ...modelo.moldeMovimentacao(), prometida_para: "2026-10-01" };
  igual("não concluiu e o prazo passou", modelo.situacaoMovimentacao(m2, "2026-10-08"), "Atrasada");
  igual("vence hoje", modelo.situacaoMovimentacao(m2, "2026-10-01"), "Vence hoje");
  igual("antes do prazo, em aberto", modelo.situacaoMovimentacao(m2, "2026-09-30"), "Em aberto");
  igual("sem data prometida, sem prazo",
    modelo.situacaoMovimentacao(modelo.moldeMovimentacao()), "Sem prazo");
  igual("o atraso cresce contra hoje", modelo.atrasoMovimentacao(m2, "2026-10-08"), 7);

  // ── preventivas ───────────────────────────────────────────────────────────
  titulo("importar.js — preventivas e o aperto de mão");
  const { preventivas: noPlano, fora: foraDoPlano, mes } = imp.lerPreventivas(abas);
  // A aba tem duas tabelas: o plano e, no pé, o quadro "FORA DO PLANO". Ler
  // tudo como uma tabela só dava 37 — com o título do quadro virando frota.
  igual("29 linhas no plano do mês", noPlano.length, 29);
  igual("e 7 frotas no quadro de fora", foraDoPlano.length, 7);
  ok("o título do quadro não vira frota",
    ![...noPlano, ...foraDoPlano].some(p => /fora do plano/i.test(p.frota)));
  const rp = modelo.resumoPreventivas([...noPlano, ...foraDoPlano], "2026-10-08");
  igual("33 preventivas a fazer, como no alto da aba", rp.preventivas, 33);
  igual("em 25 frotas", rp.frotas, 25);
  igual("8 passam para o mês seguinte (Status Reprogramada)", rp.reprogramadas, 8);
  igual("4 em andamento (Status)", rp.em_andamento, 4);
  igual("ID pela frota e pelo mês, não pela linha", noPlano[0].id, "P-Out-26-F-745");
  const preventivas = [...noPlano, ...foraDoPlano];
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
  // a parada no futuro, sempre: com data fixa o teste vencia junto com o calendário
  const p2 = { ...p1, dia_parada: modelo.somaDias(modelo.hoje(), 5) };
  igual("com parada marcada, ninguém está travando", modelo.esperandoQuem(p2), "");
  igual("e a situação é Programada, como na planilha", modelo.situacaoPreventiva(p2, "2026-10-08"), "Programada");

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
  igual("e com as mesmas preventivas", ev.lista("preventiva").length, 36);
  ok("a fita continua fechando depois de reimportar", ev.conferir().ok);

  // ── preventivas casam pela frota, não pela linha ──────────────────────────
  titulo("importar.js — preventiva casa pela frota");
  {
    const existentes = [...ev.estado.preventiva.values()];
    // A planilha ganha uma linha nova no TOPO do plano: tudo desce uma linha.
    const aba = abas.find(a => /^Preventivas/.test(a.nome));
    const iCab = aba.linhas.findIndex(L => (L || [])[0] === "Frota");
    const comLinhaNova = abas.map(a => a !== aba ? a : { ...a, linhas: [
      ...a.linhas.slice(0, iCab + 1), ["F-999", "Cavalo", "Matriz", "1 ano", 1],
      ...a.linhas.slice(iCab + 1)] });
    const r2 = imp.lerPreventivas(comLinhaNova, existentes);
    const idDe = f => (r2.preventivas.find(p => p.frota === f) || {}).id;
    igual("a F-745 continua com o mesmo ID", idDe("F-745"),
      existentes.find(p => p.frota === "F-745").id);
    igual("a nova ganha o seu", idDe("F-999"), "P-Out-26-F-999");
    igual("e ninguém sai do mapa", r2.sairam.length, 0);

    // O banco de hoje tem IDs pela posição (P-0001…) e a linha-título do
    // quadro de fora (P-0030) como se fosse frota.
    const velhas = [...noPlano, { ...modelo.moldePreventiva(), mes: "Out-26",
      frota: "FORA DO PLANO DE OUTUBRO  ·  não entram na conta acima" }, ...foraDoPlano]
      .map((p, i) => ({ ...p, fonte: "x.xlsx", id: `P-${String(i + 1).padStart(4, "0")}` }));
    const r3 = imp.lerPreventivas(abas, velhas);
    igual("reaproveita o ID que a F-745 já tinha", r3.preventivas[0].id, "P-0001");
    igual("a frota de fora reaproveita o dela", r3.fora.find(p => p.frota === "F-818").id,
      velhas.find(p => p.frota === "F-818").id);
    igual("só a linha-título sai do mapa", r3.sairam.map(p => p.id), ["P-0030"]);
  }

  // ── reimportar não apaga o que foi lançado no site ────────────────────────
  // Planilha e site convivem: ele reimporta a planilha enquanto a equipe
  // aponta no site. Antes, a importação mais recente passava por cima de tudo —
  // a chegada da frota e a baixa dadas no site sumiam, porque a planilha não
  // sabia delas.
  titulo("eventos.js — reimportar respeita o que foi lançado no site");
  await entrarComo("Mateus");
  const movAberta1 = ev.lista("movimentacao").find(modelo.movimentacaoAberta);
  const ativAberta = ev.lista().find(x => x.semana && modelo.aberta(x));
  const ativOutra = ev.lista().find(x => modelo.aberta(x) && x.id !== ativAberta.id);
  await ev.aplicar([ev.chegou(movAberta1, "2026-10-09"), ev.concluir(ativAberta, "2026-10-08")]);
  const planilhaMudada = atividades.map(x => x.id === ativOutra.id
    ? { ...x, atividade: x.atividade + " (corrigido na planilha)" } : x);
  await ev.aplicar([
    ...planilhaMudada.map(x => ev.criar(x, "planilha", "terceira vez", "atividade")),
    ...movimentacoes.map(x => ev.criar(x, "planilha", "terceira vez", "movimentacao")),
  ], { silencioso: true });
  igual("a chegada apontada no site continua lá",
    ev.porId(movAberta1.id, "movimentacao").chegou_em, "2026-10-09");
  igual("a baixa dada no site continua lá", ev.porId(ativAberta.id).concluida_em, "2026-10-08");
  ok("e o que mudou na planilha, e o site nunca mexeu, entra",
    ev.porId(ativOutra.id).atividade.endsWith("(corrigido na planilha)"));
  ok("a fita fecha com planilha e site misturados", ev.conferir().ok);

  // ── excluir e desfazer ────────────────────────────────────────────────────
  // Excluir é do PCM, em qualquer tipo; a exclusão some das telas, mas o
  // registro fica e o que foi excluído volta com o mesmo conteúdo.
  titulo("eventos.js — excluir e desfazer a exclusão");
  await entrarComo("Mateus");
  const alvoExcl = ev.lista().find(x => x.semana && modelo.aberta(x) && !x.cancelada);
  const antesExcl = ev.lista().length;
  await ev.aplicar(ev.excluir(alvoExcl, "teste de exclusão"));
  igual("excluída some das telas", ev.lista().length, antesExcl - 1);
  igual("mas continua no estado, marcada", ev.porId(alvoExcl.id).excluida, true);
  await ev.aplicar(ev.reincluir(alvoExcl));
  igual("desfazer a exclusão devolve a atividade", ev.lista().length, antesExcl);
  igual("e ela volta sem perder nada", ev.porId(alvoExcl.id).atividade, alvoExcl.atividade);
  await entrarComo("Pedro");
  let barrouExcl = "";
  try { ev.excluir(alvoExcl, "x", "atividade"); } catch (e) { barrouExcl = e.message; }
  ok("a operação não exclui nada", !!barrouExcl, barrouExcl);
  let barrouMov = "";
  const movExcl = ev.lista("movimentacao").find(modelo.movimentacaoAberta);
  try { ev.excluir(movExcl, "x", "movimentacao"); } catch (e) { barrouMov = e.message; }
  ok("nem exclui movimentação — só cancela", !!barrouMov, barrouMov);
  await entrarComo("Mateus");

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
  igual("mas conclui a movimentação",
    ev.porId(movAberta.id, "movimentacao").chegou_em, "2026-10-08");
  igual("e o registro guarda que foi o Pedro",
    ev.historicoDe(movAberta.id)[0].autor, "Pedro");
  igual("concluída pela operação, espera o PCM aprovar",
    modelo.situacaoMovimentacao(ev.porId(movAberta.id, "movimentacao")), "Aguardando aprovação");
  ok("e entra na fila de aprovação",
    modelo.movimentacaoParaAprovar(ev.porId(movAberta.id, "movimentacao")));
  // Um "editada" (que a operação pode gravar) não serve de atalho para aprovar.
  await ev.aplicar({ tipo: "editada", alvo: movAberta.id, alvo_tipo: "movimentacao",
    dados: { de: {}, para: { aprovada: true, aprovada_por: "Pedro" } } });
  ok("editar não aprova — aprovar é só do PCM",
    modelo.movimentacaoParaAprovar(ev.porId(movAberta.id, "movimentacao")));
  const [criadaJa] = await ev.aplicar(ev.pedirMovimentacao({ frota: "F-ATALHO",
    chegou_em: "2026-10-08", aprovada: true }));
  ok("nem criar uma já aprovada",
    !ev.porId(criadaJa.alvo, "movimentacao").aprovada);
  // A solicitação diz o que fazer, onde e com que prioridade — e muda depois.
  const [pedida] = await ev.aplicar(ev.pedirMovimentacao({ frota: "F-EDITA", acao: "Coletar",
    destino: "Cardan Service", prioridade: "Média", para_que: "peça do câmbio" }));
  const antesEd = ev.porId(pedida.alvo, "movimentacao");
  igual("a solicitação guarda o que fazer, onde e a prioridade",
    [antesEd.acao, antesEd.destino, antesEd.prioridade], ["Coletar", "Cardan Service", "Média"]);
  await ev.aplicar(ev.editar(antesEd,
    { acao: "Realizar TOP", destino: "Box de óleo", prioridade: "Alta", para_que: "peça do câmbio" }, "movimentacao"));
  const depoisEd = ev.porId(pedida.alvo, "movimentacao");
  igual("a operação edita a solicitação depois de criada",
    [depoisEd.acao, depoisEd.destino, depoisEd.prioridade, depoisEd.para_que],
    ["Realizar TOP", "Box de óleo", "Alta", "peça do câmbio"]);
  igual("e só o que mudou vai para o registro",
    Object.keys(ev.historicoDe(pedida.alvo)[0].dados.para).sort(), ["acao", "destino", "prioridade"]);
  ok("editar sem mudar nada não grava",
    ev.editar(depoisEd, { acao: "Realizar TOP", prioridade: "Alta" }, "movimentacao") === null);
  // A justificativa: quem está no pátio diz por que a frota atrasou.
  await ev.aplicar(ev.justificar(ev.porId(movAberta.id, "movimentacao"),
    { motivo: "A frota estava em viagem para Natal", quem: "Operação", texto: "" }, "movimentacao"));
  const justificada = ev.porId(movAberta.id, "movimentacao");
  igual("a operação justifica a movimentação: por quê e quem",
    [justificada.motivo_atraso, justificada.quem_atrasou],
    ["A frota estava em viagem para Natal", "Operação"]);
  let barrouJust = "";
  try { ev.justificar(umaAberta, { motivo: "Peça não chegou" }); } catch (e) { barrouJust = e.message; }
  ok("mas não justifica atividade (OS) — isso é do PCM", !!barrouJust, barrouJust);
  let semPorque = "";
  try { ev.justificar(justificada, { quem: "Operação" }, "movimentacao"); } catch (e) { semPorque = e.message; }
  ok("justificar sem dizer por quê é recusado", !!semPorque, semPorque);

  let barrouAprovar = "";
  try { ev.aprovarMovimentacao(ev.porId(movAberta.id, "movimentacao")); }
  catch (e) { barrouAprovar = e.message; }
  ok("a operação não aprova o que ela mesma concluiu", !!barrouAprovar, barrouAprovar);

  const prevSemData = ev.lista("preventiva").find(x => modelo.esperandoQuem(x) === "Operação");
  await ev.aplicar(ev.informarDisponibilidade(prevSemData, "agora"));
  igual("e informa quando a frota fica livre",
    modelo.esperandoQuem(ev.porId(prevSemData.id, "preventiva")), "PCM");
  let barrou3 = "";
  try { ev.marcarParada(ev.porId(prevSemData.id, "preventiva"), "2026-10-20"); }
  catch (e) { barrou3 = e.message; }
  ok("mas não marca o dia da parada", !!barrou3, barrou3);

  await entrarComo("Mateus");
  await ev.aplicar(ev.aprovarMovimentacao(ev.porId(movAberta.id, "movimentacao")));
  const aprovadaMov = ev.porId(movAberta.id, "movimentacao");
  ok("o PCM aprova e ela sai da fila", !modelo.movimentacaoParaAprovar(aprovadaMov) &&
    modelo.situacaoMovimentacao(aprovadaMov).startsWith("Concluída"));
  igual("e fica dito quem aprovou", aprovadaMov.aprovada_por, "Mateus");

  const outraMov = ev.lista("movimentacao").find(modelo.movimentacaoAberta);
  await entrarComo("Pedro");
  await ev.aplicar(ev.chegou(outraMov, "2026-10-08"));
  await entrarComo("Mateus");
  let semMotivo = "";
  try { ev.devolverMovimentacao(ev.porId(outraMov.id, "movimentacao"), ""); }
  catch (e) { semMotivo = e.message; }
  ok("devolver exige o motivo", !!semMotivo, semMotivo);
  await ev.aplicar(ev.devolverMovimentacao(ev.porId(outraMov.id, "movimentacao"),
    "a frota ainda está no fornecedor"));
  const devolvida = ev.porId(outraMov.id, "movimentacao");
  ok("devolvida, volta a ficar em aberto", modelo.movimentacaoAberta(devolvida));
  igual("com o porquê à vista", devolvida.motivo_devolucao, "a frota ainda está no fornecedor");

  const terceiraMov = ev.lista("movimentacao").find(modelo.movimentacaoAberta);
  await ev.aplicar(ev.chegou(terceiraMov, "2026-10-09"));
  ok("quando o próprio PCM conclui, já vai aprovada",
    ev.porId(terceiraMov.id, "movimentacao").aprovada);

  // O PCM justifica a OS: o porquê vai para o "SE NÃO FOI, POR QUÊ", e quem
  // atrasou, quando dito, manda no "de quem é o atraso".
  const osAtrasada = ev.lista().find(x => modelo.aberta(x) && !x.motivo);
  await ev.aplicar(ev.justificar(osAtrasada, { motivo: "Peça não chegou", quem: "Terceiro",
    texto: "fornecedor atrasou a entrega" }));
  const osJust = ev.porId(osAtrasada.id);
  igual("a OS ganha o porquê, quem atrasou e o detalhe",
    [osJust.motivo, osJust.quem_atrasou, osJust.justificativa],
    ["Peça não chegou", "Terceiro", "fornecedor atrasou a entrega"]);
  ok("quem atrasou informado vale mais que o deduzido do motivo (Peça → Suprimentos)",
    modelo.atrasoPorArea([osJust]).por.Terceiro && !modelo.atrasoPorArea([osJust]).por.Suprimentos);
  const soTexto = ev.lista().find(x => modelo.aberta(x) && !x.motivo);
  await ev.aplicar(ev.justificar(soTexto, { texto: "cliente pediu para segurar" }));
  igual("sem motivo da lista, o que foi escrito é o porquê", ev.porId(soTexto.id).motivo,
    "cliente pediu para segurar");
  ok("a fita fecha com as justificativas", ev.conferir().ok);

  await ev.aplicar(ev.marcarParada(ev.porId(prevSemData.id, "preventiva"), modelo.somaDias(modelo.hoje(), 3)));
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

// ── o fechamento da semana ──────────────────────────────────────────────────
// O pedido: o número da semana não pode subir sozinho depois que ela acaba —
// baixa dada na segunda e atividade empurrada para a frente faziam a semana
// velha virar 100%. Na planilha, a coluna amarela; aqui, o fechamento.
titulo("fechamento.js — a semana fechada não muda");
{
  const fech = await import("../js/fechamento.js");
  igual("a semana 41 fecha na sexta 09/10 às 23h59 de Mossoró",
    modelo.corteDaSemana(2026, 41), "2026-10-10T03:00:00.000Z");

  const base = { ...modelo.molde(), frota: "F-T", tipo: "Corretiva", origem: "Programada", oficina: "Interna" };
  const nova = (id, ts, atividade, dia) => ({ id: "i" + id, ts, tipo: "importada", alvo: id,
    alvo_tipo: "atividade", origem: "planilha", dados: { ...base, atividade, ano: 2026, semana: 41, dia, dias: 1 } });
  const fita = [
    nova("T1", "2026-10-05T10:00:00.000Z", "um", "Seg"),
    nova("T2", "2026-10-05T10:00:00.001Z", "dois", "Ter"),
    nova("T3", "2026-10-05T10:00:00.002Z", "três", "Qua"),
    { id: "c1", ts: "2026-10-06T12:00:00.000Z", tipo: "concluida", alvo: "T1", alvo_tipo: "atividade", dados: { em: "2026-10-05" } },
    // segunda-feira seguinte: a baixa da T2 dada atrasada, com a data de sexta…
    { id: "c2", ts: "2026-10-12T12:00:00.000Z", tipo: "concluida", alvo: "T2", alvo_tipo: "atividade", dados: { em: "2026-10-09" } },
    // …e a T3 empurrada para a semana 42
    { id: "r3", ts: "2026-10-12T12:05:00.000Z", tipo: "reprogramada", alvo: "T3", alvo_tipo: "atividade",
      motivo: "frota em viagem", dados: { de: { ano: 2026, semana: 41, dia: "Qua", dias: 1, hh: 0 },
        para: { ano: 2026, semana: 42, dia: "Seg", dias: 1, hh: 0 } } },
  ];
  const op = { fita, registrados: new Map(), agora: "2026-10-13T12:00:00.000Z", hoje: "2026-10-13" };
  const f41 = fech.fechamento(2026, 41, op);
  igual("calculada hoje, a semana 41 já deu 100%", f41.ao_vivo.aderencia, 1);
  igual("mas ninguém fechou e ela fecha sozinha", f41.modo, "automatico");
  igual("com o número da sexta: 1 de 3", [f41.numeros.concluidas_plano, f41.numeros.plano], [1, 3]);
  igual("e é esse que vale", fech.vale(f41, "aderencia"), 1 / 3);

  const durante = fech.fechamento(2026, 41, { ...op, agora: "2026-10-09T18:00:00.000Z", hoje: "2026-10-09" });
  igual("antes da sexta 23h59 a semana está em andamento", durante.modo, "em_andamento");
  ok("e não tem número congelado", durante.numeros === null);

  const f40 = fech.fechamento(2026, 40, op);
  igual("semana que acabou antes de existir a fita fica sem fechamento", f40.modo, "sem_fechamento");

  const registrados = new Map([[ev.chaveSemana(2026, 41), { aderencia: 0.84, cumprimento: 0.6292, origem: "planilha" }]]);
  const fr = fech.fechamento(2026, 41, { ...op, registrados });
  igual("o registrado vale acima do automático", [fr.modo, fech.vale(fr, "aderencia")], ["registrado", 0.84]);
  ok("e o da sexta continua à mão para comparar", fr.sexta && fr.sexta.aderencia === 1 / 3);
  // a baixa da T2 foi lançada na segunda com data de sexta: o serviço saiu na
  // semana, só a baixa atrasou. A T3, empurrada para a 42, segue contando como não feita.
  igual("na sexta com as baixas lançadas depois: 2 de 3, a reprogramada continua fora",
    [f41.sextaComBaixas.concluidas_plano, f41.sextaComBaixas.plano], [2, 3]);
  const soDepois = [...fita, { id: "c9", ts: "2026-10-13T09:00:00.000Z", tipo: "concluida", alvo: "T3",
    alvo_tipo: "atividade", dados: { em: "2026-10-13" } }];
  igual("baixa com data depois da sexta não entra",
    fech.fechamento(2026, 41, { ...op, fita: soDepois }).sextaComBaixas.concluidas_plano, 2);

  // pelo registro, como na tela
  await entrarComo("Mateus");
  await ev.aplicar(ev.fecharSemana(2026, 39, { aderencia: 0.647, cumprimento: 0.707 }, { obs: "fechada na reunião" }));
  const r39 = ev.fechamentoDe(2026, 39);
  igual("o PCM fecha a semana e o número fica", [r39.aderencia, r39.fechada_por, r39.obs], [0.647, "Mateus", "fechada na reunião"]);
  let semMotivo = "";
  try { ev.fecharSemana(2026, 39, { aderencia: 1 }); } catch (e) { semMotivo = e.message; }
  ok("fechar de novo sem motivo não passa", /motivo/i.test(semMotivo), semMotivo);
  await ev.aplicar(ev.fecharSemana(2026, 39, { aderencia: 0.7, cumprimento: 0.75 }, { motivo: "faltou a baixa da F-401" }));
  igual("com motivo, o novo número substitui", [ev.fechamentoDe(2026, 39).aderencia, ev.fechamentoDe(2026, 39).motivo],
    [0.7, "faltou a baixa da F-401"]);
  igual("e os dois fechamentos ficam no registro",
    ev.log.filter(e => e.alvo === ev.chaveSemana(2026, 39)).length, 2);
  ok("a fita fecha com as semanas dentro", ev.conferir().ok);
  // Com o banco ligado e a regra antiga (sem `semana`), o site não oferece
  // fechar: o lançamento seria recusado e a fila de quem fechou travaria.
  const cfgF = await import("../js/config.js");
  ok("com o banco ligado e a regra antiga, o site não oferece fechar a semana",
    !nuvem.ligada() || cfgF.BANCO_ACEITA_FECHAMENTO || !fech.podeGravarFechamento(),
    `ligada=${nuvem.ligada()} aceita=${cfgF.BANCO_ACEITA_FECHAMENTO}`);
  await entrarComo("Pedro");
  let operacao = "";
  try { ev.fecharSemana(2026, 40, { aderencia: 1 }); } catch (e) { operacao = e.message; }
  ok("a operação não fecha a semana", /permiss/i.test(operacao), operacao);
  await entrarComo("Mateus");

  const c83 = "/root/.claude/uploads/3a385572-107b-54f9-9b46-4352cfa98089/f239cce9-Programacao_Servicos_Makro_83_2.xlsx";
  let abas83 = null;
  try { abas83 = await pl.ler(arquivoFalso(c83, await readFile(c83))); } catch (e) { console.log("  (pulando a 83_2: não achei)"); }
  if (abas83) {
    const lidos = imp.lerFechamentos(abas83, 2026);
    igual("a coluna amarela da 83_2 tem as semanas 35 a 39", lidos.map(x => x.semana), [35, 36, 37, 38, 39]);
    igual("a 35 foi registrada com 84% e 62,92%", [lidos[0].ano, lidos[0].aderencia, lidos[0].cumprimento], [2026, 0.84, 0.6292]);
    ok("com a observação da reunião", /^Número apresentado na reunião: 21 de 25/.test(lidos[0].obs), lidos[0].obs);
    ok("a 40 e a 41, com a amarela vazia, ficam de fora", !lidos.some(x => x.semana >= 40));
  }
  // A linha de tendência não mostra a conta de hoje de semana que acabou sem número
  const { naTendencia } = await import("../js/fechamento.js");
  igual("na tendência: semana encerrada sem número fica em branco; registrada, automática e em andamento entram",
    [naTendencia({ modo: "sem_fechamento", numeros: null, ao_vivo: { aderencia: 1 } }, "aderencia"),
      naTendencia({ modo: "registrado", numeros: { aderencia: 0.88 }, ao_vivo: { aderencia: 1 } }, "aderencia"),
      naTendencia({ modo: "automatico", numeros: { aderencia: 0.4 }, ao_vivo: { aderencia: 1 } }, "aderencia"),
      naTendencia({ modo: "em_andamento", numeros: null, ao_vivo: { aderencia: 0.5 } }, "aderencia")],
    [null, 0.88, 0.4, 0.5]);
}

// ── preventivas: reprogramar, incluir, editar, o que mudou ─────────────────
titulo("eventos.js — preventiva: reprogramar a parada, incluir frota, registro");
{
  await entrarComo("Mateus");
  const [cr] = await ev.aplicar(ev.novaPreventiva({ ...modelo.moldePreventiva(), frota: "F-PREV1", mes: "Out-26",
    plano: "15 mil km", vence: "2026-10-20", hh: 4 }));
  const id = cr.alvo;
  const p0 = () => ev.porId(id, "preventiva");
  igual("incluir frota cria a preventiva no mês, lançada no site", [cr.tipo, p0().mes, p0().fonte, p0().plano],
    ["criada", "Out-26", "", "15 mil km"]);
  igual("e ela fica aguardando a operação", modelo.esperandoQuem(p0()), "Operação");
  let semFrota = "";
  try { ev.novaPreventiva({ mes: "Out-26" }); } catch (e) { semFrota = e.message; }
  ok("sem frota não inclui", /frota/i.test(semFrota), semFrota);

  await ev.aplicar(ev.informarDisponibilidade(p0(), "2026-10-14"));
  await ev.aplicar(ev.marcarParada(p0(), "2026-10-15", "Interna"));
  igual("a primeira parada não é reprogramação", [p0().reprog_parada, p0().parada_orig], [0, "2026-10-15"]);
  let semMotivo = "";
  try { ev.marcarParada(p0(), "2026-10-17"); } catch (e) { semMotivo = e.message; }
  ok("mudar o dia da parada sem motivo não passa", /motivo/i.test(semMotivo), semMotivo);
  ok("confirmar o mesmo dia não pede motivo", !!ev.marcarParada(p0(), "2026-10-15", "Terceiro"));
  await ev.aplicar(ev.marcarParada(p0(), "2026-10-17", "", "frota em viagem"));
  igual("reprogramada: conta, guarda a primeira data e o motivo",
    [p0().dia_parada, p0().reprog_parada, p0().parada_orig, p0().motivo_parada], ["2026-10-17", 1, "2026-10-15", "frota em viagem"]);
  await ev.aplicar(ev.informarDisponibilidade(p0(), "agora", "voltou antes"));
  igual("a liberação alterada também conta", p0().reprog_liberacao, 1);

  let editaParada = "";
  try { ev.editar(p0(), { dia_parada: "2026-10-30" }, "preventiva"); } catch (e) { editaParada = e.message; }
  ok("editar não troca a parada por fora da reprogramação", /próprio/i.test(editaParada), editaParada);
  await ev.aplicar(ev.editar(p0(), { vence: "2026-10-25", hh: 6 }, "preventiva"));
  igual("editar muda o resto", [p0().vence, p0().hh], ["2026-10-25", 6]);

  const mud = ev.mudancasDe(id, "preventiva");
  const reprog = mud.find(m => m.e.tipo === "prev_parada" && m.e.motivo);
  igual("o registro sabe o antes e o depois de cada passo",
    [reprog.antes.dia_parada, reprog.depois.dia_parada], ["2026-10-15", "2026-10-17"]);
  const ed = mud.find(m => m.e.tipo === "editada");
  igual("e o que a edição mudou", ed.mudou.map(x => x.campo).sort(), ["hh", "vence"]);
  ok("a fita fecha com a preventiva incluída", ev.conferir().ok);

  // a reimportação da planilha não tira do plano o que foi incluído no site
  const sairam = imp.lerPreventivas([{ nome: "Preventivas Out-26", linhas: [["Frota", "Preventivas"], ["F-OUTRA", "1 ano"]] }],
    [...ev.estado.preventiva.values()]).sairam;
  ok("reimportar a planilha não tira a frota incluída no site", !sairam.some(x => x.id === id),
    JSON.stringify(sairam.map(x => x.frota)));

  await entrarComo("Pedro");
  let opEdita = "";
  try { ev.editar(p0(), { obs: "x" }, "preventiva"); } catch (e) { opEdita = e.message; }
  ok("a operação não edita a preventiva", /permiss/i.test(opEdita), opEdita);
  let opInclui = "";
  try { ev.novaPreventiva({ frota: "F-X", mes: "Out-26" }); } catch (e) { opInclui = e.message; }
  ok("nem inclui frota no plano", /permiss/i.test(opInclui), opInclui);
  await entrarComo("Mateus");
}

titulo("a preventiva do plano e a OS preventiva da Programação andam juntas");
{
  await entrarComo("Mateus");
  const vinc = await import("../js/vinculo.js");
  const nova = async (frota, extra = {}) => {
    const [c] = await ev.aplicar(ev.novaPreventiva({ ...modelo.moldePreventiva(), frota, mes: "Out-26",
      plano: "15 mil km", vence: "2026-10-28", hh: 5, os: "", ...extra }), { silencioso: true });
    return () => ev.porId(c.alvo, "preventiva");
  };
  const osDe = p => ev.atividadeDaPreventiva(p());
  // 1. marcar a parada põe a OS preventiva no dia
  const p1 = await nova("F-VINC1", { os: "022900", onde_fazer: "Terceiro" });
  await ev.aplicar(ev.informarDisponibilidade(p1(), "agora"), { silencioso: true });
  const lote = await ev.aplicar(ev.marcarParada(p1(), "2026-10-15", "Terceiro"), { silencioso: true });
  const a1 = osDe(p1);
  igual("marcar a parada cria a OS preventiva no dia da parada, com a OS e o HH do plano",
    a1 && [a1.tipo, a1.atividade, a1.os, a1.semana, a1.dia, a1.hh, a1.oficina, a1.origem],
    ["Preventiva", "Preventiva 15 mil km", "022900", 42, "Qui", 5, "Terceirizada", "Programada"]);
  ok("os lançamentos derivados vão marcados como da ligação", lote.slice(1).every(e => e.origem === "vinculo") && lote.length === 3,
    JSON.stringify(lote.map(e => [e.tipo, e.origem])));
  // 2. reprogramar a parada move a OS, com o mesmo motivo
  await ev.aplicar(ev.marcarParada(p1(), "2026-10-19", "Terceiro", "Peça não chegou"), { silencioso: true });
  igual("reprogramar a parada move a OS para o dia novo, com o mesmo motivo",
    [osDe(p1).semana, osDe(p1).dia, osDe(p1).reprogramacoes, osDe(p1).motivo], [43, "Seg", 1, "Peça não chegou"]);
  // 3. baixa na OS = preventiva realizada; reabrir a OS reabre a preventiva
  await ev.aplicar(ev.concluir(osDe(p1), "2026-10-19"), { silencioso: true });
  igual("dar baixa na OS registra a preventiva como realizada, na mesma data e com a OS",
    [p1().realizada_em, p1().os], ["2026-10-19", "022900"]);
  await ev.aplicar(ev.reabrir(osDe(p1), "baixa errada"), { silencioso: true });
  ok("reabrir a OS reabre a preventiva", !modelo.preventivaFeita(p1()) && modelo.aberta(osDe(p1)));
  // 4. o caminho inverso: realizada na aba Preventivas dá a baixa na OS
  await ev.aplicar(ev.preventivaFeita(p1(), "2026-10-20", "022900"), { silencioso: true });
  igual("registrar a realização na aba Preventivas dá a baixa na OS", osDe(p1).concluida_em, "2026-10-20");
  // 5. a OS que já estava na carteira (mesma frota e OS) é a que vai, sem duplicar
  const [velha] = await ev.aplicar(ev.criar({ frota: "F-VINC2", atividade: "Preventiva de 15 mil km no Gilson",
    tipo: "Preventiva", os: "022446", origem: "Programada", oficina: "Interna" }), { silencioso: true });
  const p2 = await nova("F-VINC2", { os: "022446" });
  await ev.aplicar(ev.informarDisponibilidade(p2(), "agora"), { silencioso: true });
  await ev.aplicar(ev.marcarParada(p2(), "2026-10-16"), { silencioso: true });
  ok("a OS que já estava anotada é ligada e programada — nenhuma OS nova",
    osDe(p2) && osDe(p2).id === velha.alvo && osDe(p2).semana === 42 && osDe(p2).dia === "Sex" &&
    ev.lista().filter(a => a.frota === "F-VINC2").length === 1);
  // 6. adiar devolve a OS para a carteira; cancelar cancela
  await ev.aplicar(ev.adiarPreventiva(p2(), "Frota em viagem longa"), { silencioso: true });
  ok("adiar a preventiva devolve a OS para a carteira, com o motivo", osDe(p2).semana == null && /adiada/.test(osDe(p2).motivo), osDe(p2).motivo);
  const p3 = await nova("F-VINC3");
  await ev.aplicar(ev.informarDisponibilidade(p3(), "agora"), { silencioso: true });
  await ev.aplicar(ev.marcarParada(p3(), "2026-10-21"), { silencioso: true });
  await ev.aplicar(ev.cancelarPreventiva(p3(), "Frota vendida"), { silencioso: true });
  ok("cancelar a preventiva cancela a OS", osDe(p3).cancelada);
  ok("a fita continua fechando", ev.conferir().ok);

  // 7. o que já existia: conciliação
  const [jaFeita] = await ev.aplicar(ev.criar({ frota: "F-VINC4", atividade: "Preventiva de 10, 20 e 30 mil km",
    tipo: "Preventiva", os: "022447", origem: "Programada", oficina: "Interna", ano: 2026, semana: 41, dia: "Seg", dias: 1 }), { silencioso: true });
  await ev.aplicar(ev.concluir(ev.porId(jaFeita.alvo), "2026-10-06"), { silencioso: true });
  const p4 = await nova("F-VINC4", { os: "022447" });
  const p5 = await nova("F-VINC5");
  // (parada marcada antes da ligação existir: o evento sem o derivado)
  await ev.aplicar({ ...ev.marcarParada(p5(), "2026-10-22"), origem: "vinculo" }, { silencioso: true });
  const c = vinc.conciliacao([p4(), p5()], undefined, "2026-10-14");
  igual("a conciliação liga a OS já baixada e realiza a preventiva; a parada sem OS ganha a OS",
    c.map(it => it.passos.map(s => s.tipo)), [["ligar", "realizar_prev"], ["criar_os"]]);
  ok("e descreve em palavras", /realizada em 06\/10/.test(vinc.descrever(c[0])) && /cria a OS preventiva/.test(vinc.descrever(c[1])),
    vinc.descrever(c[0]) + " | " + vinc.descrever(c[1]));
  await ev.aplicar(vinc.eventosDaConciliacao(c), { silencioso: true });
  ok("aplicada: a F-VINC4 realizada em 06/10 e ligada; a F-VINC5 com a OS no dia 22/10",
    p4().realizada_em === "2026-10-06" && osDe(p4).id === jaFeita.alvo && osDe(p5) && osDe(p5).semana === 43 && osDe(p5).dia === "Qui");
  igual("e, conciliado, nada mais a fazer", vinc.conciliacao([p4(), p5()], undefined, "2026-10-14").length, 0);
}

titulo("modelo.js — a carteira por idade e prioridade");
{
  const ref = "2026-10-14";
  const at = extra => ({ ...modelo.molde(), id: "C-" + Math.random(), frota: "F-1", ...extra });
  igual("a abertura no Protheus vale primeiro",
    modelo.desdeQuando(at({ obs: "[06/10] TOP · Aberta no Protheus em 12/09/2026", criada_em: "2026-10-09T10:00:00Z" }), ref),
    { data: "2026-09-12", fonte: "abertura no Protheus" });
  igual("depois o dia do TOP", modelo.desdeQuando(at({ obs: "[06/10] TOP: folga na porca", criada_em: "2026-10-09T10:00:00Z" }), ref),
    { data: "2026-10-06", fonte: "dia do TOP" });
  igual("TOP de dezembro lido em janeiro é do ano anterior",
    modelo.desdeQuando(at({ obs: "[20/12] TOP" }), "2027-01-05").data, "2026-12-20");
  igual("sem nenhuma das duas, o primeiro registro no site",
    modelo.desdeQuando(at({ criada_em: "2026-10-09T10:00:00Z" }), ref), { data: "2026-10-09", fonte: "primeiro registro no site" });
  igual("sem data nenhuma, sem idade — não inventa", modelo.idadeDias(at({}), ref), null);
  igual("idade em dias", modelo.idadeDias(at({ obs: "[06/10] TOP" }), ref), 8);
  const l = [
    at({ id: "velha-sem", obs: "[01/09] TOP" }),
    at({ id: "p2-nova", prioridade: "P2", obs: "[10/10] TOP" }),
    at({ id: "p1-nova", prioridade: "P1", obs: "[12/10] TOP" }),
    at({ id: "p1-velha", prioridade: "P1", obs: "[02/10] TOP" }),
    at({ id: "prev", tipo: "Preventiva", criada_em: "2026-10-13T10:00:00Z" }),
  ];
  igual("preventiva primeiro, depois P1, P2, sem prioridade — a mais velha primeiro em cada uma",
    l.sort(modelo.ordemCarteira(ref)).map(a => a.id), ["prev", "p1-velha", "p1-nova", "p2-nova", "velha-sem"]);
}

titulo("pendencias.js — a mensagem da inspeção ou do TOP vira pendências");
{
  const P = await import("../js/pendencias.js");
  const frotas = ["F-433", "F-616", "F-617", "F-971", "F-971 G", "F-969", "F-974"];
  // a mensagem da 433, como chegou no WhatsApp (com os caracteres da menção)
  const m433 = ["433", "*TEMOS PREVENTIVA PARA ESSE MES* ", "", "*PENDENCIAS IDENTIFICADAS NA INSPEÇÃO*",
    "- Soldar trincas no lastro dianteiro LD, junção com o pescoço;",
    "- Substituir lonas de freio do primeiro eixo LE e LD;",
    "- Substituir lonas de freio do segundo eixo LE;",
    "- Substituir lonas do quarto eixo LD gastas;",
    "@\u2068lukkas souza CHEFE\u2069  enviar para o fornecedor( resolvemos duas coisas) ", "", "",
    "@\u2068Dias\u2069 ", "psc", "alinhar fornecedor, já adianto que provavelmente vai ser reprovado no TOP"].join("\n");
  const [b433, ...resto433] = P.lerPendencias(m433, { frotas });
  igual("433 vira a F-433, de inspeção, com as quatro pendências", [b433.frota, b433.fonte, b433.itens.length, resto433.length],
    ["F-433", "Inspeção", 4, 0]);
  igual("sem o ';' do fim e sem o traço", b433.itens[0].texto, "Soldar trincas no lastro dianteiro LD, junção com o pescoço");
  ok("a conversa fica de fora, à vista (menções, psc, o recado do TOP)", b433.ignoradas.length === 6 &&
    b433.ignoradas.some(l => l.startsWith("@lukkas")) && b433.ignoradas.includes("psc"), JSON.stringify(b433.ignoradas));
  ok("e o aviso de que a mensagem fala em preventiva", b433.temPreventiva);

  const m616 = "Inspeção prioridades 616:\n- Realizar limpeza dos bornes das baterias;\n- Veículo está esquentando, conforme relato do motorista; ⚠️⚠️\nAinda tem essas pendências aqui do 616 adicine em carteira";
  const [b616] = P.lerPendencias(m616, { frotas });
  igual("'Inspeção prioridades 616:' é a frota; o ⚠️ marca urgente e sai do texto",
    [b616.frota, b616.itens.map(i => [i.texto, i.alerta])],
    ["F-616", [["Realizar limpeza dos bornes das baterias", false], ["Veículo está esquentando, conforme relato do motorista", true]]]);

  // o texto do PDF da folha: OS na frente, linha quebrada, TOP no fim, rodapé com a frota de novo
  const folha = ["F-617 · CAVALO TRATOR", "Pendências em aberto · 29 atividades · chegou em 06/10 · TOP: não liberado",
    "OS ATIVIDADE QUEM FEZ", "021333 Repor cortinas da cabine", "021336",
    "Substituir tomada da bomba do ARLA sem proteção (item em", "estoque)", "— Corrigir banco do passageiro solto", "—",
    "Verificar vazamento de água debaixo da cabine e completar o", "nível do radiador TOP", "F-617  ·  página 1 de 1"].join("\n");
  const bf = P.lerPendencias(folha, { frotas });
  igual("PDF da folha: uma frota só, com OS, a linha quebrada emendada e o TOP marcado",
    [bf.length, bf[0].itens.map(i => [i.os, i.texto, i.top])],
    [1, [["021333", "Repor cortinas da cabine", false],
      ["021336", "Substituir tomada da bomba do ARLA sem proteção (item em estoque)", false],
      ["", "Corrigir banco do passageiro solto", false],
      ["", "Verificar vazamento de água debaixo da cabine e completar o nível do radiador", true]]]);

  const varias = P.lerPendencias("969\n1. Trocar lâmpada do farol LD\n2. Fixar para-choque\n974:\n• Corrigir vazamento de ar\n971 G\n- Soldar suporte", { frotas });
  igual("várias frotas na mesma mensagem, com numeração e bolinha; '971 G' é a F-971 G",
    varias.map(b => [b.frota, b.itens.length]), [["F-969", 2], ["F-974", 1], ["F-971 G", 1]]);
  igual("frota que o site não conhece entra como nova", P.resolverFrota("1234", frotas), { frota: "F-1234", nova: true });
  igual("sem número de frota no texto, vale a da tela; sem marcador, cada linha é uma pendência",
    P.lerPendencias("Trocar lona de freio\nFixar para-lama LE", { frotas, frotaPadrao: "F-969" }).map(b => [b.frota, b.itens.map(i => i.texto)]),
    [["F-969", ["Trocar lona de freio", "Fixar para-lama LE"]]]);

  const abertas = [{ ...modelo.molde(), id: "X", frota: "F-433", atividade: "Substituir lona de freio do segundo eixo LE", semana: 42, dia: "Qua" }];
  const d = P.marcarDuplicadas("F-433", b433.itens, abertas);
  igual("a que a frota já tem em aberto é marcada (o mesmo serviço, no mesmo lugar); a do outro eixo não",
    d.map(i => !!i.duplicada), [false, false, true, false]);
  igual("e a repetida dentro da própria mensagem também",
    P.marcarDuplicadas("F-1", [{ texto: "Fixar descarga" }, { texto: "fixar descarga;" }], []).map(i => i.repetida), [false, true]);
  // o formato do TOP, como chegou em 14/10: frota sem traço, uma pendência por
  // linha, duas grudadas por "-", o porquê da reprovação, a situação na linha da frota
  const top = ["TOP REPROVADOS 14/10- PENDENCIAS  DO TOP ", "", "F616", "",
    "realizar limpeza dos bornes das baterias",
    "fixar base do cinto de segurança do motorista desobstruir esguicho do limpador ",
    "fixar saia lateral da cabine ( LE )-veículo esquentando ", "", "",
    "F508", "PREVENTENTIVA ", "luz de ré revisar-", "luz da placa revisar regular freios ( lona LD 1º eixo )", "", "",
    "F620", "", "revisar banco do passageiro ", "revisar banco do passageiro",
    "fixar corote-lubrificar tirantes da porta-corrigir falha no motor ( sistema NOX )-corrigir iluminação traseira LE", "",
    "Veículo nao liberado devido as seguintes observações:", "Terminal da bateria ", "Falha no sistema NOX", "", "",
    "F434 LIBERADO COM RESTRIÇÃO ", "", "vazamento na válvula distribuidora ", "sirene de ré", "", "",
    "974", "", "Verificar ar-condicionado (fraco).", "Providenciar estepe.", "",
    "Observação: Veículo em manutenção para verificar possível rompimento do trocador de calor."].join("\n");
  const bt = P.lerPendencias(top, { frotas: ["F-616", "F-508", "F-620", "F-434", "F-974"], ref: "2026-10-14" });
  igual("TOP: as cinco frotas, de TOP, do dia 14/10", bt.map(b => [b.frota, b.fonte, b.dia]),
    [["F-616", "TOP", "2026-10-14"], ["F-508", "TOP", "2026-10-14"], ["F-620", "TOP", "2026-10-14"],
      ["F-434", "TOP", "2026-10-14"], ["F-974", "TOP", "2026-10-14"]]);
  igual("as grudadas se separam: pelo '-' antes de verbo ou depois de ')', e pelo verbo que começa outra",
    bt[0].itens.map(i => i.texto), ["Realizar limpeza dos bornes das baterias", "Fixar base do cinto de segurança do motorista",
      "Desobstruir esguicho do limpador", "Fixar saia lateral da cabine (LE)", "Veículo esquentando"]);
  igual("'luz da placa revisar regular freios' são duas; o '-' do fim some; PREVENTIVA não é pendência",
    [bt[1].itens.map(i => i.texto), bt[1].temPreventiva],
    [["Luz de ré revisar", "Luz da placa revisar", "Regular freios (lona LD 1º eixo)"], true]);
  igual("quatro numa linha só; o porquê da reprovação fica à parte",
    [bt[2].itens.length, bt[2].itens.slice(2).map(i => i.texto), bt[2].motivos],
    [6, ["Fixar corote", "Lubrificar tirantes da porta", "Corrigir falha no motor (sistema NOX)", "Corrigir iluminação traseira LE"],
      ["Terminal da bateria", "Falha no sistema NOX"]]);
  igual("a situação na linha da frota; a observação não vira pendência; palavra com hífen fica inteira",
    [bt[3].situacao, bt[4].itens.map(i => i.texto), bt[4].notas.length],
    ["LIBERADO COM RESTRIÇÃO", ["Verificar ar-condicionado (fraco)", "Providenciar estepe"], 1]);
  const ja = [
    { ...modelo.molde(), id: "J1", frota: "F-616", atividade: "Veículo está esquentando, conforme relato do motorista" },
    { ...modelo.molde(), id: "J2", frota: "F-974", atividade: "Sem estepe" },
    { ...modelo.molde(), id: "J3", frota: "F-974", atividade: "Motor falhando" },
    { ...modelo.molde(), id: "J4", frota: "F-974", atividade: "Diagnosticar e sanar falha no módulo FR, acionamento do freio motor" },
    { ...modelo.molde(), id: "J5", frota: "F-974", atividade: "Revisar esguicho do limpador de parabrisa" },
    { ...modelo.molde(), id: "J6", frota: "F-974", atividade: "Revisar luz de freio (LD)" }];
  const par = (f, t) => { const [r] = P.marcarDuplicadas(f, [{ texto: t }], ja); return (r.duplicada || r.parecida || {}).id || null; };
  igual("parecidas: escrita de outro jeito é a mesma; o outro lado (LE × LD) não é",
    [par("F-616", "Veículo esquentando"), par("F-974", "Providenciar estepe"), par("F-974", "Diagnosticar falhas no motor"),
      par("F-974", "Revisar esguicho do limpador de para-brisa"), par("F-974", "Revisar luz de freio LE"), par("F-974", "Providenciar cortina")],
    ["J1", "J2", "J3", "J5", null, null]);
  igual("a observação leva o dia e a origem", P.obsDaOrigem("Inspeção", "2026-10-14"), "[14/10] Inspeção");
  igual("e a carteira conta a idade a partir do dia da inspeção",
    modelo.desdeQuando({ obs: "[14/10] Inspeção" }, "2026-10-20"), { data: "2026-10-14", fonte: "dia da inspeção" });
}

titulo("modelo.js — as categorias da movimentação");
{
  const cat = (destino, acao = "", extra = {}) => modelo.categoriaMov({ ...modelo.moldeMovimentacao(), destino, acao, ...extra });
  igual("os textos que a planilha já tinha caem na categoria certa",
    ["REALIZAR TOP", "Cardan Service — coletar", "Cardan Service", "Box de lavagem", "Operação — disponibilizar para a preventiva",
      "Operação — liberar os box", "REALIZAR TESTE DE CARGA", "Box de soldagem", "Deassis - Trazer para a matriz", "Zé da Esquina"].map(d => cat(d)),
    ["top", "buscar", "fornecedor", "lavagem", "liberar", "desocupar", "teste", "box", "buscar", "outro"]);
  igual("o 'O que fazer' conta junto com o onde", [cat("Matriz", "REALIZAR TOP"), cat("Aferir tacografo", "Levar"), cat("Dunas Diesel", "Enviar Frota")],
    ["top", "teste", "fornecedor"]);
  igual("os detalhes só contam quando o que fazer e o onde não dizem nada",
    [cat("Cardan Service — buscar", "", { para_que: "Buscar na Cardan e depois fazer o TOP" }), cat("Zé", "", { para_que: "fazer o TOP" })],
    ["buscar", "top"]);
  igual("a categoria escolhida vale mais que o texto", cat("Cardan Service", "", { categoria: "buscar" }), "buscar");
  igual("categoria desconhecida volta para o texto", cat("REALIZAR TOP", "", { categoria: "xyz" }), "top");
  ok("toda categoria tem nome e a de TOP preenche o 'O que fazer'", modelo.CATEGORIAS_MOV.every(c => c.nome) &&
    modelo.categoriaMovPorId("top").acao === "Realizar TOP");
}

titulo("registro.js — o Registro por dia, por pessoa e pelo Painel");
{
  const reg = await import("../js/registro.js");
  const [cr] = await ev.aplicar(ev.novaPreventiva({ ...modelo.moldePreventiva(), frota: "F-REG1", mes: "Out-26",
    plano: "10 mil km", vence: "2026-10-30" }), { silencioso: true });
  const pr = () => ev.porId(cr.alvo, "preventiva");
  await ev.aplicar(ev.informarDisponibilidade(pr(), "agora"), { silencioso: true });

  ev.porDecisao({ titulo: "Programar a parada da F-REG1", area: "Preventivas" });
  const lote = await ev.aplicar(ev.marcarParada(pr(), "2026-10-23", "Interna"), { silencioso: true });
  ev.porDecisao(null);
  const [parada] = lote;
  igual("o lançamento feito pela decisão do Painel leva o título dela",
    parada.dados.via, { decisao: "Programar a parada da F-REG1", area: "Preventivas" });
  ok("o derivado (a OS no dia) não leva: foi o site, não a decisão",
    lote.length > 1 && lote.slice(1).every(e => e.origem === "vinculo" && !(e.dados && e.dados.via)), JSON.stringify(lote.map(e => [e.tipo, e.origem])));
  ok("a marca não entra no estado da preventiva", !("via" in pr()) && pr().dia_parada === "2026-10-23");
  const [depois] = await ev.aplicar(ev.informarDisponibilidade(pr(), "agora", "voltou"), { silencioso: true });
  ok("encerrada a decisão, o próximo lançamento sai sem marca", !depois.dados.via);

  ev.porDecisao({ titulo: "Ver as vencidas", area: "Programação" }, "programacao");
  ok("a decisão que abriu a Programação continua valendo nela", !!ev.decisaoEmCurso("programacao"));
  const [criada] = await ev.aplicar(ev.criar({ frota: "F-REG1", atividade: "trocar lâmpada" }), { silencioso: true });
  ok("criar não leva a marca (os dados da criação viram o item)", !criada.dados.via && !("via" in ev.porId(criada.alvo)));
  ok("e sair para outra tela encerra", !ev.decisaoEmCurso("hoje") && !ev.decisaoEmCurso("programacao"));

  const achar = id => ev.achar(id);
  igual("filtro 'decisão do Painel' acha só o que saiu dela",
    reg.filtrarRegistro(ev.log, { origem: "painel" }, achar).map(e => e.id), [parada.id]);
  ok("filtro de baixas junta as três", reg.filtrarRegistro(ev.log, { tipo: "_baixas" }, achar)
    .every(e => reg.BAIXAS.has(e.tipo)));
  ok("busca acha pelo título da decisão", reg.filtrarRegistro(ev.log, { busca: "parada da f-reg1" }, achar)
    .some(e => e.id === parada.id));
  ok("filtro de pessoa e de frota", reg.filtrarRegistro(ev.log, { autor: parada.autor, frota: "F-REG1" }, achar)
    .every(e => e.autor === parada.autor && ev.achar(e.alvo).item.frota === "F-REG1"));
  ok("a frota do Registro se digita do jeito que vier", reg.filtrarRegistro(ev.log, { frota: "f reg1", frotas: ["F-REG1"] }, achar)
    .some(e => e.alvo === criada.alvo));
  igual("e a frota que ninguém lançou não acha nada", reg.filtrarRegistro(ev.log, { frota: "F-99999", frotas: ["F-REG1"] }, achar).length, 0);
  const r = reg.resumoDoDia(ev.log, reg.diaDe(parada.ts));
  ok("o resumo do dia conta o que saiu do Painel e quem lançou",
    r.painel === 1 && r.porPessoa.some(([q]) => q === parada.autor) && r.porTipo.some(([t]) => t === "prev_parada"), JSON.stringify(r));

  // o tamanho da fita: 1.285 lançamentos em 5 dias, como no banco em 14/10
  const t0 = Date.parse("2026-10-09T14:00:00Z");
  const fita = Array.from({ length: 1285 }, (_, i) => ({ ts: new Date(t0 + i * (5 * 864e5 / 1285)).toISOString() }));
  const tam = reg.tamanhoDaFita(fita, new Date("2026-10-14T14:00:00Z"));
  ok("o tamanho da fita: ~1,1 MB, 0,2% dos 500 MB, e com cinco dias de uso ainda é cedo para projetar",
    Math.abs(tam.bytes / 1048576 - 1.1) < 0.05 && tam.pct < 0.003 && Math.round(tam.porDia) === 257 && tam.dias === 5 && tam.cedo,
    JSON.stringify(tam));
  // 850 da planilha num dia e 100 por dia depois, por 20 dias: o ritmo é 100, não o da importação
  const fita2 = [...Array.from({ length: 850 }, () => ({ ts: "2026-10-01T12:00:00Z", origem: "planilha" })),
    ...Array.from({ length: 2000 }, (_, i) => ({ ts: new Date(Date.parse("2026-10-01T12:00:00Z") + i * 864e5 / 100).toISOString(), origem: "manual" }))];
  const tam2 = reg.tamanhoDaFita(fita2, new Date("2026-10-21T12:00:00Z"));
  ok("a importação da planilha não entra no ritmo: 100 por dia dá uns 15 anos até os 500 MB",
    Math.round(tam2.porDia) === 100 && !tam2.cedo && Math.floor(tam2.anos) === 15, JSON.stringify(tam2));

  // O dia é o do relógio de quem olha: 22h30 em Mossoró já é amanhã em UTC.
  const tz = process.env.TZ;
  process.env.TZ = "America/Fortaleza";
  igual("lançamento das 22h30 fica no dia em que foi feito", reg.diaDe("2026-10-15T01:30:00.000Z"), "2026-10-14");
  if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
}

titulo("decisoes.js — o que decidir agora");
{
  const dec = await import("../js/decisoes.js");
  const ref = "2026-10-13";                               // terça
  const prev = (frota, extra) => ({ ...modelo.moldePreventiva(), id: "D-" + frota, frota, mes: "Out-26", ...extra });
  const prevs = [
    prev("F-A", { disponivel_agora: true, vence: "2026-10-16" }),                       // liberada, vence em 3 dias
    prev("F-B", { dia_parada: "2026-10-09", disponivel_agora: true, vence: "2026-10-20" }), // parada passou
    prev("F-C", { vence: "2026-10-15" }),                                              // sem liberação, vence logo
    prev("F-D", { vence: "2026-10-30" }),                                              // sem liberação
    prev("F-E", { dia_parada: "2026-10-16", disponivel_agora: true, vence: "2026-10-30" }),
    prev("F-F", { dia_parada: "2026-10-16", disponivel_agora: true, vence: "2026-10-30" }),
    prev("F-G", { dia_parada: "2026-10-16", disponivel_agora: true, vence: "2026-10-30" }),
    prev("F-H", { disponivel_em: "2026-10-25", prazo_service: "2026-10-20" }),          // conflito
  ];
  const ats = [{ ...modelo.molde(), id: "X1", frota: "F-E", atividade: "trocar lâmpada" }];
  const ds = dec.decisoesPreventivas(prevs, ats, ref);
  const de = f => ds.filter(d => d.frota === f);
  igual("liberada e vencendo em 3 dias: urgente, programar a parada", [de("F-A")[0].nivel, de("F-A")[0].titulo],
    [1, "Programar a parada da F-A"]);
  ok("com a sugestão de data no botão", /\d{2}\/\d{2}/.test(de("F-A")[0].acoes[0].rotulo) && de("F-A")[0].acoes[0].prev === "parada",
    JSON.stringify(de("F-A")[0].acoes));
  igual("parada que passou sem baixa: urgente, e a primeira pergunta é se a frota chegou",
    [de("F-B")[0].nivel, de("F-B")[0].acoes.map(a => a.prev)], [1, ["entrega", "realizada", "parada"]]);
  const cobra = ds.find(d => d.titulo.startsWith("Cobrar a operação"));
  ok("as sem liberação viram uma cobrança só, urgente porque a F-C vence em 2 dias, com o texto para copiar",
    cobra && cobra.nivel === 1 && /F-C/.test(cobra.acoes[0].copiar) && /F-D/.test(cobra.acoes[0].copiar), JSON.stringify(cobra));
  ok("conflito de data aparece com a saída: negociar ou adiar", de("F-H")[0] && de("F-H")[0].nivel === 1 &&
    de("F-H")[0].acoes.some(a => a.prev === "adiar"));
  ok("três paradas no mesmo dia pedem conferir a oficina", ds.some(d => d.titulo === "16/10 tem 3 paradas programadas"));
  ok("e a parada da F-E é a hora de limpar a carteira dela", de("F-E").some(d => d.nivel === 3 && /pendência/.test(d.detalhe)));
  igual("a sugestão pula o dia cheio e o fim de semana", dec.sugerirParada(prev("F-Z", { disponivel_agora: true }),
    [...prevs, prev("F-Y", { dia_parada: "2026-10-13", disponivel_agora: true }),
      prev("F-W", { dia_parada: "2026-10-13", disponivel_agora: true })], ref), "2026-10-14");
  igual("liberada num sábado: sugere a segunda", dec.sugerirParada(prev("F-Z", { disponivel_em: "2026-10-17" }), [], ref), "2026-10-19");
  igual("o nome do mês do plano", [dec.mesDoPlano("Out-26"), dec.mesDaData("2026-10-13")], ["2026-10", "Out-26"]);
  const todas = dec.todas({ ats, movs: [], prevs, ref });
  ok("tudo junto, do urgente para a oportunidade", todas.every((d, i) => !i || todas[i - 1].nivel <= d.nivel));
  ok("dentro do mesmo nível, o prazo mais curto primeiro", ds.filter(d => d.nivel === 1 && d.vence)
    .every((d, i, l) => !i || l[i - 1].vence <= d.vence), JSON.stringify(ds.map(d => [d.nivel, d.vence])));
  const sugestoes = dec.decisoesPreventivas(["F-1", "F-2", "F-3", "F-4", "F-5"].map(f =>
    prev(f, { disponivel_agora: true, vence: "2026-10-20" })), [], ref).filter(d => d.grupo === "programar").map(d => d.acoes[0].sugestao);
  igual("cinco liberadas no mesmo dia: as sugestões se espalham, duas por dia",
    sugestoes, ["2026-10-13", "2026-10-13", "2026-10-14", "2026-10-14", "2026-10-15"]);

  // O Painel geral junta as do mesmo tipo
  const muitas = dec.decisoesPreventivas(["F-1", "F-2", "F-3", "F-4"].map(f =>
    prev(f, { disponivel_agora: true, vence: "2026-10-30" })), [], ref);
  const juntas = dec.resumir([...muitas, { area: "Movimentação", nivel: 1, titulo: "1 movimentação atrasada" }]
    .sort((a, b) => a.nivel - b.nivel));
  const linha = juntas.find(d => d.grupo === "programar");
  ok("no Painel geral, quatro 'Programar a parada' viram uma linha que leva ao painel de preventivas",
    juntas.filter(d => d.area === "Preventivas" && d.titulo.startsWith("Programar")).length === 1 && linha && linha.titulo === "Programar a parada de 4 preventivas liberadas" &&
    /F-1, F-2, F-3, F-4/.test(linha.detalhe) && linha.acoes[0].ir[0] === "preventivas", JSON.stringify(juntas));
  ok("e duas do mesmo tipo continuam separadas", dec.resumir(muitas.filter(d => d.grupo).slice(0, 2)).length === 2);
  const vig = dec.planoVigente([prev("F-1", { mes: "Set-26" }), prev("F-2", { mes: "Ago-26" })], ref);
  igual("sem plano do mês corrente, vale o mais recente", [vig.mes, vig.prevs.length], ["Set-26", 1]);
}

titulo("legado.js — lançamentos que caíram nas cópias antigas do aparelho");
{
  await entrarComo("Mateus");
  const leg = await import("../js/legado.js");
  const at = (id, frota, atividade, extra = {}) => ({ id: "i-" + id, ts: "2026-09-16T02:00:00.000Z", tipo: "importada",
    alvo: id, alvo_tipo: "atividade", origem: "planilha", dados: { ...modelo.molde(), frota, atividade, ano: 2026, semana: 41, dia: "Ter", dias: 4, ...extra } });
  // O que o navegador guardava de antes da sincronização (ids inventados, sem `enviado`)
  const legado = [at("mu-1", "F-617", "REPOR CORTINAS DA CABINE"), at("mu-2", "F-617", "Lavar frota"),
    at("mu-3", "F-999", "Serviço que o banco não tem"), at("mu-4", "F-617", "Trocar lâmpada", { os: "021999" })];
  // O banco: a mesma planilha com o id da planilha
  const banco = [at("A-0205", "F-617", "Repor cortinas da cabine"),
    { ...at("A-0935", "F-617", "Lavar frota"), dados: { ...at("A-0935", "F-617", "Lavar frota").dados, concluida_em: "2026-10-09" } },
    at("A-0300", "F-617", "Substituir lâmpada do farol", { os: "021999" })];
  const depois = [
    { id: "c1", ts: "2026-10-13T18:38:00.000Z", tipo: "concluida", alvo: "mu-1", alvo_tipo: "atividade", dados: { em: "2026-10-09" } },
    { id: "j1", ts: "2026-10-13T18:38:01.000Z", tipo: "justificada", alvo: "mu-1", alvo_tipo: "atividade", dados: { motivo: "Peça atrasou", quem: "Fornecedor", texto: "" } },
    { id: "c2", ts: "2026-10-13T18:38:02.000Z", tipo: "concluida", alvo: "mu-2", alvo_tipo: "atividade", dados: { em: "2026-10-13" } },
    { id: "j2", ts: "2026-10-13T18:38:02.500Z", tipo: "justificada", alvo: "mu-2", alvo_tipo: "atividade", dados: { motivo: "Frota não chegou na oficina", quem: "", texto: "" } },
    { id: "x3", ts: "2026-10-13T18:38:03.000Z", tipo: "excluida", alvo: "mu-3", alvo_tipo: "atividade", motivo: "" },
    { id: "c3", ts: "2026-10-13T18:38:03.500Z", tipo: "concluida", alvo: "mu-3", alvo_tipo: "atividade", dados: { em: "2026-10-13" } },
    { id: "x2", ts: "2026-10-13T18:38:03.700Z", tipo: "excluida", alvo: "mu-2", alvo_tipo: "atividade", motivo: "" },
    { id: "c4", ts: "2026-10-13T18:38:04.000Z", tipo: "concluida", alvo: "mu-4", alvo_tipo: "atividade", dados: { em: "2026-10-12" } },
  ];
  const fita = [...banco, ...depois];
  const atual = ev.reconstruir(fita).atividade;
  ok("a fita do banco não tem as cópias: cada atividade uma vez só",
    [...atual.values()].filter(a => a.frota === "F-617").length === 3 && !atual.has("mu-1"));
  const itens = leg.lancamentosEmCopias(legado, fita, atual);
  const de = id => itens.filter(it => it.e.id === id)[0];
  igual("acha os lançamentos que foram para cópias — exclusão de cópia não entra (era tirar a duplicata)",
    itens.map(it => it.e.id), ["c1", "j1", "c2", "j2", "c3", "c4"]);
  ok("a baixa da cópia acha a certa pela atividade, mesmo com maiúsculas diferentes",
    de("c1").certa && de("c1").certa.id === "A-0205" && de("c1").por === "atividade" && !de("c1").feito, JSON.stringify(de("c1").certa));
  ok("a certa que já tem baixa não leva de novo", de("c2").certa.id === "A-0935" && de("c2").feito);
  ok("nem a justificativa que acompanhava essa baixa (não apaga o motivo da certa)", de("j2").feito);
  ok("a que o banco não tem fica sem correspondência, dizendo por quê", !de("c3").certa && /não achei/.test(de("c3").porque));
  ok("texto diferente, mesma OS na mesma frota: acha pela OS", de("c4").certa && de("c4").certa.id === "A-0300" && de("c4").por === "OS");
  const novos = leg.levarParaAsCertas(itens);
  igual("levar faz a baixa e a justificativa na certa, com a data e o motivo da cópia",
    novos.map(e => [e.tipo, e.alvo, e.dados && (e.dados.em || e.dados.motivo)]),
    [["concluida", "A-0205", "2026-10-09"], ["justificada", "A-0205", "Peça atrasou"], ["concluida", "A-0300", "2026-10-12"]]);
  const depoisDeLevar = ev.reconstruir([...fita, ...novos.map((e, i) => ({ ...e, id: "n" + i, ts: "2026-10-13T19:00:0" + i + ".000Z" }))]).atividade;
  ok("e, levado, nada mais fica pendente", leg.lancamentosEmCopias(legado, fita, depoisDeLevar).filter(it => it.certa && !it.feito).length === 0);
  const porId = id => depois.find(e => e.id === id);
  igual("em palavras", [leg.descrever(porId("c1")), leg.descrever(porId("j1")), leg.descrever(porId("x3"))],
    ["baixa em 09/10/2026", "justificativa: Peça atrasou (Fornecedor)", "exclusão"]);
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

// ── a frota digitada ────────────────────────────────────────────────────────
titulo("texto.js — qualquer frota se digita");
{
  igual("'F-617', 'f617', 'f 617', 'F-0617' e '617' são a mesma frota",
    ["F-617", "f617", "f 617", "F-0617", "617"].map(texto.chaveFrota), ["617", "617", "617", "617", "617"]);
  ok("mas a F-970 G não é a F-970", texto.chaveFrota("F-970 G") !== texto.chaveFrota("F-970"));
  const conhecidas = ["F-617", "F-618", "F-6170", "F-700", "Sub chassi"];
  const so = (d, l = conhecidas) => { const f = texto.filtroDeFrota(d, l); return [f.exata, l.filter(f.bate)]; };
  igual("só o número escolhe a frota inteira, não a que começa igual", so("617"), ["F-617", ["F-617"]]);
  igual("as duas grafias da mesma frota vêm juntas", so("617", ["F-617", "F 617", "F-6170"]), ["F-617", ["F-617", "F 617"]]);
  igual("um pedaço do número mostra as frotas que têm ele", so("61"), ["", ["F-617", "F-618", "F-6170"]]);
  igual("frota que ninguém lançou também se digita, e não acha nada", so("F-99999"), ["", []]);
  igual("o que não é número também", so("sub"), ["", ["Sub chassi"]]);
  ok("vazio, ou só o 'F' do começo, é todas", texto.filtroDeFrota("", conhecidas).vazio &&
    texto.filtroDeFrota("F-", conhecidas).vazio && texto.filtroDeFrota(" f ", conhecidas).bate("F-700"));
}

// ── a avaliação da operação ─────────────────────────────────────────────────
titulo("eventos.js — a frota chegou para a preventiva");
{
  await entrarComo("Mateus");
  const H = modelo.hoje(), dia = n => modelo.somaDias(H, n);
  const [cr] = await ev.aplicar(ev.novaPreventiva({ ...modelo.moldePreventiva(), frota: "F-ENT1", mes: "Out-26", plano: "15 mil km" }));
  const p = () => ev.porId(cr.alvo, "preventiva");
  await ev.aplicar(ev.informarDisponibilidade(p(), dia(-6)));
  await ev.aplicar(ev.marcarParada(p(), dia(-5), "Interna"));
  ok("a parada passou e a frota não chegou: está atrasando", modelo.entregaAtrasando(p(), H));
  igual("e os dias contam contra hoje", modelo.atrasoEntrega(p(), H), 5);
  let futuro = "";
  try { ev.registrarEntrega(p(), dia(1)); } catch (e) { futuro = e.message; }
  ok("chegar amanhã não passa", /depois de hoje/.test(futuro), futuro);
  let semDia = "";
  try { ev.registrarEntrega(p(), ""); } catch (e) { semDia = e.message; }
  ok("sem o dia não passa", /dia/.test(semDia), semDia);

  await ev.aplicar(ev.registrarEntrega(p(), dia(-3)));
  igual("chegou dois dias depois da parada: guarda o combinado e a preventiva fica em andamento",
    [p().entregue_em, p().entrega_combinada, p().em_andamento, modelo.atrasoEntrega(p())], [dia(-3), dia(-5), true, 2]);
  ok("e não está mais atrasando", !modelo.entregaAtrasando(p(), H));
  await ev.aplicar(ev.marcarParada(p(), dia(-2), "", "box ocupado"));
  await ev.aplicar(ev.registrarEntrega(p(), dia(-4), { motivo: " pneu furado na estrada ", quem: "Operação" }));
  igual("corrigir a chegada mantém o combinado da primeira anotação e guarda o porquê",
    [p().entregue_em, p().entrega_combinada, p().motivo_entrega, p().quem_atrasou_entrega],
    [dia(-4), dia(-5), "pneu furado na estrada", "Operação"]);

  const [cr2] = await ev.aplicar(ev.novaPreventiva({ ...modelo.moldePreventiva(), frota: "F-ENT2", mes: "Out-26", plano: "1 ano" }));
  const q = () => ev.porId(cr2.alvo, "preventiva");
  await entrarComo("Pedro");
  await ev.aplicar(ev.informarDisponibilidade(q(), dia(-4)));
  let semMotivo = "";
  try { ev.informarDisponibilidade(q(), dia(-2)); } catch (e) { semMotivo = e.message; }
  ok("remarcar a liberação sem o motivo não passa", /motivo/.test(semMotivo), semMotivo);
  ok("confirmar a mesma data não pede motivo", !!ev.informarDisponibilidade(q(), dia(-4)));
  await ev.aplicar(ev.informarDisponibilidade(q(), dia(-2), "frota em viagem"));
  let opEntrega = "";
  try { ev.registrarEntrega(q(), dia(-1)); } catch (e) { opEntrega = e.message; }
  ok("a operação não anota a chegada — é do PCM", /permiss/i.test(opEntrega), opEntrega);
  await entrarComo("Mateus");

  const av = await import("../js/avaliacao.js");
  const daqui = av.ocorrencias({ movs: [], prevs: ev.lista("preventiva"), log: ev.log, de: dia(-10), ate: H })
    .filter(o => o.frota === "F-ENT1" || o.frota === "F-ENT2");
  igual("na avaliação: a chegada atrasada e a liberação remarcada, com o porquê",
    daqui.map(o => [o.tipo, o.frota, o.dias, o.motivo]).sort(),
    [["entrega", "F-ENT1", 1, "pneu furado na estrada"], ["liberacao", "F-ENT2", 2, "frota em viagem"]]);
  ok("a fita fecha com as chegadas", ev.conferir().ok);
}

titulo("avaliacao.js — as contas da avaliação da operação");
{
  const av = await import("../js/avaliacao.js");
  const ref = "2026-10-13";                               // terça
  const mov = (id, frota, extra) => ({ ...modelo.moldeMovimentacao(), id, frota, acao: "Levar", destino: "Cardan Service", aprovada: true, ...extra });
  const movs = [
    mov("M1", "F-1", { prometida_para: "2026-10-05", chegou_em: "2026-10-07", motivo_atraso: "pneu", quem_atrasou: "operação" }),
    mov("M2", "F-2", { prometida_para: "2026-10-06", chegou_em: "2026-10-06" }),
    mov("M3", "F-1", { chegou_em: "2026-10-08", acao: "Lavar", destino: "" }),                          // sem prazo
    mov("M4", "F-3", { prometida_para: "2026-10-01", chegou_em: "2026-10-12" }),                       // 11 dias, sem porquê
    mov("M5", "F-4", { prometida_para: "2026-10-10" }),                                                // atrasando agora
    mov("M6", "F-9", { prometida_para: "2026-10-01", chegou_em: "2026-10-09", cancelada: true }),
    mov("M7", "F-9", { prometida_para: "2026-09-10", chegou_em: "2026-09-20" }),                       // fora do período
  ];
  const prev = (id, frota, extra) => ({ ...modelo.moldePreventiva(), id, frota, mes: "Out-26", plano: "15 mil km", ...extra });
  const prevs = [
    prev("PA", "F-1", { entregue_em: "2026-10-09", entrega_combinada: "2026-10-08" }),
    prev("PB", "F-2", { entregue_em: "2026-10-06", entrega_combinada: "2026-10-06" }),
    prev("PC", "F-5", { dia_parada: "2026-10-10", disponivel_agora: true }),                            // não chegou
    prev("PD", "F-6", { disponivel_em: "2026-10-11" }),
  ];
  const lib = (id, de, quando, ts, motivo = "") => ({ id, tipo: "prev_disponivel", alvo: "PD", alvo_tipo: "preventiva",
    ts, motivo, autor: "Pedro", dados: { de, quando } });
  const log = [
    lib("E1", "2026-10-05", "2026-10-09", "2026-10-04T10:00:00Z", "viagem"),
    lib("E2", "2026-10-09", "agora", "2026-10-08T10:00:00Z"),                                         // antecipou
    lib("E3", "agora", "2026-10-11", "2026-10-09T10:00:00Z", "quebrou na estrada"),
    lib("E4", "", "2026-10-12", "2026-10-03T10:00:00Z"),                                              // a primeira
  ];
  const ocs = av.ocorrencias({ movs, prevs, log, de: "2026-10-01", ate: ref });
  igual("só entra o feito no período: cancelada, fora do período, antecipar e a primeira liberação ficam de fora",
    ocs.map(o => (o.evento || o.id) + ":" + o.dias).sort(), ["E1:4", "E3:2", "M1:2", "M2:0", "M3:0", "M4:11", "PA:1", "PB:0"]);
  ok("sem data prometida não é atraso nem pontual", ocs.find(o => o.id === "M3").semPrazo && !ocs.find(o => o.id === "M3").atrasou);
  igual("a liberação remarcada de 'agora' conta do dia em que remarcou",
    [ocs.find(o => o.evento === "E3").combinado, ocs.find(o => o.evento === "E3").feito, ocs.find(o => o.evento === "E3").motivo],
    ["agora", "2026-10-11", "quebrou na estrada"]);
  igual("a categoria vem da movimentação", [ocs.find(o => o.id === "M1").categoria, ocs.find(o => o.id === "M3").categoria],
    ["Levar ao fornecedor", "Lavagem"]);

  const agora = av.atrasandoAgora({ movs, prevs, ref });
  igual("atrasando agora: a movimentação vencida e a frota que não chegou para a parada",
    agora.map(o => [o.tipo, o.frota, o.dias]), [["mov", "F-4", 3], ["entrega", "F-5", 3]]);
  ok("liberada sem parada marcada não é entrega atrasada: está esperando o PCM",
    !modelo.entregaAtrasando(prevs.find(p => p.id === "PD"), ref) && !modelo.combinadoEntrega(prevs.find(p => p.id === "PD")));

  const r = av.resumo(ocs, agora);
  igual("movimentações: a pontualidade conta só as que têm prazo",
    [r.mov.total, r.mov.com_prazo, r.mov.no_prazo, r.mov.atrasadas, r.mov.sem_prazo, r.mov.pct.toFixed(3), r.mov.atraso_medio, r.mov.dias],
    [4, 3, 1, 2, 1, "0.333", 6.5, 13]);
  igual("entregas para a preventiva", [r.entrega.total, r.entrega.no_prazo, r.entrega.atrasadas, r.entrega.pct], [2, 1, 1, 0.5]);
  igual("liberações remarcadas, frotas e dias", [r.liberacao.remarcadas, r.liberacao.frotas, r.liberacao.dias], [2, 1, 6]);
  igual("o que está atrasando agora", [r.agora.total, r.agora.movs, r.agora.entregas, r.agora.dias], [2, 1, 1, 6]);
  igual("e o total do período", [r.atrasos, r.dias_perdidos], [5, 20]);
  igual("sem nada no período, a pontualidade fica em branco, não em zero", av.resumo([]).mov.pct, null);

  igual("para justificar, de qualquer período: as concluídas sem porquê, a vencida e a chegada atrasada",
    av.semJustificativa(movs, prevs, log, ref).map(o => [o.tipo, o.id, o.dias]),
    [["mov", "M4", 11], ["mov", "M7", 10], ["mov", "M5", 3], ["entrega", "PA", 1]]);

  igual("semana a semana, de segunda a domingo",
    av.porSemana(ocs, "2026-10-01", ref).map(s => [s.rotulo, s.ini, s.no_prazo, s.atrasadas, s.liberacoes]),
    [["S40", "2026-09-28", 0, 0, 1], ["S41", "2026-10-05", 2, 2, 1], ["S42", "2026-10-12", 0, 1, 0]]);

  igual("quem atrasou: a mesma pessoa escrita de dois jeitos é uma só, e o vazio vira 'Não informado'",
    av.agruparAtrasos(ocs, "quem").map(g => [g.rotulo, g.total, g.mov, g.entrega, g.liberacao, g.dias]),
    [["Operação", 3, 1, 0, 2, 8], ["Não informado", 2, 1, 1, 0, 12]]);
  igual("por frota: mais atrasos primeiro, e no empate os mais dias",
    av.porFrota(ocs).map(f => [f.frota, f.total, f.atrasos, f.dias]),
    [["F-6", 2, 2, 6], ["F-1", 3, 2, 3], ["F-3", 1, 1, 11], ["F-2", 2, 0, 0]]);
  igual("por categoria: no prazo, com atraso e sem prazo",
    av.porCategoria(ocs).map(c => [c.categoria, c.no_prazo, c.atrasadas, c.sem_prazo]),
    [["Levar ao fornecedor", 1, 2, 0], ["Lavagem", 0, 0, 1]]);
  igual("tamanho dos atrasos, em faixas", av.porFaixa(ocs).map(f => f.total), [1, 2, 1, 1, 0]);

  const per = Object.fromEntries(av.periodos(ref).map(x => [x.id, [x.de, x.ate]]));
  igual("os períodos contados de hoje", per, {
    "mes": ["2026-10-01", ref], "mes-passado": ["2026-09-01", "2026-09-30"],
    "4s": ["2026-09-21", ref], "12s": ["2026-07-27", ref], "ano": ["2026-01-01", ref] });
  igual("em janeiro, o mês passado é dezembro do ano anterior",
    av.periodos("2027-01-05").find(x => x.id === "mes-passado"), { id: "mes-passado", rotulo: "Mês passado", de: "2026-12-01", ate: "2026-12-31" });
}

// ── a sequência de etapas e os motivos prontos ─────────────────────────────
titulo("modelo.js — o porquê do atraso, com motivos prontos");
{
  const c = t => modelo.categoriaDoMotivo(t);
  igual("as frases que a equipe já escreve caem no motivo certo",
    ["Prioridade entrou na frente", "frota foi para operação", "Bate e volta no pecem", "Frota vai junto com o 621",
      "Frota vai pra Bahia buscar equipamentos", "A frota estava em viagem", "Frota esta sendo utilizada",
      "Atraso no envio da frota ao fornecedor por conta de operação e lavagem da frota", "pneu furado na estrada"].map(c),
    ["prioridade", "operacao", "operacao", "conjunto", "operacao", "operacao", "operacao", "operacao", "outro"]);
  igual("o motivo escolhido vale mais que o texto", modelo.categoriaDoMotivo("frota em viagem", "motorista"), "motorista");
  igual("sem texto e sem escolha, fica sem motivo", [modelo.categoriaDoMotivo(""), modelo.nomeMotivo("")], ["", "Sem motivo informado"]);
}

titulo("eventos.js — sequência de etapas para a mesma frota");
{
  await entrarComo("Pedro");
  const H = modelo.hoje(), dia = n => modelo.somaDias(H, n);
  const FR = "F-SEQ1";
  const evs = ev.pedirSequencia({ frota: FR, prioridade: "Alta", para_que: "antes da preventiva" },
    [{ acao: "Lavar", destino: "Lava-jato", prometida_para: dia(-2) }, { acao: "", destino: "" },
      { acao: "Levar", destino: "Cardan Service", prometida_para: dia(1) }]);
  igual("a operação pede duas etapas (a vazia sai), cada uma uma movimentação da mesma sequência",
    evs.map(e => [e.tipo, e.dados.frota, e.dados.etapa, e.dados.acao, !!e.dados.roteiro]),
    [["criada", FR, 1, "Lavar", true], ["criada", FR, 2, "Levar", true]]);
  ok("com o mesmo roteiro", evs[0].dados.roteiro === evs[1].dados.roteiro);
  await ev.aplicar(evs);
  const movs = () => ev.lista("movimentacao");
  const e1 = () => ev.porId(evs[0].alvo, "movimentacao"), e2 = () => ev.porId(evs[1].alvo, "movimentacao");
  igual("as etapas em ordem", modelo.etapasDe(e2(), movs()).map(m => m.etapa), [1, 2]);
  ok("a 2ª espera a 1ª", modelo.etapaAnteriorAberta(e2(), movs())?.id === e1().id);
  igual("cada etapa tem o seu prazo e o seu atraso", [modelo.situacaoMovimentacao(e1(), H), modelo.situacaoMovimentacao(e2(), H)],
    ["Atrasada", "Em aberto"]);
  await ev.aplicar(ev.chegou(e1(), H));
  ok("feita a 1ª, a 2ª é a da vez", !modelo.etapaAnteriorAberta(e2(), movs()));
  const so = ev.pedirSequencia({ frota: "F-SEQ2" }, [{ acao: "Realizar TOP", destino: "Box" }]);
  ok("uma etapa só é uma movimentação comum", so.length === 1 && !so[0].dados.roteiro);
  let vazia = "";
  try { ev.pedirSequencia({ frota: "F-SEQ3" }, [{ acao: "", destino: "" }]); } catch (e) { vazia = e.message; }
  ok("sem o que fazer nem onde, não passa", /fazer ou onde/.test(vazia), vazia);
  await ev.aplicar(so);
  const avulsa = ev.porId(so[0].alvo, "movimentacao");
  const mais = ev.proximaEtapa(avulsa, { acao: "Lavar", destino: "Lava-jato", prometida_para: dia(2) }, movs());
  await ev.aplicar(mais);
  igual("a movimentação avulsa vira a etapa 1 quando ganha a próxima",
    modelo.etapasDe(ev.porId(avulsa.id, "movimentacao"), movs()).map(m => [m.etapa, m.acao]), [[1, "Realizar TOP"], [2, "Lavar"]]);
  ok("e a fita fecha", ev.conferir().ok);

  // o porquê, com o motivo pronto
  const j = ev.justificar(e1(), { categoria: "prioridade", quem: "Operação" }, "movimentacao");
  igual("só o motivo pronto: o nome dele vira o porquê escrito", [j.dados.motivo, j.dados.categoria], ["Outra prioridade entrou na frente", "prioridade"]);
  await ev.aplicar(j);
  igual("e a movimentação guarda os dois", [e1().motivo_atraso, e1().motivo_cat, e1().quem_atrasou],
    ["Outra prioridade entrou na frente", "prioridade", "Operação"]);
  const av = await import("../js/avaliacao.js");
  const ocs = av.ocorrencias({ movs: movs().filter(m => m.frota === FR), prevs: [], log: [] });
  igual("na avaliação, por motivo e por quem", av.porMotivo(ocs).map(x => [x.id, x.total, x.quem[0]]),
    [["prioridade", 1, ["Operação", 1]]]);
  await entrarComo("Mateus");
}

titulo("modelo.js — o passo a passo da preventiva");
{
  const H = "2026-10-23";
  const P = extra => ({ ...modelo.moldePreventiva(), frota: "F-1", vence: "2026-10-30", ...extra });
  const casos = [
    [P({}), "liberar", false],
    [P({ disponivel_agora: true }), "parada", false],
    [P({ disponivel_em: "2026-11-05", prazo_service: "2026-10-30" }), "parada", true],
    [P({ disponivel_agora: true, dia_parada: "2026-10-27" }), "chegada", false],
    [P({ disponivel_agora: true, dia_parada: "2026-10-20" }), "chegada", true],
    [P({ disponivel_agora: true, dia_parada: "2026-10-20", entregue_em: "2026-10-21" }), "baixa", false],
    [P({ em_andamento: true }), "baixa", false],
    [P({ disponivel_agora: true, dia_parada: "2026-10-20", realizada_em: "2026-10-22" }), "feita", false],
    [P({ adiada: true }), "fora", false],
    [P({ cancelada: true }), "fora", false],
  ];
  igual("o passo é o primeiro que falta, e o problema é o que passou do combinado",
    casos.map(([p]) => [modelo.passoPreventiva(p), modelo.passoAtrasado(p, H)]), casos.map(([, x, y]) => [x, y]));
  igual("os quatro passos, cada um de alguém", modelo.PASSOS_PREV.map(x => `${x.n} ${x.nome} · ${x.quem}`),
    ["1 Liberação · Operação", "2 Parada · PCM", "3 Chegada · Operação", "4 Baixa · PCM"]);
}

console.log(`\n${passou} passaram, ${falhou} falharam`);
if (falhou) { for (const f of falhas) console.log(`  × ${f}`); process.exit(1); }
