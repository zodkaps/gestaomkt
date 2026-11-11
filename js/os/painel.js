// O painel de OS do Protheus (STJ + STL), dentro do site (05/11/2026).
//
// Era um artefato à parte, atualizado pelo Claude todo dia; veio para cá para
// ficar junto das movimentações e preventivas, com o mesmo acesso — e só para
// quem tem a marca `os_makro` (sql/04_painel_os.sql). Os dados não moram aqui:
// chegam de js/os/inicio.js, que os busca no bucket privado do Supabase.
//
// O desenho é o mesmo do artefato v9 (aba Programação, Não liberadas, quem
// aponta mão de obra, a carteira para imprimir…): o código veio inteiro, e as
// únicas trocas foram de onde vêm os dados, como se baixa um arquivo e de onde
// carrega o gerador de PDF.
//
// `d3` é o global de vendor/d3.min.js (carregado pela os.html).

import { celulaCSV } from "../texto.js";
import * as IND from "./indicadores.js";

/** Desenha o painel com os dados `D` (o bloco que js/os/montar.js monta).
 *  `baixar`: { save({ filename, data }) }, o download do navegador.
 *  `raiz`: onde o painel mora — a área isolada da tela OS Makro do site (js/tela/os.js), com o molde dele.
 *  `aba`: a aba para abrir; `aoTrocarAba(aba)`: avisa o site, que põe a aba no endereço.
 *  Devolve `{ parar }`: desliga o que o painel ouve na janela, para a tela sair limpa. */
export function iniciarPainel(D, { baixar, raiz = document, aba = '', aoTrocarAba = null, meta = null, fontes = null, temaClaro = null } = {}) {
  const $ = (s) => raiz.querySelector(s);
  // o que o painel ouve fora dele (janela, documento) sai junto quando a tela fecha
  const fim = new AbortController();
  const ouvir = (alvo, ev, fn, opcoes = {}) => alvo.addEventListener(ev, fn, { ...opcoes, signal: fim.signal });
  // o elemento de verdade sob o clique, mesmo de fora da área isolada
  const alvoDe = (e) => (e.composedPath ? e.composedPath()[0] : e.target);
  const focado = () => (raiz.activeElement !== undefined ? raiz.activeElement : document.activeElement);
  const nf = new Intl.NumberFormat('pt-BR');
  const nh = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const pc = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });
  const br = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
  const dm = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const el = (tag, attrs = {}, ...filhos) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
      else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v);
    }
    for (const f of filhos.flat()) if (f != null && f !== false) e.append(f);
    return e;
  };
  const plural = (n, um, varios) => `${nf.format(n)} ${n === 1 ? um : varios}`;

  // ── as cores: um sentido para cada uma ──
  const COR = { A: 'var(--liberada)', P: 'var(--pendente)', F: 'var(--finalizada)', criadas: 'var(--liberada)', prog: 'var(--prog)', nprog: 'var(--nprog)',
    ctx: 'var(--ctx)', alerta: 'var(--alerta)' };
  const SIT = { A: 'Liberada', P: 'Pendente de liberação', F: 'Finalizada' };
  const CLASSE = { P: 'Programada', N: 'Não programada', O: 'Outra categoria', S: 'Sem categoria' };
  const COR_CLASSE = { P: COR.prog, N: COR.nprog, O: COR.ctx, S: COR.ctx };
  const GRUPO = { I: 'Equipe interna', T: 'Terceirizada', S: 'Sem executante' };
  const FAIXAS = ['Até 30 dias', '31 a 60 dias', '61 a 90 dias', 'Mais de 90 dias'];
  const TERCEIRO = 'Terceiro';
  const CATS = D.cats || [], CLS = D.classe || [];

  // ── as OS ──
  const DIA = 864e5;
  const ref = Date.parse(D.base + 'T00:00:00Z');
  const t = (iso) => Date.parse(iso + 'T00:00:00Z');
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const segundaDe = (ms) => ms - ((new Date(ms).getUTCDay() + 6) % 7) * DIA;
  const semanaISO = (ms) => { const qui = new Date(segundaDe(ms) + 3 * DIA); return 1 + Math.floor((qui - Date.UTC(qui.getUTCFullYear(), 0, 1)) / DIA / 7); };
  const OS = D.os.map((a, i) => ({ i, os: a[0], filial: a[1], frota: a[2], equip: D.equip[a[3]] || '', servico: a[4], abertura: a[5], sit: a[6], fim: a[7],
    tipo: a[8] === 'P' ? 'Preventiva' : 'Corretiva', tercSTJ: a[9] === 'S', cat: CATS[a[10]] || 'Sem categoria', classe: CLS[a[10]] || 'S', liberada: a[11] || '',
    obs: a[12] || '', servCod: a[13] || '', contador: a[14] || '', ccusto: a[15] || '', inicioMan: a[16] || '', tercSTL: a[17] === 'S',
    espTxt: a[18] || '', espList: a[18] ? a[18].split('; ') : [], progEm: a[19] || '', abertaPor: a[20] || '', origemHist: a[21] === 'H', fimReal: a[22] || '', quem: [] }));
  for (const [nome, l] of Object.entries(D.exec)) for (const [i, h, hp, prev, real] of l) OS[i].quem.push({ nome, h: h || 0, hp: hp || 0, prev: prev || '', real: real || '' });
  for (const o of OS) {
    o.quem.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
    o.pessoas = o.quem.filter((q) => q.nome !== TERCEIRO);
    // terceirizada: a STJ marca Terceiro, a mão de obra é "Terceiro", ou a STL tem o insumo Terceiro (revisão de 03/11)
    o.grupo = o.tercSTJ || o.tercSTL || o.quem.some((q) => q.nome === TERCEIRO) ? 'T' : o.pessoas.length ? 'I' : 'S';
    o.horas = Math.round(o.quem.reduce((s, q) => s + q.h, 0) * 10) / 10;
    o.hPrev = Math.round(o.quem.reduce((s, q) => s + q.hp, 0) * 10) / 10;
    // a data prevista: a mais cedo da mão de obra prevista na STL; nas para fechar, se já passou
    o.prev = o.quem.reduce((m, q) => (q.prev && (!m || q.prev < m) ? q.prev : m), '');
    o.prevEstado = o.sit === 'F' ? '' : !o.prev ? 'sem' : o.prev < D.base ? 'vencida' : 'futura';
    // aberta: há quantos dias; finalizada: quantos dias levou. A OS aberta no Protheus depois de o serviço
    // acabar (o fim antes da abertura: 1.826 em 03/11) conta do início real da manutenção — antes dava 0 dia
    o.lancDepois = o.sit === 'F' && o.fim && o.abertura && o.fim < o.abertura ? Math.round((t(o.abertura) - t(o.fim)) / DIA) : 0;
    const desde = o.lancDepois && o.inicioMan && o.inicioMan <= o.fim ? o.inicioMan : o.abertura;
    o.dias = desde ? Math.max(0, Math.round(((o.sit === 'F' ? t(o.fim) : ref) - t(desde)) / DIA)) : null;
    o.faixa = o.sit === 'F' || o.dias == null ? -1 : o.dias <= 30 ? 0 : o.dias <= 60 ? 1 : o.dias <= 90 ? 2 : 3;
    o.quemTxt = o.grupo === 'T' ? 'Terceirizada' : o.pessoas.map((q) => q.nome).join(', ') || 'Sem executante';
    o.busca = norm([o.os, o.frota, o.servico, o.equip, o.cat, CLASSE[o.classe], o.tipo, o.quemTxt, o.obs, o.servCod, o.ccusto, o.espTxt, o.abertaPor, o.abertaPor.replace(/\D/g, '')].join(' '));
  }
  const FROTAS = [...new Set([...D.frotas_lista, ...OS.map((o) => o.frota)])].sort((a, b) => a.localeCompare(b, 'pt', { numeric: true }));
  const EQUIPS = [...new Set(OS.map((o) => o.equip).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
  const FILIAIS = [...new Set(OS.map((o) => o.filial))].sort();
  // na lista do filtro, só nome de gente: a STL às vezes traz "-" no lugar do nome
  const NOMES = Object.keys(D.exec).filter((n) => n !== TERCEIRO && /[a-zà-ú]/i.test(n)).sort((a, b) => a.localeCompare(b, 'pt'));
  const eqDe = new Map();
  for (const o of OS) if (o.equip && !eqDe.has(o.frota)) eqDe.set(o.frota, o.equip);
  // os que o PCM acompanha de perto: vêm com os dados (a base histórica), não do código — o
  // repositório é público e nome de funcionário não entra nele. Sem a lista, o botão não aparece.
  const PRINCIPAIS = (D.principais || []).map((p) => NOMES.find((n) => norm(n).startsWith(norm(p)))).filter(Boolean);
  // quem ainda aponta (05/11/2026): o último dia em que a pessoa apontou mão de obra na STL inteira (em
  // qualquer OS, de qualquer filial — não só nas frotas do PCM). Sem apontar há mais de 60 dias, sai do
  // gráfico de mão de obra: pode ter saído ou mudado de área. Dá para ver todos no mesmo gráfico.
  const ULT = D.ult || null, DIAS_FORA = 60, CORTE = iso(ref - DIAS_FORA * DIA);
  const ultimoDe = (n) => (ULT && ULT[n] ? ULT[n][0] : '');
  const aponta = (n) => !ULT || n === TERCEIRO || ultimoDe(n) >= CORTE;
  const dma = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(2, 4) : '');
  const foraTxt = (n) => (ultimoDe(n) ? 'não aponta desde ' + dma(ultimoDe(n)) : 'sem apontamento na STL');
  // a OS da equipe em que ninguém mais aponta: na prática, está sem executante
  for (const o of OS) o.soFora = !!ULT && o.grupo === 'I' && o.pessoas.every((q) => !aponta(q.nome));
  const primeiraAbertura = OS.reduce((m, o) => (o.abertura && o.abertura < m ? o.abertura : m), D.base);

  // ── os períodos das finalizadas ──
  const anoBase = Number(D.base.slice(0, 4)), mesBase = Number(D.base.slice(5, 7));
  // o período (11/11/2026): um só para o painel inteiro. Cada número usa o evento dele dentro do período —
  // a entrada pela abertura, a saída pelo fim (js/os/indicadores.js), a programada pela data programada.
  // O que é situação de hoje (idade, executante, previsão) é sempre a do export.
  const agora0 = new Date(), hojeL = `${agora0.getFullYear()}-${String(agora0.getMonth() + 1).padStart(2, '0')}-${String(agora0.getDate()).padStart(2, '0')}`;
  const fimDoMes = (d) => iso(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0));
  const segBase = iso(segundaDe(ref));
  const mes1 = mesBase === 1 ? `${anoBase - 1}-12-01` : `${anoBase}-${String(mesBase - 1).padStart(2, '0')}-01`;
  const PERIODOS = [
    ['hoje', D.base === hojeL ? 'Hoje' : 'Dia do último export', D.base, D.base],
    ['7d', 'Últimos 7 dias', iso(ref - 6 * DIA)],
    ['30d', 'Últimos 30 dias', iso(ref - 29 * DIA)],
    ['semana', 'Semana atual', segBase, iso(t(segBase) + 6 * DIA)],
    ['mes', 'Mês atual', D.base.slice(0, 8) + '01', fimDoMes(D.base)],
    ['mes-1', 'Mês anterior', mes1, fimDoMes(mes1)],
    ['12s', 'Últimas 12 semanas', iso(segundaDe(ref) - 11 * 7 * DIA)],
    ['ano', 'Em ' + anoBase, anoBase + '-01-01'],
    ['ano-1', 'Em ' + (anoBase - 1), (anoBase - 1) + '-01-01', (anoBase - 1) + '-12-31'],
    ['tudo', 'Todo o histórico (desde ' + MES[Number(primeiraAbertura.slice(5, 7)) - 1] + '/' + primeiraAbertura.slice(2, 4) + ')', primeiraAbertura],
].map(([k, rot, desde, ate]) => ({ k, rot, desde, ate: ate || D.base }));

  // ── o estado ──
  // Os filtros se somam: dentro de um filtro vale qualquer um dos marcados (ou, com "Excluir as
  // marcadas", todos menos eles); entre filtros, todos ao mesmo tempo. Na barra, os quatro de todo dia:
  // Frota, Situação, Executante (com "Sem executante" no alto) e Programação; o resto em "Mais
  // filtros", à vista, em grupos (v6, 03/11/2026: o "+ Filtro" da v5 escondia os campos).
  const ABAS = ['geral', 'indicadores', 'programacao', 'avanco', 'pendentes', 'carteira', 'frotas', 'executantes', 'auditoria'];
  const MULTI = ['frota', 'sit', 'prog', 'tipo', 'exec', 'esp', 'equip', 'serv', 'ccusto', 'filial', 'idade', 'prev', 'mesAb', 'mesFim', 'lanc'];
  const PRINC = ['frota', 'sit', 'exec', 'prog'];
  const GUARDA_MAIS = 'painel-os-mais-filtros';
  const lerMais = () => { try { return localStorage.getItem(GUARDA_MAIS) === '1'; } catch (e) { return false; } };
  const guardarMais = () => { try { localStorage.setItem(GUARDA_MAIS, V.mais ? '1' : '0'); } catch (e) { /* sem armazenamento */ } };
  const F = { periodo: 'semana', per: null, q: '', neg: new Set(), r: {} };
  for (const k of MULTI) F[k] = new Set();
  const V = { aba: ABAS.includes(aba) ? aba : 'geral', ord: {}, cart: {}, execQuem: 'aponta', mais: lerMais(), frotaOrd: 'ab', tudo: {}, regras: false, serie: '', pg: { por: 'exec' }, aud: { dias: null, imp: null, a: '', b: '', res: null, cat: '', erro: '' },
    av: { por: 'exec', lista: 'saiu' } };
  // o período livre (09/11/2026): o começo e o fim escolhidos no calendário — ou andados pelas setas
  const periodo = () => (F.periodo === 'livre' && F.per
    ? { k: 'livre', rot: rotPeriodo(F.per.desde, F.per.ate), desde: F.per.desde, ate: F.per.ate }
    : PERIODOS.find((p) => p.k === F.periodo) || PERIODOS.find((p) => p.k === 'semana'));
  /** O período é um dia, uma semana (segunda a domingo) ou um mês inteiro? Senão, "". */
  const unidadeDe = (de, ate) => (de === ate ? 'dia' : new Date(t(de)).getUTCDay() === 1 && t(ate) - t(de) === 6 * DIA ? 'semana'
    : de.slice(8) === '01' && ate === fimDoMes(de) ? 'mes' : '');
  function rotPeriodo(de, ate) {
    const u = unidadeDe(de, ate);
    if (u === 'dia') return `${DIAS_LONGO[new Date(t(de)).getUTCDay()]}, ${br(de)}`;
    if (u === 'semana') return `Semana ${semanaISO(t(de))} · ${dm(de)} a ${dm(ate)}`;
    if (u === 'mes') { const m = Number(de.slice(5, 7)); return MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1) + ' de ' + de.slice(0, 4); }
    return `De ${br(de)} a ${br(ate)}`;
  }
  /** As setas: o período do mesmo tamanho antes ou depois (a semana, o mês ou o dia inteiro, se for um). */
  function periodoAndado(n) {
    const p = periodo(), u = unidadeDe(p.desde, p.ate);
    if (u === 'mes') { const de = andar('mes', p.desde, n); return { desde: de, ate: fimDoMes(de) }; }
    const dias = Math.round((t(p.ate) - t(p.desde)) / DIA) + 1;
    return { desde: iso(t(p.desde) + n * dias * DIA), ate: iso(t(p.ate) + n * dias * DIA) };
  }
  function andarPeriodo(n) {
    const x = periodoAndado(n);
    if (x.desde > D.base) return;
    aplicar(() => { F.periodo = 'livre'; F.per = x; });
  }
  const PREV = { vencida: 'Prevista e a data já passou', futura: 'Prevista de hoje em diante', sem: 'Sem data prevista na STL' };
  const SEM_EQUIP = 'Sem equipamento', SEM_CC = 'Sem centro de custo';
  const ordPt = (a, b) => a.localeCompare(b, 'pt', { numeric: true });
  const mesRot = (m) => MESES[Number(m.slice(5, 7)) - 1] + ' de ' + m.slice(0, 4);
  const MESES_AB = [...new Set(OS.map((o) => o.abertura.slice(0, 7)).filter(Boolean))].sort().reverse();
  const MESES_FIM = [...new Set(OS.filter((o) => o.fim).map((o) => o.fim.slice(0, 7)))].sort().reverse();
  const SERVS = [...new Set(OS.map((o) => o.servico).filter(Boolean))].sort(ordPt);
  const CCS = [...new Set(OS.map((o) => o.ccusto || SEM_CC))].sort(ordPt);
  const ESPS = [...new Set(OS.flatMap((o) => o.espList))].sort(ordPt);
  // os valores de cada OS em cada filtro
  const CHAVES = {
    frota: (o) => [o.frota], sit: (o) => [o.sit], prog: (o) => [o.classe, 'c:' + o.cat], tipo: (o) => [o.tipo],
    // o executante: quem fecha (equipe interna, terceirizada ou sem executante) e cada pessoa
    exec: (o) => ['g:' + o.grupo, ...(o.soFora ? ['g:X'] : []), ...o.pessoas.map((q) => q.nome)], esp: (o) => o.espList, equip: (o) => [o.equip || SEM_EQUIP], serv: (o) => [o.servico],
    ccusto: (o) => [o.ccusto || SEM_CC], filial: (o) => [o.filial],
    idade: (o) => (o.faixa >= 0 ? [String(o.faixa)] : []), prev: (o) => (o.prevEstado ? [o.prevEstado] : []),
    mesAb: (o) => (o.abertura ? [o.abertura.slice(0, 7)] : []), mesFim: (o) => (o.fim ? [o.fim.slice(0, 7)] : []),
    lanc: (o) => (o.sit === 'F' ? [o.lancDepois ? 's' : 'n'] : []),
  };
  // `g`: o grupo no "+ Filtro"; a ordem aqui é a ordem lá
  const DEF = {
    frota: { rot: 'Frota', g: 'A frota', busca: true, ops: () => FROTAS.map((f) => ({ v: f, rot: f, sub: eqDe.get(f) || '' })) },
    equip: { rot: 'Equipamento', g: 'A frota', busca: true, ops: () => [...EQUIPS, ...(OS.some((o) => !o.equip) ? [SEM_EQUIP] : [])].map((v) => ({ v, rot: v })) },
    sit: { rot: 'Situação', g: 'A OS', dica: 'vale para as listas; os números contam todas', ops: () => [['A', 'Aberta · liberada para execução'], ['P', 'Aberta · aguardando liberação'], ['F', 'Finalizada']].map(([v, rot]) => ({ v, rot, cor: COR[v] })) },
    tipo: { rot: 'Tipo', g: 'A OS', ops: () => ['Corretiva', 'Preventiva'].map((v) => ({ v, rot: v })) },
    prog: { rot: 'Programação', g: 'A OS', busca: true, ops: () => [...['P', 'N', 'O', 'S'].map((c) => ({ v: c, rot: { P: 'Programadas', N: 'Não programadas', O: 'Outras categorias', S: 'Sem categoria' }[c], grupo: 'Programada ou não', cor: COR_CLASSE[c] })),
      ...CATS.map((c, i) => ({ v: 'c:' + c, rot: c, sub: CLASSE[CLS[i]], grupo: 'Uma categoria' }))] },
    serv: { rot: 'Serviço', g: 'A OS', busca: true, ops: () => SERVS.map((v) => ({ v, rot: v })) },
    idade: { rot: 'Idade', g: 'A OS', dica: 'só as para fechar', ops: () => FAIXAS.map((f, i) => ({ v: String(i), rot: f })) },
    lanc: { rot: 'Lançada depois do serviço', g: 'A OS', dica: 'só as finalizadas: o fim veio antes da abertura', ops: () => [{ v: 's', rot: 'Sim, aberta no Protheus depois do fim' }, { v: 'n', rot: 'Não' }] },
    filial: { rot: 'Filial', g: 'A OS', ops: () => FILIAIS.map((v) => ({ v, rot: v })) },
    ccusto: { rot: 'Centro de custo', g: 'A OS', busca: true, ops: () => CCS.map((v) => ({ v, rot: v })) },
    exec: { rot: 'Executante', g: 'Quem fecha', busca: true, ops: () => [
      ...[['S', 'Sem executante', 'ninguém na STL'], ['T', 'Terceirizada', 'terceiro na STJ ou na STL'], ['I', 'Equipe interna', 'qualquer pessoa da equipe']]
        .map(([v, rot, sub]) => ({ v: 'g:' + v, rot, sub, grupo: 'Quem fecha', cor: v === 'S' ? COR.alerta : null })),
      ...(ULT ? [{ v: 'g:X', rot: `Só com quem não aponta há ${DIAS_FORA} dias`, sub: 'ninguém da OS aparece na STL desde ' + dm(CORTE), grupo: 'Quem fecha', cor: COR.alerta }] : []),
      ...NOMES.filter(aponta).map((v) => ({ v, rot: v, grupo: ULT ? `Quem aponta (últimos ${DIAS_FORA} dias)` : 'Uma pessoa' })),
      ...NOMES.filter((n) => !aponta(n)).map((v) => ({ v, rot: v, sub: foraTxt(v), grupo: `Sem apontar há mais de ${DIAS_FORA} dias` }))] },
    esp: { rot: 'Especialidade prevista', g: 'Quem fecha', dica: 'na STL, ainda sem uma pessoa', ops: () => ESPS.map((v) => ({ v, rot: v })) },
    prev: { rot: 'Data prevista', g: 'Quem fecha', dica: 'da mão de obra na STL, nas para fechar', ops: () => Object.entries(PREV).map(([v, rot]) => ({ v, rot })) },
    mesAb: { rot: 'Mês de abertura', g: 'Datas', busca: true, ops: () => MESES_AB.map((v) => ({ v, rot: mesRot(v) })) },
    mesFim: { rot: 'Mês da finalização', g: 'Datas', busca: true, ops: () => MESES_FIM.map((v) => ({ v, rot: mesRot(v) })) },
  };
  // as faixas: de… até…, em data ou em número
  const FX = {
    ab: { rot: 'Aberta em', g: 'Datas', tipo: 'date', val: (o) => o.abertura },
    fimD: { rot: 'Finalizada em', g: 'Datas', tipo: 'date', dica: 'o dia; vale junto com o período da barra', val: (o) => o.fim },
    progD: { rot: 'Programada para', g: 'Datas', tipo: 'date', dica: 'a previsão de início da manutenção na STJ', val: (o) => o.progEm },
    lib: { rot: 'Liberada em', g: 'Datas', tipo: 'date', val: (o) => o.liberada },
    prevD: { rot: 'Prevista para', g: 'Datas', tipo: 'date', dica: 'a data da mão de obra na STL', val: (o) => o.prev },
    dias: { rot: 'Dias', g: 'Números', tipo: 'number', un: 'd', dica: 'há quantos dias está aberta, ou quanto levou', val: (o) => o.dias },
    horas: { rot: 'Horas apontadas', g: 'Números', tipo: 'number', un: 'h', val: (o) => o.horas },
    hPrev: { rot: 'Horas previstas', g: 'Números', tipo: 'number', un: 'h', val: (o) => o.hPrev },
  };
  for (const k of Object.keys(FX)) F.r[k] = { de: '', ate: '' };
  const CAMPOS = [...Object.keys(DEF), ...Object.keys(FX)];
  const defDe = (k) => DEF[k] || FX[k];
  const faixaAtiva = (k) => F.r[k].de !== '' || F.r[k].ate !== '';
  const ativo = (k) => (FX[k] ? faixaAtiva(k) : F[k].size > 0);
  const casa = (k, o) => !F[k].size || CHAVES[k](o).some((v) => F[k].has(v)) !== F.neg.has(k);
  const faixaOk = (k, o) => {
    if (!faixaAtiva(k)) return true;
    const r = F.r[k], v = FX[k].val(o);
    if (v == null || v === '') return false;
    if (FX[k].tipo === 'number') return (r.de === '' || v >= Number(r.de)) && (r.ate === '' || v <= Number(r.ate));
    return (!r.de || v >= r.de) && (!r.ate || v <= r.ate);
  };

  /** As OS que passam nos filtros. `sem`: um filtro que fica de fora (para contar as opções dele). */
  function recorte({ sem = '' } = {}) {
    const p = periodo();
    const q = norm(F.q.trim());
    const fx = Object.keys(FX).filter((k) => k !== sem && faixaAtiva(k));
    const ok = (o) => MULTI.every((k) => k === sem || casa(k, o)) && fx.every((k) => faixaOk(k, o)) && (!q || o.busca.includes(q));
    const todas = OS.filter(ok);
    const base = todas.filter((o) => { if (o.sit !== 'F') return true; const sd = IND.saidaDe(o); return sd >= p.desde && sd <= p.ate; });
    return { p, todas, base, abertas: base.filter((o) => o.sit !== 'F'), fechadas: base.filter((o) => o.sit === 'F') };
  }
  // o recorte sem a Situação, que várias partes usam no mesmo desenho: um por desenho (só dentro dele —
  // fora, os filtros podem ter mudado sem desenhar ainda)
  let cacheSemSit = null;
  const semSituacao = () => cacheSemSit || (cacheSemSit = recorte({ sem: 'sit' }));
  const unicaFrota = () => (F.frota.size === 1 && !F.neg.has('frota') ? [...F.frota][0] : '');
  const zerarPaginas = () => { for (const k of Object.keys(V.cart)) V.cart[k].lim = 100; };
  const so = (k, ...v) => { F[k] = new Set(v); F.neg.delete(k); };
  const alterna = (k, v) => { if (F[k].has(v)) F[k].delete(v); else F[k].add(v); };
  const escolhe = (k, v) => { if (F.neg.has(k)) { F.neg.delete(k); F[k].clear(); } alterna(k, v); };   // o clique num gráfico é sempre "é"
  const tirar = (k) => { if (FX[k]) F.r[k] = { de: '', ate: '' }; else { F[k].clear(); F.neg.delete(k); } };
  const limparTudo = () => { for (const k of MULTI) F[k].clear(); for (const k of Object.keys(FX)) F.r[k] = { de: '', ate: '' }; F.neg.clear(); F.q = ''; };
  function aplicar(fn, aba) { fn(); zerarPaginas(); fecharPop(true); if (aba) irPara(aba); else desenhar(); }

  // ── a barra de filtros ──
  const fPer = $('#f-periodo'), fQ = $('#f-q');
  fPer.addEventListener('click', () => alternarPop('periodo', fPer));
  const fAnt = $('#f-per-ant'), fProx = $('#f-per-prox');
  if (fAnt) fAnt.addEventListener('click', () => andarPeriodo(-1));
  if (fProx) fProx.addEventListener('click', () => andarPeriodo(1));
  function pintarPeriodo() {
    const p = periodo();
    $('#f-periodo-txt').textContent = p.k === 'livre' || p.k === 'tudo' ? p.rot : `${p.rot} · ${curtoPer(p)}`;
    fPer.setAttribute('aria-expanded', String(!!pop && pop.k === 'periodo'));
    fPer.classList.toggle('on', p.k !== 'semana');
    if (fProx) fProx.disabled = periodoAndado(1).desde > D.base;
  }
  let espera;
  fQ.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => { F.q = fQ.value; zerarPaginas(); desenhar(); }, 220); });
  const nomeDe = (k, v) => { const o = DEF[k].ops().find((x) => x.v === v); return o ? o.rot : v; };
  const fmtFx = (k, v) => (FX[k].tipo === 'date' ? br(v) : nh.format(Number(v)) + (FX[k].un ? ' ' + FX[k].un : ''));
  /** Os filtros ligados, em texto: "Executante: Sem executante · Frota: F-617". `sem`: um que fica de fora. */
  const filtrosTxt = (sem = '') => [
    ...MULTI.filter((k) => k !== sem && F[k].size).map((k) => DEF[k].rot + (F.neg.has(k) ? ' exceto ' : ': ') + [...F[k]].map((v) => nomeDe(k, v)).join(', ')),
    ...Object.keys(FX).filter(faixaAtiva).map((k) => FX[k].rot + ': ' + textoFaixa(k)), ...(F.q.trim() ? [`busca "${F.q.trim()}"`] : [])].join(' · ');
  const textoFaixa = (k) => { const r = F.r[k]; return r.de !== '' && r.ate !== '' ? (r.de === r.ate ? fmtFx(k, r.de) : `${fmtFx(k, r.de)} a ${fmtFx(k, r.ate)}`) : r.de !== '' ? 'a partir de ' + fmtFx(k, r.de) : 'até ' + fmtFx(k, r.ate); };
  function rotuloPill(k) {
    if (FX[k]) return faixaAtiva(k) ? FX[k].rot + ': ' + textoFaixa(k) : FX[k].rot;
    const s = F[k], neg = F.neg.has(k);
    if (!s.size) return DEF[k].rot;
    if (s.size === 1) return DEF[k].rot + (neg ? ' exceto ' : ': ') + nomeDe(k, [...s][0]);
    return `${DEF[k].rot}${neg ? ' exceto' : ''} · ${s.size}`;
  }
  // na barra, os quatro de todo dia; em "Mais filtros", o resto, à vista e em grupos
  const OUTROS = CAMPOS.filter((k) => !PRINC.includes(k));
  const pill = (k) => el('button', { type: 'button', class: 'pill' + (ativo(k) ? ' on' : '') + (F.neg.has(k) && ativo(k) ? ' neg' : ''), 'data-k': k,
    'aria-haspopup': 'true', 'aria-expanded': String(!!pop && pop.k === k), on: { click: (e) => alternarPop(k, e.currentTarget) } },
    el('span', { class: 'pill-rot', text: rotuloPill(k) }), el('span', { class: 'seta', 'aria-hidden': 'true', text: '▾' }));
  function desenharPills() {
    pintarPeriodo();
    const nOutros = OUTROS.filter(ativo).length;
    $('#pills-multi').replaceChildren(...PRINC.map(pill),
      el('button', { type: 'button', class: 'pill pill-mais' + (nOutros ? ' on' : ''), 'aria-expanded': String(V.mais), 'aria-controls': 'mais-painel',
        on: { click: () => { V.mais = !V.mais; guardarMais(); fecharPop(true); desenharPills(); } } },
        el('span', { class: 'pill-rot', text: 'Mais filtros' + (nOutros ? ' · ' + nOutros : '') }), el('span', { class: 'seta', 'aria-hidden': 'true', text: V.mais ? '▴' : '▾' })));
    const painel = $('#mais-painel');
    painel.hidden = !V.mais;
    if (!V.mais) return;
    const grupos = [...new Set(OUTROS.map((k) => defDe(k).g))];
    painel.replaceChildren(...grupos.map((g) => el('div', { class: 'mais-grupo' }, el('span', { class: 'mais-tit', text: g }),
      el('div', { class: 'mais-pills' }, ...OUTROS.filter((k) => defDe(k).g === g).map(pill)))), guardadosLinha());
  }

  // a caixinha de cada filtro
  const popEl = $('#pop');
  let pop = null;
  function fecharPop(semDesenhar = false) { if (!pop) return; pop = null; popEl.hidden = true; if (!semDesenhar) desenharPills(); }
  function alternarPop(k, botao) { if (pop && pop.k === k) return fecharPop(); pop = { k, busca: '' }; montarPop(botao); desenharPills(); }
  function posicionar(botao) {
    const c = popEl.parentElement.getBoundingClientRect(), b = botao.getBoundingClientRect();
    popEl.style.left = Math.max(8, Math.min(b.left - c.left, c.width - popEl.offsetWidth - 8)) + 'px';
    popEl.style.top = b.bottom - c.top + 6 + 'px';
  }
  const mudou = () => { zerarPaginas(); desenhar(); if (pop && pop.lista) listarPop(); };
  const peDoPop = (limpar, ativoAgora) => el('div', { class: 'pop-pe' },
    el('button', { type: 'button', class: 'botao mini', text: 'Limpar', disabled: ativoAgora ? null : true, on: { click: limpar } }),
    el('button', { type: 'button', class: 'botao mini prim', text: 'Pronto', on: { click: () => fecharPop() } }));
  function montarPop(botao) {
    popEl.hidden = false;
    popEl.classList.toggle('pop-largo', pop.k === 'periodo');
    if (pop.k === 'periodo') montarPeriodo(); else if (FX[pop.k]) montarFaixa(pop.k); else montarMulti(pop.k);
    posicionar(botao);
  }

  // ── o calendário (09/11/2026): o dia, ou o começo e o fim, clicando ──
  // O primeiro clique marca o começo e o segundo o fim, na ordem que for; o mesmo dia duas vezes é um dia
  // só. Dois meses lado a lado no computador, um no celular. Teclado: as setas andam entre os dias,
  // PageUp/PageDown trocam de mês, Enter escolhe. O dia do export (a base) vem marcado.
  const SEMANA_CAL = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
  const somaMes = (m, n) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);
  const doisMeses = matchMedia('(min-width: 640px)');
  function calendario({ de = '', ate = '', max = '', aoEscolher }) {
    let ini = de, fim = ate, espera = '', sobre = '', foco = ate || de || D.base;
    let mes = '';
    const raiz = el('div', { class: 'cal', role: 'group', 'aria-label': 'Calendário' });
    const verMes = (dia) => { const m = dia.slice(0, 7), n = doisMeses.matches ? 2 : 1; if (!mes || m < mes || m > somaMes(mes, n - 1)) mes = somaMes(m, 1 - n); };
    const dica = el('p', { class: 'cal-dica', 'aria-live': 'polite' });
    function pintar() {
      const [x0, x1] = espera ? [espera, sobre || espera].sort() : [ini, fim];
      for (const b of raiz.querySelectorAll('.cal-dia')) {
        const d = b.dataset.dia;
        b.classList.toggle('ini', !!x0 && d === x0);
        b.classList.toggle('fim', !!x1 && d === x1);
        b.classList.toggle('meio', !!x0 && !!x1 && d > x0 && d < x1);
        b.setAttribute('aria-pressed', String(d === x0 || d === x1));
      }
      dica.textContent = espera ? `Começo: ${br(espera)} · agora clique no fim` : 'Clique no começo e depois no fim · o mesmo dia duas vezes é um dia só';
    }
    function mesEl(m) {
      const a = Number(m.slice(0, 4)), b = Number(m.slice(5, 7));
      const vazios = (new Date(Date.UTC(a, b - 1, 1)).getUTCDay() + 6) % 7, n = new Date(Date.UTC(a, b, 0)).getUTCDate();
      const dias = Array.from({ length: vazios }, () => el('span', { 'aria-hidden': 'true' }));
      for (let d = 1; d <= n; d++) {
        const dia = m + '-' + String(d).padStart(2, '0');
        dias.push(el('button', { type: 'button', class: 'cal-dia' + (dia === D.base ? ' hoje' : ''), 'data-dia': dia, tabindex: dia === foco ? '0' : '-1',
          disabled: max && dia > max ? true : null, 'aria-label': `${d} de ${MESES[b - 1]} de ${a}${dia === D.base ? ', o dia do Protheus' : ''}`, text: String(d) }));
      }
      return el('div', { class: 'cal-mes' }, el('div', { class: 'cal-nome', text: MESES[b - 1][0].toUpperCase() + MESES[b - 1].slice(1) + ' de ' + a }),
        el('div', { class: 'cal-grade' }, ...SEMANA_CAL.map((s) => el('span', { class: 'cal-sem', title: s, text: s[0].toUpperCase() })), ...dias));
    }
    function desenha(focar = false) {
      verMes(foco);
      const n = doisMeses.matches ? 2 : 1, ult = somaMes(mes, n - 1);
      raiz.replaceChildren(
        el('div', { class: 'cal-nav' },
          el('button', { type: 'button', class: 'cal-seta', 'aria-label': 'Mês anterior', text: '‹', on: { click: () => { mes = somaMes(mes, -1); foco = mes + '-01'; desenha(); } } }),
          el('button', { type: 'button', class: 'cal-seta', 'aria-label': 'Próximo mês', text: '›', disabled: max && somaMes(ult, 1) > max.slice(0, 7) ? true : null,
            on: { click: () => { mes = somaMes(mes, 1); foco = mes + '-01'; desenha(); } } })),
        el('div', { class: 'cal-meses' }, ...Array.from({ length: n }, (_, i) => mesEl(somaMes(mes, i)))), dica);
      pintar();
      if (focar) { const b = raiz.querySelector(`[data-dia="${foco}"]`); if (b) b.focus(); }
    }
    raiz.addEventListener('click', (e) => {
      const b = e.target.closest('.cal-dia');
      if (!b || b.disabled) return;
      foco = b.dataset.dia;
      for (const x of raiz.querySelectorAll('.cal-dia')) x.tabIndex = x === b ? 0 : -1;
      if (!espera) { espera = sobre = foco; pintar(); return; }
      [ini, fim] = [espera, foco].sort();
      espera = sobre = '';
      pintar();
      aoEscolher(ini, fim);
    });
    raiz.addEventListener('mouseover', (e) => { const b = e.target.closest('.cal-dia'); if (espera && b && !b.disabled && b.dataset.dia !== sobre) { sobre = b.dataset.dia; pintar(); } });
    raiz.addEventListener('keydown', (e) => {
      if (!e.target.classList.contains('cal-dia')) return;
      const passo = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      let novo = '';
      if (passo) novo = iso(t(foco) + passo * DIA);
      else if (e.key === 'PageUp' || e.key === 'PageDown') { const m = somaMes(foco.slice(0, 7), e.key === 'PageUp' ? -1 : 1); novo = m + foco.slice(7); if (novo.slice(0, 7) !== m) novo = iso(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)); }
      else return;
      e.preventDefault();
      if (max && novo > max) novo = max;
      foco = novo;
      if (espera) sobre = novo;
      desenha(true);
    });
    desenha();
    return { no: raiz, marcar: (a, z) => { ini = a; fim = z; espera = sobre = ''; if (z || a) { foco = z || a; } desenha(); } };
  }

  // o período das finalizadas (09/11/2026): os prontos à esquerda, o calendário à direita
  const curtoPer = (x) => (x.desde === x.ate ? dma(x.desde) : `${dm(x.desde)}${x.desde.slice(0, 4) !== x.ate.slice(0, 4) ? '/' + x.desde.slice(2, 4) : ''} a ${dma(x.ate)}`);
  function montarPeriodo() {
    const p = periodo();
    const prontos = el('div', { class: 'per-prontos', role: 'group', 'aria-label': 'Períodos prontos' }, ...PERIODOS.map((x) =>
      el('button', { type: 'button', class: 'per-op', 'aria-pressed': String(p.k === x.k), on: { click: () => aplicar(() => { F.periodo = x.k; F.per = null; }) } },
        el('span', { text: x.rot }), el('small', { text: curtoPer(x) }))));
    const livre = (a, z) => { F.periodo = 'livre'; F.per = { desde: a, ate: z }; };
    const cal = calendario({ de: p.desde, ate: p.ate, max: D.base, aoEscolher: (a, z) => aplicar(() => livre(a, z)) });
    const campo = (rot, v) => el('input', { type: 'date', value: v > D.base ? D.base : v, max: D.base, 'aria-label': 'Período ' + rot });
    const de = campo('de', p.desde), ate = campo('até', p.ate);
    const digitou = () => {
      if (!de.value || !ate.value) return;
      const [a, z] = [de.value, ate.value].sort();
      livre(a, z > D.base ? D.base : z);
      cal.marcar(F.per.desde, F.per.ate);
      for (const b of prontos.children) b.setAttribute('aria-pressed', 'false');
      mudou();
      pintarPeriodo();
    };
    de.addEventListener('change', digitou); ate.addEventListener('change', digitou);
    popEl.replaceChildren(el('div', { class: 'pop-tit', text: 'Período · vale para todos os números: a entrada pela abertura, a saída pelo fim, a programada pela data programada' }),
      el('div', { class: 'per-corpo' }, prontos,
        el('div', { class: 'per-cal' }, cal.no,
          el('div', { class: 'pop-datas' }, el('label', { class: 'campo' }, el('span', { text: 'De' }), de), el('label', { class: 'campo' }, el('span', { text: 'Até' }), ate)))));
    pop.lista = null;
    (prontos.querySelector('[aria-pressed="true"]') || prontos.firstElementChild).focus();
  }

  // um filtro de escolhas: busca, marcar quantas quiser, e "Excluir as marcadas" para o contrário
  function montarMulti(k) {
    const busca = DEF[k].busca ? el('input', { type: 'search', placeholder: k === 'frota' ? 'Digite a frota: 617, 96…' : 'Buscar', 'aria-label': 'Buscar em ' + DEF[k].rot, autocomplete: 'off' }) : null;
    pop.lista = el('div', { class: 'pop-lista', role: 'group', 'aria-label': DEF[k].rot });
    pop.pe = el('div', { class: 'pop-pe' });
    const cbN = el('input', { type: 'checkbox' });
    cbN.checked = F.neg.has(k);
    cbN.addEventListener('change', () => { if (cbN.checked) F.neg.add(k); else F.neg.delete(k); mudou(); });
    const excluir = el('label', { class: 'pop-excluir' }, cbN, el('span', {}, 'Excluir as marcadas', el('small', { text: 'mostra todas menos elas' })));
    if (busca) {
      busca.addEventListener('input', () => { if (!pop) return; pop.busca = busca.value; listarPop(); });
      // Enter marca as que aparecem (digitar 617 e Enter marca a F-617)
      busca.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); for (const o of pop.visiveis || []) F[k].add(o.v); busca.select(); mudou(); } });
    }
    popEl.replaceChildren(...[el('div', { class: 'pop-tit', text: DEF[k].rot + (DEF[k].dica ? ' · ' + DEF[k].dica : '') + ' · marque quantos quiser' }),
      busca, pop.lista, excluir, pop.pe].filter(Boolean));
    listarPop();
    if (busca) busca.focus();
  }

  // uma faixa: de… até…, com atalhos
  function montarFaixa(k) {
    const d = FX[k], num = d.tipo === 'number';
    const campo = (rot, v) => el('input', { type: d.tipo, value: v, 'aria-label': `${d.rot}: ${rot}`, step: num ? 'any' : null, min: num ? '0' : null, inputmode: num ? 'decimal' : null });
    const de = campo('de', F.r[k].de), ate = campo('até', F.r[k].ate);
    const cal = d.tipo === 'date' ? calendario({ de: F.r[k].de, ate: F.r[k].ate, aoEscolher: (a, z) => { de.value = a; ate.value = z; mudar(); } }) : null;
    const mudar = () => { F.r[k] = { de: de.value, ate: ate.value }; if (cal) cal.marcar(de.value, ate.value); mudou(); pe.replaceWith(pe = peDoPop(limpar, faixaAtiva(k))); };
    const limpar = () => { de.value = ''; ate.value = ''; mudar(); };
    de.addEventListener('change', mudar); ate.addEventListener('change', mudar);
    const atalho = (rot, a, b) => el('button', { type: 'button', class: 'botao mini', text: rot, on: { click: () => { de.value = a; ate.value = b; mudar(); } } });
    const ini = (n) => iso(ref - n * DIA);
    const atalhos = d.tipo === 'date'
      ? [atalho('Esta semana', iso(segundaDe(ref)), iso(segundaDe(ref) + 6 * DIA)), atalho('Últimos 7 dias', ini(6), D.base), atalho('Últimos 30 dias', ini(29), D.base), atalho('Este mês', D.base.slice(0, 8) + '01', D.base),
        atalho('Este ano', D.base.slice(0, 4) + '-01-01', D.base), ...(k === 'prevD' ? [atalho('Já passou', '', ini(1))] : [])]
      : k === 'dias' ? [atalho('Até 7', '0', '7'), atalho('Mais de 30', '31', ''), atalho('Mais de 60', '61', ''), atalho('Mais de 90', '91', '')]
        : [atalho('Sem horas', '0', '0'), atalho('Até 4 h', '0', '4'), atalho('Mais de 8 h', '8.1', ''), atalho('Mais de 24 h', '24.1', '')];
    let pe = peDoPop(limpar, faixaAtiva(k));
    popEl.classList.toggle('pop-largo', !!cal);
    popEl.replaceChildren(el('div', { class: 'pop-tit', text: d.rot + (d.dica ? ' · ' + d.dica : '') }), cal ? cal.no : null,
      el('div', { class: 'pop-datas' }, el('label', { class: 'campo' }, el('span', { text: 'De' }), de), el('label', { class: 'campo' }, el('span', { text: 'Até' }), ate)),
      el('div', { class: 'pop-atalhos' }, ...atalhos), pe);
    pop.lista = null;
    de.focus();
  }
  function listarPop() {
    const k = pop.k;
    const R = recorte({ sem: k });
    const conta = new Map();
    for (const o of R.base) for (const v of CHAVES[k](o)) conta.set(v, (conta.get(v) || 0) + 1);
    const q = norm(pop.busca.trim());
    const num = q.replace(/^f-?/, '').replace(/^0+/, '');
    const ops = DEF[k].ops().filter((o) => !q || norm(o.rot + ' ' + (o.sub || '')).includes(q) || (k === 'frota' && num && norm(o.rot).replace(/^f-/, '').startsWith(num)));
    // a frota digita-se pelo número inteiro: "617" deixa a F-617 em primeiro
    if (k === 'frota' && num) ops.sort((a, b) => (norm(b.rot) === 'f-' + num) - (norm(a.rot) === 'f-' + num));
    pop.visiveis = k === 'frota' && num && ops.some((o) => norm(o.rot) === 'f-' + num) ? ops.filter((o) => norm(o.rot) === 'f-' + num) : ops;
    const filhos = [];
    let grupo = null;
    for (const o of ops.slice(0, 400)) {
      if (o.grupo && o.grupo !== grupo) { grupo = o.grupo; filhos.push(el('div', { class: 'pop-grupo', text: grupo })); }
      const n = conta.get(o.v) || 0;
      const cb = el('input', { type: 'checkbox' });
      cb.checked = F[k].has(o.v);
      cb.addEventListener('change', () => { alterna(k, o.v); mudou(); });
      filhos.push(el('label', { class: 'pop-op' + (n ? '' : ' zero') }, cb,
        el('span', {}, o.cor ? el('i', { class: 'ponto', style: `background:${o.cor};margin-right:6px` }) : null, o.rot, o.sub ? el('small', { text: o.sub }) : null),
        el('span', { class: 'c', text: nf.format(n) })));
    }
    if (ops.length > 400) filhos.push(el('div', { class: 'vazio', text: `E mais ${nf.format(ops.length - 400)} — digite para achar.` }));
    if (!ops.length) filhos.push(el('div', { class: 'vazio', text: 'Nada com esse texto.' }));
    const rolagem = pop.lista.scrollTop;
    pop.lista.replaceChildren(...filhos);
    pop.lista.scrollTop = rolagem;
    pop.pe.replaceChildren(
      q && ops.length ? el('button', { type: 'button', class: 'botao mini', text: `Marcar ${pop.visiveis.length === 1 ? 'esta' : 'as ' + nf.format(pop.visiveis.length)}`,
        on: { click: () => { for (const o of pop.visiveis) F[k].add(o.v); mudou(); } } }) : el('span', { class: 'nota', text: F[k].size ? `${nf.format(F[k].size)} marcada(s)` : 'Nenhuma marcada: valem todas' }),
      el('span', { class: 'acoes' },
        el('button', { type: 'button', class: 'botao mini', text: 'Limpar', disabled: F[k].size ? null : true, on: { click: () => { F[k].clear(); mudou(); } } }),
        el('button', { type: 'button', class: 'botao mini prim', text: 'Pronto', on: { click: () => fecharPop() } })));
  }
  ouvir(document, 'mousedown', (e) => { const a = alvoDe(e); if (pop && !popEl.contains(a) && !(a.closest && a.closest('.pill'))) fecharPop(); });
  ouvir(window, 'keydown', (e) => { if (e.key === 'Escape' && pop) fecharPop(); });

  // os filtros guardados: só neste navegador (o painel não grava nada em lugar nenhum)
  const GUARDA_F = 'painel-os-filtros-guardados-v1';
  const lerGuardados = () => { try { const l = JSON.parse(localStorage.getItem(GUARDA_F) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } };
  const gravarGuardados = (l) => { try { localStorage.setItem(GUARDA_F, JSON.stringify(l)); return true; } catch (e) { return false; } };
  const algumFiltro = () => CAMPOS.some(ativo) || !!F.q.trim();
  const fotoFiltros = () => ({ m: Object.fromEntries(MULTI.filter((k) => F[k].size).map((k) => [k, [...F[k]]])), neg: [...F.neg].filter((k) => F[k].size),
    r: Object.fromEntries(Object.keys(FX).filter(faixaAtiva).map((k) => [k, F.r[k]])), q: F.q, periodo: F.periodo, per: F.periodo === 'livre' ? F.per : null });
  function aplicarFoto(x) {
    limparTudo();
    for (const [k, l] of Object.entries(x.m || {})) if (MULTI.includes(k)) F[k] = new Set(l);
    for (const k of x.neg || []) if (MULTI.includes(k)) F.neg.add(k);
    for (const [k, r] of Object.entries(x.r || {})) if (FX[k]) F.r[k] = { de: r.de ?? '', ate: r.ate ?? '' };
    F.q = x.q || '';
    if (PERIODOS.some((p) => p.k === x.periodo)) { F.periodo = x.periodo; F.per = null; }
    else if (x.periodo === 'livre' && x.per && x.per.desde && x.per.ate) { F.periodo = 'livre'; F.per = { desde: x.per.desde, ate: x.per.ate }; }
  }
  function guardadosLinha() {
    const l = lerGuardados();
    const nome = el('input', { type: 'text', placeholder: 'Nome: ex. Pendentes do Luiz', 'aria-label': 'Nome para guardar estes filtros', maxlength: '40' });
    const guardar = () => {
      const n = nome.value.trim() || 'Filtro ' + (l.length + 1);
      if (gravarGuardados([...l.filter((x) => x.nome !== n), { nome: n, f: fotoFiltros() }].slice(-12))) desenharPills();
    };
    nome.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardar(); } });
    return el('div', { class: 'mais-grupo' }, el('span', { class: 'mais-tit', text: 'Guardados' }),
      el('div', { class: 'mais-pills' }, ...l.map((x, i) => el('span', { class: 'chip guardado-chip' },
        el('button', { type: 'button', class: 'chip-ap', title: 'Aplicar estes filtros', text: x.nome, on: { click: () => aplicar(() => aplicarFoto(x.f)) } }),
        el('button', { type: 'button', 'aria-label': 'Apagar ' + x.nome, title: 'Apagar', text: '×', on: { click: () => { gravarGuardados(l.filter((_, j) => j !== i)); desenharPills(); } } }))),
        algumFiltro() ? el('span', { class: 'guardar' }, nome, el('button', { type: 'button', class: 'botao mini prim', text: 'Guardar estes filtros', on: { click: guardar } }))
          : el('span', { class: 'nota', text: l.length ? 'Toque num para aplicar.' : 'Monte os filtros e guarde aqui para usar de novo (fica só neste navegador).' })));
  }

  function desenharChips() {
    const c = [];
    const add = (rot, limpar, neg = false) => c.push(el('span', { class: 'chip' + (neg ? ' neg' : '') }, rot,
      el('button', { type: 'button', 'aria-label': 'Tirar o filtro ' + rot, text: '×', on: { click: () => aplicar(limpar) } })));
    for (const k of MULTI) {
      if (!F[k].size) continue;
      const nomes = [...F[k]].map((v) => nomeDe(k, v));
      add(DEF[k].rot + (F.neg.has(k) ? ' exceto: ' : ': ') + (nomes.length > 3 ? nomes.slice(0, 3).join(', ') + ` e mais ${nomes.length - 3}` : nomes.join(', ')), () => tirar(k), F.neg.has(k));
    }
    for (const k of Object.keys(FX)) if (faixaAtiva(k)) add(FX[k].rot + ': ' + textoFaixa(k), () => tirar(k));
    if (F.q.trim()) add(`Busca: "${F.q.trim()}"`, () => { F.q = ''; fQ.value = ''; });
    if (c.length > 1) c.push(el('button', { type: 'button', class: 'limpar', text: 'Limpar todos', on: { click: () => aplicar(limparTudo) } }));
    $('#chips').replaceChildren(...c);
  }
  function sincronizarCampos() { if (focado() !== fQ) fQ.value = F.q; pintarPeriodo(); }

  // ── abas ──
  function irPara(aba) {
    V.aba = aba;
    if (aoTrocarAba) aoTrocarAba(aba);
    desenhar();
    scrollTo({ top: 0 });
  }
  raiz.querySelectorAll('.aba').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.aba)));

  // ── a dica ──
  const dica = $('#dica');
  function mostrarDica(ev, titulo, linhas) {
    dica.replaceChildren(el('span', { class: 't', text: titulo }), ...linhas.map(([nome, valor, cor]) =>
      el('span', { class: 'l' }, cor ? el('i', { class: 'ponto', style: 'background:' + cor }) : null, nome, el('b', { text: valor }))));
    dica.hidden = false;
    const w = dica.offsetWidth, h = dica.offsetHeight;
    let x = ev.clientX + 14, y = ev.clientY - h - 12;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 14;
    if (y < 8) y = ev.clientY + 18;
    dica.style.left = Math.max(8, x) + 'px';
    dica.style.top = y + 'px';
  }
  const esconderDica = () => { dica.hidden = true; };
  ouvir(window, 'scroll', esconderDica, { passive: true });
  ouvir(document, 'pointerdown', (e) => { const a = alvoDe(e); if (!(a.closest && a.closest('svg'))) esconderDica(); });
  const legenda = (alvo, itens) => $(alvo).replaceChildren(...itens.map(([nome, cor]) => el('span', {}, el('i', { style: 'background:' + cor }), nome)));
  const vazio = (caixa, s) => { guardarDados(caixa, null); caixa.replaceChildren(el('div', { class: 'vazio', text: s })); };
  /** Os números por trás de um gráfico ou tabela, para o "Baixar os números": { titulo, cab, linhas }. */
  const guardarDados = (caixa, d) => { caixa._dados = d; if (d) caixa.dataset.dados = ''; else delete caixa.dataset.dados; };
  const maiusc = (x) => (x ? x[0].toUpperCase() + x.slice(1) : x);

  // ── os gráficos (d3) ──
  const txt = (sel, x, y, s, o = {}) => sel.append('text').attr('x', x).attr('y', y).attr('dy', o.dy ?? '0.32em').attr('text-anchor', o.anchor || 'start')
    .style('font-size', (o.tam || 11) + 'px').style('fill', o.cor || 'var(--fraco)').style('font-weight', o.peso || null).style('font-variant-numeric', 'tabular-nums').text(s);
  const medidor = (svg, tam) => { const m = svg.append('text').style('font-size', tam + 'px'); return { w: (s) => (m.text(s), m.node().getComputedTextLength()), fim: () => m.remove() }; };

  // a barra (v8, 05/11/2026): a ponta, onde está o número, com 4px redondos; a base reta, no eixo
  function barra(g, x, y, w, h, cor, ponta = true) {
    const r = ponta ? Math.max(0, Math.min(4, w / 2, h)) : 0;
    const d = r ? `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h}Z`
      : `M${x},${y}H${x + w}V${y + h}H${x}Z`;
    return g.append('path').attr('d', d).style('fill', cor);
  }

  /** Colunas por grupo: lado a lado ou empilhadas, com a grade leve e o número em cima. */
  function colunas(caixa, { grupos, series, empilhar = false, H = 250, rot = (g) => g.rot, titulo, aoClicar, minLarg = 0, faixaAlerta = null, numeros = true }) {
    if (!grupos.length || !grupos.some((g) => series.some((s) => g[s.k]))) return vazio(caixa, 'Nada com estes filtros.');
    const W = Math.max(caixa.clientWidth || 640, grupos.length * minLarg);
    const svg = d3.create('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', titulo);
    caixa.replaceChildren(svg.node());
    guardarDados(caixa, { titulo, cab: ['Período', ...series.map((s) => s.nome)], linhas: grupos.map((g) => [g.nome || rot(g), ...series.map((s) => g[s.k] || 0)]) });
    const tot = (g) => (empilhar ? d3.sum(series, (s) => g[s.k]) : d3.max(series, (s) => g[s.k]));
    const sy = d3.scaleLinear([0, d3.max(grupos, tot) || 1], [H - 26, 20]).nice();
    const med = medidor(svg, 11);
    const ml = Math.ceil(med.w(nf.format(sy.ticks(4).at(-1)))) + 12;
    const maiorRot = d3.max(grupos, (g) => med.w(rot(g)));
    med.fim();
    const sx = d3.scaleBand(grupos.map((g) => g.chave), [ml, W - 4]).paddingInner(0.3).paddingOuter(0.12);
    for (const v of sy.ticks(4)) {
      svg.append('line').attr('x1', ml).attr('x2', W - 4).attr('y1', sy(v)).attr('y2', sy(v)).style('stroke', v === 0 ? 'var(--borda)' : 'var(--linha)');
      txt(svg, ml - 8, sy(v), nf.format(v), { anchor: 'end', cor: 'var(--muito-fraco)' });
    }
    const n = empilhar ? 1 : series.length;
    const bw = Math.max(3, Math.min(empilhar ? 34 : 20, (sx.bandwidth() - 2 * (n - 1)) / n));
    const largG = bw * n + 2 * (n - 1);
    // os nomes embaixo: pulam alguns quando não cabem
    const passo = Math.max(1, Math.ceil((maiorRot + 8) / sx.step()));
    grupos.forEach((d, k) => {
      const x0 = sx(d.chave) + (sx.bandwidth() - largG) / 2;
      const g = svg.append('g').attr('class', 'col' + (aoClicar ? ' clica' : ''));
      g.append('rect').attr('x', sx(d.chave) - (sx.step() * sx.paddingInner()) / 2).attr('width', sx.step()).attr('y', 0).attr('height', H).style('fill', 'transparent');
      if (empilhar) {
        const vis = series.filter((s) => sy(0) - sy(d[s.k]) > 0);
        let y = sy(0);
        vis.forEach((s, j) => {
          const h = sy(0) - sy(d[s.k]);
          barra(g, x0, y - h, bw, Math.max(1, h - (y < sy(0) ? 2 : 0)), s.corDe ? s.corDe(d) : s.cor, j === vis.length - 1);
          y -= h;
        });
        if (bw >= 16 && tot(d)) txt(g, x0 + bw / 2, sy(tot(d)) - 9, nf.format(tot(d)), { anchor: 'middle', cor: 'var(--texto)', peso: 650 });
      } else {
        series.forEach((s, j) => {
          const v = d[s.k];
          if (v) barra(g, x0 + j * (bw + 2), sy(v), bw, Math.max(0, sy(0) - sy(v)), s.cor);
          if (numeros && v && bw >= 15) txt(g, x0 + j * (bw + 2) + bw / 2, sy(v) - 8, nf.format(v), { anchor: 'middle', cor: 'var(--fraco)', tam: 10 });
        });
      }
      if (!(k % passo) || k === grupos.length - 1)
        txt(g, sx(d.chave) + sx.bandwidth() / 2, H - 12, rot(d), { anchor: 'middle', cor: faixaAlerta && faixaAlerta(d) ? 'var(--alerta-t)' : 'var(--fraco)', peso: faixaAlerta && faixaAlerta(d) ? 700 : null });
      g.on('mousemove', (ev) => mostrarDica(ev, d.nome || rot(d), [...series.map((s) => [s.nome, nf.format(d[s.k]), s.cor]), ...(empilhar && series.length > 1 ? [['Total', nf.format(tot(d))]] : [])]))
        .on('mouseleave', esconderDica)
        .on('click', () => aoClicar && aoClicar(d));
    });
  }

  /** Colunas em pé, empilhadas, na ordem em que vêm: o total em cima, o número de cada parte dentro dela
   *  quando cabe, o nome embaixo. Muitas colunas: a caixa rola para o lado, com as primeiras à vista.
   *  `cem`: cada coluna soma 100% e as partes mostram a porcentagem. A parte `sempre` mostra o número
   *  mesmo pequena: ganha a altura mínima dele. Devolve se a caixa ficou rolando. */
  function colunasEmPe(caixa, { linhas: todas, partes, titulo, nomes, dica = null, aoClicar = null, aoParte = null, marcado = null,
    H = 300, passoMin = 44, passoMax = 88, cem = false, nLinhas = 1, bwMax = 36, limite = 0, chave = '', quem = ['coluna', 'colunas'] }) {
    const tot = (l) => d3.sum(partes, (p) => l[p.k] || 0);
    if (!todas.length || !todas.some(tot)) { vazio(caixa, 'Nada com estes filtros.'); botaoTodas(caixa); return false; }
    const { linhas, corta: cortou, nVis } = recortar(todas, caixa, { limite, chave, passoMin });
    const nomeCol = (l) => { if (l.nome) return l.nome; const n = nomes(l); return [...(n.fortes || []), ...(n.fracos || [])].filter(Boolean).join(' · '); };
    const dadosEmPe = { titulo, cab: [quem[0] === 'coluna' ? 'Item' : maiusc(quem[0]), ...partes.map((p) => p.nome), ...(partes.length > 1 && !cem ? ['Total'] : [])],
      linhas: todas.map((l) => [nomeCol(l), ...partes.map((p) => l[p.k] || 0), ...(partes.length > 1 && !cem ? [tot(l)] : [])]) };
    const disp = Math.max(caixa.clientWidth || 640, 240);
    const passo = Math.max(passoMin, Math.min(passoMax, (disp - 8) / linhas.length));
    const W = Math.max(disp, Math.ceil(passo * linhas.length + 8));
    const x0 = (W - passo * linhas.length) / 2;
    const svg = d3.create('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', titulo);
    caixa.replaceChildren(svg.node());
    const medF = medidor(svg, 11.5), medf = medidor(svg, 10.5), medN = medidor(svg, 11);
    // o nome em até duas linhas que caibam na largura da coluna; o que sobra vira reticências
    const cabe = passo - 6;
    const corta = (x, m) => { if (m.w(x) * 1.05 <= cabe) return x; let y = x; while (y.length > 2 && m.w(y + '…') * 1.05 > cabe) y = y.slice(0, -1); return y + '…'; };
    const quebra = (s, m) => {
      const out = [];
      let cur = '';
      for (const w of String(s).split(' ')) { const t = cur ? cur + ' ' + w : w; if (!cur || m.w(t) * 1.05 <= cabe) cur = t; else { out.push(cur); cur = w; } }
      if (cur) out.push(cur);
      return (out.length > 2 ? [out[0], out.slice(1).join(' ')] : out).map((x) => corta(x, m));
    };
    // `alerta`: o nome vai em vermelho (a faixa de mais de 90 dias)
    const rots = linhas.map((l) => { const n = nomes(l); return [...(n.fortes || []).flatMap((s) => quebra(s, medF)).map((t) => [t, n.alerta ? 'var(--alerta-t)' : 'var(--texto)']), ...(n.fracos || []).filter(Boolean).flatMap((s) => quebra(s, medf)).map((t) => [t, ''])]; });
    const nLin = Math.max(nLinhas, d3.max(rots, (r) => r.length) || 1);   // nLinhas: para dois gráficos lado a lado terem a mesma base
    const base = Math.round(H - 8 - nLin * 13.5);
    const topo = 24 + (partes.some((p) => p.sempre) ? 16 : 0);
    const sy = d3.scaleLinear([0, cem ? 1 : d3.max(linhas, tot) || 1], [base, topo]);
    const bw = Math.min(bwMax, Math.max(12, Math.round(passo * 0.56)));
    const corDe = (p, l) => (typeof p.cor === 'function' ? p.cor(l) : p.cor);
    const TINTA = { claro: '#ffffff', escuro: '#1f2937', tema: 'var(--texto)', inv: 'var(--papel)' };
    const marc = marcado || (() => false);
    svg.append('line').attr('x1', 0).attr('x2', W).attr('y1', base + 0.5).attr('y2', base + 0.5).style('stroke', 'var(--borda)');
    linhas.forEach((l, i) => {
      const t = tot(l), cx = x0 + passo * i + passo / 2;
      const g = svg.append('g').attr('class', 'col' + (aoClicar || aoParte ? ' clica' : ''));
      g.append('rect').attr('x', cx - passo / 2 + 1).attr('width', passo - 2).attr('y', 0).attr('height', H).attr('rx', 6).style('fill', marc(l) ? 'var(--marca-clara)' : 'transparent');
      let y = base;
      const cima = partes.reduce((u, p, j) => (l[p.k] ? j : u), -1);   // a parte de cima leva a ponta redonda
      for (const [j, p] of partes.entries()) {
        const v = l[p.k] || 0;
        if (!v) continue;
        const h = Math.max(base - sy(cem ? v / t : v), p.sempre ? 16 : 1);
        const vao = y < base ? 2 : 0;   // 2px entre as partes
        const r = barra(g, cx - bw / 2, y - h, bw, Math.max(1, h - vao), corDe(p, l), j === cima);
        r.node().parte = p;
        const s = cem ? pc.format(v / t) : nf.format(v);
        if (p.texto && h - vao >= 15 && medN.w(s) * 1.1 + 6 <= bw)
          txt(g, cx, y - h + (h - vao) / 2, s, { anchor: 'middle', cor: TINTA[p.texto], peso: 750 }).style('pointer-events', 'none');
        y -= h;
      }
      if (!cem) txt(g, cx, y - 10, nf.format(t), { anchor: 'middle', cor: 'var(--texto)', peso: 750, tam: 12.5 });
      rots[i].forEach(([s, cor], j) => txt(g, cx, base + 14 + j * 13.5, s, { anchor: 'middle', cor: cor || 'var(--muito-fraco)', peso: cor ? 600 : null, tam: cor ? 11.5 : 10.5 }));
      const nomeL = l.nome || rots[i].map((r) => r[0]).join(' ');
      g.on('mousemove', (ev) => {
        const p = ev.target.parte;
        if (p && aoParte) return mostrarDica(ev, `${nomeL} · ${p.nome}`, [['', `${nf.format(l[p.k])} OS · ${pc.format(l[p.k] / t)}`]]);
        mostrarDica(ev, nomeL, dica ? dica(l) : [...partes.map((p2) => [p2.nome, nf.format(l[p2.k] || 0), corDe(p2, l)]), ...(partes.length > 1 ? [['Total', nf.format(t)]] : [])]);
      }).on('mouseleave', esconderDica)
        .on('click', (ev) => { const p = ev.target.parte; if (p && aoParte) aoParte(l, p); else if (aoClicar) aoClicar(l); });
    });
    medF.fim(); medf.fim(); medN.fim();
    guardarDados(caixa, dadosEmPe);
    botaoTodas(caixa, { n: todas.length, nVis, chave, quem, corta: cortou });
    return W > disp + 1;
  }

  // ── quantas colunas cabem (09/11/2026) ──
  // Colunas em pé, sem rolar para o lado: aparecem as que cabem na largura (as primeiras da ordem), e o botão
  // "Mostrar todas" abre o resto — aí sim a caixa rola. `chave` guarda a escolha enquanto o painel está aberto.
  const cabem = (caixa, passoMin) => Math.max(4, Math.floor(((caixa.clientWidth || 640) - 8) / passoMin));
  function recortar(todas, caixa, { limite = 0, chave = '', passoMin }) {
    const nVis = limite ? Math.min(limite, cabem(caixa, passoMin)) : todas.length;
    const corta = !!limite && todas.length > nVis + 2 && !V.tudo[chave];
    return { linhas: corta ? todas.slice(0, nVis) : todas, corta, nVis };
  }
  function botaoTodas(caixa, { n = 0, nVis = 0, chave = '', quem = ['coluna', 'colunas'], corta = false } = {}) {
    const velho = caixa.nextElementSibling;
    if (velho && velho.classList.contains('ver-todas')) velho.remove();
    if (!chave || n <= nVis + 2) return;
    caixa.after(el('button', { type: 'button', class: 'ver-todas', 'aria-expanded': String(!corta),
      text: corta ? `Mostrar todas as ${plural(n, quem[0], quem[1])}` : `Mostrar só as ${nf.format(nVis)} primeiras`,
      on: { click: () => { V.tudo[chave] = !V.tudo[chave]; desenhar(); } } }));
  }

  // ── o backlog no padrão do PCM (10/11/2026, o painel do colega): uma barra deitada e grossa por frota ou
  // pessoa, com as baixadas (fechadas no período) e as pendentes (abertas hoje) na mesma barra, o número
  // dentro de cada parte e o total no fim. As primeiras da ordem; o resto no "Mostrar todas". ──
  const BK = [{ k: 'baix', nome: 'Baixadas (encerradas no período)', cor: 'var(--bk-baixada)' }, { k: 'pend', nome: 'Pendentes (abertas)', cor: 'var(--bk-pendente)' }];
  const itensBK = (partes = BK) => partes.map((q) => el('span', {}, el('i', { style: 'background:' + q.cor }), q.nome));
  // a baixa do backlog (Avanço): as mesmas cores — baixadas em azul, o que ainda falta em laranja
  const BK_AV = [{ k: 'fechou', nome: 'Baixadas', cor: 'var(--bk-baixada)' }, { k: 'ainda', nome: 'Remanescentes', cor: 'var(--bk-pendente)' }];
  /** A barra deitada: a ponta (à direita) com 4px redondos; a base reta, no eixo. */
  function barraH(g, x, y, w, h, cor, ponta = true) {
    const r = ponta ? Math.max(0, Math.min(4, h / 2, w)) : 0;
    const d = r ? `M${x},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x}Z` : `M${x},${y}H${x + w}V${y + h}H${x}Z`;
    return g.append('path').attr('d', d).style('fill', cor);
  }
  function barrasBacklog(caixa, { linhas: todas, titulo, limite = 10, chave = '', quem = ['frota', 'frotas'], aoClicar = null, dica = null, sub = () => '', partes = BK }) {
    const tot = (l) => partes.reduce((s2, q) => s2 + (l[q.k] || 0), 0);
    if (!todas.length || !todas.some(tot)) { vazio(caixa, 'Nada com estes filtros.'); botaoTodas(caixa); return false; }
    const corta = !!limite && todas.length > limite + 2 && !V.tudo[chave];
    const linhas = corta ? todas.slice(0, limite) : todas;
    const W = Math.max(caixa.clientWidth || 640, 300), LIN = 40, barH = 24, topo = 4;
    const yFim = topo + linhas.length * LIN, H = yFim + 26;
    const svg = d3.create('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', titulo);
    caixa.replaceChildren(svg.node());
    guardarDados(caixa, { titulo, cab: [maiusc(quem[0]), ...partes.map((q) => q.nome), 'Total'], linhas: todas.map((l) => [l.nome || l.rot, ...partes.map((q) => l[q.k] || 0), tot(l)]) });
    const medF = medidor(svg, 12.5), medS = medidor(svg, 10.5), medN = medidor(svg, 12);
    const cabe = (x, m, max) => { if (!x || m.w(x) <= max) return x; let y = x; while (y.length > 2 && m.w(y + '…') > max) y = y.slice(0, -1); return y + '…'; };
    const xNome = Math.round(Math.min(W * 0.32, Math.max(64, d3.max(linhas, (l) => Math.max(medF.w(l.rot), Math.min(medS.w(sub(l) || ''), 140))) + 14)));
    const xFim = W - 46;   // o lugar do total
    const sx = d3.scaleLinear([0, d3.max(linhas, tot) || 1], [xNome, xFim]).nice();
    for (const v of sx.ticks(Math.max(2, Math.min(8, Math.floor((xFim - xNome) / 80))))) {
      const xv = Math.round(sx(v)) + 0.5;
      svg.append('line').attr('x1', xv).attr('x2', xv).attr('y1', topo).attr('y2', yFim).style('stroke', v ? 'var(--linha)' : 'var(--borda)');
      txt(svg, sx(v), yFim + 14, nf.format(v), { anchor: 'middle', cor: 'var(--muito-fraco)', tam: 10 });
    }
    linhas.forEach((l, i) => {
      const cy = topo + i * LIN + LIN / 2, s2 = sub(l);
      const g = svg.append('g').attr('class', 'col' + (aoClicar ? ' clica' : ''));
      g.append('rect').attr('x', 0).attr('y', cy - LIN / 2 + 1).attr('width', W).attr('height', LIN - 2).attr('rx', 6).style('fill', 'transparent');
      txt(g, 0, s2 ? cy - 7 : cy, cabe(l.rot, medF, xNome - 10), { cor: 'var(--texto)', peso: 700, tam: 12.5 });
      if (s2) txt(g, 0, cy + 8, cabe(s2, medS, xNome - 10), { cor: 'var(--muito-fraco)', tam: 10.5 });
      const vis = partes.filter((q) => l[q.k]);
      let x = sx(0);
      vis.forEach((q, j) => {
        const w = sx(l[q.k]) - sx(0), wd = Math.max(2, w - (j < vis.length - 1 ? 2 : 0));
        barraH(g, x, cy - barH / 2, wd, barH, q.cor, j === vis.length - 1);
        const n = nf.format(l[q.k]);
        if (medN.w(n) + 10 <= wd) txt(g, x + wd / 2, cy, n, { anchor: 'middle', cor: q.tinta || '#ffffff', peso: 800, tam: 12 }).style('pointer-events', 'none');
        x += w;
      });
      txt(g, x + 6, cy, nf.format(tot(l)), { cor: 'var(--fraco)', peso: 700, tam: 12 });
      g.on('mousemove', (ev) => mostrarDica(ev, l.nome || l.rot, dica ? dica(l) : [...partes.map((q) => [q.nome, nf.format(l[q.k] || 0), q.cor]), ['Total', nf.format(tot(l))]]))
        .on('mouseleave', esconderDica).on('click', () => aoClicar && aoClicar(l));
    });
    medF.fim(); medS.fim(); medN.fim();
    botaoTodas(caixa, { n: todas.length, nVis: limite, chave, quem, corta });
    return false;
  }

  /** Duas colunas por linha, lado a lado, cada uma empilhada de baixo para cima com o total em cima. Por
   *  padrão, a das frotas: as abertas (liberadas embaixo, aguardando liberação em cima) e as fechadas no
   *  período. `esq`/`dir`: as partes de cada coluna ({ k, cor }); `rotulo`: o nome embaixo e a linha fraca.
   *  As que não cabem ficam para o "Mostrar todas". Devolve se a caixa ficou rolando. */
  function colunasPar(caixa, { linhas: todas, titulo, H = 300, passoMin = 54, passoMax = 96, aoClicar = null, dica = null, limite = 0, chave = '', quem = ['frota', 'frotas'],
    esq = [{ k: 'A', cor: COR.A, nome: 'Abertas: liberadas' }, { k: 'P', cor: COR.P, nome: 'Abertas: aguardando liberação' }], dir = [{ k: 'F', cor: COR.F, nome: 'Fechadas no período' }],
    rotulo = (l) => [l.chave, l.sub], marcado = null, bwMax = 22 }) {
    const soma = (l, ps) => ps.reduce((s2, p) => s2 + (l[p.k] || 0), 0);
    if (!todas.length || !todas.some((l) => soma(l, esq) + soma(l, dir))) { vazio(caixa, 'Nada com estes filtros.'); botaoTodas(caixa); return false; }
    const { linhas, corta, nVis } = recortar(todas, caixa, { limite, chave, passoMin });
    const disp = Math.max(caixa.clientWidth || 640, 240);
    const passo = Math.max(passoMin, Math.min(passoMax, (disp - 8) / linhas.length));
    const W = Math.max(disp, Math.ceil(passo * linhas.length + 8));
    const x0 = (W - passo * linhas.length) / 2;
    const svg = d3.create('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', titulo);
    caixa.replaceChildren(svg.node());
    const base = H - 38, topo = 22;
    const sy = d3.scaleLinear([0, d3.max(linhas, (l) => Math.max(soma(l, esq), soma(l, dir))) || 1], [base, topo]).nice();
    const bw = Math.min(bwMax, Math.max(8, Math.floor((passo - 12) / 2)));
    for (const v of sy.ticks(4)) if (v) svg.append('line').attr('x1', 0).attr('x2', W).attr('y1', Math.round(sy(v)) + 0.5).attr('y2', Math.round(sy(v)) + 0.5).style('stroke', 'var(--linha)');
    svg.append('line').attr('x1', 0).attr('x2', W).attr('y1', base + 0.5).attr('y2', base + 0.5).style('stroke', 'var(--borda)');
    const med = medidor(svg, 10);
    const cabe = passo - 6;
    const corta2 = (x) => { if (!x || med.w(x) <= cabe) return x; let y = x; while (y.length > 2 && med.w(y + '…') > cabe) y = y.slice(0, -1); return y + '…'; };
    // uma coluna: as partes de baixo para cima, 2px entre elas, a ponta redonda só na de cima, o total em cima
    const pilha = (g, x, l, ps, corNum, peso) => {
      const t = soma(l, ps);
      if (!t) return;
      const cima = ps.reduce((u, p, j) => (l[p.k] ? j : u), -1), vivas = ps.filter((p) => l[p.k]).length;
      let acc = 0, yTopo = base;
      ps.forEach((p, j) => {
        const v = l[p.k] || 0;
        if (!v) return;
        const y0 = acc ? yTopo - 2 : base, y1 = Math.min(sy(acc + v), y0 - 2);
        barra(g, x, y1, bw, y0 - y1, p.cor, j === cima);
        const n = nf.format(v);
        if (vivas > 1 && y0 - y1 >= 16 && med.w(n) * 1.15 + 4 <= bw) txt(g, x + bw / 2, (y0 + y1) / 2, n, { anchor: 'middle', cor: p.tinta || '#ffffff', peso: 800, tam: 10.5 }).style('pointer-events', 'none');
        acc += v;
        yTopo = y1;
      });
      txt(g, x + bw / 2, yTopo - 9, nf.format(t), { anchor: 'middle', cor: corNum, peso, tam: 11 });
    };
    const marc = marcado || (() => false);
    linhas.forEach((l, i) => {
      const cx = x0 + passo * i + passo / 2;
      const g = svg.append('g').attr('class', 'col' + (aoClicar ? ' clica' : ''));
      g.append('rect').attr('x', cx - passo / 2 + 1).attr('width', passo - 2).attr('y', 0).attr('height', H).attr('rx', 6).style('fill', marc(l) ? 'var(--marca-clara)' : 'transparent');
      pilha(g, cx - bw - 1, l, esq, 'var(--texto)', 700);
      pilha(g, cx + 1, l, dir, 'var(--fraco)', 650);
      const [forte, fraco] = rotulo(l);
      txt(g, cx, base + 14, corta2(forte), { anchor: 'middle', cor: 'var(--texto)', peso: 650, tam: 11.5 });
      if (fraco) txt(g, cx, base + 28, corta2(fraco), { anchor: 'middle', cor: 'var(--muito-fraco)', tam: 10 });
      g.on('mousemove', (ev) => mostrarDica(ev, l.nome || forte, dica ? dica(l) : [['Abertas (para fechar)', nf.format(soma(l, esq)), COR.A], ['Fechadas no período', nf.format(soma(l, dir)), COR.F]]))
        .on('mouseleave', esconderDica).on('click', () => aoClicar && aoClicar(l));
    });
    med.fim();
    guardarDados(caixa, { titulo, cab: [maiusc(quem[0]), ...esq.map((p) => p.nome), ...dir.map((p) => p.nome)],
      linhas: todas.map((l) => [l.nome || l.rot || rotulo(l).filter(Boolean).join(' · '), ...esq.map((p) => l[p.k] || 0), ...dir.map((p) => l[p.k] || 0)]) });
    // rolando (no celular): a coluna marcada vem para o meio, e não as primeiras
    const iMarc = marcado ? linhas.findIndex(marc) : -1;
    if (W > disp + 1 && iMarc >= 0) caixa.scrollLeft = Math.max(0, x0 + passo * iMarc + passo / 2 - disp / 2);
    botaoTodas(caixa, { n: todas.length, nVis, chave, quem, corta });
    return W > disp + 1;
  }

  /** A rosca (09/11/2026): parte do todo, com poucas fatias. O total no meio; ao lado, cada fatia com o número
   *  e a porcentagem. 2px de vão entre as fatias, e cada uma (e a linha dela na legenda) se clica para filtrar. */
  function rosca(caixa, fatias, { titulo, sub = 'OS', aoClicar = null, tam = 168 }) {
    const vivas = fatias.filter((f) => f.valor > 0), total = d3.sum(vivas, (f) => f.valor);
    guardarDados(caixa, { titulo, cab: ['Parte', 'OS', '%'], linhas: fatias.map((f) => [f.nome, f.valor, total ? pc.format(f.valor / total) : '—']) });
    if (!total) return vazio(caixa, 'Nada com estes filtros.');
    const svg = d3.create('svg').attr('width', tam).attr('height', tam).attr('viewBox', `0 0 ${tam} ${tam}`).attr('role', 'img')
      .attr('aria-label', `${titulo}: ` + vivas.map((f) => `${f.nome} ${nf.format(f.valor)} (${pc.format(f.valor / total)})`).join('; '));
    const g = svg.append('g').attr('transform', `translate(${tam / 2},${tam / 2})`);
    const arco = d3.arc().innerRadius(tam * 0.3).outerRadius(tam * 0.47).cornerRadius(2.5);
    g.selectAll('path').data(d3.pie().sort(null).value((f) => f.valor).padAngle(vivas.length > 1 ? 0.03 : 0)(vivas)).join('path')
      .attr('d', arco).attr('class', 'fatia' + (aoClicar ? ' clica' : '')).style('fill', (d) => d.data.cor)
      .on('mousemove', (ev, d) => mostrarDica(ev, d.data.nome, [['', `${nf.format(d.data.valor)} OS · ${pc.format(d.data.valor / total)}`, d.data.cor]]))
      .on('mouseleave', esconderDica).on('click', (ev, d) => aoClicar && aoClicar(d.data));
    txt(g, 0, -7, nf.format(total), { anchor: 'middle', cor: 'var(--texto)', tam: Math.round(tam / 6.6), peso: 750 });
    txt(g, 0, tam / 9, sub, { anchor: 'middle', cor: 'var(--muito-fraco)', tam: 11 });
    const leg = el('div', { class: 'rosca-leg' }, ...fatias.map((f) => el(aoClicar ? 'button' : 'div',
      { type: aoClicar ? 'button' : null, class: 'rosca-item' + (f.valor ? '' : ' zero'), on: aoClicar ? { click: () => aoClicar(f) } : {} },
      el('i', { class: 'ponto', style: 'background:' + f.cor }), el('span', { text: f.nome }), el('b', { text: nf.format(f.valor) }), el('small', { text: pc.format(f.valor / total) }))));
    caixa.replaceChildren(el('div', { class: 'rosca' }, svg.node(), leg));
  }

  /** As frotas do recorte, com as abertas (liberadas e pendentes) e as fechadas no período. */
  function porFrota(R) {
    const m = new Map();
    const de = (f) => { if (!m.has(f)) m.set(f, { chave: f, frota: f, sub: eqDe.get(f) || '', nome: f + (eqDe.get(f) ? ' · ' + eqDe.get(f) : ''), A: 0, P: 0, F: 0, Fant: 0, v90: 0, sem: 0 }); return m.get(f); };
    for (const o of R.base) { const x = de(o.frota); x[o.sit]++; if (o.sit !== 'F') { if (o.faixa === 3) x.v90++; if (o.grupo === 'S') x.sem++; } else if (o.abertura < R.p.desde) x.Fant++; }
    return [...m.values()];
  }
  const ORD_FROTA = { ab: ['Pendentes', (a, b) => b.A + b.P - a.A - a.P || b.F - a.F], fe: ['Baixadas', (a, b) => b.F - a.F || b.A + b.P - a.A - a.P],
    tot: ['Total', (a, b) => b.A + b.P + b.F - a.A - a.P - a.F], frota: ['Frota', () => 0] };
  const ordenaFrotas = (l) => [...l].sort((a, b) => ORD_FROTA[V.frotaOrd][1](a, b) || a.frota.localeCompare(b.frota, 'pt', { numeric: true }));
  const dicaFrota = (R) => (l) => [['Abertas', nf.format(l.A + l.P), COR.A], ['· liberadas para execução', nf.format(l.A)], ['· aguardando liberação', nf.format(l.P)],
    ['Encerradas no período', nf.format(l.F), COR.F], ['· abertas no período', nf.format(l.F - (l.Fant || 0))], ['· abertas antes do período', nf.format(l.Fant || 0)],
    ['Abertas há mais de 90 dias', nf.format(l.v90)], ['Abertas sem executante', nf.format(l.sem)]];
  /** Os controles do gráfico por frota: a ordem. */
  function controlesFrota(alvo) {
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Ordenar as frotas por' }, ...Object.entries(ORD_FROTA).map(([k, [rot]]) =>
      el('button', { type: 'button', 'aria-pressed': String(V.frotaOrd === k), text: rot, on: { click: () => { V.frotaOrd = k; desenhar(); } } })));
    alvo.replaceChildren(el('span', { text: 'Ordenar' }), seg);
  }

  // ── a tabela ordenável ──
  function tabela(caixa, { id, cols, linhas, padrao, aoClicar, lim = Infinity }) {
    const o = V.ord[id] || (V.ord[id] = { ...padrao });
    const col = cols.find((c) => c.k === o.k) || cols[0];
    const val = (r) => (col.ord ? col.ord(r) : r[col.k]);
    const l = [...linhas].sort((a, b) => {
      const x = val(a), y = val(b);
      const d = typeof x === 'number' || typeof y === 'number' ? (x ?? -1) - (y ?? -1) : String(x ?? '').localeCompare(String(y ?? ''), 'pt', { numeric: true });
      return o.dir === 'asc' ? d : -d;
    });
    const cab = el('tr', {}, ...cols.map((c) => el('th', { class: [c.num ? 'n' : '', c.esc ? 'esc' : ''].join(' ').trim() || null,
      'aria-sort': c.k === col.k ? (o.dir === 'asc' ? 'ascending' : 'descending') : 'none' },
      el('button', { type: 'button', text: c.rot, on: { click: () => { V.ord[id] = { k: c.k, dir: o.k === c.k && o.dir === 'desc' ? 'asc' : c.num ? 'desc' : 'asc' }; desenhar(); } } }))));
    const corpo = el('tbody');
    for (const r of l.slice(0, lim)) {
      const tr = el('tr', { class: aoClicar ? 'clica' : null, tabindex: aoClicar ? '0' : null });
      for (const c of cols) {
        const v = c.ver ? c.ver(r) : r[c.k];
        tr.append(el('td', { class: [c.num ? 'n' : '', c.cls ? c.cls(r) : '', c.esc ? 'esc' : ''].join(' ').trim() || null },
          v instanceof Node ? v : v == null || v === '' ? '—' : typeof v === 'number' ? (c.h ? nh : nf).format(v) : String(v)));
      }
      if (aoClicar) { tr.addEventListener('click', () => aoClicar(r)); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') aoClicar(r); }); }
      corpo.append(tr);
    }
    caixa.replaceChildren(el('table', {}, el('thead', {}, cab), corpo));
    if (!l.length) caixa.append(el('div', { class: 'vazio', text: 'Nenhuma OS com estes filtros.' }));
    return l;
  }
  const badge = (o) => el('span', { class: 'badge b-' + o.sit, text: o.sit === 'F' ? 'Finalizada' : o.sit === 'P' ? 'Não liberada' : 'Liberada', title: SIT[o.sit] });
  const categoria = (o) => el('span', { class: 'cat c-' + o.classe, title: CLASSE[o.classe], text: o.cat });
  const diasDe = (o) => (o.dias == null ? '—' : o.sit === 'F' ? `levou ${nf.format(o.dias)} d` : `${nf.format(o.dias)} d`);

  // ── a carteira: a tabela de OS, a mesma em toda aba ──
  // As colunas: as de sempre ficam fixas; as outras, cada um escolhe (fica guardado no navegador dele).
  const ordSit = (o) => (o.sit === 'F' ? 'Z' + o.fim : o.sit === 'P' ? 'B' : 'A') + String(1e6 - (o.dias || 0)).padStart(7, '0');
  const COLS = [
    { k: 'os', rot: 'OS', fixa: true, cls: () => 'os' },
    { k: 'frota', rot: 'Frota', fixa: true, frota: true, cls: () => 'frota' },
    { k: 'servico', rot: 'Serviço', fixa: true, cls: () => 'serv', ver: (o) => el('span', {}, o.servico, o.equip ? el('small', { text: o.equip }) : null) },
    { k: 'sit', rot: 'Situação', fixa: true, ver: (o) => badge(o), ord: ordSit },
    { k: 'cat', rot: 'Categoria', padrao: true, ver: (o) => categoria(o), ord: (o) => 'PNOS'.indexOf(o.classe) + o.cat },
    { k: 'abertura', rot: 'Aberta em', padrao: true, ver: (o) => br(o.abertura), cls: () => 'data' },
    { k: 'abertaPor', rot: 'Aberta por', padrao: true, ver: (o) => o.abertaPor || '—', cls: () => 'data' },
    { k: 'liberada', rot: 'Liberada em', padrao: true, ver: (o) => br(o.liberada), cls: () => 'data' },
    { k: 'progEm', rot: 'Programada para', padrao: true, ver: (o) => br(o.progEm), cls: () => 'data' },
    { k: 'prev', rot: 'Prevista na STL', ver: (o) => (o.prev ? el('span', { class: o.prevEstado === 'vencida' ? 'velha' : '', text: br(o.prev), title: o.prevEstado === 'vencida' ? 'A data prevista na STL já passou' : 'Data prevista na mão de obra da STL' }) : '—'), cls: () => 'data' },
    { k: 'inicioMan', rot: 'Início da manutenção', ver: (o) => br(o.inicioMan), cls: () => 'data' },
    { k: 'fim', rot: 'Finalizada em', padrao: true, ver: (o) => br(o.fim), cls: () => 'data' },
    { k: 'dias', rot: 'Dias', num: true, padrao: true, ord: (o) => o.dias, cls: (o) => (o.sit !== 'F' && o.dias > 90 ? 'velha' : o.sit === 'F' ? 'fraco' : ''),
      ver: (o) => (o.lancDepois ? el('span', {}, diasDe(o), el('span', { class: 'lanc', text: 'lançada depois', title: `Aberta no Protheus ${plural(o.lancDepois, 'dia', 'dias')} depois do fim do serviço; o tempo conta do início da manutenção` })) : diasDe(o)) },
    { k: 'quemTxt', rot: 'Quem fecha', padrao: true, cls: (o) => 'quem' + (o.grupo === 'S' ? ' fraco' : ''),
      ver: (o) => (o.grupo === 'S' && o.espTxt ? el('span', {}, 'Sem executante', el('small', { style: 'display:block;color:var(--muito-fraco)', text: 'prevista: ' + o.espTxt })) : o.quemTxt) },
    { k: 'tipo', rot: 'Tipo', padrao: true },
    { k: 'horas', rot: 'Horas apontadas', num: true, h: true, padrao: true, ver: (o) => (o.horas ? nh.format(o.horas) + ' h' : '—') },
    { k: 'hPrev', rot: 'Horas previstas', num: true, h: true, ver: (o) => (o.hPrev ? nh.format(o.hPrev) + ' h' : '—') },
    { k: 'contador', rot: 'Contador', num: true, ord: (o) => Number(o.contador) || -1, ver: (o) => (o.contador ? nf.format(Number(o.contador) || 0) : '—') },
    { k: 'servCod', rot: 'Código do serviço' },
    { k: 'ccusto', rot: 'Centro de custo' },
    { k: 'filial', rot: 'Filial' },
    { k: 'obs', rot: 'Observação', cls: () => 'obs', ver: (o) => (o.obs ? o.obs.slice(0, 110) + (o.obs.length > 110 ? '…' : '') : '—') },
  ];
  const GUARDA_COLS = 'painel-os-colunas-v3';
  const colunasOn = (() => {
    try { const l = JSON.parse(localStorage.getItem(GUARDA_COLS) || 'null'); if (Array.isArray(l)) return new Set(l); } catch (e) { /* sem armazenamento */ }
    return new Set(COLS.filter((c) => c.padrao).map((c) => c.k));
  })();
  // v8 (10/11/2026): a coluna Aberta por (quem abriu a OS) entra para quem já tinha escolhido as colunas
  try { if (!localStorage.getItem('painel-os-v8-colunas')) { colunasOn.add('abertaPor'); localStorage.setItem('painel-os-v8-colunas', '1');
    localStorage.setItem(GUARDA_COLS, JSON.stringify([...colunasOn])); } } catch (e) { colunasOn.add('abertaPor'); }
  // v7: a coluna Programada para entra para quem já tinha escolhido as colunas
  try { if (!localStorage.getItem('painel-os-v7-colunas')) { colunasOn.add('progEm'); colunasOn.delete('prev'); localStorage.setItem('painel-os-v7-colunas', '1');
    localStorage.setItem(GUARDA_COLS, JSON.stringify([...colunasOn])); } } catch (e) { colunasOn.add('progEm'); }
  const salvarCols = () => { try { localStorage.setItem(GUARDA_COLS, JSON.stringify([...colunasOn])); } catch (e) { /* sem armazenamento */ } };
  let colunasAbertas = false;

  // os botões de situação no alto da carteira mexem no mesmo filtro da barra
  const SITS = [['todas', 'Todas'], ['abrir', 'Para fechar'], ['A', 'Liberadas'], ['P', 'Não liberadas'], ['F', 'Finalizadas']];
  function carteira(alvo, lista, semSit, { chave, titulo, nota, semFrota = false, semSegm = false, grupos = null }) {
    const est = V.cart[chave] || (V.cart[chave] = { lim: 100 });
    // `grupos` (a Programação): os botões são desta lista — escolher um não mexe na Situação da barra
    let segG = null;
    if (grupos) {
      const g = grupos.find((x) => x.k === est.g) || grupos[0];
      est.g = g.k;
      lista = semSit.filter(g.casa);
      // (11/11/2026) os botões principais à vista, em blocos com nome; o detalhe (`sub`, aberto por um número
      // ou por um pedaço da barra) aparece só enquanto está escolhido
      const botao = (x) => el('button', { type: 'button', 'aria-pressed': String(x === g), title: x.dica || null, on: { click: () => { est.g = x.k; est.lim = 100; desenhar(); } } },
        x.cor ? el('i', { class: 'ponto', style: 'background:' + x.cor }) : null, x.rot, el('span', { class: 'n', text: nf.format(semSit.filter(x.casa).length) }));
      const vis = grupos.filter((x) => !x.sub || x === g), blocos = [...new Set(vis.map((x) => x.bloco || ''))];
      segG = blocos.length > 1
        ? el('div', { class: 'segm-blocos' }, ...blocos.map((b) => el('div', { class: 'segm-bloco' }, b ? el('span', { class: 'segm-rot', text: b }) : null,
          el('div', { class: 'segm', role: 'group', 'aria-label': b || 'Quais OS' }, ...vis.filter((x) => (x.bloco || '') === b).map(botao)))))
        : el('div', { class: 'segm', role: 'group', 'aria-label': 'Quais OS' }, ...vis.map(botao));
    }
    const conta = { todas: semSit.length, abrir: semSit.filter((o) => o.sit !== 'F').length, A: 0, P: 0, F: 0 };
    for (const o of semSit) conta[o.sit]++;
    const ligado = (k) => (k === 'todas' ? !F.sit.size : k === 'abrir' ? F.sit.size === 2 && F.sit.has('A') && F.sit.has('P') : F.sit.has(k));
    const clicar = (k) => aplicar(() => {
      if (k === 'todas') F.sit.clear();
      else if (k === 'abrir') F.sit = ligado('abrir') ? new Set() : new Set(['A', 'P']);
      else escolhe('sit', k);
    });
    const segm = el('div', { class: 'segm', role: 'group', 'aria-label': 'Situação (pode marcar mais de uma)' }, ...SITS.map(([k, rot]) =>
      el('button', { type: 'button', 'aria-pressed': String(ligado(k)), on: { click: () => clicar(k) } },
        COR[k] ? el('i', { class: 'ponto', style: 'background:' + COR[k] }) : null, rot, el('span', { class: 'n', text: nf.format(conta[k]) }))));
    const caixa = el('div', { class: 'tab' });
    const baixar = el('button', { type: 'button', class: 'botao mini baixar-csv', hidden: true, title: 'A lista na tela, com todas as linhas e todas as colunas, para abrir no Excel' });
    baixar.innerHTML = ICONE_BAIXAR + '<span>Baixar a lista (Excel)</span>';
    const aviso = el('span', { class: 'aviso-img', 'aria-live': 'polite' });
    // escolher as colunas
    const escolha = el('details', { class: 'colunas' });
    if (colunasAbertas) escolha.open = true;
    escolha.addEventListener('toggle', () => { colunasAbertas = escolha.open; });
    escolha.append(el('summary', { class: 'botao mini', text: 'Colunas' }), el('div', { class: 'colunas-lista' }, ...COLS.filter((c) => !c.fixa).map((c) => {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = colunasOn.has(c.k);
      cb.addEventListener('change', () => { if (cb.checked) colunasOn.add(c.k); else colunasOn.delete(c.k); salvarCols(); desenhar(); });
      return el('label', {}, cb, c.rot);
    })));
    const pe = el('div', { class: 'tab-pe' });
    alvo.replaceChildren(
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: titulo }), el('p', { class: 'nota', text: nota })), el('div', { class: 'acoes' }, aviso, baixar, escolha)),
      ...(semSegm ? [] : [el('div', { class: 'cart-barra' }, segG || segm)]), caixa, pe);
    const cols = COLS.filter((c) => (c.fixa || colunasOn.has(c.k)) && !(semFrota && c.frota));
    const ordenadas = tabela(caixa, { id: 'cart-' + chave, linhas: lista, lim: est.lim, padrao: { k: 'sit', dir: 'asc' }, aoClicar: abrirDetalhe, cols });
    const mais = lista.length - est.lim;
    pe.replaceChildren(el('span', { text: `${nf.format(Math.min(est.lim, lista.length))} de ${plural(lista.length, 'OS', 'OS')} ` }),
      ...(mais > 0 ? [el('span', { class: 'acoes' },
        el('button', { type: 'button', class: 'botao mini', text: `Mostrar mais ${nf.format(Math.min(100, mais))}`, on: { click: () => { est.lim += 100; desenhar(); } } }),
        el('button', { type: 'button', class: 'botao mini', text: `Mostrar todas (${nf.format(lista.length)})`, on: { click: () => { est.lim = lista.length; desenhar(); } } }))] : []));
    baixar.addEventListener('click', () => baixarCSV(ordenadas, titulo, baixar, aviso));
    downloadsP.then((d) => { if (d) baixar.hidden = false; });
  }

  // ── o detalhe de uma OS (09/11/2026): uma caixa no meio da tela, com o que importa em cima
  // (idade, datas, previsão, quem fecha, horas) e o resto recolhido em "Mais detalhes" ──
  const detalhe = $('#detalhe'), fundo = $('#detalhe-fundo');
  let voltaFoco = null;
  function fecharDetalhe() { detalhe.hidden = true; fundo.hidden = true; if (voltaFoco) voltaFoco.focus(); }
  fundo.addEventListener('click', fecharDetalhe);
  ouvir(window, 'keydown', (e) => {
    if (detalhe.hidden) return;
    if (e.key === 'Escape') { fecharDetalhe(); return; }
    // a caixa prende o Tab: o foco roda dentro dela até fechar
    if (e.key !== 'Tab') return;
    const f = [...detalhe.querySelectorAll('button, [href], input, select, summary')].filter((x) => !x.disabled && x.getClientRects().length);
    if (!f.length) return;
    const agora = focado(), fora = !detalhe.contains(agora);
    if (e.shiftKey && (fora || agora === f[0])) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (fora || agora === f[f.length - 1])) { e.preventDefault(); f[0].focus(); }
  });
  const cabDetalhe = (sobre, titulo) => el('div', { class: 'det-cab' }, el('div', {}, sobre, el('h3', { id: 'detalhe-tit', text: titulo })),
    el('button', { type: 'button', class: 'fechar', 'aria-label': 'Fechar', title: 'Fechar (Esc)', text: '×', on: { click: fecharDetalhe } }));
  function mostrarDetalhe(...filhos) {
    detalhe.replaceChildren(...filhos.filter(Boolean));
    fundo.hidden = false;
    detalhe.hidden = false;
    detalhe.scrollTop = 0;
    detalhe.querySelector('.fechar').focus();
  }
  function abrirDetalhe(o) {
    voltaFoco = focado();
    const aberta = o.sit !== 'F', vencida = o.prevEstado === 'vencida';
    const fato = (rot, val, { sub = '', cls = '' } = {}) => el('div', { class: 'det-fato' + (cls ? ' ' + cls : '') },
      el('span', { class: 'rot', text: rot }), el('b', { text: val }), sub ? el('small', { text: sub }) : null);
    const fatos = [
      o.dias != null && fato(aberta ? 'Aberta há' : 'Levou', plural(o.dias, 'dia', 'dias'), { cls: aberta && o.dias > 90 ? 'alerta' : '', sub: o.lancDepois ? 'do início da manutenção' : '' }),
      fato('Aberta em', br(o.abertura) || '—'),
      fato('Aberta por', o.abertaPor || '—', { sub: o.abertaPor ? 'Usr Inclusao no Protheus'
        : o.origemHist || (o.abertura && o.abertura < ((D.historica && D.historica.corte) || '2026-01-01')) ? 'a base histórica não tem essa coluna' : 'não veio no export da STJ' }),
      aberta ? fato('Liberada em', o.liberada ? br(o.liberada) : 'Aguardando', { cls: o.liberada ? '' : 'espera' }) : fato('Finalizada em', br(o.fim) || '—'),
      aberta && fato('Prevista para', o.prev ? br(o.prev) : 'Sem data', { cls: vencida ? 'alerta' : '', sub: vencida ? 'já passou' : '' }),
      !!o.progEm && fato('Programada para', br(o.progEm)),
      fato('Quem fecha', GRUPO[o.grupo], { cls: o.grupo === 'S' || o.soFora ? 'alerta' : '', sub: o.soFora ? `ninguém aponta há ${DIAS_FORA} dias` : '' }),
      !!(o.hPrev || o.horas) && fato('Horas', nh.format(o.horas) + (o.hPrev ? ' de ' + nh.format(o.hPrev) : '') + ' h', { sub: o.hPrev ? 'apontadas de previstas' : 'apontadas' })];
    const mao = o.quem.length ? el('div', { class: 'det-bloco' }, el('h4', { text: 'Mão de obra' }),
      el('div', { class: 'tab' }, el('table', { class: 'mao' },
        el('thead', {}, el('tr', {}, ...['Pessoa', 'Prevista', 'Apontou', 'Horas'].map((x, i) => el('th', { class: i ? 'n' : null, text: x })))),
        el('tbody', {}, ...o.quem.map((q) => el('tr', {},
          el('td', {}, q.nome, aponta(q.nome) ? null : el('small', { class: 'fora-tag', text: foraTxt(q.nome) })),
          el('td', { class: 'n' + (q.prev && q.prev < D.base && aberta ? ' velha' : ''), text: dma(q.prev) || '—' }),
          el('td', { class: 'n', text: dma(q.real) || '—' }),
          el('td', { class: 'n', text: q.h || q.hp ? nh.format(q.h) + (q.hp ? ' de ' + nh.format(q.hp) : '') + ' h' : '—' }))))))) : null;
    const linha = (rot, v) => (v == null || v === '' ? [] : [el('dt', { text: rot }), el('dd', {}, v)]);
    const mais = [...linha('Filial', o.filial), ...linha('Código do serviço', o.servCod), ...linha('Programação', CLASSE[o.classe]),
      ...linha('Início da manutenção', br(o.inicioMan)), ...linha('Lançada no Protheus', o.lancDepois ? `${plural(o.lancDepois, 'dia', 'dias')} depois do fim do serviço` : ''),
      ...linha('Contador', o.contador ? nf.format(Number(o.contador) || 0) : ''), ...linha('Centro de custo', o.ccusto),
      ...linha('Terceiro', [o.tercSTJ ? 'marcado na STJ' : '', o.tercSTL ? 'insumo Terceiro na STL' : ''].filter(Boolean).join(' · ')),
      ...linha('Especialidade prevista', o.espTxt)];
    mostrarDetalhe(
      cabDetalhe(el('p', { class: 'det-id' }, el('b', { text: 'OS ' + o.os }), ' · ' + o.frota + (o.equip ? ' · ' + o.equip : '')), o.servico || 'Sem descrição'),
      el('div', { class: 'acoes' }, badge(o), categoria(o), el('span', { class: 'etq', text: o.tipo })),
      el('div', { class: 'det-fatos' }, ...fatos),
      o.obs ? el('div', { class: 'det-bloco' }, el('h4', { text: 'Observação' }), el('p', { class: 'obs-txt', text: o.obs })) : null,
      mao,
      mais.length ? el('details', { class: 'det-mais' }, el('summary', { text: 'Mais detalhes' }), el('dl', {}, ...mais)) : null,
      el('div', { class: 'det-pe' }, el('button', { type: 'button', class: 'botao', text: 'Ver todas as OS da ' + o.frota,
        on: { click: () => { fecharDetalhe(); aplicar(() => so('frota', o.frota), 'frotas'); } } })));
  }

  // ── por semana ou por mês ──
  function baldes(p) {
    const ini = t(p.desde), fim = Math.min(t(p.ate), ref);
    const semanas = (fim - ini) / DIA / 7;
    const b = [];
    if (semanas < 3) {
      for (let d = ini; d <= fim; d += DIA) b.push({ chave: iso(d), de: iso(d), ate: iso(d), rot: dm(iso(d)), nome: `${DIAS_LONGO[new Date(d).getUTCDay()]}, ${br(iso(d))}` });
      return { b, unid: 'dia' };
    }
    if (semanas <= 17) {
      for (let s = segundaDe(ini); s <= fim; s += 7 * DIA) b.push({ chave: iso(s), de: iso(s), ate: iso(s + 6 * DIA), rot: 'S' + semanaISO(s), nome: `Semana ${semanaISO(s)} · ${dm(iso(s))} a ${dm(iso(s + 6 * DIA))}` });
      return { b, unid: 'semana' };
    }
    let a = Number(p.desde.slice(0, 4)), m = Number(p.desde.slice(5, 7));
    for (;;) {
      const de = `${a}-${String(m).padStart(2, '0')}-01`;
      if (t(de) > fim) break;
      const ate = iso(Date.UTC(a, m, 0));
      b.push({ chave: de, de, ate, rot: MES[m - 1] + (b.length === 0 || m === 1 ? '/' + String(a).slice(2) : ''), nome: MESES[m - 1] + ' de ' + a });
      m++; if (m > 12) { m = 1; a++; }
    }
    return { b, unid: 'mês' };
  }
  const achaBalde = (b, d) => { for (const x of b) if (d >= x.de && d <= x.ate) return x; return null; };

  // ── Visão geral ──
  // Simples de ler (v6, 03/11/2026): quatro números que se clicam, as frotas, a entrada e saída, quem
  // fecha, há quanto tempo estão abertas, programadas ou não e as categorias. Um cartão por ideia.
  function desenharGeral(R) {
    const ab = R.abertas, fe = R.fechadas;
    const lib = ab.filter((o) => o.sit === 'A').length, pen = ab.length - lib;
    const v90 = ab.filter((o) => o.faixa === 3).length, sem = ab.filter((o) => o.grupo === 'S').length;
    const sel = periodoSel(), esc = escSerie(sel), unid = unidDe(esc);
    // o resumo do período (11/11/2026): as cinco perguntas — quanto havia, quanto entrou, quanto saiu (com as
    // antigas), quanto há e se a carteira andou ou só girou —, cada número com o período anterior
    const mv = IND.movimento(R.todas, { de: sel.de, ate: sel.ate, base: D.base });
    const pa = IND.anterior({ desde: sel.de, ate: sel.ate, base: D.base, unidade: sel.unidade });
    const mvA = IND.movimento(R.todas, { de: pa.desde, ate: pa.ate, base: D.base });
    const rotAnt = pa.desde === pa.ate ? dm(pa.desde) : `${dm(pa.desde)} a ${dm(pa.ate)}`, nf0 = (v) => nf.format(v);
    const pctV = mv.variacaoPct == null || !mv.variacao ? '' : ` (${sinalPc(mv.variacaoPct)})`, pctF = pctV ? `; ${sinalPc(mv.variacaoPct)}` : '';
    $('#rot-resumo').textContent = sel.rot;
    $('#nota-resumo').textContent = `Pela abertura e pelo fim no Protheus · comparado com ${rotAnt}`;
    const [clsV, frase] = mv.variacao < 0
      ? ['bom', `Evoluindo: a carteira caiu de ${nf.format(mv.inicial)} para ${nf.format(mv.final)} OS (${sinal(mv.variacao)} OS${pctF}). Encerrou ${plural(mv.saidas, 'OS', 'OS')} — ${nf.format(mv.saidasAntigas)} do backlog inicial — e entraram ${nf.format(mv.entradas)}.`]
      : mv.variacao > 0 && mv.saidas
        ? ['ruim', `Só movimentando: encerrou ${plural(mv.saidas, 'OS', 'OS')}, mas entraram ${nf.format(mv.entradas)} — a carteira cresceu de ${nf.format(mv.inicial)} para ${nf.format(mv.final)} (${sinal(mv.variacao)} OS${pctF}).`]
        : mv.variacao > 0 ? ['ruim', `A carteira cresceu de ${nf.format(mv.inicial)} para ${nf.format(mv.final)} (${sinal(mv.variacao)} OS${pctF}): entraram ${nf.format(mv.entradas)} e nenhuma foi encerrada.`]
          : ['', `A carteira ficou igual (${nf.format(mv.final)} OS): entraram ${nf.format(mv.entradas)} e encerraram ${nf.format(mv.saidas)}.`];
    const ver = $('#veredito');
    ver.className = 'veredito ' + clsV;
    ver.textContent = (clsV === 'bom' ? '✓ ' : clsV === 'ruim' ? '⚠ ' : '= ') + frase + ` No período anterior (${rotAnt}): ${sinal(mvA.variacao)}.`;
    $('#kpis-resumo').replaceChildren(
      kpiCom('Backlog inicial', nf.format(mv.inicial), `em aberto em ${dm(mv.vespera)}`, COR.A, { comp: comparacao(mv.inicial, mvA.inicial, null, nf0, rotAnt) }),
      kpiCom('Novas OS', mais(mv.entradas), 'abertas no período', 'var(--nova)', { comp: comparacao(mv.entradas, mvA.entradas, null, nf0, rotAnt) }),
      kpiCom('Encerradas', menos(mv.saidas), `${nf.format(mv.saidasAntigas)} antigas · ${nf.format(mv.saidasNovas)} abertas no período`, COR.F,
        { comp: comparacao(mv.saidas, mvA.saidas, 'mais', nf0, rotAnt) }),
      kpiCom(sel.ate >= D.base ? 'Backlog atual' : 'Backlog final', nf.format(mv.final), `em aberto em ${dm(mv.ate)}`, 'var(--fraco)', { comp: comparacao(mv.final, mvA.final, 'menos', nf0, rotAnt) }),
      kpiCom('Variação', sinal(mv.variacao) + pctV, mv.variacao < 0 ? 'a carteira diminuiu' : mv.variacao > 0 ? 'a carteira cresceu' : 'a carteira ficou igual', null,
        { cls: mv.variacao < 0 ? 'bom' : mv.variacao > 0 ? 'ruim' : '', comp: comparacao(mv.variacao, mvA.variacao, 'menos', sinal, rotAnt) }));
    // a evolução do backlog: o fim de cada período, a variação embaixo e a reta da tendência
    const serie = serieCarteira(R.todas, sel, esc);
    $('#ctl-evolucao').replaceChildren(segSerie(sel));
    const trE = linhaTempo($('#g-evolucao'), { linhas: serie, k: 'final', titulo: 'Evolução do backlog', nomes: (l) => [l.curto, l.variacaoPct == null || !l.variacao ? '0' : sinalPc(l.variacaoPct)],
      subCor: corVar, marcado: (l) => toca(l, sel), aoClicar: (l) => irPeriodo(l), dica: dicaMov, tendencia: true });
    $('#nota-evolucao').textContent = `OS em aberto no fim de cada ${unid} · embaixo, a variação ${{ dia: 'no dia', semana: 'na semana', mes: 'no mês' }[esc]}` +
      (trE ? ` · tracejado: a tendência dos últimos ${N_JANELA[esc]} (${sinal(Math.round(trE.b))} OS por ${unid})` : '');
    const kpi = (rot, val, pe, { cls = '', cor = null, fazer = null, trilho = null } = {}) => el(fazer ? 'button' : 'div', { class: 'kpi', type: fazer ? 'button' : null, on: fazer ? { click: fazer } : {} },
      el('span', { class: 'rot' }, cor ? el('i', { class: 'ponto', style: 'background:' + cor }) : null, rot), el('span', { class: 'val ' + cls, text: val }),
      trilho, el('span', { class: 'pe', text: pe }));
    const trilho = ab.length ? el('span', { class: 'trilho', title: `${nf.format(lib)} liberadas para execução · ${nf.format(pen)} aguardando liberação` },
      el('i', { style: `flex:${lib};background:${COR.A}` }), el('i', { style: `flex:${pen};background:${COR.P}` })) : null;
    const irSit = (...s) => aplicar(() => so('sit', ...s), 'carteira');
    const sem7 = contaProg(semSituacao().todas, sel);
    $('#kpis').replaceChildren(
      kpi('Abertas agora', nf.format(ab.length), `${nf.format(lib)} liberadas · ${nf.format(pen)} aguardando`, { trilho, fazer: () => irSit('A', 'P') }),
      kpi('Sem executante', nf.format(sem), ab.length ? `${pc.format(sem / ab.length)} das abertas` : '—', { cls: sem ? 'ruim' : '', cor: COR.alerta, fazer: () => aplicar(() => so('exec', 'g:S'), 'carteira') }),
      kpi('Abertas há mais de 90 dias', nf.format(v90), ab.length ? pc.format(v90 / ab.length) + ' das abertas' : '—', { cls: v90 ? 'ruim' : '', cor: COR.alerta, fazer: () => aplicar(() => so('idade', '3'), 'carteira') }),
      kpi('Programadas no período', nf.format(sem7.n), `${nf.format(sem7.prazo)} encerradas no período (${sem7.n ? pc.format(sem7.prazo / sem7.n) : '—'})`,
        { cor: COR.prog, fazer: () => { (V.cart.prog || (V.cart.prog = { lim: 100 })).g = 'prog'; V.rolar = 'pg-lista'; irPara('programacao'); } }));

    // abertas e fechadas por frota, lado a lado (pedido de 03/11/2026)
    const pf = ordenaFrotas(porFrota(R));
    controlesFrota($('#ctl-frotas'));
    $('#leg-frotas').replaceChildren(...itensBK());
    barrasBacklog($('#g-frotas'), { linhas: pf.map((l) => ({ ...l, rot: l.chave, baix: l.F, pend: l.A + l.P })), titulo: 'Backlog por frota', dica: dicaFrota(R),
      limite: 10, chave: 'geral-frotas', sub: (l) => l.sub, aoClicar: (l) => aplicar(() => so('frota', l.chave), 'frotas') });
    $('#nota-frotas').textContent = `${plural(ab.length, 'pendente', 'pendentes')} e ${plural(fe.length, 'baixada', 'baixadas')} (${R.p.rot.toLowerCase()}) em ${plural(pf.length, 'frota', 'frotas')}` +
      ` · por ${ORD_FROTA[V.frotaOrd][0].toLowerCase()}`;

    // programadas × finalizadas (10/11/2026): o dia, a semana ou o mês de hoje e os em volta; a coluna abre a Programação
    const jan = janelaDe(sel, esc, 2).map((q) => contaProg(semSituacao().todas, q));
    const agora = contaProg(semSituacao().todas, sel);
    $('#ctl-progfin').replaceChildren(segSerie(sel));
    $('#nota-progfin').textContent = `${sel.rot}: ${plural(agora.n, 'programada', 'programadas')}, ${nf.format(agora.prazo)} encerradas no período (${pctDe(agora.prazo, agora.n)})` +
      ` · ${plural(agora.fin, 'encerrada', 'encerradas')} no total (${nf.format(agora.finFora)} extra programação)`;
    $('#leg-progfin').replaceChildren(...itensPF());
    grafProgFin($('#g-progfin'), jan, { titulo: 'Programadas e encerradas', rotulo: (l) => [l.curto, l.de > D.base ? 'a vir' : pctDe(l.prazo, l.n)], marcado: (l) => toca(l, sel),
      aoClicar: (l) => verProgramadas(esc, l.de) });

    // entrada e saída em cada período: novas × encerradas, e o saldo embaixo
    $('#nota-fluxo').textContent = `Por ${unid} · ${sel.rot}: entraram ${nf.format(mv.entradas)} e saíram ${nf.format(mv.saidas)} — ` +
      (mv.saldo > 0 ? `a carteira cresceu ${nf.format(mv.saldo)}` : mv.saldo < 0 ? `a carteira diminuiu ${nf.format(-mv.saldo)}` : 'a carteira ficou igual') + ' · embaixo, o saldo';
    legenda('#leg-fluxo', [['Novas OS (abertas no Protheus)', 'var(--nova)'], ['Encerradas', COR.F]]);
    colunasNE($('#g-fluxo'), serie, sel, 'Entrada e saída da carteira');

    // quem vai fechar as abertas
    const nq = (g) => ab.filter((o) => o.grupo === g).length;
    // (rosca: é parte do todo, três fatias; só o problema — sem executante — ganha cor)
    rosca($('#g-quem'), [{ chave: 'I', nome: GRUPO.I, valor: nq('I'), cor: 'var(--fraco)' }, { chave: 'T', nome: GRUPO.T, valor: nq('T'), cor: 'var(--ctx)' },
      { chave: 'S', nome: GRUPO.S, valor: nq('S'), cor: COR.alerta }], { titulo: 'Quem vai fechar as abertas', sub: 'abertas',
      aoClicar: (f) => aplicar(() => so('exec', 'g:' + f.chave), 'carteira') });

    // há quanto tempo estão abertas: uma cor só; a faixa de mais de 90 dias em vermelho
    colunasEmPe($('#g-idade'), { linhas: FAIXAS.map((f, i) => ({ chave: String(i), nome: f, n: ab.filter((o) => o.faixa === i).length })),
      partes: [{ k: 'n', nome: 'OS abertas', cor: (l) => (l.chave === '3' ? COR.alerta : COR.A) }], H: 250, passoMax: 140, bwMax: 44, titulo: 'Há quanto tempo estão abertas',
      nomes: (l) => ({ fortes: [l.nome], fracos: [ab.length ? pc.format(l.n / ab.length) : ''], alerta: l.chave === '3' }),
      aoClicar: (d) => aplicar(() => so('idade', d.chave), 'carteira') });

    // programadas e não programadas: as abertas e as fechadas, cada uma em 100%
    const nP = fe.filter((o) => o.classe === 'P').length, nN = fe.filter((o) => o.classe === 'N').length;
    $('#nota-comp').textContent = nP + nN ? `${pc.format(nP / (nP + nN))} das fechadas foram programadas (${nf.format(nP)} de ${nf.format(nP + nN)})` : 'Nenhuma fechada programada ou não programada no período';
    legenda('#leg-comp', []);
    const comp = (rot, l) => ({ chave: rot, nome: rot, rot, n: l.length, P: l.filter((o) => o.classe === 'P').length, N: l.filter((o) => o.classe === 'N').length,
      O: l.filter((o) => o.classe === 'O' || o.classe === 'S').length });
    // duas roscas, as abertas e as fechadas: cada uma é um todo
    const fatiasComp = (l) => [{ c: 'P', nome: 'Programada', valor: l.P, cor: COR.prog }, { c: 'N', nome: 'Não programada', valor: l.N, cor: COR.nprog },
      { c: '', nome: 'Outra ou sem categoria', valor: l.O, cor: COR.ctx }];
    const rA = el('div'), rF = el('div');
    $('#g-comp').replaceChildren(el('div', { class: 'roscas' }, el('div', {}, el('h3', { class: 'rosca-tit', text: 'Abertas' }), rA),
      el('div', {}, el('h3', { class: 'rosca-tit', text: 'Fechadas no período' }), rF)));
    const filtraComp = (f) => f.c && aplicar(() => escolhe('prog', f.c));
    rosca(rA, fatiasComp(comp('Abertas', ab)), { titulo: 'Abertas por categoria', sub: 'abertas', tam: 150, aoClicar: filtraComp });
    rosca(rF, fatiasComp(comp('Fechadas', fe)), { titulo: 'Fechadas no período por categoria', sub: 'fechadas', tam: 150, aoClicar: filtraComp });

    // as categorias: as 10 maiores, abertas e fechadas
    const pc2 = new Map();
    for (const o of R.base) {
      const diz = norm(o.cat).startsWith(norm(CLASSE[o.classe])) || o.cat.startsWith('Outra') || o.classe === 'S';
      if (!pc2.has(o.cat)) pc2.set(o.cat, { chave: o.cat, nome: diz ? o.cat : o.cat + ' · ' + CLASSE[o.classe].toLowerCase(), rot: o.cat, cls: diz ? '' : CLASSE[o.classe].toLowerCase(), abrir: 0, fim: 0 });
      pc2.get(o.cat)[o.sit === 'F' ? 'fim' : 'abrir']++;
    }
    legenda('#leg-cats', [['Abertas', COR.A], ['Fechadas no período', COR.F]]);
    colunasEmPe($('#g-cats'), { linhas: [...pc2.values()].sort((a, b2) => b2.abrir + b2.fim - a.abrir - a.fim), limite: 10, chave: 'cats', quem: ['categoria', 'categorias'],
      partes: [{ k: 'abrir', nome: 'Abertas', cor: COR.A, texto: 'claro' }, { k: 'fim', nome: 'Fechadas no período', cor: COR.F, texto: 'escuro' }], titulo: 'Categorias',
      nomes: (l) => ({ fortes: [l.rot], fracos: [l.cls] }), H: 300, passoMin: 80, passoMax: 120,
      marcado: (l) => F.prog.has('c:' + l.chave), aoClicar: (l) => aplicar(() => escolhe('prog', 'c:' + l.chave)) });
    const de = (c) => [...new Set(CATS.filter((_, i) => CLS[i] === c).map((n) => (n.startsWith('Outra:') ? 'siglas sem legenda (' + CATS.filter((x, i) => CLS[i] === c && x.startsWith('Outra:')).map((x) => x.slice(7)).join(', ') + ')' : n)))].join(', ');
    $('#regra-prog').replaceChildren(el('b', { text: 'Programadas: ' }), de('P') || '—', '. ', el('b', { text: 'Não programadas: ' }), de('N') || '—', '. ',
      el('b', { text: 'Outras: ' }), de('O') || '—', '. ', el('b', { text: 'Sem categoria: ' }), 'o campo veio em branco no Protheus.');
  }

  // ── Indicadores (09/11/2026): os números de PCM, cada um com a regra escrita e a comparação com o período
  // anterior de mesmo tamanho. As contas estão em js/os/indicadores.js (e no teste); aqui só a tela. O
  // período da barra vale para o que é fluxo (o que entrou, fechou, estava programado); a carteira é a de hoje.
  const fmtDias = (v) => (v == null ? '—' : plural(Math.round(v * 10) / 10, 'dia', 'dias').replace(/^(\d+)\.(\d)/, '$1,$2'));
  const fmtPc = (v) => (v == null ? '—' : pc.format(v));
  const fmtSem = (v) => (v == null ? '—' : nh.format(v) + (v === 1 ? ' semana' : ' semanas'));
  /** O comparativo (11/11/2026): cada indicador no período (k) e no anterior (a), a diferença, a variação e a leitura. */
  function comparativoDe(k, a) {
    const COMP = [['Backlog no início', k.noComeco, a.noComeco, 'n', null], ['Novas OS', k.entraram, a.entraram, 'n', null], ['Encerradas', k.fechadas, a.fechadas, 'n', 'mais'],
      ['Backlog no fim', k.carteira, a.carteira, 'n', 'menos'], ['Saldo (novas − encerradas)', k.saldo, a.saldo, 'n', 'menos'],
      ['Encerradas ÷ novas', k.atendimento, a.atendimento, 'pc', 'mais'], ['Fechadas por semana', k.ritmo, a.ritmo, 'h', 'mais'],
      ['Tempo para fechar (mediana)', k.tempoMediana, a.tempoMediana, 'd', 'menos'], ['Fechadas em até 7 dias', k.ate7, a.ate7, 'pc', 'mais'],
      ['Aderência à programação', k.aderencia, a.aderencia, 'pc', 'mais'], ['Índice de preventiva', k.preventiva, a.preventiva, 'pc', 'mais'],
      ['Trabalho programado', k.programado, a.programado, 'pc', 'mais'], ['Horas apontadas', k.horas, a.horas, 'h', null],
      ['Abertas depois do serviço', k.abertasDepois, a.abertasDepois, 'pc', 'menos']];
    const fmtC = (v, tp) => (v == null ? '—' : tp === 'pc' ? pc.format(v) : tp === 'd' ? fmtDias(v) : tp === 'h' ? nh.format(v) : nf.format(v));
    const difC = (d, tp) => (d == null ? '—' : !d ? '0' : (d > 0 ? '+' : '−') + (tp === 'pc' ? nh.format(Math.abs(d) * 100) + ' p.p.' : tp === 'd' ? fmtDias(Math.abs(d)) : tp === 'h' ? nh.format(Math.abs(d)) : nf.format(Math.abs(d))));
    const linhasC = COMP.map(([rot, v1, v0, tp, melhor]) => {
      const d = v1 == null || v0 == null ? null : v1 - v0, bom = d == null || !d || !melhor ? null : melhor === 'mais' ? d > 0 : d < 0;
      return { rot, tp, n1: v1, n0: v0, v1: fmtC(v1, tp), v0: fmtC(v0, tp), d: difC(d, tp), pct: d == null || tp === 'pc' || !v0 ? '—' : sinalPc(d / Math.abs(v0)),
        leit: d == null ? '—' : !d ? 'igual' : bom === true ? '▲ melhor' : bom === false ? '▼ pior' : d > 0 ? 'subiu' : 'desceu', bom };
    });
    return linhasC;
  }
  function desenharIndicadores(R) {
    const raiz = $('#indicadores');
    const p = { desde: R.p.desde, ate: R.p.ate, base: D.base }, pa = IND.anterior({ ...p, unidade: unidadeDe(R.p.desde, R.p.ate) });
    const k = IND.indicadores(R.todas, p), a = IND.indicadores(R.todas, pa);
    const nomeAnt = pa.desde === pa.ate ? dma(pa.desde) : `${dma(pa.desde)} a ${dma(pa.ate)}`;
    // a comparação: a seta, "melhor" ou "pior" escrito (a cor nunca sozinha) e o número de antes
    const compara = (agora, antes, melhor, fmt) => {
      if (agora == null || antes == null) return el('span', { class: 'comp', text: 'sem o período anterior para comparar' });
      const d = agora - antes;
      if (Math.abs(d) < 1e-9) return el('span', { class: 'comp', text: `igual ao período anterior (${fmt(antes)})` });
      const bom = melhor === 'mais' ? d > 0 : melhor === 'menos' ? d < 0 : null;
      return el('span', { class: 'comp' + (bom === true ? ' bom' : bom === false ? ' ruim' : ''), title: 'Período anterior: ' + nomeAnt },
        el('b', { text: (d > 0 ? '▲ ' : '▼ ') + (bom === true ? 'melhor' : bom === false ? 'pior' : d > 0 ? 'subiu' : 'desceu') }), ` · antes ${fmt(antes)}`);
    };
    const ind = (rot, valor, regra, { comp = null, fazer = null, cls = '' } = {}) => el(fazer ? 'button' : 'div', { class: 'kpi ind', type: fazer ? 'button' : null, on: fazer ? { click: fazer } : {} },
      el('span', { class: 'rot', text: rot }), el('span', { class: 'val ' + cls, text: valor }), el('span', { class: 'regra', text: regra }), comp);
    const grupo = (tit, sub, ...cartoes) => el('section', { class: 'ind-grupo' }, el('div', { class: 'ind-cab' }, el('h3', { text: tit }), el('span', { text: sub })),
      el('div', { class: 'ind-cartoes' }, ...cartoes));
    const irSit = (...v) => aplicar(() => so('sit', ...v), 'carteira');
    const selI = periodoSel(), escI = escSerie(selI), unidI = unidDe(escI);
    // o comparativo (11/11/2026): cada indicador no período e no anterior, a diferença e a leitura
    const linhasC = comparativoDe(k, a);
    const tComp = el('div', { class: 'tab' }, el('table', { class: 'comparativo img-tabela' },
      el('thead', {}, el('tr', {}, ...['Indicador', 'No período', 'No anterior', 'Diferença', 'Variação', 'Leitura'].map((x, ix) => el('th', { class: ix ? 'n' : null, text: x })))),
      el('tbody', {}, ...linhasC.map((l) => el('tr', {}, el('td', { text: l.rot }), el('td', { class: 'n', text: l.v1 }), el('td', { class: 'n', text: l.v0 }), el('td', { class: 'n', text: l.d }),
        el('td', { class: 'n', text: l.pct }), el('td', { class: 'n leit' + (l.bom === true ? ' bom' : l.bom === false ? ' ruim' : ''), text: l.leit }))))));
    guardarDados(tComp, { titulo: 'Comparativo com o período anterior', cab: ['Indicador', `${R.p.rot} (${dma(k.periodo.desde)} a ${dma(k.periodo.ate)})`, `Anterior (${nomeAnt})`, 'Diferença', 'Variação', 'Leitura'],
      linhas: linhasC.map((l) => [l.rot, l.v1, l.v0, l.d, l.pct, l.leit]) });
    const cartaoComp = el('article', { class: 'cartao c12', id: 'c-ind-comp', 'data-imagem': true },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Comparativo com o período anterior' }), el('p', { class: 'nota', text: `${R.p.rot} × ${nomeAnt} · percentuais comparados em pontos percentuais (p.p.)` })),
        el('div', { class: 'acoes' })), tComp);
    // a regra de cada conta fica recolhida: o botão mostra todas de uma vez
    const botaoRegras = () => el('button', { type: 'button', class: 'botao mini', 'aria-pressed': String(V.regras), text: 'Como é calculado',
      on: { click: (e) => { V.regras = !V.regras; raiz.classList.toggle('regras', V.regras); e.currentTarget.setAttribute('aria-pressed', String(V.regras)); } } });
    raiz.classList.toggle('regras', V.regras);
    raiz.replaceChildren(el('div', { class: 'grade' },
      el('article', { class: 'cartao c12', id: 'c-ind-kpis', 'data-imagem': true },
        el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Indicadores de PCM' }),
          el('p', { class: 'nota', text: `${R.p.rot} · comparado com ${nomeAnt}` })),
          el('div', { class: 'acoes' }, botaoRegras())),
        grupo('Carteira', 'o que estava em aberto no fim do período',
          ind('Backlog no fim do período', nf.format(k.carteira), `em aberto em ${dm(k.periodo.ate)} · eram ${nf.format(k.noComeco)} no começo do período`,
            { comp: compara(k.carteira, k.noComeco, 'menos', (v) => nf.format(v)), fazer: () => irSit('A', 'P') }),
          ind('Backlog em semanas', fmtSem(k.backlogSemanas), k.ritmo ? `carteira ÷ ${nh.format(k.ritmo)} fechadas por semana no período: quanto tempo leva para zerar, se nada entrar` : 'nenhuma fechada no período'),
          ind('Idade da carteira', fmtDias(k.idadeMediana), `mediana das abertas · ${fmtPc(k.mais90)} com mais de 90 dias (${nf.format(k.nMais90)})`,
            { cls: k.mais90 > 0.5 ? 'ruim' : '', fazer: () => aplicar(() => so('idade', '3'), 'carteira') }),
          ind('Aguardando liberação', nf.format(k.aguardando), k.esperaLiberacao == null ? 'nenhuma liberada no período para medir a espera'
            : `as liberadas no período esperaram ${fmtDias(k.esperaLiberacao)} (mediana) da abertura até a liberação`, { fazer: () => irPara('pendentes') })),
        grupo('Ritmo', 'no período',
          ind('Fechadas por semana', k.ritmo == null ? '—' : nh.format(k.ritmo), `${plural(k.fechadas, 'fechada', 'fechadas')} em ${nh.format(k.periodo.semanas)} semanas`,
            { comp: compara(k.ritmo, a.ritmo, 'mais', (v) => nh.format(v)), fazer: () => irSit('F') }),
          ind('Taxa de atendimento', fmtPc(k.atendimento), `fechadas ÷ entraram (${nf.format(k.fechadas)} de ${nf.format(k.entraram)}) · acima de 100% a carteira diminui`,
            { comp: compara(k.atendimento, a.atendimento, 'mais', fmtPc), cls: k.atendimento == null ? '' : k.atendimento >= 1 ? 'bom' : 'ruim' }),
          ind('Saldo da carteira', sinal(k.saldo), `entraram − fecharam no período (${nf.format(k.entraram)} − ${nf.format(k.fechadas)})`,
            { comp: compara(k.saldo, a.saldo, 'menos', sinal), cls: k.saldo > 0 ? 'ruim' : k.saldo < 0 ? 'bom' : '' }),
          ind('Entraram', nf.format(k.entraram), 'OS abertas no Protheus dentro do período', { comp: compara(k.entraram, a.entraram, null, (v) => nf.format(v)) })),
        grupo('Prazo', 'quanto demora e o que cumpre o combinado',
          ind('Tempo para fechar', fmtDias(k.tempoMediana), `mediana, da abertura ao fim da manutenção, das fechadas no período · média ${fmtDias(k.tempoMedia)}`,
            { comp: compara(k.tempoMediana, a.tempoMediana, 'menos', fmtDias) }),
          ind('Fechadas em até 7 dias', fmtPc(k.ate7), `${nf.format(k.nAte7)} das ${nf.format(k.fechadas)} fechadas no período`, { comp: compara(k.ate7, a.ate7, 'mais', fmtPc) }),
          ind('Aderência à programação', fmtPc(k.aderencia), k.programadas ? `das ${nf.format(k.programadas)} programadas (com executante) para uma semana que já acabou, ${nf.format(k.cumpridas)} finalizadas até o domingo dela`
            : 'nenhuma OS programada para uma semana que já acabou', { comp: compara(k.aderencia, a.aderencia, 'mais', fmtPc), fazer: () => irPara('programacao') }),
          ind('Prevista vencida', fmtPc(k.vencida), `${nf.format(k.nVencidas)} das ${nf.format(k.nEquipe)} abertas com alguém da equipe: a data da mão de obra na STL já passou`,
            { cls: k.vencida > 0.5 ? 'ruim' : '', fazer: () => aplicar(() => { so('exec', 'g:I'); so('prev', 'vencida'); }, 'carteira') })),
        grupo('Planejamento e mão de obra', 'como o trabalho chega',
          ind('Índice de preventiva', fmtPc(k.preventiva), `das fechadas no período, do tipo Preventiva (${nf.format(k.nPreventivas)} de ${nf.format(k.fechadas)})`,
            { comp: compara(k.preventiva, a.preventiva, 'mais', fmtPc) }),
          ind('Trabalho programado', fmtPc(k.programado), `Categoria programada ÷ (programada + não programada), nas fechadas (${nf.format(k.nProgP)} de ${nf.format(k.nProgP + k.nProgN)})`,
            { comp: compara(k.programado, a.programado, 'mais', fmtPc) }),
          ind('Cobertura de mão de obra', fmtPc(k.cobertura), `abertas com alguém da equipe ou terceiro na STL (${nf.format(k.nComExec)} de ${nf.format(k.carteira)})`,
            { fazer: () => aplicar(() => so('exec', 'g:S'), 'carteira') }),
          ind('Horas apontadas', nh.format(k.horas) + ' h', k.horasPorOS == null ? 'nenhuma fechada no período com apontamento' : `nas fechadas no período · ${nh.format(k.horasPorOS)} h por OS com apontamento`,
            { comp: compara(k.horas, a.horas, null, (v) => nh.format(v) + ' h') }),
          ind('Abertas depois do serviço', fmtPc(k.abertasDepois), `das fechadas no período, OS aberta no Protheus depois do fim da manutenção (${nf.format(k.nDepois)})`,
            { comp: compara(k.abertasDepois, a.abertasDepois, 'menos', fmtPc) }))),
      cartaoComp,
      cartaoGraf('c-ind-backlog', 'Evolução do backlog', `OS em aberto no fim de cada ${unidI} · tracejado: a tendência`, 'c12'),
      cartaoGraf('c-ind-ne', 'Novas e encerradas', `Em cada ${unidI}: a entrada pela abertura e a saída pelo fim · embaixo, o saldo`, 'c12', [['Novas OS', 'var(--nova)'], ['Encerradas', COR.F]]),
      cartaoGraf('c-ind-saldo', 'Saldo da carteira', `Novas − encerradas em cada ${unidI}`, 'c6', [['Cresceu (entrou mais do que saiu)', COR.alerta], ['Diminuiu (saiu mais do que entrou)', COR.F]]),
      cartaoGraf('c-ind-taxa', 'Encerradas ÷ novas', `Em cada ${unidI} · acima de 100% a carteira diminui`, 'c6'),
      cartaoGraf('c-tempo', 'Tempo para fechar', `Mediana de dias até fechar, em cada ${unidI}`, 'c6'),
      cartaoGraf('c-ader', 'Aderência à programação', `% das programadas encerradas até o domingo da semana delas, em cada ${unidI}`, 'c6'),
      cartaoGraf('c-tipo', 'Corretiva e preventiva', 'Encerradas no período', 'c6'),
      cartaoGraf('c-sit', 'Situação das abertas', 'Abertas hoje', 'c6')));
    $('#c-ind-backlog .acoes').prepend(el('div', { class: 'ctl' }, segSerie(selI)));
    const serieI = serieCarteira(R.todas, selI, escI);
    linhaTempo($('#g-ind-backlog'), { linhas: serieI, k: 'final', titulo: 'Evolução do backlog', nomes: (l) => [l.curto, l.variacaoPct == null || !l.variacao ? '0' : sinalPc(l.variacaoPct)],
      subCor: corVar, marcado: (l) => toca(l, selI), aoClicar: (l) => irPeriodo(l), dica: dicaMov, tendencia: true });
    colunasNE($('#g-ind-ne'), serieI, selI, 'Novas e encerradas');
    colunasSaldo($('#g-ind-saldo'), { linhas: serieI, titulo: 'Saldo da carteira', nomes: (l) => [l.curto, ''], marcado: (l) => toca(l, selI), aoClicar: (l) => irPeriodo(l), dica: dicaMov });
    linhaTempo($('#g-ind-taxa'), { linhas: serieI.map((l) => ({ ...l, taxa: l.taxaEncerramento })), k: 'taxa', titulo: 'Encerradas ÷ novas', fmt: (v) => pc.format(v), area: false, passoMin: 40,
      nomes: (l) => [l.curto, ''], ref: { v: 1, rot: '100%' }, marcado: (l) => toca(l, selI), aoClicar: (l) => irPeriodo(l),
      dica: (l) => [['Encerradas ÷ novas', l.taxaEncerramento == null ? '—' : pc.format(l.taxaEncerramento)], ...dicaMov(l)] });
    const fe = R.fechadas, ab = R.abertas;
    rosca($('#g-tipo'), [{ nome: 'Preventiva', valor: fe.filter((o) => o.tipo === 'Preventiva').length, cor: COR.prog, v: 'Preventiva' },
      { nome: 'Corretiva', valor: fe.filter((o) => o.tipo !== 'Preventiva').length, cor: COR.nprog, v: 'Corretiva' }],
      { titulo: 'Corretiva e preventiva', sub: 'fechadas', aoClicar: (f) => aplicar(() => { so('tipo', f.v); so('sit', 'F'); }, 'carteira') });
    rosca($('#g-sit'), [{ nome: 'Liberadas para execução', valor: ab.filter((o) => o.sit === 'A').length, cor: COR.A, v: 'A' },
      { nome: 'Aguardando liberação', valor: ab.filter((o) => o.sit === 'P').length, cor: COR.P, v: 'P' }],
      { titulo: 'Situação das abertas', sub: 'abertas', aoClicar: (f) => aplicar(() => so('sit', f.v), 'carteira') });
    const pb = IND.porBalde(R.todas, serieI.map((l) => ({ chave: l.chave, de: l.de, ate: l.ate, rot: l.curto, nome: l.rot })), D.base)
      .map((x) => ({ ...x, med: x.tempo == null ? 0 : x.tempo, falta: x.programadas - x.cumpridas }));
    colunasEmPe($('#g-tempo'), { linhas: pb, partes: [{ k: 'med', nome: 'Mediana (dias)', cor: COR.A }], titulo: 'Tempo para fechar', H: 250, passoMin: 34, passoMax: 80, bwMax: 30,
      nomes: (l) => ({ fortes: [l.rot], fracos: [l.fechadas ? plural(l.fechadas, 'OS', 'OS') : '—'] }),
      dica: (l) => [['Mediana', l.tempo == null ? '—' : fmtDias(l.tempo), COR.A], ['Fechadas', nf.format(l.fechadas)]] });
    colunasEmPe($('#g-ader'), { linhas: pb, cem: true, partes: [{ k: 'cumpridas', nome: 'Fechadas até o domingo', cor: COR.F, texto: 'escuro' }, { k: 'falta', nome: 'Não fechadas a tempo', cor: COR.ctx, texto: 'tema' }],
      titulo: 'Aderência à programação', H: 250, passoMin: 34, passoMax: 80, bwMax: 30,
      nomes: (l) => ({ fortes: [l.rot], fracos: [l.programadas ? fmtPc(l.aderencia) : '—'] }),
      dica: (l) => [['Programadas', nf.format(l.programadas)], ['Fechadas até o domingo', `${nf.format(l.cumpridas)} · ${fmtPc(l.aderencia)}`, COR.F], ['Não fechadas a tempo', nf.format(l.falta), COR.ctx]] });
    for (const c of raiz.querySelectorAll('.cartao[data-imagem]')) prepararImagem(c);
  }
  /** Um cartão de gráfico com título, nota e o lugar do desenho (id `g-…` a partir do `c-…`). */
  const cartaoGraf = (id, tit, nota, larg, leg = null) => el('article', { class: 'cartao ' + larg, id, 'data-imagem': true },
    el('div', { class: 'cab' }, el('div', {}, el('h2', { text: tit }), el('p', { class: 'nota', text: nota })), el('div', { class: 'acoes' })),
    leg ? el('div', { class: 'legenda' }, ...leg.map(([nome, cor]) => el('span', {}, cor ? el('i', { style: 'background:' + cor }) : null, nome))) : null,
    el('div', { class: 'graf rolar-x', id: id.replace(/^c-/, 'g-') }));

  /** Abre a Programação no período, já na lista das programadas. */
  function verProgramadas(esc, ref) {
    const q = periodoDe(esc, ref);
    porPeriodo(q.de, q.ate);
    (V.cart.prog || (V.cart.prog = { lim: 100 })).g = 'prog';
    V.rolar = 'pg-lista';
    irPara('programacao');
  }

  // ── Programação: as OS programadas para o dia, a semana ou o mês, e quantas fecharam (04/11/2026) ──
  // A data programada é a previsão de início da manutenção na STJ (P. In. Man.), a mesma da mão de obra
  // prevista na STL. Fechada no período: finalizada até o último dia do período programado; fechada
  // depois: finalizada mais tarde; aberta: ainda não finalizada (não fechada, se o período já passou).
  const DIAS_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const DIAS_LONGO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  function periodoDe(esc, d) {
    const ms = t(d);
    if (esc === 'dia') { const w = new Date(ms).getUTCDay(); return { esc, chave: d, de: d, ate: d, rot: `${DIAS_LONGO[w]}, ${br(d)}`, curto: dm(d), sub: DIAS_SEM[w] }; }
    if (esc === 'semana') { const s = segundaDe(ms), de = iso(s), ate = iso(s + 6 * DIA); return { esc, chave: de, de, ate, rot: `Semana ${semanaISO(s)} · ${dm(de)} a ${dm(ate)}`, curto: 'S' + semanaISO(s), sub: dm(de) }; }
    const a = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)), de = `${a}-${String(m).padStart(2, '0')}-01`;
    return { esc, chave: de, de, ate: iso(Date.UTC(a, m, 0)), rot: MESES[m - 1] + ' de ' + a, curto: MES[m - 1] + '/' + String(a).slice(2), sub: '' };
  }
  function andar(esc, d, n) {
    if (esc === 'dia') return iso(t(d) + n * DIA);
    if (esc === 'semana') return iso(segundaDe(t(d)) + n * 7 * DIA);
    const a = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)) - 1 + n;
    return iso(Date.UTC(a + Math.floor(m / 12), ((m % 12) + 12) % 12, 1));
  }
  /** As contas de um período: as programadas e o que foi delas, e todas as finalizadas nele (as contas
   *  estão em js/os/indicadores.js, com teste). `fechAte`: até quando a fechada conta "no período" (a
   *  semana cortada pelo mês conta até o domingo dela). */
  const contaProg = (lista, p) => ({ ...p, ...IND.progFin(lista, p) });
  // programada (11/11/2026): com a data no período e com executante (IND.contaComoProgramada)
  const doPeriodo = (lista, p) => lista.filter((o) => o.progEm && o.progEm >= p.de && o.progEm <= p.ate && IND.contaComoProgramada(o));
  // programadas × finalizadas (10/11/2026): em cada período, à esquerda as programadas para ele (fechadas
  // no período, fechadas depois, abertas) e à direita todas as finalizadas nele (da programação e extra programação)
  const COR_DEPOIS = 'var(--fech-depois)';
  // (10/11/2026, de uma olhada) as programadas numa cor só; as finalizadas divididas entre as da programação
  // e as extra programação — a OS finalizada no período sem estar programada para ele
  const PF_ESQ = [{ k: 'n', cor: COR.prog, nome: 'Programadas' }];
  const PF_DIR = [{ k: 'finProg', cor: COR.F, nome: 'Encerradas da programação', tinta: '#1f2937' }, { k: 'finFora', cor: COR.nprog, nome: 'Extra programação', tinta: '#ffffff' }];
  const N_JANELA = { dia: 14, semana: 12, mes: 12 };
  const ESC_ROT = { dia: 'dia a dia', semana: 'semana a semana', mes: 'mês a mês' };
  const pctDe = (a, n) => (n ? pc.format(a / n) : '—');
  const dicaProg = (l) => [['Programadas', nf.format(l.n), COR.prog], ['· encerradas no período', `${nf.format(l.prazo)} · ${pctDe(l.prazo, l.n)}`],
    ['· encerradas depois', nf.format(l.depois)], [l.ate < D.base ? '· não encerradas' : '· ainda abertas', nf.format(l.ab)],
    ['Encerradas no período', nf.format(l.fin)], ['· da programação', nf.format(l.finProg), COR.F], ['· extra programação', nf.format(l.finFora), COR.nprog],
    ...(l.semExec ? [['Com data, sem executante (não contam)', nf.format(l.semExec), COR.alerta]] : [])];
  const itensPF = () => {
    const item = (nome, cor) => el('span', {}, el('i', { style: 'background:' + cor }), nome);
    return [item('Programadas', COR.prog), item('Encerradas da programação', COR.F), item('Extra programação', COR.nprog)];
  };
  const legendaPF = () => el('div', { class: 'legenda' }, ...itensPF());
  const grafProgFin = (caixa, linhas, { titulo, rotulo, marcado = null, aoClicar }) => colunasPar(caixa, { linhas, titulo, H: 290, passoMin: 58, passoMax: 104, bwMax: 26,
    esq: PF_ESQ, dir: PF_DIR, rotulo, marcado, aoClicar, dica: dicaProg, quem: ['período', 'períodos'] });

  // Todas / Com executante / Sem executante: vale só na aba (não liga o filtro Executante da barra)
  const QUAIS = { todas: ['Todas', () => true], com: ['Com executante', (o) => o.grupo !== 'S'], sem: ['Sem executante', (o) => o.grupo === 'S'] };
  const daQuais = (est) => (QUAIS[est.quais] || QUAIS.todas)[1];
  const segQuaisDe = (est) => el('div', { class: 'seg', role: 'group', 'aria-label': 'Quais OS' }, ...Object.entries(QUAIS).map(([kk, [rot]]) =>
    el('button', { type: 'button', 'aria-pressed': String((est.quais || 'todas') === kk), text: rot, on: { click: () => { est.quais = kk; zerarPaginas(); desenhar(); } } })));

  // (11/11/2026) dentro do período: os dias (até 14), as semanas (até 120 dias) ou os meses — cortados nele
  function partesDoPeriodo(sel) {
    const dias = Math.round((t(sel.ate) - t(sel.de)) / DIA) + 1;
    if (dias <= 1) return null;
    const subs = [];
    if (dias <= 14) {
      for (let i = 0; i < dias; i++) subs.push(periodoDe('dia', iso(t(sel.de) + i * DIA)));
      return { esc: 'dia', tit: sel.unidade === 'semana' ? 'Dia a dia da semana' : 'Dia a dia do período', subs };
    }
    const esc = dias <= 120 ? 'semana' : 'mes';
    for (let d = sel.de; d <= sel.ate && subs.length < 36; d = andar(esc, d, 1)) {
      const w = periodoDe(esc, d), de = w.de < sel.de ? sel.de : w.de, ate = w.ate > sel.ate ? sel.ate : w.ate;
      subs.push({ ...w, de, ate, fechAte: w.ate, sub: `${dm(de)} a ${dm(ate)}` });
    }
    return { esc, tit: esc === 'semana' ? (sel.unidade === 'mes' ? 'Semana a semana do mês' : 'Semana a semana do período') : 'Mês a mês do período', subs };
  }

  // ── Programação (11/11/2026): sobre o período da barra, três contas que não se misturam:
  //   programada — a data programada (P. In. Man.) cai no período;
  //   executada  — serviço feito: encerrada no Protheus, ou aberta com o fim real da manutenção (R. Fim Man.);
  //   encerrada  — Término = Sim no Protheus (no período: até o último dia dele).
  // A OS encerrada no período sem estar programada para ele é extra programação: nunca conta como programada.
  // Embaixo, o movimento da carteira no período (abertura e fim) — a mesma conta do Avanço.
  function desenharProg() {
    const raiz = $('#programacao');
    const pg = V.pg;
    const todas = semSituacao().todas.filter(daQuais(pg));
    const sel = periodoSel(), passou = sel.ate < D.base;
    const x = contaProg(todas, sel);
    const mv = IND.movimento(todas, { de: sel.de, ate: sel.ate, base: D.base });
    // para comparar: as programadas do período anterior inteiro; o movimento, nos mesmos dias
    const pp = periodoAndado(-1), xA = contaProg(todas, { de: pp.desde, ate: pp.ate });
    const pa = IND.anterior({ desde: sel.de, ate: sel.ate, base: D.base, unidade: sel.unidade });
    const mvA = IND.movimento(todas, { de: pa.desde, ate: pa.ate, base: D.base });
    const rotPP = `${dm(pp.desde)} a ${dm(pp.ate)}`, rotPA = `${dm(pa.desde)} a ${dm(pa.ate)}`;
    const temFimReal = D.os.some((a) => a.length > 22);
    const pct = (v) => pctDe(v, x.n), nf0 = (v) => nf.format(v);
    const progs = doPeriodo(todas, sel);
    const execP = (o) => o.sit === 'F' || !!o.fimReal;
    const pend = progs.filter((o) => !execP(o)), nA = pend.filter((o) => o.sit === 'A').length, nP = pend.length - nA;
    const fech = x.prazo + x.depois;
    const conclusao = x.n ? fech / x.n : null, conclusaoA = xA.n ? (xA.prazo + xA.depois) / xA.n : null;
    const irLista = (g) => { (V.cart.prog || (V.cart.prog = { lim: 100 })).g = g; V.rolar = 'pg-lista'; desenhar(); };
    const rotPend = passou ? 'Não executadas' : 'Pendentes de execução';
    const kProg = el('div', { class: 'kpis mini pg-kpis' },
      kpiCom('Programadas', nf.format(x.n), 'com a data no período e executante' + (x.semExec ? ` · ${nf.format(x.semExec)} sem executante não contam` : ''), COR.prog,
        { fazer: () => irLista('prog'), comp: comparacao(x.n, xA.n, null, nf0, rotPP) }),
      kpiCom('Executadas', nf.format(x.exec), temFimReal ? `${pct(x.exec)} das programadas · ${nf.format(x.execAbertas)} sem encerrar no Protheus`
        : `${pct(x.exec)} das programadas · pelo encerramento no Protheus`, null, { fazer: () => irLista('exec') }),
      kpiCom('Encerradas', nf.format(fech), `${pct(fech)} das programadas` + (x.depois ? ` · ${nf.format(x.depois)} depois do período` : ''), COR.F,
        { cls: x.n && fech / x.n >= 0.8 ? 'bom' : '', fazer: () => irLista('fech') }),
      kpiCom(rotPend, nf.format(pend.length), `${plural(nA, 'liberada', 'liberadas')} · ${nf.format(nP)} aguardando liberação`, passou && pend.length ? COR.alerta : COR.A,
        { cls: passou && pend.length ? 'ruim' : '', fazer: () => irLista('pend') }),
      kpiCom('Conclusão', conclusao == null ? '—' : pc.format(conclusao), x.n ? `encerradas ÷ programadas · no período ${pct(x.prazo)}` : 'nada programado no período', null,
        { comp: comparacao(conclusao, conclusaoA, 'mais', (v) => pc.format(v), rotPP) }));
    const kMov = el('div', { class: 'kpis mini pg-kpis pg-mov' },
      kpiCom('Abertas no período', mais(mv.entradas), 'OS novas, pela data de abertura', 'var(--nova)',
        { fazer: () => irLista('novas'), comp: comparacao(mv.entradas, mvA.entradas, null, nf0, rotPA) }),
      kpiCom('Encerradas no período', menos(x.fin), `${nf.format(x.finProg)} da programação · ${nf.format(x.finFora)} extra programação`, COR.F,
        { fazer: () => irLista('fin'), comp: comparacao(x.fin, mvA.saidas, 'mais', nf0, rotPA) }),
      kpiCom('Antigas encerradas', nf.format(mv.saidasAntigas), `em aberto em ${dm(mv.vespera)}, encerradas no período`, COR.A, { fazer: () => irLista('antigas') }),
      kpiCom('Extra programação', nf.format(x.finFora), 'encerradas no período sem estar programadas para ele', COR.nprog, { fazer: () => irLista('extra') }));
    // o avanço das programadas numa barra só: encerradas, executadas sem encerrar e pendentes
    const partesAv = [['Encerradas no período', x.prazo, COR.F, 'fech', '#ffffff'], ['Encerradas depois do período', x.depois, COR_DEPOIS, 'fech', '#1f2937'],
      ['Executadas, sem encerrar', x.execAbertas, COR.ctx, 'execAb', '#1f2937'],
      [`${passou ? 'Não executadas' : 'Pendentes'}: liberadas`, nA, COR.A, 'abA', '#ffffff'], [`${passou ? 'Não executadas' : 'Pendentes'}: aguardando liberação`, nP, COR.P, 'abP', '#1f2937']];
    const avanco = x.n ? el('div', { class: 'pg-avanco' },
      el('p', { class: 'pg-avanco-tit' }, el('b', { text: `Das ${plural(x.n, 'programada', 'programadas')}: ${nf.format(x.exec)} executadas (${pct(x.exec)}) e ${nf.format(fech)} encerradas (${pct(fech)})` })),
      el('div', { class: 'pg-avanco-barra' }, ...partesAv.filter((q) => q[1]).map(([rot, v, cor, g, tinta]) =>
        el('button', { type: 'button', class: 'pg-parte', style: `flex:${v} 1 0;background:${cor};color:${tinta}`, title: `${rot}: ${nf.format(v)} — ver na lista`,
          'aria-label': `${rot}: ${nf.format(v)}`, on: { click: () => irLista(g) } }, v / x.n >= 0.06 ? nf.format(v) : ''))),
      el('div', { class: 'legenda' }, ...partesAv.filter((q) => q[1] || q[3] !== 'execAb').map(([rot, v, cor]) => el('span', {}, el('i', { style: 'background:' + cor }), el('span', { text: `${rot}: ` }), el('b', { text: nf.format(v) })))),
      !fech && !passou ? el('p', { class: 'nota', text: 'Nenhuma encerrou ainda: encerrada é a OS com Término = Sim no Protheus.' }) : null) : null;
    // as com data no período e sem ninguém na STL: não contam como programadas, mas não somem
    const semExecNota = x.semExec ? el('p', { class: 'nota pg-semexec' }, `${plural(x.semExec, 'OS tem', 'OS têm')} a data programada no período e ninguém na STL (nem da equipe, nem terceiro): ` +
      `${x.semExec === 1 ? 'não conta como programada' : 'não contam como programadas'}. `, el('button', { type: 'button', class: 'concil-ver', text: 'Ver quais', on: { click: () => irLista('semExec') } })) : null;
    const limite = el('details', { class: 'regra-mais pg-regras' }, el('summary', { text: 'Como é contado' }), el('ul', { class: 'pg-limite' },
      el('li', { text: 'Programada: a data programada (P. In. Man.) cai no período e há quem execute — alguém da equipe ou terceiro na STL. Sem executante, a OS não conta como programada. A OS encerrada no período sem estar programada nele é extra programação.' }),
      el('li', { text: temFimReal ? 'Executada: encerrada no Protheus, ou aberta com o fim real da manutenção (R. Fim Man.) lançado.'
        : 'Executada: por ora, só a encerrada no Protheus. O fim real da manutenção das OS abertas (R. Fim Man.) passa a contar a partir da próxima atualização.' }),
      el('li', { text: 'Abertas e encerradas no período: pela data de abertura e pela data de fim — a mesma conta do Avanço.' })));
    const topo = el('article', { class: 'cartao c12', id: 'pg-topo', 'data-imagem': true },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Programação' }),
        el('p', { class: 'nota', text: `${sel.rot} · comparado com ${rotPP}`, title: 'A data programada é a previsão de início da manutenção no Protheus; quando ninguém a mudou, é o próprio dia da abertura.' })),
        el('div', { class: 'acoes' }, el('div', { class: 'ctl' }, segQuaisDe(pg)))),
      el('b', { class: 'pg-rot', text: sel.rot }),
      el('div', { class: 'kpi-grupo' }, el('h3', { class: 'kpis-tit', text: 'As programadas para o período' }), kProg), avanco, semExecNota,
      el('div', { class: 'kpi-grupo' }, el('h3', { class: 'kpis-tit', text: 'A carteira no período · pela abertura e pelo fim' }), kMov), limite);
    // a série: as programadas e as encerradas de cada período até o escolhido, e os 2 seguintes (já programados)
    const esc = escSerie(sel);
    const janela = janelaDe(sel, esc, 2).map((b) => contaProg(todas, b));
    const gSeq = el('div', { class: 'graf rolar-x' });
    const seq = el('article', { class: 'cartao c12', id: 'pg-seq', 'data-imagem': true },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Programadas e encerradas · ' + ESC_ROT[esc] }),
        el('p', { class: 'nota', text: 'À esquerda as programadas; à direita as encerradas no período (da programação e extra programação) · embaixo, % das programadas encerradas no período' })),
        el('div', { class: 'acoes' }, el('div', { class: 'ctl' }, segSerie(sel)))),
      legendaPF(), gSeq);
    // dentro do período: os dias, as semanas ou os meses
    const dp = partesDoPeriodo(sel);
    let det = null, gDet = null, subs = [];
    if (dp) {
      subs = dp.subs.map((q) => contaProg(todas, q));
      gDet = el('div', { class: 'graf rolar-x' });
      det = el('article', { class: 'cartao c12', 'data-imagem': true },
        el('div', { class: 'cab' }, el('div', {}, el('h2', { text: dp.tit }), el('p', { class: 'nota', text: sel.rot })), el('div', { class: 'acoes' })),
        legendaPF(), gDet);
    }
    // quem e onde: por executante ou por frota, no período
    const por = pg.por || 'exec';
    const segPor = el('div', { class: 'seg', role: 'group', 'aria-label': 'Agrupar por' }, ...[['exec', 'Executante'], ['frota', 'Frota']].map(([kk, rot]) =>
      el('button', { type: 'button', 'aria-pressed': String(por === kk), text: rot, on: { click: () => { pg.por = kk; desenhar(); } } })));
    const tPor = el('div', { class: 'bt-rolagem' });
    const quem = el('article', { class: 'cartao c12', 'data-imagem': true },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Por ' + (por === 'exec' ? 'executante' : 'frota') + ' · ' + sel.rot })), el('div', { class: 'acoes' }, el('div', { class: 'ctl' }, segPor))),
      tPor);
    const lista = el('article', { class: 'cartao c12', id: 'pg-lista' });
    raiz.replaceChildren(el('div', { class: 'grade' }, topo, lista, seq, det, quem));
    const rotPct = (l) => (l.de > D.base ? 'a vir' : pctDe(l.prazo, l.n));
    grafProgFin(gSeq, janela, { titulo: 'Programadas e encerradas', rotulo: (l) => [l.curto, rotPct(l)], marcado: (l) => toca(l, sel), aoClicar: (l) => irPeriodo(l) });
    if (det) grafProgFin(gDet, subs, { titulo: dp.tit, rotulo: (l) => (dp.esc === 'dia' ? [`${l.sub} ${l.curto}`, rotPct(l)] : [l.curto, rotPct(l)]), aoClicar: (l) => irPeriodo(l) });
    // a tabela por executante ou frota
    const m = new Map();
    const linhaDe = (c) => { if (!m.has(c)) m.set(c, { chave: c, nome: c, prazo: 0, depois: 0, execAb: 0, pend: 0, fin: 0 }); return m.get(c); };
    const chavesDe = (o) => (por === 'frota' ? [o.frota] : o.pessoas.length ? o.pessoas.map((q) => q.nome) : [GRUPO[o.grupo]]);
    for (const o of progs) for (const c of chavesDe(o)) { const y = linhaDe(c); if (o.sit === 'F') { if (o.fim <= sel.ate) y.prazo++; else y.depois++; } else if (o.fimReal) y.execAb++; else y.pend++; }
    const emProg = (o) => !!o.progEm && o.progEm >= sel.de && o.progEm <= sel.ate && IND.contaComoProgramada(o);
    const semExecP = (o) => !!o.progEm && o.progEm >= sel.de && o.progEm <= sel.ate && !IND.contaComoProgramada(o);
    const finP = (o) => { const sd = IND.saidaDe(o); return !!sd && sd >= sel.de && sd <= sel.ate; };
    const novaP = (o) => !!o.abertura && o.abertura >= sel.de && o.abertura <= sel.ate;
    for (const o of todas) if (finP(o)) for (const c of chavesDe(o)) linhaDe(c).fin++;
    const grupoDe = { [GRUPO.S]: 'g:S', [GRUPO.T]: 'g:T' };
    tabelaNums(tPor, { id: 'prog-' + por, linhas: [...m.values()], totalRot: 'Programadas', padrao: { k: '_tot', dir: 'desc' },
      nome: { rot: por === 'exec' ? 'Executante' : 'Frota', ver: (l) => [l.nome, por === 'frota' ? eqDe.get(l.chave) || '' : grupoDe[l.chave] ? 'ninguém da equipe na STL' : ''] },
      partes: [{ k: 'prazo' }, { k: 'depois' }, { k: 'execAb' }, { k: 'pend' }],
      cols: [{ k: 'prazo', rot: 'Encerradas no período' }, { k: 'depois', rot: 'Encerradas depois' }, ...(temFimReal ? [{ k: 'execAb', rot: 'Executadas sem encerrar' }] : []),
        { k: 'pend', rot: passou ? 'Não executadas' : 'Pendentes', ruim: passou },
        { k: 'ader', rot: '% no período', val: (l) => { const n = l.prazo + l.depois + l.execAb + l.pend; return n ? l.prazo / n : null; }, fmt: (v) => (v == null ? '—' : pc.format(v)) },
        { k: 'fin', rot: 'Todas as encerradas no período' }],
      vazioTxt: 'Nada programado para este período com estes filtros.',
      aoClicar: (l) => aplicar(() => (por === 'frota' ? so('frota', l.chave) : so('exec', grupoDe[l.chave] || l.chave))) });
    // a lista das OS do período: as programadas, as abertas e as encerradas nele, com os botões desta lista
    const BL_PROG = 'Programadas para o período', BL_PER = 'Abertas e encerradas no período';
    carteira(lista, null, todas.filter((o) => emProg(o) || semExecP(o) || finP(o) || novaP(o)), { chave: 'prog', titulo: 'As OS · ' + sel.rot,
      nota: 'A situação de hoje no Protheus · os botões escolhem o grupo', grupos: [
        { k: 'prog', rot: 'Programadas', cor: COR.prog, casa: emProg, bloco: BL_PROG },
        { k: 'pend', rot: passou ? 'Não executadas' : 'Pendentes', casa: (o) => emProg(o) && !execP(o), bloco: BL_PROG },
        { k: 'fech', rot: 'Encerradas', cor: COR.F, casa: (o) => emProg(o) && o.sit === 'F', bloco: BL_PROG },
        { k: 'semExec', rot: 'Sem executante', cor: COR.alerta, casa: semExecP, bloco: BL_PROG, dica: 'Com a data no período e ninguém na STL: não contam como programadas' },
        { k: 'novas', rot: 'Abertas', cor: 'var(--nova)', casa: novaP, bloco: BL_PER, dica: 'Abertas no Protheus dentro do período' },
        { k: 'fin', rot: 'Encerradas', cor: 'var(--fraco)', casa: finP, bloco: BL_PER, dica: 'Encerradas no Protheus dentro do período, programadas ou não' },
        // o detalhe: aparece só quando um número (ou um pedaço da barra) o abre
        { k: 'exec', rot: 'Executadas', casa: (o) => emProg(o) && execP(o), bloco: BL_PROG, sub: true },
        ...(temFimReal ? [{ k: 'execAb', rot: 'Executadas sem encerrar', cor: COR.ctx, casa: (o) => emProg(o) && o.sit !== 'F' && !!o.fimReal, bloco: BL_PROG, sub: true }] : []),
        { k: 'abA', rot: 'Pendentes liberadas', cor: COR.A, casa: (o) => emProg(o) && !execP(o) && o.sit === 'A', bloco: BL_PROG, sub: true },
        { k: 'abP', rot: 'Pendentes aguardando liberação', cor: COR.P, casa: (o) => emProg(o) && !execP(o) && o.sit === 'P', bloco: BL_PROG, sub: true },
        { k: 'antigas', rot: 'Antigas encerradas', casa: (o) => finP(o) && o.abertura < sel.de, bloco: BL_PER, sub: true },
        { k: 'extra', rot: 'Extra programação', cor: COR.nprog, casa: (o) => finP(o) && !emProg(o), bloco: BL_PER, sub: true }] });
    // veio de um número: a lista vem para a vista
    if (V.rolar === 'pg-lista') { V.rolar = ''; requestAnimationFrame(() => lista.scrollIntoView({ block: 'start', behavior: 'smooth' })); }
  }

  // ── Avanço: o que cada um tinha para fechar no começo do período, quanto fechou e com quanto ficou (06/11/2026) ──
  // Pedido do Mateus: "o Luiz Paulo tava com 21 para fechar e 5 fechadas" — e no dia seguinte, com 14. Aqui
  // isso se vê por dia, semana ou mês, para a equipe, para cada pessoa ou cada frota. Conta pelas datas do
  // Protheus (abertura e fim da manutenção) e pela mão de obra de hoje na STL:
  //   tinha  — aberta antes do período e ainda não finalizada na véspera dele;
  //   fechou — das que tinha, finalizada até o fim do período (ou até hoje, no período de agora);
  //   entrou — aberta dentro do período (as que já fecharam e as que seguem abertas);
  //   no fim — as que tinha e não fechou, mais as que entraram e seguem abertas.
  // O fim lançado com a data do serviço (às vezes dias depois) entra no dia do serviço.
  // (11/11/2026) as mesmas regras da conta do período (IND.movimento): a saída pelo fim, nunca antes da
  // abertura (a OS lançada depois do serviço sai no dia em que entrou); encerrada sem fim fica de fora.
  const avancoDe = (o, de, ate) => {
    if (!o.abertura || o.abertura > ate || (o.sit === 'F' && !o.fim)) return null;
    const sd = IND.saidaDe(o), saiu = !!sd && sd >= de && sd <= ate;
    if (o.abertura < de) {
      if (!IND.emAberto(o, IND.diaAntes(de))) return null;     // já estava encerrada antes do período
      return saiu ? 'fechou' : 'ainda';
    }
    return saiu ? 'entrouFechou' : 'entrouAberta';
  };
  const somaAvanco = (y) => Object.assign(y, { tinha: y.fechou + y.ainda, entrou: y.entrouFechou + y.entrouAberta,
    fim: y.ainda + y.entrouAberta, pct: y.fechou + y.ainda ? y.fechou / (y.fechou + y.ainda) : null });
  function contaAvanco(lista, p) {
    const ate = p.ate < D.base ? p.ate : D.base;
    const x = { ...p, ateReal: ate, fechou: 0, ainda: 0, entrouFechou: 0, entrouAberta: 0 };
    for (const o of lista) { const k = avancoDe(o, p.de, ate); if (k) x[k]++; }
    return somaAvanco(x);
  }
  const LIG_NOME = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  /** O nome curto de cada pessoa, embaixo da coluna: as duas primeiras palavras, e mais uma enquanto dois ficarem iguais. */
  function curtos(nomes) {
    const pal = (n) => n.split(' ').filter((w) => !LIG_NOME.has(w.toLowerCase()));
    const c = new Map(nomes.map((n) => [n, pal(n).slice(0, 2).join(' ')]));
    for (let k = 3; k <= 6; k++) {
      const conta = d3.rollup([...c.values()], (v) => v.length, (x) => x);
      const iguais = nomes.filter((n) => conta.get(c.get(n)) > 1);
      if (!iguais.length) break;
      for (const n of iguais) c.set(n, pal(n).slice(0, k).join(' '));
    }
    return c;
  }
  // a lista do Avanço: cada grupo pelo que aconteceu à OS no período (avancoDe)
  const LISTAS_AV = [['tinha', 'Backlog inicial'], ['entrou', 'Novas OS'], ['saiu', 'Encerradas'], ['fim', 'Backlog final']];
  const NA_LISTA = { tinha: ['fechou', 'ainda'], entrou: ['entrouFechou', 'entrouAberta'], saiu: ['fechou', 'entrouFechou'], fim: ['ainda', 'entrouAberta'],
    fechou: ['fechou'], entrouFechou: ['entrouFechou'] };
  const TIT_LISTA = { tinha: 'As OS do backlog inicial', entrou: 'As novas OS (abertas no período)', saiu: 'As OS encerradas no período', fim: 'As OS do backlog final',
    fechou: 'As encerradas do backlog inicial', entrouFechou: 'As abertas e encerradas no próprio período' };

  // ── o período escolhido, como o Avanço e a Programação usam (11/11/2026) ──
  /** O período da barra: de, até, o rótulo e a unidade (dia, semana, mês ou ""). */
  function periodoSel() {
    const p = periodo();
    return { de: p.desde, ate: p.ate, rot: p.k === 'livre' || p.k === 'tudo' ? p.rot : `${p.rot} · ${curtoPer(p)}`, k: p.k, unidade: unidadeDe(p.desde, p.ate) };
  }
  /** A série (as colunas no tempo): por dia, semana ou mês — escolhida, ou pelo tamanho do período. */
  const escAuto = (sel) => (sel.unidade === 'dia' ? 'dia' : sel.unidade === 'mes' || (t(sel.ate) - t(sel.de)) / DIA > 120 ? 'mes' : 'semana');
  const escSerie = (sel) => V.serie || escAuto(sel);
  /** Os períodos da série até o do fim do período escolhido; `futuros`: quantos depois dele (já programados). */
  function janelaDe(sel, esc, futuros = 0) {
    const fimRef = sel.ate < D.base ? sel.ate : D.base, N = N_JANELA[esc];
    return Array.from({ length: N + futuros }, (_, i) => periodoDe(esc, andar(esc, fimRef, i - N + 1)));
  }
  const toca = (b, sel) => b.de <= sel.ate && b.ate >= sel.de;
  /** O período da barra passa a ser de `de` a `ate`: um dos prontos, se for igual a ele (a semana atual, o mês...). */
  function porPeriodo(de, ate) {
    const pr = PERIODOS.find((q) => q.desde === de && q.ate === ate);
    F.periodo = pr ? pr.k : 'livre';
    F.per = pr ? null : { desde: de, ate };
  }
  const irPeriodo = (b) => aplicar(() => porPeriodo(b.de, b.ate));
  const segSerie = (sel) => el('div', { class: 'seg', role: 'group', 'aria-label': 'A série por' }, ...[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']].map(([kk, rot]) =>
    el('button', { type: 'button', 'aria-pressed': String(escSerie(sel) === kk), text: rot, on: { click: () => { V.serie = kk; desenhar(); } } })));
  /** A comparação com o período anterior: a seta, "melhor" ou "pior" escrito (a cor nunca sozinha) e o número de antes. */
  function comparacao(agora, antes, melhor, fmt = (v) => nf.format(v), rotAnt = 'o período anterior') {
    if (agora == null || antes == null) return el('span', { class: 'comp', text: 'sem o período anterior para comparar' });
    const d = agora - antes;
    if (Math.abs(d) < 1e-9) return el('span', { class: 'comp', text: `igual ao anterior (${fmt(antes)})`, title: rotAnt });
    const bom = melhor === 'mais' ? d > 0 : melhor === 'menos' ? d < 0 : null;
    return el('span', { class: 'comp' + (bom === true ? ' bom' : bom === false ? ' ruim' : ''), title: 'Período anterior: ' + rotAnt },
      el('b', { text: (d > 0 ? '▲ ' : '▼ ') + (bom === true ? 'melhor' : bom === false ? 'pior' : d > 0 ? 'subiu' : 'desceu') }), ` · antes ${fmt(antes)}`);
  }
  const sinal = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + nf.format(Math.abs(v));
  const mais = (v) => (v ? '+' : '') + nf.format(v), menos = (v) => (v ? '−' : '') + nf.format(v);
  const sinalPc = (v) => (v == null ? '' : (v > 0 ? '+' : v < 0 ? '−' : '') + pc.format(Math.abs(v)));
  /** Um número do alto: o nome, o valor, a linha de baixo e, se houver, a comparação. */
  const kpiCom = (rot, val, pe, cor, { cls = '', fazer = null, comp = null } = {}) => el(fazer ? 'button' : 'div', { class: 'kpi', type: fazer ? 'button' : null, on: fazer ? { click: fazer } : {} },
    el('span', { class: 'rot' }, cor ? el('i', { class: 'ponto', style: 'background:' + cor }) : null, rot), el('span', { class: 'val ' + cls, text: val }), el('span', { class: 'pe', text: pe }), comp);

  /** A conferência do backlog de um período: a conta, linha por linha, e se ela fecha (11/11/2026). */
  function cartaoConferencia(mv, sel) {
    const lin = (rot, v, cls = '') => el('tr', { class: cls }, el('th', { scope: 'row', text: rot }), el('td', { text: v }));
    const fecha = mv.diferenca === 0;
    const canc = Array.isArray(D.canceladas) ? D.canceladas.length : null;
    const notas = [
      mv.lancadasDepois ? `${plural(mv.lancadasDepois, 'das encerradas foi lançada', 'das encerradas foram lançadas')} no Protheus depois do serviço (o fim antes da abertura): entra e sai no dia da abertura.` : '',
      canc === null ? 'As canceladas no Protheus ficam fora da carteira (não entram nem saem). O painel passa a contá-las a partir da próxima atualização.'
        : `${plural(canc, 'OS cancelada', 'OS canceladas')} no Protheus ${canc === 1 ? 'fica' : 'ficam'} fora da carteira: não entram nem saem.`,
      mv.semAbertura ? `${plural(mv.semAbertura, 'OS sem data de abertura fica', 'OS sem data de abertura ficam')} fora da conta (veja a Auditoria).` : '',
      `Do Protheus de ${br(D.base)}: cada dia refeito pelas datas de abertura e de fim. O que mudou de uma atualização para outra está na aba Auditoria.`].filter(Boolean);
    return el('article', { class: 'cartao c6', id: 'av-conferencia', 'data-imagem': true },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Conferência do backlog' }), el('p', { class: 'nota', text: sel.rot })), el('div', { class: 'acoes' })),
      el('table', { class: 'concil' }, el('tbody', {},
        lin(`Backlog inicial (em aberto em ${dm(mv.vespera)})`, nf.format(mv.inicial)),
        lin('+ Novas OS abertas no período', mais(mv.entradas), 'mais'),
        lin('− Encerradas do backlog inicial', menos(mv.saidasAntigas), 'menos'),
        lin('− Encerradas que entraram no próprio período', menos(mv.saidasNovas), 'menos'),
        lin('= Backlog final calculado', nf.format(mv.esperado), 'soma'),
        lin(`Backlog final encontrado (em aberto em ${dm(mv.ate)})`, nf.format(mv.final), 'achado'))),
      el('p', { class: 'concil-res ' + (fecha ? 'bom' : 'ruim') }, fecha ? '✓ A conta fecha: diferença 0.'
        : `⚠ Divergência: esperado ${nf.format(mv.esperado)}, encontrado ${nf.format(mv.final)}, diferença ${sinal(mv.diferenca)}` +
          (mv.divergentes && mv.divergentes.length ? ` — nas OS ${mv.divergentes.slice(0, 8).map((o) => o.os || '?').join(', ')}${mv.divergentes.length > 8 ? '…' : ''}` : '') + '.'),
      el('ul', { class: 'concil-notas' }, ...notas.map((x) => el('li', { text: x }))));
  }

  /** Entradas e saídas do período na mesma escala: as novas OS, as encerradas (do backlog inicial e do próprio
   *  período) e o saldo — o que diz se a carteira andou ou só girou. */
  function entradasSaidas(caixa, mv, { titulo }) {
    const W = Math.max(caixa.clientWidth || 520, 290), rotW = W < 420 ? 82 : 108, valW = 64, linhaH = 62, topo = 8;
    const linhas = [
      { rot: 'Novas OS', partes: [{ v: mv.entradas, cor: 'var(--nova)', nome: 'Abertas no período' }], txt: mais(mv.entradas),
        sub: mv.entradas ? `${nf.format(mv.novasAbertas)} seguem abertas · ${nf.format(mv.saidasNovas)} já encerradas` : 'nenhuma OS aberta no período' },
      { rot: 'Encerradas', partes: [{ v: mv.saidasAntigas, cor: COR.F, nome: 'Do backlog inicial' }, { v: mv.saidasNovas, cor: COR_DEPOIS, nome: 'Abertas no próprio período' }],
        txt: (mv.saidas ? '−' : '') + nf.format(mv.saidas), sub: `${nf.format(mv.saidasAntigas)} do backlog inicial · ${nf.format(mv.saidasNovas)} abertas no período` },
      { rot: 'Saldo', partes: [{ v: Math.abs(mv.saldo), cor: mv.saldo > 0 ? COR.alerta : COR.F, nome: 'Saldo' }], txt: sinal(mv.saldo),
        sub: mv.saldo > 0 ? 'entrou mais do que saiu: a carteira cresceu' : mv.saldo < 0 ? 'saiu mais do que entrou: a carteira diminuiu' : 'entrou o mesmo que saiu: a carteira ficou igual' }];
    const H = topo + linhas.length * linhaH + 4, maior = Math.max(1, mv.entradas, mv.saidas, Math.abs(mv.saldo));
    const svg = d3.create('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', titulo);
    caixa.replaceChildren(svg.node());
    guardarDados(caixa, { titulo, cab: ['', 'OS'], linhas: [['Novas OS (abertas no período)', mv.entradas], ['Encerradas do backlog inicial', mv.saidasAntigas],
      ['Encerradas abertas no próprio período', mv.saidasNovas], ['Saldo (novas − encerradas)', mv.saldo]] });
    const sx = d3.scaleLinear([0, maior], [0, W - rotW - valW - 8]);
    linhas.forEach((l, i) => {
      const y = topo + i * linhaH, g = svg.append('g').attr('class', 'col');
      txt(g, 0, y + 15, l.rot, { cor: 'var(--texto)', peso: 700, tam: 13 });
      let x = rotW;
      for (const q of l.partes) { if (q.v) barra(g, x, y + 2, Math.max(3, sx(q.v)), 22, q.cor, false); x += q.v ? Math.max(3, sx(q.v)) + 2 : 0; }
      txt(g, x + 6, y + 18, l.txt, { cor: i === 2 ? (mv.saldo > 0 ? 'var(--alerta-t)' : mv.saldo < 0 ? 'var(--finalizada-t)' : 'var(--texto)') : 'var(--texto)', peso: 750, tam: 14 });
      txt(g, rotW, y + 42, l.sub, { cor: 'var(--fraco)', tam: 11.5 });
      g.on('mousemove', (ev) => mostrarDica(ev, l.rot, l.partes.map((q) => [q.nome, nf.format(q.v), q.cor]))).on('mouseleave', esconderDica);
    });
  }

  // ── a evolução (11/11/2026): a conta do período (IND.movimento) em cada período da série ──
  /** Os períodos da série até o escolhido, cada um com a conta da carteira (inicial, novas, encerradas, final…). */
  const serieCarteira = (todas, sel, esc) => janelaDe(sel, esc).map((b) => ({ ...IND.movimento(todas, { de: b.de, ate: b.ate, base: D.base }), ...b }));
  /** A reta dos mínimos quadrados pelos pontos (x, y): y = a + b·x. Com menos de 3 pontos, não há tendência. */
  function tendenciaDe(xs, ys) {
    if (xs.length < 3) return null;
    const mx = d3.mean(xs), my = d3.mean(ys), sxx = d3.sum(xs, (x) => (x - mx) ** 2);
    if (!sxx) return null;
    const b = d3.sum(xs, (x, i) => (x - mx) * (ys[i] - my)) / sxx;
    return { a: my - b * mx, b };
  }
  /** A tendência de uma série: só os períodos que já começaram. */
  const tendenciaSerie = (linhas, k) => {
    const xs = [], ys = [];
    linhas.forEach((l, i) => { if (l[k] != null && l.de <= D.base) { xs.push(i); ys.push(l[k]); } });
    const r = tendenciaDe(xs, ys);
    return r ? { ...r, x0: xs[0], x1: xs[xs.length - 1] } : null;
  };
  const corVar = (l) => (l.variacao < 0 ? 'var(--finalizada-t)' : l.variacao > 0 ? 'var(--alerta-t)' : 'var(--fraco)');
  const dicaMov = (l) => [['Backlog inicial', nf.format(l.inicial)], ['Novas OS', mais(l.entradas), 'var(--nova)'],
    ['Encerradas', `${menos(l.saidas)} · ${nf.format(l.saidasAntigas)} do backlog inicial`, COR.F], ['Backlog final', nf.format(l.final)],
    ['Variação', sinal(l.variacao) + (l.variacaoPct == null || !l.variacao ? '' : ` (${sinalPc(l.variacaoPct)})`)]];
  /** Uma linha no tempo: um ponto por período e o número em cima; embaixo o nome e uma segunda linha (a
   *  variação). `ref`: uma linha de referência (o 100%); `tendencia`: a reta pelos pontos que já passaram. */
  function linhaTempo(caixa, { linhas, titulo, k, cor = COR.A, fmt = (v) => nf.format(v), nomes, subCor = null, marcado = null, aoClicar = null, dica = null,
    ref = null, tendencia = false, area = true, H = 270, passoMin = 56 }) {
    const tem = linhas.filter((l) => l[k] != null);
    if (!tem.length) return vazio(caixa, 'Nada com estes filtros.');
    const W = Math.max(caixa.clientWidth || 640, linhas.length * passoMin);
    const svg = d3.create('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', titulo);
    caixa.replaceChildren(svg.node());
    guardarDados(caixa, { titulo, cab: ['Período', titulo], linhas: linhas.map((l) => [l.rot, l[k] == null ? '' : l[k]]) });
    const base = H - 46, topo = 26, passo = W / linhas.length, cx = (i) => passo * i + passo / 2;
    const sy = d3.scaleLinear([0, Math.max(d3.max(tem, (l) => l[k]), ref ? ref.v : 0) || 1], [base, topo]).nice();
    linhas.forEach((l, i) => { if (marcado && marcado(l)) svg.append('rect').attr('x', passo * i + 2).attr('y', 4).attr('width', passo - 4).attr('height', H - 8).attr('rx', 8).style('fill', 'var(--marca-clara)'); });
    for (const v of sy.ticks(3)) if (v) svg.append('line').attr('x1', 0).attr('x2', W).attr('y1', sy(v) + 0.5).attr('y2', sy(v) + 0.5).style('stroke', 'var(--linha)');
    svg.append('line').attr('x1', 0).attr('x2', W).attr('y1', base + 0.5).attr('y2', base + 0.5).style('stroke', 'var(--borda)');
    if (ref) {
      svg.append('line').attr('x1', 0).attr('x2', W).attr('y1', sy(ref.v)).attr('y2', sy(ref.v)).style('stroke', 'var(--fraco)').style('stroke-width', 1.2).style('stroke-dasharray', '4 4');
      txt(svg, W - 4, sy(ref.v) - 8, ref.rot, { anchor: 'end', cor: 'var(--fraco)', tam: 10.5, peso: 650 });
    }
    const pts = linhas.map((l, i) => (l[k] == null ? null : [cx(i), sy(l[k])]));
    if (area) svg.append('path').attr('d', d3.area().defined((q) => q).x((q) => q[0]).y0(base).y1((q) => q[1])(pts)).style('fill', cor).style('opacity', 0.12);
    svg.append('path').attr('d', d3.line().defined((q) => q).x((q) => q[0]).y((q) => q[1])(pts)).style('fill', 'none').style('stroke', cor).style('stroke-width', 2.2).style('stroke-linejoin', 'round');
    const tr = tendencia ? tendenciaSerie(linhas, k) : null;
    if (tr) svg.append('line').attr('x1', cx(tr.x0)).attr('x2', cx(tr.x1)).attr('y1', sy(tr.a + tr.b * tr.x0)).attr('y2', sy(tr.a + tr.b * tr.x1))
      .style('stroke', 'var(--fraco)').style('stroke-width', 1.6).style('stroke-dasharray', '6 5');
    linhas.forEach((l, i) => {
      const g = svg.append('g').attr('class', 'col');
      g.append('rect').attr('x', passo * i).attr('y', 0).attr('width', passo).attr('height', H).style('fill', 'transparent');
      if (l[k] != null) {
        const y = sy(l[k]);
        g.append('rect').attr('x', cx(i) - 6.5).attr('y', y - 6.5).attr('width', 13).attr('height', 13).attr('rx', 6.5).style('fill', 'var(--papel)');
        g.append('rect').attr('x', cx(i) - 4.5).attr('y', y - 4.5).attr('width', 9).attr('height', 9).attr('rx', 4.5).style('fill', cor);
        txt(g, cx(i), y - 15, fmt(l[k]), { anchor: 'middle', cor: 'var(--texto)', peso: 700, tam: 11.5 });
      }
      const [forte, fraco] = nomes(l);
      txt(g, cx(i), base + 15, forte, { anchor: 'middle', cor: 'var(--fraco)', peso: 650, tam: 11 });
      if (fraco) txt(g, cx(i), base + 29, fraco, { anchor: 'middle', cor: subCor ? subCor(l) : 'var(--muito-fraco)', peso: 600, tam: 10.5 });
      if (dica) g.on('mousemove', (ev) => mostrarDica(ev, l.rot, dica(l))).on('mouseleave', esconderDica);
      if (aoClicar) g.style('cursor', 'pointer').on('click', () => aoClicar(l));
    });
    return tr;
  }
  /** O saldo em cada período: para cima a carteira cresceu (entrou mais do que saiu), para baixo diminuiu. */
  function colunasSaldo(caixa, { linhas, titulo, k = 'saldo', nomes, marcado = null, aoClicar = null, dica = null, H = 250 }) {
    if (!linhas.length) return vazio(caixa, 'Nada com estes filtros.');
    const W = Math.max(caixa.clientWidth || 520, linhas.length * 36);
    const svg = d3.create('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', titulo);
    caixa.replaceChildren(svg.node());
    guardarDados(caixa, { titulo, cab: ['Período', 'Saldo (novas − encerradas)'], linhas: linhas.map((l) => [l.rot, l[k]]) });
    const topo = 22, base = H - 44, lo = Math.min(0, d3.min(linhas, (l) => l[k])), hi = Math.max(0, d3.max(linhas, (l) => l[k]));
    const sy = d3.scaleLinear([lo, hi || (lo ? 0 : 1)], [base - (lo < 0 ? 16 : 6), topo]), passo = W / linhas.length, bw = Math.min(28, passo * 0.55);
    linhas.forEach((l, i) => { if (marcado && marcado(l)) svg.append('rect').attr('x', passo * i + 2).attr('y', 4).attr('width', passo - 4).attr('height', H - 8).attr('rx', 8).style('fill', 'var(--marca-clara)'); });
    svg.append('line').attr('x1', 0).attr('x2', W).attr('y1', sy(0)).attr('y2', sy(0)).style('stroke', 'var(--borda)');
    linhas.forEach((l, i) => {
      const v = l[k], x = passo * i + passo / 2, y0 = sy(0), y1 = sy(v);
      const g = svg.append('g').attr('class', 'col');
      g.append('rect').attr('x', passo * i).attr('y', 0).attr('width', passo).attr('height', H).style('fill', 'transparent');
      if (v) g.append('rect').attr('x', x - bw / 2).attr('y', Math.min(y0, y1)).attr('width', bw).attr('height', Math.max(2, Math.abs(y1 - y0))).attr('rx', 3).style('fill', v > 0 ? COR.alerta : COR.F);
      txt(g, x, v >= 0 ? y1 - 9 : y1 + 10, sinal(v), { anchor: 'middle', cor: 'var(--texto)', peso: 700, tam: 11.5 });
      const [forte, fraco] = nomes(l);
      txt(g, x, base + 15, forte, { anchor: 'middle', cor: 'var(--fraco)', peso: 650, tam: 11 });
      if (fraco) txt(g, x, base + 29, fraco, { anchor: 'middle', cor: 'var(--muito-fraco)', tam: 10.5 });
      if (dica) g.on('mousemove', (ev) => mostrarDica(ev, l.rot, dica(l))).on('mouseleave', esconderDica);
      if (aoClicar) g.style('cursor', 'pointer').on('click', () => aoClicar(l));
    });
  }
  /** Novas × encerradas em cada período, lado a lado; embaixo, o saldo. */
  const colunasNE = (caixa, serie, sel, titulo) => colunasPar(caixa, { linhas: serie, titulo, H: 270, passoMin: 52, passoMax: 96, bwMax: 24,
    esq: [{ k: 'entradas', cor: 'var(--nova)', nome: 'Novas OS', tinta: '#1f2937' }], dir: [{ k: 'saidas', cor: COR.F, nome: 'Encerradas', tinta: '#ffffff' }],
    rotulo: (l) => [l.curto, sinal(l.saldo)], marcado: (l) => toca(l, sel), aoClicar: (l) => irPeriodo(l), dica: dicaMov, quem: ['período', 'períodos'] });
  const unidDe = (esc) => ({ dia: 'dia', semana: 'semana', mes: 'mês' }[esc]);

  function desenharAvanco() {
    const raiz = $('#avanco');
    const av = V.av;
    const todas = semSituacao().todas.filter(daQuais(av));
    const sel = periodoSel(), noAtual = sel.ate >= D.base;
    // a conta do período (a mesma da Visão geral e dos Indicadores) e a do período anterior, para comparar
    const mv = IND.movimento(todas, { de: sel.de, ate: sel.ate, base: D.base });
    const pa = IND.anterior({ desde: sel.de, ate: sel.ate, base: D.base, unidade: sel.unidade });
    const mvA = IND.movimento(todas, { de: pa.desde, ate: pa.ate, base: D.base });
    const rotAnt = pa.desde === pa.ate ? dm(pa.desde) : `${dm(pa.desde)} a ${dm(pa.ate)}`;
    const x = contaAvanco(todas, sel);   // OS por OS (as listas e cada pessoa): as mesmas contas do movimento
    const por = av.por;
    const segPor = el('div', { class: 'seg', role: 'group', 'aria-label': 'Cada um por' }, ...[['exec', 'Executante'], ['frota', 'Frota']].map(([kk, rot]) =>
      el('button', { type: 'button', 'aria-pressed': String(por === kk), text: rot, on: { click: () => { av.por = kk; desenhar(); } } })));
    const verLista = (kk) => { av.lista = kk; zerarPaginas(); V.rolar = 'av-lista'; desenhar(); };
    const nf0 = (v) => nf.format(v);
    const kpis = el('div', { class: 'kpis mini av-kpis' },
      kpiCom('Backlog inicial', nf.format(mv.inicial), `em aberto em ${dm(mv.vespera)}`, COR.A, { fazer: () => verLista('tinha'), comp: comparacao(mv.inicial, mvA.inicial, null, nf0, rotAnt) }),
      kpiCom('Novas OS', mais(mv.entradas), `abertas no período · ${nf.format(mv.novasAbertas)} seguem abertas`, 'var(--nova)',
        { fazer: () => verLista('entrou'), comp: comparacao(mv.entradas, mvA.entradas, null, nf0, rotAnt) }),
      kpiCom('Encerradas', menos(mv.saidas), `${nf.format(mv.saidasAntigas)} do backlog inicial · ${nf.format(mv.saidasNovas)} abertas no período`, COR.F,
        { fazer: () => verLista('saiu'), comp: comparacao(mv.saidas, mvA.saidas, 'mais', nf0, rotAnt) }),
      kpiCom(noAtual ? 'Backlog atual' : 'Backlog final', nf.format(mv.final), `em aberto em ${dm(mv.ate)}`, 'var(--fraco)',
        { fazer: () => verLista('fim'), comp: comparacao(mv.final, mvA.final, 'menos', nf0, rotAnt) }),
      kpiCom('Variação do backlog', sinal(mv.variacao) + (mv.variacaoPct != null && mv.variacao ? ` (${sinalPc(mv.variacaoPct)})` : ''),
        mv.variacao < 0 ? 'a carteira diminuiu' : mv.variacao > 0 ? 'a carteira cresceu' : 'a carteira ficou igual', null,
        { cls: mv.variacao < 0 ? 'bom' : mv.variacao > 0 ? 'ruim' : '', comp: comparacao(mv.variacao, mvA.variacao, 'menos', sinal, rotAnt) }),
      kpiCom('Encerradas ÷ novas', mv.taxaEncerramento == null ? '—' : pc.format(mv.taxaEncerramento),
        mv.taxaEncerramento == null ? 'nenhuma OS nova no período' : mv.taxaEncerramento >= 1 ? 'encerrou mais do que entrou' : 'entrou mais do que encerrou', null,
        { cls: mv.taxaEncerramento == null ? '' : mv.taxaEncerramento >= 1 ? 'bom' : 'ruim', comp: comparacao(mv.taxaEncerramento, mvA.taxaEncerramento, 'mais', (v) => pc.format(v), rotAnt) }));
    const topo = el('article', { class: 'cartao c12', id: 'av-topo', 'data-imagem': true },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Avanço do backlog' }),
        el('p', { class: 'nota', text: `${sel.rot} · comparado com ${rotAnt}`,
          title: 'Pelas datas do Protheus: a OS entra no dia da abertura e sai no dia do fim da manutenção. Cada pessoa: pela mão de obra da STL de hoje.' })),
        el('div', { class: 'acoes' }, el('div', { class: 'ctl' }, segQuaisDe(av)))),
      el('b', { class: 'pg-rot', text: sel.rot }), kpis);
    // entradas × saídas do período, ao lado da conferência
    const gES = el('div', { class: 'graf' });
    const es = el('article', { class: 'cartao c6', id: 'av-es', 'data-imagem': true },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Entradas e saídas' }), el('p', { class: 'nota', text: sel.rot })), el('div', { class: 'acoes' })),
      el('div', { class: 'legenda' }, el('span', {}, el('i', { style: 'background:var(--nova)' }), 'Novas OS'), el('span', {}, el('i', { style: 'background:' + COR.F }), 'Encerradas do backlog inicial'),
        el('span', {}, el('i', { style: 'background:' + COR_DEPOIS }), 'Encerradas abertas no período')), gES);
    // a série: o backlog no fim de cada período, até o escolhido
    const esc = escSerie(sel), unid = { dia: 'dia', semana: 'semana', mes: 'mês' }[esc];
    const janela = janelaDe(sel, esc).map((b) => contaAvanco(todas, b));
    const PARTES_FIM = [{ k: 'ainda', nome: 'Remanescente do backlog inicial', cor: COR.A, texto: 'claro' }, { k: 'entrouAberta', nome: 'Abertas no período', cor: 'var(--nova)', texto: 'tema' }];
    const dicaAv = (l) => [['Backlog inicial', nf.format(l.tinha), COR.A], ['Encerradas', `${nf.format(l.fechou + l.entrouFechou)} · ${nf.format(l.fechou)} do inicial`, COR.F],
      ['Novas OS', `${nf.format(l.entrou)} · ${nf.format(l.entrouFechou)} já encerradas`, 'var(--nova)'], ['Backlog final', nf.format(l.fim)]];
    const gSeq = el('div', { class: 'graf rolar-x' });
    const seq = el('article', { class: 'cartao c12', 'data-imagem': true },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: `Backlog ao fim de cada ${unid}` }),
        el('p', { class: 'nota', text: 'OS em aberto ao fim de cada período · embaixo, o percentual do backlog inicial encerrado' })), el('div', { class: 'acoes' }, el('div', { class: 'ctl' }, segSerie(sel)))),
      el('div', { class: 'legenda' }, ...PARTES_FIM.map((q) => el('span', {}, el('i', { style: 'background:' + q.cor }), q.nome)), el('span', { text: 'no topo, o backlog final' })),
      gSeq);
    // cada pessoa (ou frota): do backlog inicial, quantas encerrou
    const m = new Map();
    for (const o of todas) {
      const kk = avancoDe(o, sel.de, x.ateReal);
      if (!kk) continue;
      const chaves = por === 'frota' ? [o.frota] : o.pessoas.length ? o.pessoas.map((q) => q.nome) : [GRUPO[o.grupo]];
      for (const c of chaves) {
        if (!m.has(c)) m.set(c, { chave: c, nome: c, fechou: 0, ainda: 0, entrouFechou: 0, entrouAberta: 0 });
        m.get(c)[kk]++;
      }
    }
    const grupoDe = { [GRUPO.S]: 'g:S', [GRUPO.T]: 'g:T' };
    const linhas = [...m.values()].map((y) => somaAvanco({ ...y, aponta: por === 'exec' && !grupoDe[y.chave] ? aponta(y.nome) : true }));
    const noGrafico = linhas.filter((y) => y.tinha && !grupoDe[y.chave]).sort((a, b) => b.tinha - a.tinha || b.fechou - a.fechou || a.nome.localeCompare(b.nome, 'pt', { numeric: true }));
    const curto = por === 'exec' ? curtos(noGrafico.map((y) => y.nome)) : null;
    const gCada = el('div', { class: 'graf rolar-x' }), notaCada = el('p', { class: 'nota' });
    const cada = el('article', { class: 'cartao c12', 'data-imagem': true },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Baixa do backlog ' + (por === 'exec' ? 'por executante' : 'por frota') + ' · ' + sel.rot }), notaCada),
        el('div', { class: 'acoes' }, el('div', { class: 'ctl' }, segPor))),
      el('div', { class: 'legenda' }, ...itensBK(BK_AV), el('span', { text: 'no fim, o backlog inicial' })),
      gCada);
    const tCada = el('div', { class: 'bt-rolagem' });
    const tab = el('article', { class: 'cartao c12', 'data-imagem': true },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Backlog ' + (por === 'exec' ? 'por executante' : 'por frota') + ' · ' + sel.rot })), el('div', { class: 'acoes' })),
      tCada);
    // a lista: cada grupo pelo que aconteceu à OS no período
    const qual = NA_LISTA[av.lista] ? av.lista : 'saiu';
    const daLista = (o) => NA_LISTA[qual].includes(avancoDe(o, sel.de, x.ateReal));
    const itens = todas.filter(daLista);
    const conta = { tinha: x.tinha, entrou: x.entrou, saiu: x.fechou + x.entrouFechou, fim: x.fim };
    const lista = el('article', { class: 'cartao c12', id: 'av-lista' });
    // novas e encerradas em cada período da série: a entrada e a saída lado a lado
    const gNE = el('div', { class: 'graf rolar-x' });
    const ne = el('article', { class: 'cartao c12', 'data-imagem': true },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: `Novas e encerradas em cada ${unid}` }),
        el('p', { class: 'nota', text: 'Entrada pela data de abertura, saída pela data de fim · embaixo, o saldo (novas − encerradas)' })), el('div', { class: 'acoes' })),
      el('div', { class: 'legenda' }, el('span', {}, el('i', { style: 'background:var(--nova)' }), 'Novas OS'), el('span', {}, el('i', { style: 'background:' + COR.F }), 'Encerradas')), gNE);
    // o histórico dos períodos: a conta de cada um, numa tabela
    const tHist = el('div', { class: 'tab' });
    const hist = el('article', { class: 'cartao c12', id: 'av-historico', 'data-imagem': true },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: `Histórico · cada ${unid}` }),
        el('p', { class: 'nota', text: 'O backlog no começo e no fim de cada período, o que entrou e o que saiu · a linha abre o período' })), el('div', { class: 'acoes' })), tHist);
    raiz.replaceChildren(el('div', { class: 'grade' }, topo, cartaoConferencia(mv, sel), es, seq, ne, hist, cada, tab, lista));
    const varH = (l) => l.fim - l.tinha, encH = (l) => l.fechou + l.entrouFechou;
    tabela(tHist, { id: 'av-hist', linhas: janela, padrao: { k: 'de', dir: 'desc' }, aoClicar: (l) => irPeriodo(l), cols: [
      { k: 'de', rot: 'Período', ord: (l) => l.de, ver: (l) => l.rot },
      { k: 'tinha', rot: 'Backlog inicial', num: true }, { k: 'entrou', rot: 'Novas', num: true },
      { k: 'enc', rot: 'Encerradas', num: true, ord: encH, ver: encH }, { k: 'fechou', rot: '· do inicial', num: true }, { k: 'entrouFechou', rot: '· do período', num: true },
      { k: 'fim', rot: 'Backlog final', num: true }, { k: 'var', rot: 'Variação', num: true, ord: varH, ver: (l) => sinal(varH(l)) },
      { k: 'varPc', rot: 'Variação %', num: true, ord: (l) => (l.tinha ? varH(l) / l.tinha : 0), ver: (l) => (l.tinha && varH(l) ? sinalPc(varH(l) / l.tinha) : '0') },
      { k: 'taxa', rot: 'Encerradas ÷ novas', num: true, ord: (l) => (l.entrou ? encH(l) / l.entrou : -1), ver: (l) => (l.entrou ? pc.format(encH(l) / l.entrou) : '—') }] });
    tHist.querySelector('table').classList.add('img-tabela');
    guardarDados(tHist, { titulo: `Histórico · cada ${unid}`, cab: ['Período', 'Backlog inicial', 'Novas', 'Encerradas', 'Encerradas do inicial', 'Encerradas do período', 'Backlog final', 'Variação', 'Variação %'],
      linhas: [...janela].reverse().map((l) => [l.rot, l.tinha, l.entrou, encH(l), l.fechou, l.entrouFechou, l.fim, varH(l), l.tinha ? Math.round((varH(l) / l.tinha) * 1000) / 10 : 0]) });
    entradasSaidas(gES, mv, { titulo: 'Entradas e saídas · ' + sel.rot });
    const fluxoJ = janela.map((l) => ({ ...l, nome: l.rot, novas: l.entrou, enc: l.fechou + l.entrouFechou, saldo: l.entrou - l.fechou - l.entrouFechou }));
    colunasPar(gNE, { linhas: fluxoJ, titulo: `Novas e encerradas em cada ${unid}`, H: 270, passoMin: 52, passoMax: 96, bwMax: 24,
      esq: [{ k: 'novas', cor: 'var(--nova)', nome: 'Novas OS', tinta: '#1f2937' }], dir: [{ k: 'enc', cor: COR.F, nome: 'Encerradas', tinta: '#ffffff' }],
      rotulo: (l) => [l.curto, (l.saldo > 0 ? '+' : l.saldo < 0 ? '−' : '') + nf.format(Math.abs(l.saldo))], marcado: (l) => toca(l, sel), aoClicar: (l) => irPeriodo(l),
      dica: (l) => [['Novas OS', nf.format(l.novas), 'var(--nova)'], ['Encerradas', `${nf.format(l.enc)} · ${nf.format(l.fechou)} do backlog inicial`, COR.F],
        ['Saldo', sinal(l.saldo)], ['Backlog no fim', nf.format(l.fim)]], quem: ['período', 'períodos'] });
    colunasEmPe(gSeq, { linhas: janela, partes: PARTES_FIM, titulo: `Backlog ao fim de cada ${unid}`, H: 300, passoMin: 46, passoMax: 92,
      nomes: (l) => ({ fortes: [l.curto], fracos: [l.tinha ? pc.format(l.pct) + ' encerrado' : '—'] }), dica: dicaAv,
      marcado: (l) => toca(l, sel), aoClicar: (l) => irPeriodo(l) });
    const rola = barrasBacklog(gCada, { linhas: noGrafico.map((l) => ({ ...l, rot: por === 'exec' ? curto.get(l.nome) : l.nome })), partes: BK_AV,
      titulo: 'Baixa do backlog ' + (por === 'exec' ? 'por executante' : 'por frota'), limite: 15, chave: 'av-' + por, quem: por === 'exec' ? ['pessoa', 'pessoas'] : ['frota', 'frotas'],
      sub: (l) => (l.pct === null ? '' : pc.format(l.pct) + ' baixado') + (por === 'exec' && !l.aponta ? ' · não aponta' : por === 'frota' && eqDe.get(l.chave) ? ' · ' + eqDe.get(l.chave) : ''),
      dica: (l) => [['Backlog inicial', nf.format(l.tinha)], ['Baixadas', `${nf.format(l.fechou)} · ${l.pct === null ? '—' : pc.format(l.pct)}`, 'var(--bk-baixada)'], ['Remanescentes', nf.format(l.ainda), 'var(--bk-pendente)'],
        ['Novas OS', `${nf.format(l.entrou)} · ${nf.format(l.entrouFechou)} já encerradas`, 'var(--nova)'], ['Backlog final', nf.format(l.fim)]],
      aoClicar: (l) => aplicar(() => (por === 'frota' ? so('frota', l.chave) : so('exec', l.chave))) });
    notaCada.textContent = noGrafico.length ? `${plural(noGrafico.length, por === 'exec' ? 'pessoa' : 'frota', por === 'exec' ? 'pessoas' : 'frotas')} com backlog no início do período` + (rola ? ' · role para o lado' : '') : '';
    tabelaNums(tCada, { id: 'av-' + por, linhas, totalRot: 'Backlog inicial', padrao: { k: '_tot', dir: 'desc' },
      nome: { rot: por === 'exec' ? 'Executante' : 'Frota', ver: (l) => [l.nome, por === 'frota' ? eqDe.get(l.chave) || '' : grupoDe[l.chave] ? 'ninguém da equipe na STL' : l.aponta ? '' : foraTxt(l.nome)] },
      partes: [{ k: 'tinha' }],
      cols: [{ k: 'fechou', rot: 'Encerradas do inicial' }, { k: 'pct', rot: '% baixado', val: (l) => (l.pct === null ? -1 : l.pct), fmt: (v) => (v < 0 ? '—' : pc.format(v)) },
        { k: 'ainda', rot: 'Remanescentes' }, { k: 'entrou', rot: 'Novas OS' }, { k: 'entrouFechou', rot: 'Novas já encerradas' }, { k: 'fim', rot: noAtual ? 'Backlog atual' : 'Backlog final' }],
      vazioTxt: 'Sem backlog neste período com estes filtros.',
      aoClicar: (l) => aplicar(() => (por === 'frota' ? so('frota', l.chave) : so('exec', grupoDe[l.chave] || l.chave))) });
    carteira(lista, itens, itens, { chave: 'av', semSegm: true, titulo: TIT_LISTA[qual] + ' · ' + sel.rot,
      nota: { tinha: `Em aberto em ${dm(mv.vespera)}, véspera do período`, entrou: 'Abertas no Protheus dentro do período, encerradas ou não',
        saiu: `Encerradas no Protheus no período, até ${dm(mv.ate)}: as do backlog inicial e as que entraram nele`, fim: `Em aberto em ${dm(mv.ate)}`,
        fechou: 'Do backlog inicial, as encerradas no período', entrouFechou: 'Abertas e encerradas dentro do período' }[qual] });
    lista.querySelector('.cab .acoes').prepend(el('div', { class: 'ctl' }, el('div', { class: 'seg', role: 'group', 'aria-label': 'Quais OS' }, ...LISTAS_AV.map(([kk, rot]) =>
      el('button', { type: 'button', 'aria-pressed': String(qual === kk), text: `${rot} · ${nf.format(conta[kk])}`, on: { click: () => { av.lista = kk; zerarPaginas(); desenhar(); } } })))));
    if (V.rolar === 'av-lista') { V.rolar = ''; requestAnimationFrame(() => lista.scrollIntoView({ block: 'start', behavior: 'smooth' })); }
  }

  // ── Auditoria (11/11/2026): de onde vem cada número e o que não fecha ──
  // A conta do período (a mesma do Avanço), o funil do Protheus ao painel (o que ficou de fora e por quê),
  // os pontos de atenção dos dados e a comparação entre duas atualizações guardadas (dias/ no bucket).
  // Nada aqui corrige número: o que não fecha aparece como divergência, com a OS.
  const dataHora = (x) => { const d = new Date(x); return isNaN(d) ? '' : `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`; };
  const copias = new Map();   // o dia → a cópia baixada (uma vez por abertura do painel)
  const baixarCopia = (dia) => {
    if (!copias.has(dia)) copias.set(dia, fontes.dia(dia).then((pk) => { if (!pk || !pk.D) throw new Error(`a cópia de ${br(dia)} não abriu`); return pk; })
      .catch((e) => { copias.delete(dia); throw e; }));
    return copias.get(dia);
  };
  /** Carrega uma vez a lista das cópias e o índice das atualizações; desenha de novo quando chegam. */
  function carregarAuditoria() {
    const au = V.aud;
    if (!fontes) { au.dias = au.dias || []; au.imp = au.imp || []; return; }
    const volta = () => { if (V.aba === 'auditoria') desenhar(); };
    if (au.dias === null) {
      au.dias = 'carregando';
      Promise.resolve().then(() => fontes.dias()).then((l) => {
        au.dias = Array.isArray(l) ? l : [];
        au.b = au.b || (au.dias.includes(D.base) ? D.base : au.dias[au.dias.length - 1] || '');
        au.a = au.a || [...au.dias].reverse().find((d) => d < au.b) || '';
      }).catch((e) => { au.dias = []; au.erro = 'Não deu para ler as cópias guardadas: ' + ((e && e.message) || e); }).then(volta);
    }
    if (au.imp === null) {
      au.imp = 'carregando';
      Promise.resolve().then(() => fontes.importacoes()).then((l) => { au.imp = Array.isArray(l) ? l : []; }).catch(() => { au.imp = []; }).then(volta);
    }
  }
  const linConta = (rot, v, cls = '', fazer = null) => el('tr', { class: cls },
    el('th', { scope: 'row' }, fazer ? el('button', { type: 'button', class: 'concil-ver', text: rot, title: 'Ver as OS', on: { click: fazer } }) : rot), el('td', { text: v }));
  function desenharAuditoria() {
    const raiz = $('#auditoria');
    carregarAuditoria();
    const todas = semSituacao().todas, sel = periodoSel();
    const mv = IND.movimento(todas, { de: sel.de, ate: sel.ate, base: D.base });
    const cab = (tit, nota, ...acoes) => el('div', { class: 'cab' }, el('div', {}, el('h2', { text: tit }), el('p', { class: 'nota', text: nota })), el('div', { class: 'acoes' }, ...acoes));
    // o funil: cada linha da STJ e o que foi feito dela
    const A = D.auditoria;
    let funil;
    if (A) {
      const calc = A.linhasHoje + A.linhasHist - A.foraDaLista - A.repetidasHoje - A.repetidasHist - A.canceladas - A.semFim - A.antesDe;
      const ok = calc === A.consideradas && A.consideradas === D.os.length;
      funil = el('article', { class: 'cartao c6', id: 'aud-funil', 'data-imagem': true },
        cab('Do Protheus ao painel', `O export inteiro (sem os filtros) · Protheus de ${br(D.base)}`),
        el('table', { class: 'concil' }, el('tbody', {},
          linConta('Linhas da STJ de hoje', nf.format(A.linhasHoje)),
          linConta('+ Linhas da base histórica', mais(A.linhasHist)),
          linConta('− De frotas fora da lista do PCM', menos(A.foraDaLista)),
          linConta('− Repetidas no export de hoje', menos(A.repetidasHoje)),
          linConta('− Da base histórica que o export de hoje já trouxe', menos(A.repetidasHist)),
          linConta('− Canceladas no Protheus', menos(A.canceladas)),
          linConta('− Encerradas sem a data de fim', menos(A.semFim)),
          linConta(`− Encerradas antes de ${br(A.desde)}`, menos(A.antesDe)),
          linConta('= OS consideradas', nf.format(calc), 'soma'),
          linConta('OS no painel', nf.format(D.os.length), 'achado'))),
        el('p', { class: 'concil-res ' + (ok ? 'bom' : 'ruim') }, ok ? '✓ Todas as linhas estão contadas: cada uma entrou no painel ou tem o motivo de ter ficado de fora.'
          : `⚠ Divergência: a conta dá ${nf.format(calc)}, o painel tem ${nf.format(D.os.length)} (diferença ${sinal(D.os.length - calc)}).`),
        el('ul', { class: 'concil-notas' }, el('li', { text: `Encerradas antes de ${br(A.desde)} ficam fora: o backlog refeito para antes dessa data sai menor que o real.` }),
          el('li', { text: 'Repetida é a mesma OS (filial e número) duas vezes: vale a primeira, e o export de hoje vem antes da base histórica.' })));
    } else {
      funil = el('article', { class: 'cartao c6', id: 'aud-funil' }, cab('Do Protheus ao painel', `Protheus de ${br(D.base)}`),
        el('p', { class: 'nota', text: 'Quantas linhas vieram do Protheus e por que cada uma ficou de fora (outra frota, repetida, cancelada, sem data de fim) aparece a partir da próxima atualização com o Protheus.' }));
    }
    // os pontos de atenção: o que pede cuidado nos dados (com os filtros da barra)
    const temOrigem = D.os.some((a) => a.length > 21), canc = Array.isArray(D.canceladas) ? D.canceladas : null;
    const H = D.historica || {};
    const PONTOS = [
      { k: 'depois', rot: 'Lançadas depois do serviço', casa: (o) => o.sit === 'F' && !!o.fim && !!o.abertura && o.fim < o.abertura,
        txt: 'Encerradas com o fim antes da abertura (a OS foi aberta no Protheus depois do serviço): entram e saem no dia da abertura.' },
      { k: 'futuro', rot: 'Datas depois do export', casa: (o) => (!!o.abertura && o.abertura > D.base) || (!!o.fim && o.fim > D.base),
        txt: `Abertura ou fim depois de ${br(D.base)}: provável erro de digitação no Protheus.` },
      { k: 'hist', rot: 'Abertas que vêm só da base histórica', casa: (o) => o.origemHist && o.sit !== 'F', sem: !temOrigem,
        txt: temOrigem ? `A situação é a do dia em que a base histórica foi feita${H.feito_em ? ' (' + br(H.feito_em.slice(0, 10)) + ')' : ''}: se alguma foi encerrada depois, o painel ainda a conta em aberto.`
          : 'Contadas a partir da próxima atualização com o Protheus.' },
      { k: 'semAb', rot: 'Sem data de abertura', casa: (o) => !o.abertura, txt: 'Ficam fora das contas do período (não se sabe quando entraram).' },
      { k: 'semExec', rot: 'Abertas sem executante', casa: (o) => o.sit !== 'F' && o.grupo === 'S', txt: 'Ninguém da equipe nem terceiro na STL. Com data programada, não contam como programadas.' },
      { k: 'semAbriu', rot: 'Sem quem abriu (CPF)', casa: (o) => !o.abertaPor,
        txt: !OS.some((o) => o.abertaPor) ? 'Nenhuma OS tem o CPF de quem abriu: a STJ desta atualização veio sem a coluna Usr Inclusao (ou com um nome que o painel não reconheceu). Exporte a STJ com essa coluna e atualize.'
          : 'A base histórica (antes de 2026) não tem essa coluna; nas OS de 2026 em diante, é o que o export não trouxe.' }];
    const conta = Object.fromEntries(PONTOS.map((q) => [q.k, q.sem ? null : todas.filter(q.casa).length]));
    const verPonto = (k) => { (V.cart.aud || (V.cart.aud = { lim: 100 })).g = k; V.rolar = 'aud-lista'; desenhar(); };
    const atencao = el('article', { class: 'cartao c12', id: 'aud-atencao', 'data-imagem': true },
      cab('Pontos de atenção nos dados', 'Com os filtros da barra · clique para ver as OS'),
      el('ul', { class: 'aud-pontos' },
        ...PONTOS.map((q) => el('li', {}, el('button', { type: 'button', class: 'aud-n' + (conta[q.k] ? ' tem' : ''), disabled: !conta[q.k], text: conta[q.k] == null ? '—' : nf.format(conta[q.k]),
          'aria-label': `${q.rot}: ver as OS`, on: { click: () => verPonto(q.k) } }), el('div', {}, el('b', { text: q.rot }), el('span', { text: q.txt })))),
        el('li', {}, el('span', { class: 'aud-n' + (canc && canc.length ? ' tem' : ''), text: canc ? nf.format(canc.length) : '—' }),
          el('div', {}, el('b', { text: 'Canceladas no Protheus' }), el('span', { text: canc ? 'Ficam fora da carteira: não entram nem saem.' + (canc.length ? ' OS: ' + canc.slice(0, 12).map((c) => c[0]).join(', ') + (canc.length > 12 ? '…' : '') : '')
            : 'Contadas a partir da próxima atualização com o Protheus.' })))));
    // comparar duas atualizações
    const comparar = el('article', { class: 'cartao c12', id: 'aud-comparar', 'data-imagem': true });
    desenharComparacao(comparar, cab);
    // o histórico das atualizações (o índice)
    const historico = el('article', { class: 'cartao c12', id: 'aud-historico' });
    desenharHistorico(historico, cab);
    // conferir com a STJ (11/11/2026): a STJ exportada por data de abertura traz as OS abertas no período e a
    // situação delas hoje; o painel conta a encerrada pela data de fim, inclusive a aberta antes. Lado a lado.
    const corte = (D.historica && D.historica.corte) || '2026-01-01', feito = D.historica && D.historica.feito_em ? br(String(D.historica.feito_em).slice(0, 10)) : '';
    const fimP = sel.ate < D.base ? sel.ate : D.base;
    const abP = todas.filter((o) => o.abertura && o.abertura >= sel.de && o.abertura <= fimP), abPenc = abP.filter((o) => o.sit === 'F').length;
    const encP = todas.filter((o) => { const sd = IND.saidaDe(o); return !!sd && sd >= sel.de && sd <= fimP; }), encNovas = encP.filter((o) => o.abertura >= sel.de).length;
    const abHoje = todas.filter((o) => o.sit !== 'F'), abHist = abHoje.filter((o) => (temOrigem ? o.origemHist : !!o.abertura && o.abertura < corte)).length;
    const conferir = el('article', { class: 'cartao c6', id: 'aud-stj', 'data-imagem': true },
      cab('Conferir com a STJ', `${sel.rot} · ${filtrosTxt() || 'sem filtros'}`),
      el('table', { class: 'concil' }, el('tbody', {},
        linConta('OS abertas no período (Dt. Original)', nf.format(abP.length), 'tit'),
        linConta('· hoje encerradas (Término = Sim)', nf.format(abPenc)),
        linConta('· hoje em aberto', nf.format(abP.length - abPenc)),
        linConta('Encerradas no período (pela data de fim)', nf.format(encP.length), 'tit'),
        linConta('· abertas no próprio período', nf.format(encNovas)),
        linConta('· abertas antes do período', nf.format(encP.length - encNovas)),
        linConta('Em aberto hoje', nf.format(abHoje.length), 'tit'),
        linConta(temOrigem ? '· só na base histórica (situação antiga)' : `· abertas antes de ${br(corte)} (vêm da base histórica)`, nf.format(abHist)))),
      el('ul', { class: 'concil-notas' },
        el('li', { text: 'A STJ exportada por data de abertura só traz as OS abertas no período: o "encerradas" dela é a linha "hoje encerradas". O painel conta como encerrada no período a OS que saiu nele, inclusive a aberta antes — a linha "abertas antes do período", que a STJ do período não traz.' }),
        el('li', { text: `As OS abertas antes de ${br(corte)} vêm da base histórica${feito ? ', com a situação de ' + feito : ''}, quando a STJ de hoje não as traz: se alguma foi encerrada depois, o painel ainda a conta em aberto. Para atualizá-las, exporte a STJ e a STL desde 01/01/2024.` })));
    const lista = el('article', { class: 'cartao c12', id: 'aud-lista' });
    raiz.replaceChildren(el('div', { class: 'grade' }, cartaoConferencia(mv, sel), conferir, funil, atencao, comparar, historico, lista));
    const doPonto = PONTOS.filter((q) => !q.sem);
    carteira(lista, null, todas.filter((o) => doPonto.some((q) => q.casa(o))), { chave: 'aud', titulo: 'As OS dos pontos de atenção', nota: 'A situação de hoje no Protheus, com os filtros da barra',
      grupos: doPonto.map((q) => ({ k: q.k, rot: q.rot, casa: q.casa })) });
    if (V.rolar === 'aud-lista') { V.rolar = ''; requestAnimationFrame(() => lista.scrollIntoView({ block: 'start', behavior: 'smooth' })); }
  }

  /** A comparação de duas cópias: a conta da carteira de uma para a outra e o backlog registrado × refeito. */
  function desenharComparacao(caixa, cab) {
    const au = V.aud;
    const nota = 'Cada atualização com o Protheus guarda uma cópia do dia. Escolha duas e veja o que mudou entre elas, OS por OS.';
    if (!fontes) return caixa.replaceChildren(cab('Comparar duas atualizações', nota), el('p', { class: 'nota', text: 'As cópias guardadas não estão disponíveis aqui.' }));
    if (au.dias === 'carregando' || au.dias === null) return caixa.replaceChildren(cab('Comparar duas atualizações', nota), el('p', { class: 'nota', text: 'Lendo as cópias guardadas…' }));
    const dias = au.dias;
    if (dias.length < 2) {
      return caixa.replaceChildren(cab('Comparar duas atualizações', nota), el('p', { class: 'nota', text: au.erro || (dias.length
        ? `Só há a cópia de ${br(dias[0])}. A comparação fica disponível a partir da próxima atualização.` : 'Ainda não há cópias guardadas. Cada atualização com o Protheus guarda a sua.') }));
    }
    const escolha = (rot, k) => {
      const sl = el('select', { 'aria-label': rot, on: { change: (e) => { au[k] = e.target.value; au.res = null; au.cat = ''; desenhar(); } } },
        ...dias.map((d) => el('option', { value: d, text: br(d) })));
      sl.value = au[k];
      return el('label', { class: 'aud-escolha' }, el('span', { text: rot }), sl);
    };
    const pode = au.a && au.b && au.a < au.b;
    const botao = el('button', { type: 'button', class: 'botao prim', text: 'Comparar', disabled: !pode, on: { click: () => {
      botao.disabled = true; botao.textContent = 'Baixando as cópias…'; au.erro = '';
      Promise.all([baixarCopia(au.a), baixarCopia(au.b)]).then(([pa, pb]) => {
        au.res = { a: au.a, b: au.b, c: IND.compararAtualizacoes(pa.D, pb.D), rr: IND.registradoReconstruido(pa.D, pb.D), temCanc: Array.isArray(pb.D.canceladas),
          geradoA: pa.meta && pa.meta.gerado_em, geradoB: pb.meta && pb.meta.gerado_em };
        au.cat = '';
      }).catch((e) => { au.erro = 'Não deu para comparar: ' + ((e && e.message) || e); }).then(() => { if (V.aba === 'auditoria') desenhar(); });
    } } });
    const filhos = [cab('Comparar duas atualizações', nota),
      el('div', { class: 'aud-ctl' }, escolha('A anterior', 'a'), escolha('A mais nova', 'b'), botao, pode ? null : el('span', { class: 'nota', text: 'A anterior tem de ser mais velha que a mais nova.' })),
      au.erro ? el('p', { class: 'concil-res ruim', text: '⚠ ' + au.erro }) : null];
    const r = au.res;
    if (r && r.a === au.a && r.b === au.b) {
      const { c, rr } = r;
      const ver = (k) => () => { au.cat = au.cat === k ? '' : k; desenhar(); };
      const CAT = { novas: ['Novas (não estavam na anterior)', c.novas], reabertas: ['Reabertas', c.reabertas], encerradas: ['Encerradas', c.encerradas],
        canceladas: ['Canceladas', c.canceladas], sumiram: ['Sumiram do export', c.sumiram], liberadas: ['Liberadas', c.liberadas], voltaram: ['Voltaram a aguardar liberação', c.voltaramAguardar],
        datas: ['Mudaram de data', c.datasMudaram], novasEnc: ['Entraram já encerradas', c.novasEncerradas], sumEnc: ['Encerradas que sumiram', c.sumiramEncerradas],
        novasAntigas: ['Novas com abertura de antes', c.novasAntigas],
        rEncDia: [`Encerradas em ${br(rr.dia)}, depois do export`, rr.encerradasNoDia], rEncAntes: ['Encerradas com data de antes', rr.encerradasAntes], rSum: ['Sumiram do export', rr.sumiram],
        rSaiuOutras: ['Saíram por outro motivo (data mudou)', rr.saiuOutras], rAbDia: [`Abertas em ${br(rr.dia)}, depois do export`, rr.abertasNoDia], rInc: ['Incluídas depois com abertura de antes', rr.incluidasAntes],
        rReab: ['Reabertas', rr.reabertas], rEntrouOutras: ['Entraram por outro motivo (data mudou)', rr.entrouOutras] };
      const n = (k) => CAT[k][1].length;
      const linCat = (sinalTxt, k, cls) => linConta(`${sinalTxt} ${CAT[k][0]}`, sinalTxt === '+' ? mais(n(k)) : menos(n(k)), cls, n(k) ? ver(k) : null);
      const fecha = c.diferenca === 0, fechaR = rr.registrado - rr.saiu + rr.entrou === rr.reconstruido;
      filhos.push(el('div', { class: 'aud-par' },
        el('div', {}, el('h3', { class: 'kpis-tit', text: `A carteira de ${br(r.a)} para ${br(r.b)}` }),
          el('table', { class: 'concil' }, el('tbody', {},
            linConta(`Em aberto na atualização de ${br(r.a)}`, nf.format(c.backlogA)),
            linCat('+', 'novas', 'mais'), linCat('+', 'reabertas', 'mais'), linCat('−', 'encerradas', 'menos'), linCat('−', 'canceladas', 'menos'), linCat('−', 'sumiram', 'menos'),
            linConta('= Esperado', nf.format(c.esperado), 'soma'),
            linConta(`Em aberto na atualização de ${br(r.b)}`, nf.format(c.backlogB), 'achado'))),
          el('p', { class: 'concil-res ' + (fecha ? 'bom' : 'ruim') }, fecha ? `✓ A conta fecha: variação ${sinal(c.variacao)}.` : `⚠ Divergência de ${sinal(c.diferenca)} OS.`),
          el('ul', { class: 'concil-notas' },
            r.temCanc ? null : el('li', { text: `A atualização de ${br(r.b)} não traz a lista das canceladas: as que saíram por cancelamento estão em "sumiram".` }),
            el('li', {}, 'Sem sair da carteira: ', ...[['liberadas', 'liberadas'], ['voltaram', 'voltaram a aguardar'], ['datas', 'mudaram de data']].flatMap(([k, rot], ix) =>
              [ix ? ' · ' : '', n(k) ? el('button', { type: 'button', class: 'concil-ver', text: `${nf.format(n(k))} ${rot}`, on: { click: ver(k) } }) : `0 ${rot}`])),
            el('li', {}, 'Fora da conta (não estavam em aberto): ', ...[['novasEnc', 'entraram já encerradas'], ['sumEnc', 'encerradas que sumiram'], ['novasAntigas', 'das novas, com abertura de antes']].flatMap(([k, rot], ix) =>
              [ix ? ' · ' : '', n(k) ? el('button', { type: 'button', class: 'concil-ver', text: `${nf.format(n(k))} ${rot}`, on: { click: ver(k) } }) : `0 ${rot}`])))),
        el('div', {}, el('h3', { class: 'kpis-tit', text: `O backlog de ${br(rr.dia)}: registrado × refeito` }),
          el('table', { class: 'concil' }, el('tbody', {},
            linConta(`Registrado na atualização de ${br(rr.dia)}`, nf.format(rr.registrado)),
            linCat('−', 'rEncDia', 'menos'), linCat('−', 'rEncAntes', 'menos'), linCat('−', 'rSum', 'menos'), linCat('−', 'rSaiuOutras', 'menos'),
            linCat('+', 'rAbDia', 'mais'), linCat('+', 'rInc', 'mais'), linCat('+', 'rReab', 'mais'), linCat('+', 'rEntrouOutras', 'mais'),
            linConta(`= Refeito hoje com a atualização de ${br(rr.baseH)}`, nf.format(rr.reconstruido), 'soma'))),
          el('p', { class: 'concil-res ' + (fechaR ? (rr.diferenca ? 'ruim' : 'bom') : 'ruim') }, !fechaR ? '⚠ A conta não fecha: verifique as OS acima.'
            : rr.diferenca ? `⚠ Divergência de ${sinal(rr.diferenca)} OS entre o que o painel mostrou em ${br(rr.dia)} e o que se refaz hoje — explicada OS por OS acima.`
              : '✓ O que o painel mostrou naquele dia é o mesmo que se refaz hoje.'),
          el('ul', { class: 'concil-notas' }, el('li', { text: 'Registrado: as OS em aberto naquele dia segundo a cópia daquele dia. Refeito: as OS em aberto naquele dia segundo as datas da cópia mais nova.' })))));
      if (au.cat && CAT[au.cat]) {
        const [rot, l] = CAT[au.cat];
        const doPainel = new Map(OS.map((o) => [IND.chaveOS(o.filial, o.os), o]));
        const caixaT = el('div', { class: 'tab' });
        filhos.push(el('div', { class: 'aud-cat' }, el('div', { class: 'cab' }, el('div', {}, el('h3', { text: `${rot} · ${plural(l.length, 'OS', 'OS')}` })),
          el('div', { class: 'acoes' }, el('button', { type: 'button', class: 'botao mini', text: 'Fechar', on: { click: ver(au.cat) } }))), caixaT));
        tabela(caixaT, { id: 'aud-cat', linhas: l, lim: 300, padrao: { k: 'os', dir: 'asc' }, aoClicar: (o) => { const x = doPainel.get(IND.chaveOS(o.filial, o.os)); if (x) abrirDetalhe(x); },
          cols: [{ k: 'os', rot: 'OS', ord: (o) => o.os, ver: (o) => o.os }, { k: 'frota', rot: 'Frota', ord: (o) => o.frota, ver: (o) => o.frota },
            { k: 'ab', rot: 'Abertura', ord: (o) => o.abertura || '', ver: (o) => (o.abertura ? br(o.abertura) : '—') },
            { k: 'fim', rot: 'Fim', ord: (o) => o.fim || '', ver: (o) => (o.fim ? br(o.fim) : '—') },
            { k: 'sit', rot: 'Situação', ord: (o) => o.sit, ver: (o) => ({ A: 'Liberada', P: 'Não liberada', F: 'Encerrada' }[o.sit] || o.sit) },
            ...(au.cat === 'datas' ? [{ k: 'antes', rot: 'Antes', ord: (o) => (o.antes ? o.antes.abertura + o.antes.fim : ''), ver: (o) => (o.antes ? `abertura ${o.antes.abertura ? br(o.antes.abertura) : '—'} · fim ${o.antes.fim ? br(o.antes.fim) : '—'}` : '') }] : [])] });
      }
    }
    caixa.replaceChildren(...filhos.filter(Boolean));
  }

  /** O histórico das atualizações: o índice (uma linha por gravação) e as cópias guardadas. */
  function desenharHistorico(caixa, cab) {
    const au = V.aud;
    const nota = 'Uma linha por atualização com o Protheus: o que o painel registrou naquele dia';
    if (!fontes || au.imp === null || au.imp === 'carregando') return caixa.replaceChildren(cab('Histórico das atualizações', nota), el('p', { class: 'nota', text: fontes ? 'Lendo o histórico…' : 'O histórico não está disponível aqui.' }));
    const dias = Array.isArray(au.dias) ? au.dias : [];
    const l = au.imp;
    const caixaT = el('div', { class: 'tab' });
    caixa.replaceChildren(cab('Histórico das atualizações', nota),
      dias.length ? el('p', { class: 'nota', text: `Cópias guardadas: ${dias.map(br).join(' · ')}` }) : null,
      l.length ? caixaT : el('p', { class: 'nota', text: 'O registro começa na próxima atualização com o Protheus (cada uma grava a sua linha). As cópias guardadas acima já podem ser comparadas.' }));
    if (!l.length) return;
    const num = (k, rot) => ({ k, rot, num: true, ord: (x) => (x[k] == null ? -1 : x[k]), ver: (x) => (x[k] == null ? '—' : nf.format(x[k])) });
    tabela(caixaT, { id: 'aud-hist', linhas: [...l].reverse(), padrao: { k: 'base', dir: 'desc' },
      cols: [{ k: 'base', rot: 'Export de', ord: (x) => x.base, ver: (x) => br(x.base) }, { k: 'gerado', rot: 'Gravado em', ord: (x) => x.gerado_em || '', ver: (x) => (x.gerado_em ? dataHora(x.gerado_em) : '—') },
        num('total', 'OS'), num('abertas', 'Em aberto'), num('liberadas', 'Liberadas'), num('aguardando', 'Aguardando'), num('encerradas', 'Encerradas'), num('canceladas', 'Canceladas'),
        { k: 'desde', rot: 'Comparada com', ord: (x) => x.desde || '', ver: (x) => (x.desde ? br(x.desde) : '—') },
        num('novas', 'Novas'), num('fecharam', 'Encerraram'), num('reabertas', 'Reabertas'), num('sumiramAbertas', 'Sumiram')] });
  }

  // ── Não liberadas: as OS abertas no Protheus que ainda aguardam liberação (05/11/2026) ──
  // Todas, de qualquer data; os filtros da barra valem, menos a Situação (a aba já é ela). A idade conta da
  // abertura, numa cor só, do claro ao escuro. As liberadas vêm da data de liberação da STJ.
  const FAIXAS_P = [{ k: 'f0', nome: 'Até 30 dias', cor: 'var(--pend1)', texto: 'tema' }, { k: 'f1', nome: '31 a 90 dias', cor: 'var(--pend2)', texto: 'escuro' },
    { k: 'f2', nome: 'Mais de 90 dias', cor: 'var(--pend3)', texto: 'inv' }];
  const faixaP = (o) => (o.dias == null || o.dias <= 30 ? 0 : o.dias <= 90 ? 1 : 2);
  function desenharPendentes() {
    const raiz = $('#pendentes');
    const S = semSituacao();
    const pend = S.abertas.filter((o) => o.sit === 'P');
    const n = pend.length, nAb = S.abertas.length;
    const v90 = pend.filter((o) => faixaP(o) === 2).length;
    const dias = pend.map((o) => o.dias).filter((d) => d != null);
    const mediana = dias.length ? Math.round(d3.median(dias)) : null;
    const maisAntiga = pend.reduce((m, o) => (o.abertura && (!m || o.abertura < m) ? o.abertura : m), '');
    const frotasP = new Set(pend.map((o) => o.frota));
    const sem0 = periodoDe('semana', D.base), semAnt = periodoDe('semana', andar('semana', D.base, -1));
    const libEm = (de, ate) => S.todas.filter((o) => o.liberada && o.liberada >= de && o.liberada <= ate).length;
    const verLib = (de, ate) => aplicar(() => { F.r.lib = { de, ate }; F.sit.clear(); }, 'carteira');
    const k = (rot, val, pe, cor, cls, fazer) => el(fazer ? 'button' : 'div', { class: 'kpi', type: fazer ? 'button' : null, on: fazer ? { click: fazer } : {} },
      el('span', { class: 'rot' }, cor ? el('i', { class: 'ponto', style: 'background:' + cor }) : null, rot), el('span', { class: 'val ' + (cls || ''), text: val }), el('span', { class: 'pe', text: pe }));
    const topo = el('article', { class: 'cartao c12' },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'OS não liberadas' }),
        el('p', { class: 'nota', text: 'Aguardando liberação no Protheus (situação Pendente), de qualquer data' })), el('div', { class: 'acoes' })),
      el('div', { class: 'kpis mini pend-kpis' },
        k('Aguardando liberação', nf.format(n), `em ${plural(frotasP.size, 'frota', 'frotas')} · ${nAb ? pc.format(n / nAb) : '—'} das abertas`, COR.P),
        k('Há mais de 90 dias', nf.format(v90), n ? `${pc.format(v90 / n)} das não liberadas` : '—', 'var(--pend3)', v90 ? 'ruim' : '',
          v90 ? () => aplicar(() => { F.r.dias = { de: '91', ate: '' }; }) : null),
        k('Esperando há', mediana == null ? '—' : plural(mediana, 'dia', 'dias'), mediana == null ? '' : `metade espera mais que isso · a mais antiga é de ${br(maisAntiga)}`),
        k('Liberadas nesta semana', nf.format(libEm(sem0.de, sem0.ate)), `${dm(sem0.de)} a ${dm(sem0.ate)} · na anterior: ${nf.format(libEm(semAnt.de, semAnt.ate))}`, COR.A, '',
          () => verLib(sem0.de, sem0.ate))));
    // por frota, pela idade
    const pf = new Map();
    for (const o of pend) {
      if (!pf.has(o.frota)) pf.set(o.frota, { chave: o.frota, frota: o.frota, nome: o.frota + (eqDe.get(o.frota) ? ' · ' + eqDe.get(o.frota) : ''), f0: 0, f1: 0, f2: 0 });
      pf.get(o.frota)['f' + faixaP(o)]++;
    }
    const totP = (l) => l.f0 + l.f1 + l.f2;
    const linF = [...pf.values()].sort((a, b) => totP(b) - totP(a) || b.f2 - a.f2 || a.frota.localeCompare(b.frota, 'pt', { numeric: true }));
    const gF = el('div', { class: 'graf rolar-x' }), notaF = el('p', { class: 'nota' });
    const cF = el('article', { class: 'cartao c12', 'data-imagem': true },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Não liberadas por frota' }), notaF), el('div', { class: 'acoes' })),
      el('div', { class: 'legenda' }, ...FAIXAS_P.map((p) => el('span', {}, el('i', { style: 'background:' + p.cor }), p.nome)), el('span', { text: 'há quanto tempo estão abertas' })), gF);
    // as liberadas por semana (ou por mês), pela data de liberação
    const { b, unid } = baldes(S.p);
    const lb = b.map((x) => ({ ...x, n: 0 }));
    for (const o of S.todas) if (o.liberada && o.liberada >= S.p.desde && o.liberada <= S.p.ate) { const x = achaBalde(lb, o.liberada); if (x) x.n++; }
    const totLib = d3.sum(lb, (x) => x.n);
    const gL = el('div', { class: 'graf rolar-x' });
    const cL = el('article', { class: 'cartao c8', 'data-imagem': true },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: `OS liberadas por ${unid}` }),
        el('p', { class: 'nota', text: `Pela data de liberação no Protheus · ${S.p.rot.toLowerCase()}: ${plural(totLib, 'liberada', 'liberadas')}` })), el('div', { class: 'acoes' })), gL);
    // do que se trata: categoria, tipo e quem fecha, com um trilho proporcional
    const fato = (rot, v, cor, fazer) => el('button', { type: 'button', class: 'fato', on: { click: fazer } }, el('span', { text: rot }),
      el('b', {}, nf.format(v), el('small', { text: n ? pc.format(v / n) : '—' })), el('i', { style: `--p:${n ? ((100 * v) / n).toFixed(1) : 0}%;--c:${cor}` }));
    const conta = (f) => pend.filter(f).length;
    const bloco = (tit, itens) => { const l = itens.filter((x) => x[1]); return l.length ? el('div', {}, el('h3', { text: tit }), ...l.map((x) => fato(...x))) : null; };
    const cFatos = el('article', { class: 'cartao c4' },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Do que se trata' }))),
      n ? el('div', { class: 'fatos' },
        bloco('Categoria no Protheus', ['P', 'N', 'O', 'S'].map((c) => [CLASSE[c], conta((o) => o.classe === c), COR_CLASSE[c], () => aplicar(() => escolhe('prog', c))])),
        bloco('Tipo', ['Corretiva', 'Preventiva'].map((tp) => [tp, conta((o) => o.tipo === tp), 'var(--pend2)', () => aplicar(() => escolhe('tipo', tp))])),
        bloco('Quem fecha (mão de obra na STL)', ['I', 'T', 'S'].map((g) => [GRUPO[g], conta((o) => o.grupo === g), 'var(--pend2)', () => aplicar(() => escolhe('exec', 'g:' + g))]))) :
        el('div', { class: 'vazio', text: 'Nenhuma OS aguardando liberação com estes filtros.' }));
    const lista = el('article', { class: 'cartao c12' });
    raiz.replaceChildren(el('div', { class: 'grade' }, topo, cF, cL, cFatos, lista));
    prepararImagem(cF);
    prepararImagem(cL);
    const TINTA_P = { claro: '#ffffff', escuro: '#1f2937', tema: 'var(--texto)', inv: 'var(--papel)' };
    const rola = barrasBacklog(gF, { linhas: linF.map((l) => ({ ...l, rot: l.frota })), partes: FAIXAS_P.map((q) => ({ ...q, tinta: TINTA_P[q.texto] })), titulo: 'Não liberadas por frota',
      limite: 15, chave: 'pend', quem: ['frota', 'frotas'], sub: (l) => eqDe.get(l.frota) || '',
      dica: (l) => [['Não liberadas', nf.format(totP(l))], ...FAIXAS_P.map((p) => [p.nome, nf.format(l[p.k]), p.cor])],
      aoClicar: (l) => aplicar(() => escolhe('frota', l.chave)) });
    notaF.textContent = n ? `${plural(n, 'OS', 'OS')} em ${plural(linF.length, 'frota', 'frotas')}` + (rola ? ' · role para o lado' : '') : '';
    colunasEmPe(gL, { linhas: lb, partes: [{ k: 'n', nome: 'Liberadas', cor: COR.A }], titulo: `OS liberadas por ${unid}`, H: 250, passoMin: 40, passoMax: 80, bwMax: 28,
      nomes: (l) => ({ fortes: [l.rot], fracos: [unid === 'semana' ? dm(l.de) : ''] }),
      dica: (l) => [['Liberadas', nf.format(l.n), COR.A]], marcado: (l) => l.de <= D.base && D.base <= l.ate, aoClicar: (l) => verLib(l.de, l.ate) });
    carteira(lista, pend, pend, { chave: 'pend', titulo: 'As OS não liberadas', semSegm: true,
      nota: `${plural(n, 'OS', 'OS')} aguardando liberação, com os filtros · da mais antiga para a mais nova · escolha as colunas em "Colunas"` });
  }

  // ── Carteira ──
  function desenharCarteira(R) {
    const lista = R.base.filter((o) => casa('sit', o));
    carteira($('#c-carteira'), lista, R.base, { chave: 'carteira', titulo: 'Carteira de OS',
      nota: `Em aberto hoje e encerradas no período (${R.p.rot.toLowerCase()}) · ${plural(lista.length, 'OS', 'OS')} com os filtros · escolha as colunas em "Colunas"` });
    $('#c-carteira .cab .acoes').prepend(botaoFolha());
  }

  // ── a tabela dos números ──
  // Uma linha por frota (ou por pessoa): o nome, o total e as colunas com os números. Clicar no título de
  // uma coluna ordena por ela; clicar na linha abre a frota (ou a pessoa).
  function tabelaNums(alvo, { id, linhas, nome, partes, totalRot, cols, padrao, aoClicar, vazioTxt = 'Nada com estes filtros.' }) {
    if (!linhas.length) return vazio(alvo, vazioTxt);
    const o = V.ord[id] || (V.ord[id] = { ...padrao });
    const total = (l) => partes.reduce((s, p) => s + (l[p.k] || 0), 0);
    const vDe = Object.fromEntries(cols.filter((c) => c.val).map((c) => [c.k, c.val]));
    const valor = (l, k) => (k === '_tot' ? total(l) : k === '_nome' ? l.chave : vDe[k] ? vDe[k](l) : l[k] || 0);
    const ord = [...linhas].sort((a, b) => {
      const x = valor(a, o.k), y = valor(b, o.k);
      const d = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'pt', { numeric: true });
      return (o.dir === 'asc' ? d : -d) || total(b) - total(a) || String(a.chave).localeCompare(String(b.chave), 'pt', { numeric: true });
    });
    guardarDados(alvo, { titulo: '', cab: [nome.rot, totalRot, ...cols.map((c) => c.rot)],
      linhas: ord.map((l) => [nome.ver(l).filter(Boolean).join(' · '), total(l), ...cols.map((c) => { const v = c.val ? c.val(l) : l[c.k] || 0; return c.fmt ? c.fmt(v) : v; })]) });
    const molde = `minmax(9rem, 1fr) repeat(${cols.length + 1}, minmax(4.2rem, 6.4rem))`;
    const cabeca = (k, rot, esq) => el('button', { type: 'button', class: esq ? 'esq' : null, 'aria-sort': o.k === k ? (o.dir === 'asc' ? 'ascending' : 'descending') : 'none', text: rot,
      title: 'Ordenar por ' + rot.toLowerCase(), on: { click: () => { V.ord[id] = { k, dir: o.k === k && o.dir === 'desc' ? 'asc' : k === '_nome' ? 'asc' : 'desc' }; desenhar(); } } });
    const cab = el('div', { class: 'bt-cab', style: '--bt-cols:' + molde }, cabeca('_nome', nome.rot, true), cabeca('_tot', totalRot), ...cols.map((c) => cabeca(c.k, c.rot)));
    alvo.replaceChildren(el('div', { class: 'bt' }, cab, ...ord.map((l) => {
      const tot = total(l);
      const [principal, sub] = nome.ver(l);
      return el('button', { type: 'button', class: 'bt-lin', style: '--bt-cols:' + molde, on: { click: () => aoClicar(l) } },
        el('span', { class: 'bt-nome' }, el('b', { text: principal }), sub ? el('small', { text: sub }) : null),
        el('span', { class: 'bt-nums' }, el('span', { class: 'bt-n bt-total' + (!tot ? ' zero' : ''), 'data-rot': totalRot, text: nf.format(tot) }), ...cols.map((c) => {
          const v = c.val ? c.val(l) : l[c.k] || 0, extra = c.classe ? c.classe(l) : '';
          return el('span', { class: 'bt-n' + (!v ? ' zero' : c.ruim ? ' ruim' : '') + (extra ? ' ' + extra : ''), 'data-rot': c.rot, text: c.fmt ? c.fmt(v) : nf.format(v) });
        })));
    })));
  }

  // ── Frotas: a carteira de cada frota, da maior para a menor ──
  function desenharFrotas(R) {
    const raiz = $('#frotas');
    const f1 = unicaFrota();
    if (f1) return desenharFicha(raiz, f1, R);
    const naBase = new Set(R.base.map((o) => o.frota));
    const nomes = F.frota.size && !F.neg.has('frota') ? [...F.frota]
      : FROTAS.filter((f) => (D.frotas_lista.includes(f) || naBase.has(f)) && !(F.neg.has('frota') && F.frota.has(f)));
    const m = new Map(nomes.map((f) => [f, { chave: f, frota: f, equip: eqDe.get(f) || '', sub: eqDe.get(f) || '', nome: f + (eqDe.get(f) ? ' · ' + eqDe.get(f) : ''),
      A: 0, P: 0, F: 0, Fant: 0, prog: 0, nprog: 0, v90: 0, sem: 0, venc: 0 }]));
    for (const o of R.base) {
      const x = m.get(o.frota);
      if (!x) continue;
      x[o.sit]++;
      if (o.sit === 'F' && o.abertura < R.p.desde) x.Fant++;
      if (o.sit !== 'F') { if (o.classe === 'P') x.prog++; if (o.classe === 'N') x.nprog++; if (o.faixa === 3) x.v90++; if (o.grupo === 'S') x.sem++; if (o.prevEstado === 'vencida') x.venc++; }
    }
    const linhas = [...m.values()];
    const soma = linhas.reduce((s, x) => s + x.A + x.P, 0);
    const nota = el('p', { class: 'nota' }), graf = el('div', { class: 'graf rolar-x' }), caixa = el('div', { class: 'bt-rolagem' }), ctl = el('div', { class: 'ctl' });
    const cartao = el('article', { class: 'cartao', 'data-imagem': true },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Backlog por frota' }), nota), el('div', { class: 'acoes' }, ctl)),
      el('div', { class: 'legenda' }, ...itensBK()),
      graf);
    raiz.replaceChildren(cartao, el('article', { class: 'cartao' },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Os números de cada frota' }),
        el('p', { class: 'nota', text: `Todas as frotas da lista · encerradas: ${R.p.rot.toLowerCase()}, pela data de fim — inclusive as abertas antes do período, que a STJ exportada por data de abertura não traz` })),
        el('div', { class: 'acoes' }, botaoFolha())),
      caixa));
    prepararImagem(cartao);
    controlesFrota(ctl);
    const comAlgo = ordenaFrotas(linhas.filter((x) => x.A + x.P + x.F));
    const rola = barrasBacklog(graf, { linhas: comAlgo.map((l) => ({ ...l, rot: l.frota, baix: l.F, pend: l.A + l.P })), titulo: 'Backlog por frota', limite: 20, chave: 'frotas', sub: (l) => l.equip,
      dica: (l) => [['Abertas', nf.format(l.A + l.P), COR.A], ['· liberadas para execução', nf.format(l.A)], ['· aguardando liberação', nf.format(l.P)],
        ['Encerradas no período', nf.format(l.F), COR.F], ['· abertas no período', nf.format(l.F - l.Fant)], ['· abertas antes do período', nf.format(l.Fant)],
        ['Há mais de 90 dias', nf.format(l.v90)], ['Programadas', nf.format(l.prog)], ['Não programadas', nf.format(l.nprog)],
        ['Sem executante', nf.format(l.sem)], ['Prevista e vencida', nf.format(l.venc)]],
      aoClicar: (l) => aplicar(() => so('frota', l.frota)) });
    nota.textContent = `${plural(soma, 'pendente', 'pendentes')} (abertas hoje) e ${plural(linhas.reduce((x, l) => x + l.F, 0), 'baixada', 'baixadas')} (${R.p.rot.toLowerCase()}) em ${plural(comAlgo.length, 'frota', 'frotas')}` +
      ` · por ${ORD_FROTA[V.frotaOrd][0].toLowerCase()}` + (rola ? ' · role para o lado' : '');
    tabelaNums(caixa, { id: 'frotas', linhas, totalRot: 'Carteira', padrao: { k: '_tot', dir: 'desc' },
      nome: { rot: 'Frota', ver: (l) => [l.frota, l.equip] },
      partes: [{ k: 'A' }, { k: 'P' }],
      cols: [{ k: 'A', rot: 'Liberadas' }, { k: 'P', rot: 'Pendentes' }, { k: 'v90', rot: '+90 dias', ruim: true }, { k: 'prog', rot: 'Programadas' },
        { k: 'nprog', rot: 'Não programadas' }, { k: 'sem', rot: 'Sem executante' }, { k: 'venc', rot: 'Prevista vencida', ruim: true },
        { k: 'F', rot: 'Encerradas no período' }, { k: 'Fnov', rot: '· abertas no período', val: (l) => l.F - l.Fant }, { k: 'Fant', rot: '· abertas antes' }],
      aoClicar: (l) => aplicar(() => so('frota', l.frota)) });
  }

  function desenharFicha(raiz, f, R) {
    const daF = R.base.filter((o) => o.frota === f), ab = daF.filter((o) => o.sit !== 'F'), fe = daF.filter((o) => o.sit === 'F');
    const lib = ab.filter((o) => o.sit === 'A').length;
    const k = (rot, val, pe, cor, cls = '') => el('div', { class: 'kpi' }, el('span', { class: 'rot' }, cor ? el('i', { class: 'ponto', style: 'background:' + cor }) : null, rot),
      el('span', { class: 'val ' + cls, text: val }), el('span', { class: 'pe', text: pe }));
    const venc = ab.filter((o) => o.prevEstado === 'vencida').length;
    const cab = el('article', { class: 'cartao c12' },
      el('div', { class: 'ficha-cab' }, el('div', {}, el('h2', { text: 'Frota ' + f }), el('p', { text: [eqDe.get(f), 'finalizadas: ' + R.p.rot.toLowerCase()].filter(Boolean).join(' · ') })),
        el('div', { class: 'acoes' }, botaoFolha(f), el('button', { type: 'button', class: 'botao', text: '← Todas as frotas', on: { click: () => aplicar(() => F.frota.clear()) } }))),
      el('div', { class: 'kpis mini' },
        k('Carteira (para fechar)', nf.format(ab.length), `${nf.format(lib)} liberadas · ${nf.format(ab.length - lib)} pendentes`, COR.A),
        k('Encerradas no período', nf.format(fe.length), `${nf.format(fe.filter((o) => o.abertura >= R.p.desde).length)} abertas no período · ${nf.format(fe.filter((o) => o.abertura < R.p.desde).length)} abertas antes`, COR.F),
        k('Programadas para fechar', nf.format(ab.filter((o) => o.classe === 'P').length), `${nf.format(ab.filter((o) => o.classe === 'N').length)} não programadas`, COR.prog),
        k('Há mais de 90 dias', nf.format(ab.filter((o) => o.faixa === 3).length), 'das para fechar', COR.alerta, ab.some((o) => o.faixa === 3) ? 'ruim' : ''),
        k('Prevista e vencida', nf.format(venc), 'data da STL já passou', COR.alerta, venc ? 'ruim' : '')));
    const fluxo = el('article', { class: 'cartao c12', 'data-imagem': true },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Entrada e saída · ' + f }), el('p', { class: 'nota', id: 'nota-ficha-fluxo' })), el('div', { class: 'acoes' })),
      el('div', { class: 'legenda', id: 'leg-ficha-fluxo' }), el('div', { class: 'graf rolar-x', id: 'g-ficha-fluxo' }));
    const cart = el('article', { class: 'cartao c12' });
    raiz.replaceChildren(el('div', { class: 'grade' }, cab, fluxo, cart));
    prepararImagem(fluxo);
    const { b, unid } = baldes(R.p);
    const fl = b.map((x) => ({ ...x, entrou: 0, saiu: 0 }));
    for (const o of R.todas) if (o.frota === f && o.abertura >= R.p.desde && o.abertura <= R.p.ate) { const x = achaBalde(fl, o.abertura); if (x) x.entrou++; }
    for (const o of fe) { const x = achaBalde(fl, IND.saidaDe(o)); if (x) x.saiu++; }
    $('#nota-ficha-fluxo').textContent = `OS da frota abertas e finalizadas em cada ${unid}`;
    legenda('#leg-ficha-fluxo', [['Entraram (abertas)', COR.criadas], ['Saíram (finalizadas)', COR.F]]);
    colunas($('#g-ficha-fluxo'), { grupos: fl, series: [{ k: 'entrou', nome: 'Entraram', cor: COR.criadas }, { k: 'saiu', nome: 'Saíram', cor: COR.F }], H: 200, titulo: 'Entrada e saída da frota', minLarg: 26 });
    carteira(cart, daF.filter((o) => casa('sit', o)), semSituacao().base.filter((o) => o.frota === f), { chave: 'ficha', titulo: 'OS da frota ' + f, nota: 'Para fechar e finalizadas no período, com os filtros', semFrota: true });
  }

  // ── Executantes: o total de OS de cada um e quantas ele ainda tem para fechar ──
  // v8 (05/11/2026): no gráfico, por padrão, só quem apontou mão de obra na STL nos últimos 60 dias (em
  // qualquer OS); os outros ficam numa linha embaixo, com o último dia e as OS para fechar que ainda têm.
  const QUEM_EXEC = [['aponta', 'Quem aponta'], ['todos', 'Todos'], ['princ', 'Principais do PCM']];
  function desenharExecutantes(R) {
    const ab = R.abertas;
    const kp = (rot, n, pe, fazer, cls = '') => el('button', { type: 'button', class: 'kpi', on: { click: fazer } },
      el('span', { class: 'rot', text: rot }), el('span', { class: 'val ' + cls, text: nf.format(n) }), el('span', { class: 'pe', text: pe }));
    const venc = ab.filter((o) => o.grupo === 'I' && o.prevEstado === 'vencida').length;
    const soFora = ab.filter((o) => o.soFora).length;
    $('#kpis-exec').replaceChildren(
      kp('Para fechar com alguém da equipe', ab.filter((o) => o.grupo === 'I').length, 'já programadas para uma pessoa na STL', () => aplicar(() => so('exec', 'g:I'), 'carteira')),
      kp('Com a data prevista vencida', venc, 'a data da mão de obra na STL já passou', () => aplicar(() => { so('exec', 'g:I'); so('prev', 'vencida'); }, 'carteira'), venc ? 'ruim' : ''),
      kp('Terceirizadas', ab.filter((o) => o.grupo === 'T').length, 'OS para fechar de terceiro', () => aplicar(() => so('exec', 'g:T'), 'carteira')),
      kp('Sem executante', ab.filter((o) => o.grupo === 'S').length, 'OS para fechar sem ninguém na STL', () => aplicar(() => so('exec', 'g:S'), 'carteira')),
      ...(ULT ? [kp('Só com quem não aponta', soFora, `ninguém da OS apontou nos últimos ${DIAS_FORA} dias`, () => aplicar(() => so('exec', 'g:X'), 'carteira'), soFora ? 'ruim' : '')] : []));
    const m = new Map();
    for (const o of R.base) for (const q of o.pessoas) {
      if (!m.has(q.nome)) m.set(q.nome, { chave: q.nome, nome: q.nome, abrir: 0, venc: 0, v90: 0, F: 0, horas: 0, hPrev: 0, frotas: new Set() });
      const x = m.get(q.nome);
      if (o.sit === 'F') { x.F++; x.horas += q.h; }
      else { x.abrir++; x.hPrev += q.hp; if (q.prev && q.prev < D.base) x.venc++; if (o.faixa === 3) x.v90++; }
      x.frotas.add(o.frota);
    }
    const todas = [...m.values()].map((x) => ({ ...x, frotas: x.frotas.size, horas: Math.round(x.horas * 10) / 10, hPrev: Math.round(x.hPrev * 10) / 10,
      ult: ultimoDe(x.nome), aponta: aponta(x.nome) }));
    const fora = todas.filter((x) => !x.aponta);
    const modo = !ULT && V.execQuem === 'aponta' ? 'todos' : V.execQuem;
    let linhas = modo === 'aponta' ? todas.filter((x) => x.aponta) : todas;
    if (modo === 'princ') linhas = PRINCIPAIS.map((n) => todas.find((x) => x.nome === n) ||
      { chave: n, nome: n, abrir: 0, venc: 0, v90: 0, F: 0, horas: 0, hPrev: 0, frotas: 0, ult: ultimoDe(n), aponta: aponta(n) });
    $('#exec-quem').replaceChildren(el('div', { class: 'seg', role: 'group', 'aria-label': 'Quem aparece' }, ...QUEM_EXEC.filter(([kk]) => (ULT || kk !== 'aponta') && (PRINCIPAIS.length || kk !== 'princ')).map(([kk, rot]) =>
      el('button', { type: 'button', 'aria-pressed': String(modo === kk), text: rot + (kk === 'aponta' ? ` · ${nf.format(todas.length - fora.length)}` : kk === 'todos' ? ` · ${nf.format(todas.length)}` : ''),
        title: kk === 'aponta' ? `Quem apontou mão de obra na STL nos últimos ${DIAS_FORA} dias, em qualquer OS` : kk === 'todos' ? 'Todos com OS nestes filtros, até quem não aponta mais' : 'Os que o PCM acompanha de perto',
        on: { click: () => { V.execQuem = kk; desenhar(); } } }))));
    const somaAb = linhas.reduce((s, x) => s + x.abrir, 0);
    $('#leg-exec').replaceChildren(...itensBK());
    $('#leg-exec').append(el('span', { text: 'o número no fim é o total de OS da pessoa' }));
    const h = (v) => (v ? nh.format(v) + ' h' : '—');
    const porFechar = [...linhas].sort((a, b) => b.abrir - a.abrir || b.abrir + b.F - a.abrir - a.F || a.nome.localeCompare(b.nome, 'pt'));
    const curto = curtos([...new Set([...todas, ...linhas].map((l) => l.nome))]);
    const rola = barrasBacklog($('#g-exec'), { linhas: porFechar.map((l) => ({ ...l, rot: curto.get(l.nome), baix: l.F, pend: l.abrir })), titulo: 'Backlog por executante',
      limite: 15, chave: 'exec-' + modo, quem: ['pessoa', 'pessoas'], sub: (l) => (l.aponta ? '' : 'não aponta'),
      dica: (l) => [['Para fechar', nf.format(l.abrir), COR.A], ['Finalizadas no período', nf.format(l.F), COR.F], ['Total de OS', nf.format(l.abrir + l.F)],
        ['Prevista e vencida', nf.format(l.venc)], ['Há mais de 90 dias', nf.format(l.v90)], ['Horas previstas (para fechar)', h(l.hPrev)], ['Horas apontadas (finalizadas)', h(l.horas)], ['Frotas', nf.format(l.frotas)],
        ...(ULT ? [['Último apontamento na STL', l.ult ? br(l.ult) : '—']] : [])],
      aoClicar: (l) => aplicar(() => so('exec', l.nome), 'carteira') });
    $('#nota-exec').textContent = `${plural(linhas.length, 'pessoa', 'pessoas')}${modo === 'aponta' ? ` que apontaram nos últimos ${DIAS_FORA} dias` : ''} · ${plural(somaAb, 'OS para fechar', 'OS para fechar')} somando as pessoas · finalizadas: ${R.p.rot.toLowerCase()}` +
      (rola ? ' · role para o lado' : '');
    // quem ficou de fora: o nome, o último dia e as OS para fechar que ainda estão com a pessoa
    const cx = $('#exec-fora');
    cx.hidden = modo !== 'aponta' || !fora.length;
    if (!cx.hidden) {
      const ord = [...fora].sort((a, b) => b.abrir - a.abrir || (b.ult || '').localeCompare(a.ult || '') || a.nome.localeCompare(b.nome, 'pt'));
      cx.replaceChildren(...[
        el('p', {}, `${plural(fora.length, 'pessoa ficou', 'pessoas ficaram')} fora do gráfico: não apontam mão de obra na STL, em nenhuma OS, desde antes de ${br(CORTE)} (${DIAS_FORA} dias) — podem ter saído ou mudado de área.` +
          (soFora ? ` ${plural(soFora, 'OS para fechar está', 'OS para fechar estão')} só com elas.` : '')),
        el('div', { class: 'fora-lista' }, ...ord.map((x) => el('button', { type: 'button', title: `${x.nome} · ${foraTxt(x.nome)} · clique para ver as OS`, on: { click: () => aplicar(() => so('exec', x.nome), 'carteira') } },
          el('span', { text: x.nome }), el('small', { text: x.ult ? 'desde ' + dma(x.ult) : 'sem apontamento' }), x.abrir ? el('b', { text: nf.format(x.abrir) + ' para fechar' }) : null))),
          soFora ? el('button', { type: 'button', class: 'botao mini', text: `Ver as ${plural(soFora, 'OS', 'OS')} só com elas`, on: { click: () => aplicar(() => so('exec', 'g:X'), 'carteira') } }) : null].filter(Boolean));
    }
    tabelaNums($('#t-exec'), { id: 'exec', linhas, totalRot: 'Total de OS', padrao: { k: 'abrir', dir: 'desc' },
      nome: { rot: 'Executante', ver: (l) => [l.nome, [l.frotas ? plural(l.frotas, 'frota', 'frotas') : '', l.aponta ? '' : foraTxt(l.nome)].filter(Boolean).join(' · ')] },
      partes: [{ k: 'abrir' }, { k: 'F' }],
      cols: [{ k: 'abrir', rot: 'Para fechar' }, { k: 'venc', rot: 'Prevista vencida', ruim: true }, { k: 'v90', rot: '+90 dias', ruim: true },
        { k: 'F', rot: 'Finalizadas' }, { k: 'hPrev', rot: 'Horas previstas (para fechar)', fmt: h }, { k: 'horas', rot: 'Horas apontadas (finalizadas)', fmt: h },
        ...(ULT ? [{ k: 'ult', rot: 'Último apontamento', val: (l) => l.ult || '', fmt: (v) => (v ? dma(v) : '—'), classe: (l) => (l.aponta ? '' : 'ruim') }] : [])],
      vazioTxt: 'Ninguém da equipe com OS nestes filtros.',
      aoClicar: (l) => aplicar(() => so('exec', l.nome), 'carteira') });
  }

  // ── baixar: a lista em CSV e o gráfico em PNG ──
  // baixar: no site é o download do próprio navegador (no artefato era o do Claude)
  const downloadsP = Promise.resolve(baixar || null);
  const ICONE_BAIXAR = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v7.5M4.8 7 8 10.2 11.2 7M3 13h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const tratarErro = (e, aviso) => {
    const code = e && e.code;
    aviso.textContent = code === 'declined' ? '' : code === 'rate_limited' ? 'Já há um download esperando resposta. Tente de novo em instantes.'
      : `Não deu para baixar aqui (${code || (e && (e.message || e.name)) || 'erro'}).`;
    if (['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(code)) raiz.querySelectorAll('.baixar, .baixar-csv').forEach((b) => { b.hidden = true; });
  };
  async function baixarCSV(lista, titulo, botao, aviso) {
    botao.disabled = true;
    try {
      const hv = (v) => (v ? String(v).replace('.', ',') : '');
      const linhas = [['OS', 'Filial', 'Frota', 'Equipamento', 'Código do serviço', 'Serviço', 'Categoria', 'Programação', 'Tipo', 'Situação', 'Aberta em', 'Liberada em',
        'Programada para', 'Prevista na STL', 'Início da manutenção', 'Finalizada em', 'Dias', 'Lançada depois (dias)', 'Quem fecha', 'Executantes', 'Especialidade prevista', 'Horas previstas', 'Horas apontadas',
        'Contador', 'Centro de custo', 'Observação'],
        ...lista.map((o) => [o.os, o.filial, o.frota, o.equip, o.servCod, o.servico, o.cat, CLASSE[o.classe], o.tipo, SIT[o.sit], br(o.abertura), br(o.liberada),
          br(o.progEm), br(o.prev), br(o.inicioMan), br(o.fim), o.dias ?? '', o.lancDepois || '', GRUPO[o.grupo], o.quemTxt, o.espTxt, hv(o.hPrev), hv(o.horas), o.contador, o.ccusto, o.obs])];
      const blob = new Blob(['﻿' + linhas.map((l) => l.map(celulaCSV).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const d = await downloadsP;
      if (!d) throw { code: 'unavailable' };
      await d.save({ filename: `${slug(titulo)}-${D.base}.csv`, data: blob });
      aviso.textContent = `Lista salva · ${plural(lista.length, 'OS', 'OS')}.`;
    } catch (e) { tratarErro(e, aviso); } finally { botao.disabled = false; }
  }
  // O gráfico pintado direto no canvas, peça por peça (retângulo, linha, caminho e texto), com as cores já
  // resolvidas pela página. Antes o SVG virava uma imagem por um endereço blob:, que o quadro onde o painel
  // abre no Claude pode bloquear — e aí o botão Imagem não baixava nada.
  function pintarSVG(c, svg) {
    const num = (e, a) => parseFloat(e.getAttribute(a)) || 0;
    const ALINHA = { start: 'left', middle: 'center', end: 'right' };
    const andar = (no, alfa) => {
      for (const e of no.children) {
        const st = getComputedStyle(e);
        if (st.display === 'none' || st.visibility === 'hidden') continue;
        const op = parseFloat(st.opacity), a = alfa * (Number.isNaN(op) ? 1 : op);
        if (!a) continue;
        const tag = e.tagName.toLowerCase();
        const fill = st.fill && st.fill !== 'none' && st.fill !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(st.fill) ? st.fill : null;
        const stroke = st.stroke && st.stroke !== 'none' && !/^rgba\(.*,\s*0\)$/.test(st.stroke) ? st.stroke : null;
        c.save();
        c.globalAlpha = a;
        const m = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)/.exec(e.getAttribute('transform') || '');
        if (m) c.translate(+m[1], +m[2]);
        if (tag === 'g') andar(e, a);
        else if (tag === 'rect' && fill) {
          const x = num(e, 'x'), y = num(e, 'y'), w = num(e, 'width'), h = num(e, 'height'), r = Math.min(num(e, 'rx'), w / 2, h / 2);
          c.fillStyle = fill;
          c.beginPath();
          if (r > 0 && c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
          c.fill();
        } else if (tag === 'line' && stroke) {
          c.strokeStyle = stroke; c.lineWidth = parseFloat(st.strokeWidth) || 1;
          if (st.strokeDasharray && st.strokeDasharray !== 'none') c.setLineDash(st.strokeDasharray.split(/[\s,]+/).map(parseFloat).filter((x) => x >= 0));
          c.beginPath(); c.moveTo(num(e, 'x1'), num(e, 'y1')); c.lineTo(num(e, 'x2'), num(e, 'y2')); c.stroke();
        } else if (tag === 'path' && e.getAttribute('d')) {
          const p = new Path2D(e.getAttribute('d'));
          if (fill) { c.fillStyle = fill; c.fill(p); }
          if (stroke) { c.strokeStyle = stroke; c.lineWidth = parseFloat(st.strokeWidth) || 1; c.stroke(p); }
        } else if (tag === 'text' && fill && e.textContent) {
          const tam = parseFloat(st.fontSize) || 11, dy = e.getAttribute('dy') || '0';
          c.font = `${st.fontWeight} ${tam}px ${st.fontFamily}`;
          c.fillStyle = fill;
          c.textAlign = ALINHA[e.getAttribute('text-anchor') || 'start'] || 'left';
          c.textBaseline = 'alphabetic';
          c.fillText(e.textContent, num(e, 'x'), num(e, 'y') + (dy.endsWith('em') ? parseFloat(dy) * tam : parseFloat(dy) || 0));
        }
        c.restore();
      }
    };
    andar(svg, 1);
  }
  // ── mandar no grupo (10/11/2026): a imagem de um cartão (o título, o período, os filtros, os números em
  // quadros, a legenda e o gráfico), para copiar e colar no WhatsApp, baixar ou compartilhar; e os números ──
  // as cores da página e a fonte do site (o painel herda a dele: não há --fonte; sem fonte válida o canvas
  // escreveria tudo em 10px)
  const corCss = () => { const css = getComputedStyle(raiz.host || document.documentElement); return (v) => (v === '--fonte' ? css.fontFamily || 'sans-serif' : css.getPropertyValue(v).trim()); };
  /** O texto em até `max` linhas que caibam em `larg`; a última, se sobrar, com reticências. */
  function quebrarTxt(c, s, larg, max = 2) {
    const out = [];
    let cur = '';
    for (const w of String(s || '').split(/\s+/).filter(Boolean)) { const t2 = cur ? cur + ' ' + w : w; if (!cur || c.measureText(t2).width <= larg) cur = t2; else { out.push(cur); cur = w; } }
    if (cur) out.push(cur);
    if (out.length > max) { out.length = max; let u = out[max - 1]; while (u.length > 1 && c.measureText(u + '…').width > larg) u = u.slice(0, -1); out[max - 1] = u + '…'; }
    return out;
  }
  const retRedondo = (c, x, y, w, h, r) => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); c.fill(); };
  /** Os números em quadros: `blocos` = [{ tit, itens: [{ rot, val, sub, cor, corVal }] }]. Com `pintar` falso só
   *  mede. Devolve a altura. */
  function quadros(c, cor, blocos, x0, y0, larg, { cols: colsMax = 4, pintar = true } = {}) {
    const f = cor('--fonte'), gap = 10, pq = 12;
    const rc = (v) => (v && v.startsWith('var(') ? cor(v.slice(4, -1)) : v);
    let y = y0;
    for (const b of blocos) {
      if (b.tit) { if (pintar) { c.fillStyle = cor('--fraco'); c.font = `700 12px ${f}`; c.fillText(b.tit.toUpperCase(), x0, y + 12); } y += 24; }
      const cols = Math.max(1, Math.min(colsMax, b.itens.length)), w = (larg - gap * (cols - 1)) / cols;
      for (let i = 0; i < b.itens.length; i += cols) {
        const fila = b.itens.slice(i, i + cols).map((q) => {
          c.font = `600 12px ${f}`;
          const rot = quebrarTxt(c, q.rot, w - pq * 2 - (q.cor ? 15 : 0), 2);
          c.font = `11.5px ${f}`;
          return { q, rot, sub: quebrarTxt(c, q.sub, w - pq * 2, 2) };
        });
        const nR = d3.max(fila, (z) => z.rot.length) || 1, nS = d3.max(fila, (z) => z.sub.length) || 0;
        const h = pq + nR * 15 + 26 + 8 + nS * 14 + pq;
        if (pintar) fila.forEach(({ q, rot, sub }, k) => {
          const x = x0 + k * (w + gap), yVal = y + pq + nR * 15 + 26;
          c.fillStyle = cor('--papel2'); retRedondo(c, x, y, w, h, 10);
          if (q.cor) { c.fillStyle = rc(q.cor); retRedondo(c, x + pq, y + pq + 2, 9, 9, 2); }
          c.fillStyle = cor('--fraco'); c.font = `600 12px ${f}`;
          rot.forEach((l, n) => c.fillText(l, x + pq + (q.cor ? 15 : 0), y + pq + 11 + n * 15));
          c.fillStyle = rc(q.corVal) || cor('--texto'); c.font = `800 26px ${f}`; c.fillText(q.val, x + pq, yVal, w - pq * 2);
          c.fillStyle = cor('--muito-fraco'); c.font = `11.5px ${f}`;
          sub.forEach((l, n) => c.fillText(l, x + pq, yVal + 18 + n * 14));
        });
        y += h + gap;
      }
      y += 4;
    }
    return y - y0;
  }
  /** Os números de um cartão, como estão na tela (nos Indicadores, em grupos). */
  function kpisDoCartao(card) {
    const de = (k) => {
      const v = k.querySelector('.val'), pt = k.querySelector('.ponto');
      return { rot: (k.querySelector('.rot') || k).textContent.trim(), val: v ? v.textContent.trim() : '', sub: ((k.querySelector('.pe') || k.querySelector('.comp') || {}).textContent || '').trim(),
        cor: pt ? getComputedStyle(pt).backgroundColor : null, corVal: v ? getComputedStyle(v).color : null };
    };
    const grupos = [...card.querySelectorAll('.ind-grupo, .kpi-grupo')];
    if (grupos.length) return grupos.map((g) => ({ tit: (g.querySelector('h3') || {}).textContent || '', itens: [...g.querySelectorAll('.kpi')].map(de) }));
    const ks = [...card.querySelectorAll('.kpi')];
    return ks.length ? [{ tit: '', itens: ks.map(de) }] : [];
  }
  /** Um canvas no dobro da tela (nítido no celular), sem passar do que o celular aguenta (16 milhões de pixels). */
  function novaTela(W, H, cor) {
    const tela = document.createElement('canvas'), c = tela.getContext('2d');
    const esc = Math.min(2, Math.sqrt(16e6 / (W * H)));
    tela.width = Math.round(W * esc); tela.height = Math.round(H * esc); c.scale(esc, esc);
    c.fillStyle = cor('--papel'); c.fillRect(0, 0, W, H);
    return { tela, c };
  }
  const paraPNG = (tela) => new Promise((ok, erro) => tela.toBlob((bl) => (bl ? ok(bl) : erro(new Error('sem imagem'))), 'image/png'));
  function cabecalhoImg(c, cor, titulo, subL, pad, W, H) {
    const f = cor('--fonte');
    c.fillStyle = cor('--texto'); c.font = `700 19px ${f}`; c.fillText(titulo, pad, pad + 16, W - pad * 2 - 160);
    c.textAlign = 'right'; c.fillStyle = cor('--alerta-t');
    c.font = `700 12px ${f}`; c.fillText('Data de atualização', W - pad, pad + 6);
    c.font = `800 15px ${f}`; c.fillText(br(D.base), W - pad, pad + 24);
    c.textAlign = 'left';
    c.fillStyle = cor('--muito-fraco'); c.font = `12px ${f}`; subL.forEach((l, i) => c.fillText(l, pad, pad + 38 + i * 16));
    c.font = `11px ${f}`; c.fillText('Painel de OS · Makro', pad, H - 14);
  }
  async function imagemDoCartao(card, { minW = 760 } = {}) {
    const cor = corCss(), f = cor('--fonte');
    const svgs = [...card.querySelectorAll('.graf svg')].filter((x) => x.getClientRects().length);
    const blocos = kpisDoCartao(card);
    // as contas (11/11/2026): cada tabela de conferência com o título, as linhas, o resultado e as notas
    const contas = [...card.querySelectorAll('table.concil')].map((tc) => {
      const pai = tc.parentElement, tit = pai.querySelector('.kpis-tit'), res = pai.querySelector('.concil-res');
      return { tit: tit ? tit.textContent.trim() : '', linhas: [...tc.querySelectorAll('tr')].map((tr) => ({ rot: tr.querySelector('th').textContent.trim(), val: tr.querySelector('td').textContent.trim(), cls: tr.className })),
        res: res ? { txt: res.textContent.trim(), bom: res.classList.contains('bom') } : null, notas: [...pai.querySelectorAll('.concil-notas li')].map((li) => li.textContent.trim()) };
    });
    // a frase do resumo e as tabelas marcadas para a imagem (o comparativo, o histórico)
    const verEl = card.querySelector('.veredito');
    const tabs = [...card.querySelectorAll('table.img-tabela')].filter((tb) => tb.getClientRects().length)
      .map((tb) => [...tb.querySelectorAll('tr')].slice(0, 41).map((tr) => [...tr.children].map((x) => x.textContent.trim().replace(/\s+/g, ' '))));
    if (!svgs.length && !blocos.length && !contas.length && !tabs.length && !verEl) throw new Error('vazio');
    const partes = svgs.map((svg) => { const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal; const sec = svg.closest('.par > div'); return { svg, w: r.width, h: r.height, k: vb && vb.width ? r.width / vb.width : 1, rot: sec && sec !== card.querySelector('.par > div') ? sec.querySelector('h2').textContent.trim() : '' }; });
    const leg = svgs.length ? [...card.querySelectorAll('.legenda > span, .legenda > .leg-tit, .rosca-leg > div')].map((sp) => { const i = sp.querySelector('i'); return [[...sp.children].filter((x) => x !== i).map((x) => x.textContent.trim()).filter(Boolean).join(' · ') || sp.textContent.trim(), i ? getComputedStyle(i).backgroundColor : null]; }) : [];
    const titulo = card.querySelector('h2').textContent.trim();
    // (11/11/2026) toda imagem diz o que é, de quando e com que filtros: a nota do cartão, o período e os filtros
    const quando = card.querySelector('.pg-rot'), notaC = card.querySelector('.cab .nota');
    const sub = [notaC ? notaC.textContent.trim() : '', 'Período: ' + (quando ? quando.textContent.trim() : periodoSel().rot), filtrosTxt() || 'sem filtros',
      'Protheus de ' + br(D.base)].filter(Boolean).join(' · ');
    const med = document.createElement('canvas').getContext('2d');
    const colW = tabs.map((rows) => { const w = []; rows.forEach((r, ri) => r.forEach((x, j) => { med.font = `${ri ? 400 : 700} 12px ${f}`; w[j] = Math.max(w[j] || 0, med.measureText(x).width + 18); })); return w; });
    const pad = 28, larg = Math.max(0, ...partes.map((p) => p.w), ...colW.map((w) => d3.sum(w))), W = Math.ceil(Math.max(minW, larg + pad * 2));
    const colsQ = W >= 900 ? 5 : W >= 640 ? 4 : 2;
    med.font = `12px ${f}`;
    const subL = quebrarTxt(med, sub, W - pad * 2, 4);
    med.font = `700 13px ${f}`;
    const verL = verEl ? quebrarTxt(med, verEl.textContent.trim(), W - pad * 2 - 24, 4) : [];
    med.font = `12px ${f}`;
    const linhasLeg = []; let atual = [], x = 0;
    for (const [nome, cl] of leg) { const w = (cl ? 16 : 0) + med.measureText(nome).width + 18; if (x + w > W - pad * 2 && atual.length) { linhasLeg.push(atual); atual = []; x = 0; } atual.push([nome, cl, x]); x += w; }
    if (atual.length) linhasLeg.push(atual);
    const yV = pad + 38 + subL.length * 16, hV = verL.length ? verL.length * 18 + 22 : 0;
    const yQ = yV + hV;
    const hQ = blocos.length ? quadros(med, cor, blocos, pad, yQ, W - pad * 2, { pintar: false, cols: colsQ }) : 0;
    for (const k of contas) k.notasL = k.notas.flatMap((n) => quebrarTxt(med, '• ' + n, W - pad * 2, 4));
    const hConta = contas.reduce((h, k) => h + (k.tit ? 28 : 0) + k.linhas.length * 30 + (k.res ? 46 : 0) + k.notasL.length * 17 + 14, 0);
    const hTabs = tabs.reduce((h, rows) => h + rows.length * 24 + 12, 0);
    const yLeg = yQ + hQ + (blocos.length ? 4 : 0) + hConta + hTabs, y0 = yLeg + linhasLeg.length * 20 + (linhasLeg.length ? 12 : 0);
    const H = Math.ceil(y0 + partes.reduce((s2, p) => s2 + p.h + 12 + (p.rot ? 30 : 0), 0) + 36);
    const { tela, c } = novaTela(W, H, cor);
    cabecalhoImg(c, cor, titulo, subL, pad, W, H);
    if (verL.length) {
      const bom = verEl.classList.contains('bom'), ruim = verEl.classList.contains('ruim');
      c.fillStyle = cor(bom ? '--finalizada-f' : ruim ? '--alerta-f' : '--papel2'); retRedondo(c, pad, yV, W - pad * 2, hV - 10, 8);
      c.fillStyle = cor(bom ? '--finalizada-t' : ruim ? '--alerta-t' : '--texto'); c.font = `700 13px ${f}`;
      verL.forEach((l, ix) => c.fillText(l, pad + 12, yV + 20 + ix * 18));
    }
    if (blocos.length) quadros(c, cor, blocos, pad, yQ, W - pad * 2, { cols: colsQ });
    let yc = yQ + hQ + (blocos.length ? 4 : 0);
    for (const { tit, linhas: conta, res, notasL } of contas) {
      if (tit) { c.fillStyle = cor('--fraco'); c.font = `700 12px ${f}`; c.fillText(tit.toUpperCase(), pad, yc + 18); yc += 28; }
      for (const l of conta) {
        const forte = /soma|achado/.test(l.cls);
        c.fillStyle = cor(forte ? '--texto' : '--fraco'); c.font = `${forte ? 700 : 400} 13px ${f}`; c.fillText(l.rot, pad, yc + 19);
        c.fillStyle = cor(/mais/.test(l.cls) ? '--liberada-t' : /menos/.test(l.cls) ? '--finalizada-t' : '--texto'); c.font = `700 14px ${f}`;
        c.textAlign = 'right'; c.fillText(l.val, W - pad, yc + 19); c.textAlign = 'left';
        c.fillStyle = cor('--linha'); c.fillRect(pad, yc + 29, W - pad * 2, /soma/.test(l.cls) ? 2 : 1);
        yc += 30;
      }
      if (res) {
        c.fillStyle = cor(res.bom ? '--finalizada-f' : '--alerta-f'); retRedondo(c, pad, yc + 8, W - pad * 2, 30, 8);
        c.fillStyle = cor(res.bom ? '--finalizada-t' : '--alerta-t'); c.font = `700 13px ${f}`; c.fillText(quebrarTxt(c, res.txt, W - pad * 2 - 24, 1)[0] || '', pad + 12, yc + 28);
        yc += 46;
      }
      c.fillStyle = cor('--fraco'); c.font = `12px ${f}`;
      for (const l of notasL) { c.fillText(l, pad, yc + 13); yc += 17; }
      yc += 14;
    }
    tabs.forEach((rows, ti) => {
      const w = colW[ti];
      rows.forEach((r, ri) => {
        let x = pad;
        r.forEach((cel, j) => {
          c.font = `${ri ? 400 : 700} 12px ${f}`; c.fillStyle = cor(ri ? (j ? '--texto' : '--fraco') : '--fraco');
          if (j) { c.textAlign = 'right'; c.fillText(cel, x + w[j] - 6, yc + 16); c.textAlign = 'left'; } else c.fillText(cel, x, yc + 16);
          x += w[j];
        });
        c.fillStyle = cor('--linha'); c.fillRect(pad, yc + 23, d3.sum(w), 1);
        yc += 24;
      });
      yc += 12;
    });
    c.font = `12px ${f}`;
    linhasLeg.forEach((l, i) => { const y = yLeg + i * 20; for (const [nome, cl, lx] of l) { if (cl) { c.fillStyle = cl; c.fillRect(pad + lx, y + 1, 10, 10); } c.fillStyle = cor(cl ? '--fraco' : '--texto'); c.font = `${cl ? 400 : 700} 12px ${f}`; c.fillText(nome, pad + lx + (cl ? 16 : 0), y + 10); } });
    let y = y0;
    for (const p of partes) {
      if (p.rot) { y += 8; c.fillStyle = cor('--texto'); c.font = `700 15px ${f}`; c.fillText(p.rot, pad, y + 12); y += 22; }
      c.save(); c.translate(pad, y); c.scale(p.k, p.k); pintarSVG(c, p.svg); c.restore(); y += p.h + 12;
    }
    return { blob: await paraPNG(tela), nome: `${slug(titulo)}-${D.base}.png`, titulo };
  }

  // copiar a imagem (cola no WhatsApp com Ctrl+V), baixar ou compartilhar (no celular abre o WhatsApp)
  const podeCopiarImagem = () => !!(navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== 'undefined');
  const podeCompartilhar = () => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] })); } catch (e) { return false; } };
  async function usarImagem(como, fazer, aviso, texto = '') {
    aviso.textContent = como === 'copiar' ? 'Copiando…' : 'Gerando a imagem…';
    try {
      if (como === 'copiar') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': fazer().then((r) => r.blob) })]);
        aviso.textContent = 'Imagem copiada: cole no grupo (Ctrl+V).';
        return;
      }
      const r = await fazer();
      if (como === 'compartilhar') {
        await navigator.share({ files: [new File([r.blob], r.nome, { type: 'image/png' })], title: r.titulo, ...(texto ? { text: texto } : {}) });
        aviso.textContent = '';
        return;
      }
      const d = await downloadsP;
      if (!d) throw { code: 'unavailable' };
      await d.save({ filename: r.nome, data: r.blob });
      aviso.textContent = 'Imagem salva.';
    } catch (e) {
      if (e && e.name === 'AbortError') aviso.textContent = '';   // desistiu de compartilhar
      else if (e && e.message === 'vazio') aviso.textContent = 'Este cartão está vazio.';
      else if (como === 'copiar') aviso.textContent = 'O navegador não deixou copiar a imagem: use Baixar imagem.';
      else tratarErro(e, aviso);
    }
  }
  /** Os números de um cartão em planilha (.csv para o Excel): os quadros e o que está por trás de cada gráfico ou tabela. */
  function dadosDoCartao(card) {
    const linhas = [];
    const ks = kpisDoCartao(card);
    if (ks.length) {
      linhas.push(['Indicador', 'Valor', 'Detalhe']);
      for (const b of ks) for (const q of b.itens) linhas.push([b.tit ? `${b.tit}: ${q.rot}` : q.rot, q.val, q.sub]);
    }
    const fontes = [...card.querySelectorAll('[data-dados]')].filter((e2) => e2._dados && e2.getClientRects().length);
    for (const e2 of fontes) {
      const d = e2._dados;
      if (linhas.length) linhas.push([]);
      if (fontes.length > 1 || ks.length) linhas.push([d.titulo || card.querySelector('h2').textContent.trim()]);
      linhas.push(d.cab, ...d.linhas.map((l) => l.map((v) => (typeof v === 'number' && !Number.isInteger(v) ? String(Math.round(v * 10) / 10).replace('.', ',') : v))));
    }
    return linhas;
  }
  async function baixarDados(card, aviso) {
    const linhas = dadosDoCartao(card);
    if (!linhas.length) { aviso.textContent = 'Este cartão está vazio.'; return; }
    const titulo = card.querySelector('h2').textContent.trim();
    const quando = card.querySelector('.pg-rot'), filtros = filtrosTxt();
    const topo = [[titulo], [['Protheus de ' + br(D.base), quando ? quando.textContent.trim() : '', filtros ? 'Filtros: ' + filtros : ''].filter(Boolean).join(' · ')], []];
    try {
      const blob = new Blob(['﻿' + [...topo, ...linhas].map((l) => l.map(celulaCSV).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const d = await downloadsP;
      if (!d) throw { code: 'unavailable' };
      await d.save({ filename: `${slug(titulo)}-${D.base}.csv`, data: blob });
      aviso.textContent = 'Números salvos.';
    } catch (e) { tratarErro(e, aviso); }
  }
  // o menu do Enviar: um aberto por vez; fecha no clique fora e no Esc
  let menuAberto = null;
  const fecharMenu = () => { if (!menuAberto) return; menuAberto.menu.hidden = true; menuAberto.botao.setAttribute('aria-expanded', 'false'); menuAberto = null; };
  ouvir(document, 'pointerdown', (e) => { if (menuAberto && !(e.composedPath ? e.composedPath() : [e.target]).includes(menuAberto.caixa)) fecharMenu(); });
  ouvir(window, 'keydown', (e) => { if (e.key === 'Escape' && menuAberto) { const b = menuAberto.botao; fecharMenu(); b.focus(); } });
  const ICONE_ENVIAR = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 10V2.5M5 5.3 8 2.3l3 3M3.5 8.5V13h9V8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  /** O botão Enviar de um cartão (gráfico, números ou tabela): só aparece o que o cartão tem. */
  function prepararImagem(card) {
    const acoes = card.querySelector('.cab .acoes') || card.querySelector('.acoes');
    if (!acoes || acoes.querySelector('.baixar')) return;
    const aviso = el('span', { class: 'aviso-img', 'aria-live': 'polite' });
    const botao = el('button', { class: 'botao mini baixar', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: 'Mandar no grupo: a imagem ou os números' });
    botao.innerHTML = ICONE_ENVIAR + '<span>Enviar</span>';
    const menu = el('div', { class: 'menu-env', role: 'menu', hidden: true });
    const caixa = el('span', { class: 'env' }, botao, menu);
    const fazer = () => imagemDoCartao(card);
    const item = (rot, sub, fn) => el('button', { type: 'button', role: 'menuitem', on: { click: () => { fecharMenu(); fn(); } } }, el('b', { text: rot }), el('small', { text: sub }));
    botao.addEventListener('click', () => {
      const era = menuAberto && menuAberto.menu === menu;
      fecharMenu();
      if (era) return;
      const temImg = !!card.querySelector('.graf svg, .kpi'), temDados = temImg || !!card.querySelector('[data-dados]');
      menu.replaceChildren(...[
        temImg && podeCopiarImagem() && item('Copiar imagem', 'e colar no grupo (Ctrl+V)', () => usarImagem('copiar', fazer, aviso)),
        temImg && item('Baixar imagem', 'PNG, para mandar depois', () => usarImagem('baixar', fazer, aviso)),
        temImg && podeCompartilhar() && item('Compartilhar…', 'WhatsApp e outros', () => usarImagem('compartilhar', fazer, aviso)),
        temDados && item('Baixar os números', 'planilha para o Excel', () => baixarDados(card, aviso))].filter(Boolean));
      menu.style.left = ''; menu.style.right = '0';
      menu.hidden = false;
      if (menu.getBoundingClientRect().left < 8) { menu.style.right = 'auto'; menu.style.left = '0'; }
      botao.setAttribute('aria-expanded', 'true');
      menuAberto = { menu, botao, caixa };
      const pri = menu.querySelector('button');
      if (pri) pri.focus();
    });
    acoes.append(aviso, caixa);
  }

  // ── o resumo do dia (10/11/2026): o texto pronto para o grupo (com o *negrito* do WhatsApp) e a imagem ──
  function dadosDoResumo() {
    const S = recorte({ sem: 'sit' }), ab = S.abertas;
    const lib = ab.filter((o) => o.sit === 'A').length, pen = ab.length - lib;
    const semEx = ab.filter((o) => o.grupo === 'S').length, v90 = ab.filter((o) => o.faixa === 3).length;
    const dia = contaProg(S.todas, periodoDe('dia', D.base)), sem = contaProg(S.todas, periodoDe('semana', D.base));
    const entrou = (de, ate) => S.todas.filter((o) => o.abertura >= de && o.abertura <= ate).length;
    const eDia = entrou(dia.de, dia.ate), eSem = entrou(sem.de, D.base);
    const filtros = filtrosTxt('sit');
    const agora = new Date(), hojeL = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    const rotDia = (D.base === hojeL ? 'Hoje · ' : 'No dia do export · ') + dia.rot;
    const titulo = 'OS Makro · Protheus de ' + br(D.base);
    const n = (v) => nf.format(v);
    const texto = [`*${titulo}*`, ...(filtros ? [`_Com os filtros: ${filtros}_`] : []), '',
      '*Carteira*',
      `Abertas: *${n(ab.length)}* (${plural(lib, 'liberada', 'liberadas')} · ${n(pen)} aguardando liberação)`,
      `Sem executante: *${n(semEx)}* (${pctDe(semEx, ab.length)})`,
      `Há mais de 90 dias: *${n(v90)}* (${pctDe(v90, ab.length)})`, '',
      `*${rotDia}*`,
      `Programadas: *${n(dia.n)}* · já fechadas: *${n(dia.prazo)}* (${pctDe(dia.prazo, dia.n)})`,
      `Finalizadas: *${n(dia.fin)}* · entraram: *${n(eDia)}*`, '',
      `*${sem.rot}*`,
      `Programadas: *${n(sem.n)}* · já fechadas: *${n(sem.prazo)}* (${pctDe(sem.prazo, sem.n)})` + (sem.semExec ? ` · ${n(sem.semExec)} sem executante não contam` : ''),
      `Finalizadas: *${n(sem.fin)}* (${n(sem.finProg)} da programação · ${n(sem.finFora)} extra programação)`,
      `Entraram: *${n(eSem)}*`].join('\n');
    const ruim = (v) => (v ? 'var(--alerta-t)' : null);
    const blocos = [
      { tit: 'Carteira', itens: [
        { rot: 'Abertas', val: n(ab.length), sub: `${plural(lib, 'liberada', 'liberadas')} · ${n(pen)} aguardando`, cor: COR.A },
        { rot: 'Sem executante', val: n(semEx), sub: pctDe(semEx, ab.length) + ' das abertas', cor: COR.alerta, corVal: ruim(semEx) },
        { rot: 'Há mais de 90 dias', val: n(v90), sub: pctDe(v90, ab.length) + ' das abertas', cor: COR.alerta, corVal: ruim(v90) }] },
      { tit: rotDia, itens: [
        { rot: 'Programadas', val: n(dia.n), sub: `${n(dia.prazo)} já fechadas · ${pctDe(dia.prazo, dia.n)}`, cor: 'var(--fraco)' },
        { rot: 'Finalizadas', val: n(dia.fin), sub: `${n(dia.finProg)} da programação · ${n(dia.finFora)} extra`, cor: COR.F },
        { rot: 'Entraram', val: n(eDia), sub: 'abertas no Protheus', cor: COR.criadas }] },
      { tit: sem.rot, itens: [
        { rot: 'Programadas', val: n(sem.n), sub: `${n(sem.prazo)} já fechadas · ${pctDe(sem.prazo, sem.n)}`, cor: 'var(--fraco)' },
        { rot: 'Finalizadas', val: n(sem.fin), sub: `${n(sem.finProg)} da programação · ${n(sem.finFora)} extra`, cor: COR.F },
        { rot: 'Entraram', val: n(eSem), sub: 'abertas no Protheus', cor: COR.criadas }] }];
    return { titulo, sub: filtros ? 'Com os filtros: ' + filtros : 'Todas as frotas da lista do PCM', texto, blocos };
  }
  async function imagemDoResumo(r) {
    const cor = corCss(), f = cor('--fonte'), W = 760, pad = 28;
    const med = document.createElement('canvas').getContext('2d');
    med.font = `12px ${f}`;
    const subL = quebrarTxt(med, r.sub, W - pad * 2, 3);
    const yQ = pad + 44 + subL.length * 16;
    const H = Math.ceil(yQ + quadros(med, cor, r.blocos, pad, yQ, W - pad * 2, { pintar: false, cols: 3 }) + 30);
    const { tela, c } = novaTela(W, H, cor);
    cabecalhoImg(c, cor, r.titulo, subL, pad, W, H);
    quadros(c, cor, r.blocos, pad, yQ, W - pad * 2, { cols: 3 });
    return { blob: await paraPNG(tela), nome: `resumo-do-dia-${D.base}.png`, titulo: r.titulo };
  }
  function abrirResumo() {
    voltaFoco = focado();
    const r = dadosDoResumo(), fazer = () => imagemDoResumo(r);
    const aviso = el('span', { class: 'aviso-img', 'aria-live': 'polite' });
    const previa = el('img', { class: 'resumo-img', alt: 'A imagem do resumo, para mandar no grupo' });
    const b = (rot, fn, prim = false) => el('button', { type: 'button', class: 'botao' + (prim ? ' prim' : ''), text: rot, on: { click: fn } });
    const copiarTexto = async () => {
      try { await navigator.clipboard.writeText(r.texto); aviso.textContent = 'Texto copiado: cole no grupo.'; }
      catch (e) { aviso.textContent = 'O navegador não deixou copiar: selecione o texto e copie.'; }
    };
    mostrarDetalhe(
      cabDetalhe(el('p', { class: 'det-id', text: 'Para mandar no grupo' }), 'Resumo do dia'),
      el('div', { class: 'resumo-acoes' }, b('Copiar texto', copiarTexto, true),
        podeCopiarImagem() ? b('Copiar imagem', () => usarImagem('copiar', fazer, aviso)) : null,
        b('Baixar imagem', () => usarImagem('baixar', fazer, aviso)),
        podeCompartilhar() ? b('Compartilhar…', () => usarImagem('compartilhar', fazer, aviso, r.texto)) : null, aviso),
      el('pre', { class: 'resumo-txt', text: r.texto }), previa);
    fazer().then((x) => { const u = URL.createObjectURL(x.blob); previa.onload = () => URL.revokeObjectURL(u); previa.src = u; }).catch(() => previa.remove());
  }
  const bResumo = $('#os-resumo');
  if (bResumo) { bResumo.hidden = false; bResumo.addEventListener('click', abrirResumo); }

  // ── o relatório gerencial (11/11/2026): o PDF para os gestores, a imagem para o celular e os dados ──
  // O relatório é o próprio painel: cada aba é desenhada no período e com os filtros da barra, numa largura
  // de página e no tema claro, e os cartões viram imagem (as mesmas do Enviar). O que vai no PDF é o que
  // está na tela; os dados para o Excel saem das mesmas contas (js/os/indicadores.js).
  const REL = [
    ['geral', 'Visão geral', ['#c-resumo', '#c-evolucao', '#c-fluxo', '#c-progfin']],
    ['avanco', 'Avanço do backlog', ['#av-topo', '#av-conferencia', '#av-es', '#av-historico']],
    ['programacao', 'Programação', ['#pg-topo', '#pg-seq']],
    ['indicadores', 'Indicadores', ['#c-ind-kpis', '#c-ind-comp', '#c-ind-ne', '#c-ind-saldo', '#c-ind-taxa', '#c-ader']]];
  const REL_CEL = [['geral', 'Visão geral', ['#c-resumo', '#c-evolucao']], ['avanco', 'Avanço do backlog', ['#av-conferencia']]];
  const quadro = () => new Promise((ok) => requestAnimationFrame(() => ok()));
  const abrirImagem = (blob) => new Promise((ok, erro) => {
    const fr = new FileReader();
    fr.onerror = () => erro(new Error('não leu a imagem'));
    fr.onload = () => { const im = new Image(); im.onload = () => ok({ url: fr.result, w: im.naturalWidth, h: im.naturalHeight, im }); im.onerror = () => erro(new Error('não abriu a imagem')); im.src = fr.result; };
    fr.readAsDataURL(blob);
  });
  /** Desenha cada aba na largura dada, no tema claro, e guarda a imagem de cada cartão; depois volta tudo como estava. */
  async function capturar(lista, largura, aviso, minW = 760) {
    // o tema claro é do site (as cores de base vêm dele): quem abre o painel empresta, só durante a captura
    return temaClaro ? temaClaro(() => capturarJa(lista, largura, aviso, minW)) : capturarJa(lista, largura, aviso, minW);
  }
  async function capturarJa(lista, largura, aviso, minW) {
    const pg = raiz.querySelector('.pg'), abaAntes = V.aba, y = scrollY, larguraAntes = pg.style.maxWidth;
    const out = [];
    pg.style.maxWidth = largura + 'px';
    try {
      for (const [aba, secao, sels] of lista) {
        if (aviso) aviso.textContent = `Montando: ${secao}…`;
        V.aba = aba;
        desenhar();
        await quadro(); await quadro();
        for (const q of sels) {
          const card = raiz.querySelector(q);
          if (!card || !card.getClientRects().length) continue;
          try { const r = await imagemDoCartao(card, { minW }); out.push({ secao, titulo: r.titulo, ...(await abrirImagem(r.blob)) }); }
          catch (e) { if (!(e && e.message === 'vazio')) throw e; }
        }
      }
    } finally {
      pg.style.maxWidth = larguraAntes;
      V.aba = abaAntes;
      desenhar();
      scrollTo({ top: y });
    }
    return out;
  }
  const rotRelatorio = () => {
    const sel = periodoSel();
    return { sel, linhas: [`Período: ${sel.rot}` + (sel.rot.includes('/') ? '' : ` (${br(sel.de)} a ${br(sel.ate)})`),
      `Dados do Protheus de ${br(D.base)}` + (meta && meta.gerado_em ? ` · atualizado em ${dataHora(meta.gerado_em)}` : '') + ' · STJ e STL',
      'Filtros: ' + (filtrosTxt() || 'nenhum (todas as OS das frotas da lista do PCM)'), `Gerado em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`] };
  };
  async function relatorioPDF(botao, aviso) {
    botao.disabled = true;
    try {
      const JsPDF = await libPDF();
      const { sel, linhas } = rotRelatorio();
      const imgs = await capturar(REL, 860, aviso);
      if (!imgs.length) throw new Error('nada para pôr no relatório com estes filtros');
      aviso.textContent = 'Montando o PDF…';
      const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 10, larg = W - M * 2;
      const TINTA = [17, 24, 39], FRACO = [75, 85, 99], MARCA = [37, 99, 235];
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...TINTA);
      doc.text(pdfTxt('Relatório gerencial das OS'), M, 18);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...FRACO);
      let y = 25;
      for (const l of linhas) for (const parte of doc.splitTextToSize(pdfTxt(l), larg)) { doc.text(parte, M, y); y += 5; }
      y += 3;
      let secao = '';
      for (const im of imgs) {
        let w = larg, h = (im.h / im.w) * w;
        if (h > H - 30) { h = H - 30; w = (im.w / im.h) * h; }
        const nova = im.secao !== secao;
        if (y + (nova ? 11 : 0) + h > H - 12) { doc.addPage(); y = 14; }
        if (nova) {
          secao = im.secao;
          doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...MARCA);
          doc.text(pdfTxt(secao), M, y + 4);
          doc.setDrawColor(...MARCA); doc.setLineWidth(0.5); doc.line(M, y + 6.5, W - M, y + 6.5);
          y += 11;
        }
        doc.addImage(im.url, 'PNG', M + (larg - w) / 2, y, w, h, undefined, 'FAST');
        y += h + 5;
      }
      const n = doc.getNumberOfPages();
      for (let pg = 1; pg <= n; pg++) {
        doc.setPage(pg);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 128, 140);
        doc.text(pdfTxt(`Painel de OS · Protheus de ${br(D.base)} · ${sel.rot}`), M, H - 6);
        doc.text(`página ${pg} de ${n}`, W - M, H - 6, { align: 'right' });
      }
      const d = await downloadsP;
      if (!d) throw { code: 'unavailable' };
      await d.save({ filename: `relatorio-os-${slug(sel.rot)}-${D.base}.pdf`, data: doc.output('blob') });
      aviso.textContent = `PDF salvo · ${plural(n, 'página', 'páginas')}.`;
    } catch (e) { tratarErro(e, aviso); } finally { botao.disabled = false; }
  }
  /** A imagem para o celular: o resumo do período, a evolução e a conferência, uma embaixo da outra. */
  async function relatorioImagem(aviso) {
    const { sel } = rotRelatorio();
    const imgs = await capturar(REL_CEL, 430, aviso, 440);
    if (!imgs.length) throw new Error('vazio');
    const larg = Math.max(...imgs.map((x) => x.w)), gap = 24, topo = 64;
    const tela = document.createElement('canvas'), c = tela.getContext('2d');
    tela.width = larg; tela.height = topo + d3.sum(imgs, (x) => x.h) + gap * imgs.length;
    c.fillStyle = '#eef1f6'; c.fillRect(0, 0, tela.width, tela.height);
    c.fillStyle = '#111827'; c.font = `700 30px ${corCss()('--fonte')}`; c.fillText(pdfTxt('Painel de OS').replace(/-/g, '−') + ' · ' + sel.rot, 28, 44);
    let y = topo;
    for (const im of imgs) { c.drawImage(im.im, (larg - im.w) / 2, y); y += im.h + gap; }
    aviso.textContent = '';
    return { blob: await paraPNG(tela), nome: `resumo-os-${slug(sel.rot)}-${D.base}.png`, titulo: 'Painel de OS · ' + sel.rot };
  }
  const pct1 = (v) => (v == null ? '' : String(Math.round(v * 1000) / 10).replace('.', ',') + '%');
  /** Os dados do relatório para o Excel: o resumo, a conferência, a programação, o histórico, o comparativo e as OS do período. */
  function dadosDoRelatorio() {
    const { sel, linhas: cab } = rotRelatorio();
    const todas = semSituacao().todas, base = D.base;
    const mv = IND.movimento(todas, { de: sel.de, ate: sel.ate, base });
    const pa = IND.anterior({ desde: sel.de, ate: sel.ate, base, unidade: sel.unidade });
    const mvA = IND.movimento(todas, { de: pa.desde, ate: pa.ate, base });
    const esc = escSerie(sel), serie = serieCarteira(todas, sel, esc), x = contaProg(todas, sel);
    const k = IND.indicadores(todas, { desde: sel.de, ate: sel.ate, base }), a = IND.indicadores(todas, { desde: pa.desde, ate: pa.ate, base });
    const fim = sel.ate < base ? sel.ate : base;
    const osPer = todas.filter((o) => { const sd = IND.saidaDe(o); return (o.abertura && o.abertura >= sel.de && o.abertura <= fim) || (sd && sd >= sel.de && sd <= fim); });
    const mov = (o) => { const ent = o.abertura >= sel.de, sd = IND.saidaDe(o), saiu = !!sd && sd >= sel.de && sd <= fim; return ent && saiu ? 'Entrou e saiu no período' : ent ? 'Entrou (segue em aberto)' : 'Saiu (do backlog inicial)'; };
    return [['Relatório gerencial das OS'], ...cab.map((l) => [l]), [`Comparado com: ${br(pa.desde)} a ${br(pa.ate)}`], [],
      ['Resumo do período', 'No período', 'No anterior'],
      ['Backlog inicial', mv.inicial, mvA.inicial], ['Novas OS', mv.entradas, mvA.entradas], ['Encerradas', mv.saidas, mvA.saidas],
      ['· do backlog inicial', mv.saidasAntigas, mvA.saidasAntigas], ['· abertas no próprio período', mv.saidasNovas, mvA.saidasNovas],
      ['Backlog final', mv.final, mvA.final], ['Variação', mv.variacao, mvA.variacao], ['Variação %', pct1(mv.variacaoPct), pct1(mvA.variacaoPct)],
      ['Encerradas ÷ novas', pct1(mv.taxaEncerramento), pct1(mvA.taxaEncerramento)], [],
      ['Conferência do backlog', 'OS'], [`Backlog inicial (em aberto em ${br(mv.vespera)})`, mv.inicial], ['+ Novas OS', mv.entradas], ['− Encerradas do backlog inicial', mv.saidasAntigas],
      ['− Encerradas abertas no próprio período', mv.saidasNovas], ['= Backlog final calculado', mv.esperado], [`Backlog final encontrado (em aberto em ${br(mv.ate)})`, mv.final], ['Diferença', mv.diferenca], [],
      ['Programação', 'OS'], ['Programadas', x.n], ['Executadas', x.exec], ['Encerradas', x.prazo + x.depois], ['· no período', x.prazo], ['· depois do período', x.depois],
      ['Pendentes de execução', x.n - x.exec], ['Com data programada, sem executante (não contam)', x.semExec],
      ['Encerradas no período (todas)', x.fin], ['· da programação', x.finProg], ['· extra programação', x.finFora], [],
      [`Histórico · cada ${unidDe(esc)}`, 'De', 'Até', 'Backlog inicial', 'Novas', 'Encerradas', 'Encerradas do inicial', 'Encerradas do período', 'Backlog final', 'Variação', 'Variação %', 'Encerradas ÷ novas'],
      ...serie.map((l) => [l.rot, br(l.de), br(l.ate), l.inicial, l.entradas, l.saidas, l.saidasAntigas, l.saidasNovas, l.final, l.variacao, pct1(l.variacaoPct), pct1(l.taxaEncerramento)]), [],
      ['Comparativo com o período anterior', 'No período', 'No anterior', 'Diferença', 'Variação', 'Leitura'],
      ...comparativoDe(k, a).map((l) => [l.rot, l.v1, l.v0, l.d, l.pct, l.leit]), [],
      ['As OS que entraram ou saíram no período', 'Filial', 'Frota', 'Equipamento', 'Serviço', 'Aberta em', 'Encerrada em', 'Situação hoje', 'No período'],
      ...osPer.sort((p1, p2) => (p1.abertura < p2.abertura ? -1 : 1)).map((o) => [o.os, o.filial, o.frota, o.equip, o.servico, br(o.abertura), br(o.fim), SIT[o.sit], mov(o)])];
  }
  async function relatorioDados(botao, aviso) {
    botao.disabled = true;
    try {
      const linhas = dadosDoRelatorio();
      const blob = new Blob(['﻿' + linhas.map((l) => l.map(celulaCSV).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const d = await downloadsP;
      if (!d) throw { code: 'unavailable' };
      await d.save({ filename: `relatorio-os-${slug(periodoSel().rot)}-${D.base}.csv`, data: blob });
      aviso.textContent = 'Dados salvos (abre no Excel).';
    } catch (e) { tratarErro(e, aviso); } finally { botao.disabled = false; }
  }
  function abrirRelatorio() {
    voltaFoco = focado();
    const { linhas } = rotRelatorio();
    const aviso = el('span', { class: 'aviso-img', 'aria-live': 'polite' });
    const b = (rot, fn, prim = false) => { const bt = el('button', { type: 'button', class: 'botao' + (prim ? ' prim' : ''), text: rot }); bt.addEventListener('click', () => fn(bt)); return bt; };
    const fazerImg = () => relatorioImagem(aviso);
    mostrarDetalhe(
      cabDetalhe(el('p', { class: 'det-id', text: 'Para os gestores' }), 'Relatório gerencial'),
      el('ul', { class: 'rel-info' }, ...linhas.slice(0, 3).map((l) => el('li', { text: l }))),
      el('div', { class: 'resumo-acoes' }, b('Baixar o PDF', (bt) => relatorioPDF(bt, aviso), true),
        b('Baixar a imagem (celular)', () => usarImagem('baixar', fazerImg, aviso)),
        podeCompartilhar() ? b('Compartilhar a imagem…', () => usarImagem('compartilhar', fazerImg, aviso)) : null,
        b('Baixar os dados (Excel)', (bt) => relatorioDados(bt, aviso)), aviso),
      el('p', { class: 'nota', text: 'O PDF leva a Visão geral (o resumo do período, a evolução, entradas e saídas, programadas e encerradas), o Avanço (os números, a conferência do backlog e o histórico), a Programação e os Indicadores (o comparativo e os gráficos) — no período e com os filtros da barra. A imagem para o celular leva o resumo, a evolução e a conferência. Os dados levam as mesmas contas e a lista das OS que entraram ou saíram no período.' }));
  }
  const bRel = $('#os-relatorio');
  if (bRel) { bRel.hidden = false; bRel.addEventListener('click', abrirRelatorio); }
  raiz.querySelectorAll('.cartao[data-imagem]').forEach(prepararImagem);

  // ── a carteira para imprimir (05/11/2026) ──
  // Um PDF A4 deitado, uma frota por página: as OS para fechar (liberadas e aguardando liberação, da mais
  // antiga para a mais nova), as fechadas nos últimos dias (para conferir o fechamento) e colunas em branco
  // para escrever a programação à mão. Os filtros da barra valem, menos a Situação e o período. O gerador
  // de PDF (jsPDF + AutoTable, em vendor/) só carrega quando alguém pede a folha.
  const URL_JSPDF = 'vendor/jspdf.umd.min.js';
  const URL_AUTOTABLE = 'vendor/jspdf.plugin.autotable.min.js';
  let pdfLib = null;
  const carregar = (src) => new Promise((ok, erro) => {
    const sc = document.createElement('script');
    sc.src = src; sc.onload = ok; sc.onerror = () => erro(new Error('não carregou o gerador de PDF'));
    document.head.append(sc);
  });
  const libPDF = () => pdfLib || (pdfLib = carregar(URL_JSPDF).then(() => carregar(URL_AUTOTABLE)).then(() => window.jspdf.jsPDF).catch((e) => { pdfLib = null; throw e; }));
  const ICONE_IMPRIMIR = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6V2.5h7V6M4.5 11.5h-2v-5h11v5h-2M4.5 9.5h7v4h-7z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  const FOLHA = { quais: 'uma', lib: true, pend: true, fech: 7, mao: true, porPag: true };
  function botaoFolha(fixa = '') {
    const b = el('button', { type: 'button', class: 'botao mini', hidden: true, title: 'A carteira em PDF para imprimir: uma frota por página, com espaço para escrever a programação',
      on: { click: () => abrirFolha(fixa) } });
    b.innerHTML = ICONE_IMPRIMIR + '<span>Imprimir carteira</span>';
    downloadsP.then((d) => { if (d) b.hidden = false; });
    return b;
  }
  // o que vai na folha de cada frota
  function folhas(S, frotas) {
    const desde = iso(ref - (FOLHA.fech - 1) * DIA);
    const por = new Map(frotas.map((f) => [f, []]));
    for (const o of S.todas) if (por.has(o.frota)) por.get(o.frota).push(o);
    const antiga = (a, b) => (b.dias || 0) - (a.dias || 0) || a.os.localeCompare(b.os);
    return frotas.map((f) => {
      const l = por.get(f), ab = l.filter((o) => o.sit !== 'F');
      return { f, ab, lib: FOLHA.lib ? ab.filter((o) => o.sit === 'A').sort(antiga) : [], pend: FOLHA.pend ? ab.filter((o) => o.sit === 'P').sort(antiga) : [],
        fech: FOLHA.fech ? l.filter((o) => o.sit === 'F' && IND.saidaDe(o) >= desde && IND.saidaDe(o) <= D.base).sort((a, b) => b.fim.localeCompare(a.fim) || a.os.localeCompare(b.os)) : [] };
    }).filter((x) => x.lib.length + x.pend.length + x.fech.length);
  }
  function abrirFolha(fixa = '') {
    voltaFoco = focado();
    const S = recorte({ sem: 'sit' });
    const uma = fixa || unicaFrota();
    const todasF = FROTAS.filter((f) => S.todas.some((o) => o.frota === f));
    const varias = todasF.length > 1;
    const quais = () => (uma && (FOLHA.quais === 'uma' || !varias) ? [uma] : todasF);
    const conta = {}, resumo = el('p', { class: 'folha-resumo' });
    const aviso = el('span', { class: 'aviso-img', 'aria-live': 'polite' });
    const baixar = el('button', { type: 'button', class: 'botao prim' });
    baixar.innerHTML = ICONE_BAIXAR + '<span>Baixar o PDF</span>';
    const atualizar = () => {
      const fl = folhas(S, quais());
      const n = (k) => d3.sum(fl, (x) => x[k].length);
      // os números ao lado de cada opção contam mesmo desmarcada
      conta.lib.textContent = nf.format(d3.sum(quais(), (f) => S.abertas.filter((o) => o.frota === f && o.sit === 'A').length));
      conta.pend.textContent = nf.format(d3.sum(quais(), (f) => S.abertas.filter((o) => o.frota === f && o.sit === 'P').length));
      const desde = iso(ref - ((FOLHA.fech || 7) - 1) * DIA), set = new Set(quais());
      conta.fech.textContent = nf.format(S.todas.filter((o) => set.has(o.frota) && o.sit === 'F' && IND.saidaDe(o) >= desde && IND.saidaDe(o) <= D.base).length);
      porPag.hidden = quais().length < 2;
      resumo.replaceChildren(fl.length ? el('span', {}, 'Vai sair: ', el('b', { text: plural(fl.length, 'frota', 'frotas') }), `${fl.length > 1 ? (FOLHA.porPag ? ' (uma por página)' : ' (uma embaixo da outra)') : ''} · ${plural(n('lib') + n('pend'), 'OS para fechar', 'OS para fechar')}` +
        (FOLHA.fech ? ` · ${plural(n('fech'), 'fechada', 'fechadas')} nos últimos ${FOLHA.fech} dias` : '') + '.') : 'Nada para imprimir com estas opções.');
      baixar.disabled = !fl.length;
    };
    const marca = (k, rot, sub) => {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = !!FOLHA[k];
      cb.addEventListener('change', () => { FOLHA[k] = cb.checked; atualizar(); });
      if (k !== 'mao' && k !== 'porPag') conta[k] = el('span', { class: 'n' });
      return el('label', { class: 'folha-op' }, cb, el('span', {}, rot, sub ? el('small', { text: sub }) : null), conta[k]);
    };
    const selFech = el('select', { 'aria-label': 'Fechadas nos últimos' }, ...[[0, 'não incluir'], [7, '7 dias'], [15, '15 dias'], [30, '30 dias']].map(([v, rot]) => {
      const o = new Option(rot, String(v)); o.selected = FOLHA.fech === v; return o; }));
    selFech.addEventListener('change', () => { FOLHA.fech = Number(selFech.value); atualizar(); });
    conta.fech = el('span', { class: 'n' });
    const porPag = marca('porPag', 'Uma frota por página', 'desmarque para economizar papel');
    const radio = (v, rot, sub) => {
      const r = el('input', { type: 'radio', name: 'folha-quais' });
      r.checked = FOLHA.quais === v;
      r.addEventListener('change', () => { FOLHA.quais = v; atualizar(); });
      return el('label', { class: 'folha-op' }, r, el('span', {}, rot, sub ? el('small', { text: sub }) : null));
    };
    mostrarDetalhe(
      cabDetalhe(el('p', { class: 'det-id', text: 'PDF · A4 deitado' }), 'Imprimir a carteira'),
      el('p', { class: 'nota', text: `Dados de ${br(D.base)} · valem os filtros da barra, menos situação e período` }),
      el('fieldset', { class: 'folha-grupo' }, el('legend', { text: 'Frotas' }),
        ...(uma && !varias ? [el('p', { class: 'nota', text: `Só a ${uma}${eqDe.get(uma) ? ' · ' + eqDe.get(uma) : ''}` })]
          : uma ? [radio('uma', `Só a ${uma}`, eqDe.get(uma) || ''), radio('todas', 'Todas as frotas com os filtros', 'cada uma com o que tiver para imprimir')]
          : [el('p', { class: 'nota', text: 'Todas as frotas com os filtros (para só algumas, marque no filtro Frota)' })])),
      el('fieldset', { class: 'folha-grupo' }, el('legend', { text: 'O que entra' }),
        marca('lib', 'Liberadas para execução', 'as OS abertas já liberadas'), marca('pend', 'Aguardando liberação', 'situação Pendente no Protheus'),
        el('label', { class: 'folha-op' }, el('span', {}, 'Fechadas nos últimos ', selFech, el('small', { text: 'para conferir o fechamento' })), conta.fech),
        marca('mao', 'Colunas em branco para escrever', 'programar para, executante, feita e observação'), porPag),
      resumo,
      el('div', { class: 'folha-acoes' }, baixar, aviso));
    atualizar();
    baixar.addEventListener('click', () => gerarPDF(folhas(S, quais()), baixar, aviso));
  }
  // o jsPDF escreve com as fontes do próprio PDF (Latin-1): o que não cabe nelas sai da folha
  const pdfTxt = (x) => String(x ?? '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/[^\n\x20-\x7e\xa0-\xff]/g, '');
  const LIG_PDF = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  const nomePDF = (n) => n.split(' ').filter((w) => !LIG_PDF.has(w.toLowerCase())).slice(0, 2).join(' ');
  const quemPDF = (o) => (o.grupo === 'T' ? 'Terceirizada' : o.grupo === 'S' ? '-' : o.pessoas.map((q) => nomePDF(q.nome) + (aponta(q.nome) ? '' : ' (não aponta)')).join(', '));
  async function gerarPDF(lista, botao, aviso) {
    botao.disabled = true;
    aviso.textContent = 'Montando o PDF…';
    try {
      const JsPDF = await libPDF();
      const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 10;
      const mao = FOLHA.mao;
      const agora = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      const TINTA = [17, 24, 39], FRACO = [75, 85, 99], LINHA = [205, 210, 220];
      const SIT_COR = { A: [[231, 239, 255], [29, 78, 216]], P: [[255, 244, 214], [146, 64, 14]] };
      let yFim = 0;
      lista.forEach((fl, i) => {
        const nova = i && (FOLHA.porPag || yFim > H - 62);
        if (nova) doc.addPage();
        const t = !i || nova ? 14 : yFim + 13;      // a linha do título desta frota
        const inicio = doc.getNumberOfPages();
        if (t > 14) { doc.setDrawColor(...LINHA); doc.setLineWidth(0.4); doc.line(M, t - 7, W - M, t - 7); }
        const cab = (cont) => {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(cont ? 10.5 : 16); doc.setTextColor(...TINTA);
          doc.text(pdfTxt(`Carteira de OS · ${fl.f}` + (cont ? ' · continuação' : '')), M, cont ? 9 : t);
          if (cont) return;
          const lib = fl.ab.filter((o) => o.sit === 'A').length, v90 = fl.ab.filter((o) => o.faixa === 3).length;
          doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...FRACO);
          doc.text(pdfTxt([eqDe.get(fl.f), 'Protheus de ' + br(D.base), 'impressa em ' + agora].filter(Boolean).join(' · ')), M, t + 5.5);
          doc.setTextColor(...TINTA);
          doc.text(pdfTxt(`${plural(fl.ab.length, 'OS para fechar', 'OS para fechar')}: ${nf.format(lib)} liberadas · ${nf.format(fl.ab.length - lib)} aguardando liberação · ${nf.format(v90)} há mais de 90 dias`), M, t + 10.5);
          doc.setFontSize(8.5); doc.setTextColor(...FRACO);
          doc.text('Programado por: ______________________', W - M, t - 1, { align: 'right' });
          doc.text('Conferido por: ______________________   Data: ____/____/______', W - M, t + 5.5, { align: 'right' });
        };
        cab(false);
        const ganchos = (fixas) => ({
          didParseCell: (d) => {
            if (d.section === 'head' && d.column.index >= fixas) d.cell.styles.fillColor = [100, 116, 139];
            if (d.section !== 'body' || !d.row.raw || !d.row.raw._o) return;
            const o = d.row.raw._o;
            if (d.column.dataKey === 'sit' && SIT_COR[o.sit]) { d.cell.styles.fillColor = SIT_COR[o.sit][0]; d.cell.styles.textColor = SIT_COR[o.sit][1]; d.cell.styles.fontStyle = 'bold'; }
            if (d.column.dataKey === 'dias' && o.sit !== 'F' && o.dias > 90) { d.cell.styles.textColor = [180, 35, 24]; d.cell.styles.fontStyle = 'bold'; }
          },
          didDrawCell: (d) => {
            if (d.section === 'body' && d.row.raw && d.row.raw._o && d.column.dataKey === 'ok') {
              doc.setDrawColor(100, 116, 139); doc.setLineWidth(0.3);
              doc.rect(d.cell.x + d.cell.width / 2 - 1.9, d.cell.y + 1.8, 3.8, 3.8);
            }
          },
          didDrawPage: () => { if (doc.getCurrentPageInfo().pageNumber > inicio) cab(true); },
        });
        const comum = { theme: 'grid', margin: { top: 14, left: M, right: M, bottom: 12 }, rowPageBreak: 'avoid',
          styles: { font: 'helvetica', fontSize: 7.8, cellPadding: 1.3, lineColor: LINHA, lineWidth: 0.1, textColor: TINTA, valign: 'top', overflow: 'linebreak' },
          headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 7.5, valign: 'middle' } };
        const grupo = (rot, n, cols) => ({ os: { content: pdfTxt(`${rot} · ${nf.format(n)}`), colSpan: cols.length, styles: { fillColor: [241, 243, 247], fontStyle: 'bold', fontSize: 8.2 } } });
        let y = t + 15;
        // as para fechar
        if (fl.lib.length + fl.pend.length) {
          const cols = [{ dataKey: 'os', header: 'OS' }, { dataKey: 'serv', header: 'Serviço e observação' }, { dataKey: 'sit', header: 'Situação' }, { dataKey: 'ab', header: 'Aberta' },
            { dataKey: 'dias', header: 'Dias' }, { dataKey: 'prog', header: 'Program.' }, { dataKey: 'quem', header: 'Quem fecha' },
            ...(mao ? [{ dataKey: 'p1', header: 'Programar p/' }, { dataKey: 'p2', header: 'Executante' }, { dataKey: 'ok', header: 'Feita' }, { dataKey: 'p3', header: 'Observação' }] : [])];
          const larg = mao ? { os: 13, serv: 72, sit: 19, ab: 14, dias: 10, prog: 14, quem: 33, p1: 20, p2: 30, ok: 10, p3: 42 } : { os: 14, serv: 149, sit: 19, ab: 16, dias: 11, prog: 16, quem: 52 };
          const linha = (o) => ({ _o: o, os: o.os, serv: pdfTxt(o.servico + (o.obs ? '\n' + o.obs.slice(0, 130) + (o.obs.length > 130 ? '...' : '') : '')),
            sit: o.sit === 'A' ? 'Liberada' : 'Aguardando', ab: dma(o.abertura), dias: o.dias == null ? '' : String(o.dias),
            prog: o.progEm && o.progEm !== o.abertura ? dma(o.progEm) : '', quem: pdfTxt(quemPDF(o)), p1: '', p2: '', ok: '', p3: '' });
          const corpo = [];
          const dois = fl.lib.length && fl.pend.length;
          if (fl.lib.length) { if (dois) corpo.push(grupo('Liberadas para execução', fl.lib.length, cols)); corpo.push(...fl.lib.map(linha)); }
          if (fl.pend.length) { if (dois) corpo.push(grupo('Aguardando liberação', fl.pend.length, cols)); corpo.push(...fl.pend.map(linha)); }
          doc.autoTable({ ...comum, ...ganchos(7), startY: y, columns: cols, body: corpo,
            columnStyles: Object.fromEntries(Object.entries(larg).map(([k, w]) => [k, { cellWidth: w, ...(k === 'dias' ? { halign: 'right' } : {}), ...(mao && ['p1', 'p2', 'ok', 'p3'].includes(k) ? { minCellHeight: 8 } : {}) }])) });
          y = doc.lastAutoTable.finalY + 6;
        }
        // as fechadas nos últimos dias: para conferir o fechamento
        if (fl.fech.length) {
          if (y > H - 30) { doc.addPage(); cab(true); y = 14; }
          const cols = [{ dataKey: 'os', header: 'OS' }, { dataKey: 'serv', header: 'Serviço' }, { dataKey: 'fim', header: 'Finalizada' }, { dataKey: 'dias', header: 'Levou (dias)' },
            { dataKey: 'quem', header: 'Quem fechou' }, { dataKey: 'h', header: 'Horas apontadas' }, ...(mao ? [{ dataKey: 'ok', header: 'Conferida' }, { dataKey: 'p3', header: 'Observação' }] : [])];
          const larg = mao ? { os: 13, serv: 110, fim: 18, dias: 16, quem: 50, h: 18, ok: 14, p3: 38 } : { os: 14, serv: 150, fim: 20, dias: 18, quem: 55, h: 20 };
          const corpo = [grupo(`Fechadas nos últimos ${FOLHA.fech} dias`, fl.fech.length, cols), ...fl.fech.map((o) => ({ _o: o, os: o.os, serv: pdfTxt(o.servico),
            fim: dma(o.fim), dias: o.dias == null ? '' : String(o.dias), quem: pdfTxt(quemPDF(o)), h: o.horas ? nh.format(o.horas) + ' h' : '-', ok: '', p3: '' }))];
          doc.autoTable({ ...comum, ...ganchos(6), startY: y, columns: cols, body: corpo,
            columnStyles: Object.fromEntries(Object.entries(larg).map(([k, w]) => [k, { cellWidth: w, ...(['dias', 'h'].includes(k) ? { halign: 'right' } : {}) }])) });
          y = doc.lastAutoTable.finalY + 6;
        }
        yFim = y - 6;
      });
      // o rodapé: de quando são os dados e a página
      const n = doc.getNumberOfPages();
      for (let p = 1; p <= n; p++) {
        doc.setPage(p);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 128, 140);
        doc.text(pdfTxt(`Painel de OS · Makro · dados do Protheus de ${br(D.base)} (STJ e STL) · confira no Protheus antes de fechar`), M, H - 6);
        doc.text(`página ${p} de ${n}`, W - M, H - 6, { align: 'right' });
      }
      const blob = doc.output('blob');
      const d = await downloadsP;
      if (!d) throw { code: 'unavailable' };
      await d.save({ filename: `carteira-${lista.length === 1 ? slug(lista[0].f) : lista.length + '-frotas'}-${D.base}.pdf`, data: blob });
      aviso.textContent = `PDF salvo · ${plural(n, 'página', 'páginas')}.`;
    } catch (e) { tratarErro(e, aviso); } finally { botao.disabled = false; }
  }

  // ── o desenho ──
  const DESENHO = { geral: desenharGeral, indicadores: desenharIndicadores, programacao: desenharProg, avanco: desenharAvanco, pendentes: desenharPendentes, carteira: desenharCarteira, frotas: desenharFrotas, executantes: desenharExecutantes,
    auditoria: desenharAuditoria };
  function desenhar() {
    cacheSemSit = null;
    esconderDica();
    sincronizarCampos();
    desenharPills();
    desenharChips();
    for (const a of ABAS) { $('#' + a).hidden = a !== V.aba; const b = $('#aba-' + a); b.setAttribute('aria-selected', String(a === V.aba)); b.classList.toggle('on', a === V.aba); }
    // os números e os gráficos contam todas as situações; a Situação da barra vale para as listas (11/11/2026)
    const R = semSituacao(), Rl = recorte();
    $('#sub').textContent = `${D.base_rotulo || 'Protheus de ' + br(D.base)}` + (meta && meta.gerado_em ? ` · atualizado em ${dataHora(meta.gerado_em)}` : '') +
      ` · ${plural(OS.length, 'OS', 'OS')} da STJ e STL · ${plural(D.frotas_lista.length, 'frota', 'frotas')} da lista do PCM`;
    $('#aviso').hidden = !D.aviso;
    $('#aviso').textContent = D.aviso || '';
    $('#n-carteira').textContent = nf.format(Rl.base.length);
    $('#n-pendentes').textContent = nf.format(semSituacao().abertas.filter((o) => o.sit === 'P').length);
    const f1 = unicaFrota();
    $('#n-frotas').textContent = f1 || (F.frota.size ? (F.neg.has('frota') ? 'sem ' : '') + nf.format(F.frota.size) : '');
    $('#n-frotas').hidden = !F.frota.size;
    DESENHO[V.aba](R);
    fecharMenu();
    raiz.querySelectorAll('.cartao[data-imagem]').forEach(prepararImagem);
  }
  let redim;
  ouvir(window, 'resize', () => { clearTimeout(redim); redim = setTimeout(desenhar, 150); });
  desenhar();
  return { parar: () => { fim.abort(); clearTimeout(redim); clearTimeout(espera); esconderDica(); } };
}
