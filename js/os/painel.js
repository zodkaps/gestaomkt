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
export function iniciarPainel(D, { baixar, raiz = document, aba = '', aoTrocarAba = null } = {}) {
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
    espTxt: a[18] || '', espList: a[18] ? a[18].split('; ') : [], progEm: a[19] || '', quem: [] }));
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
    o.busca = norm([o.os, o.frota, o.servico, o.equip, o.cat, CLASSE[o.classe], o.tipo, o.quemTxt, o.obs, o.servCod, o.ccusto, o.espTxt].join(' '));
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
  const PERIODOS = [
    ['30d', 'Últimos 30 dias', iso(ref - 29 * DIA)],
    ['12s', 'Últimas 12 semanas', iso(segundaDe(ref) - 11 * 7 * DIA)],
    ['mes', MESES[mesBase - 1][0].toUpperCase() + MESES[mesBase - 1].slice(1) + ' de ' + anoBase, D.base.slice(0, 8) + '01'],
    ['mes-1', ((m, a) => MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1) + ' de ' + a)(mesBase === 1 ? 12 : mesBase - 1, mesBase === 1 ? anoBase - 1 : anoBase),
      iso(Date.UTC(mesBase === 1 ? anoBase - 1 : anoBase, (mesBase + 10) % 12, 1)), iso(Date.UTC(anoBase, mesBase - 1, 0))],
    ['ano', 'Em ' + anoBase, anoBase + '-01-01'],
    ['ano-1', 'Em ' + (anoBase - 1), (anoBase - 1) + '-01-01', (anoBase - 1) + '-12-31'],
    ['tudo', 'Todo o histórico (desde ' + MES[Number(primeiraAbertura.slice(5, 7)) - 1] + '/' + primeiraAbertura.slice(2, 4) + ')', primeiraAbertura],
  ].map(([k, rot, desde, ate]) => ({ k, rot, desde, ate: ate || D.base }));

  // ── o estado ──
  // Os filtros se somam: dentro de um filtro vale qualquer um dos marcados (ou, com "Excluir as
  // marcadas", todos menos eles); entre filtros, todos ao mesmo tempo. Na barra, os quatro de todo dia:
  // Frota, Situação, Executante (com "Sem executante" no alto) e Programação; o resto em "Mais
  // filtros", à vista, em grupos (v6, 03/11/2026: o "+ Filtro" da v5 escondia os campos).
  const ABAS = ['geral', 'indicadores', 'programacao', 'avanco', 'pendentes', 'carteira', 'frotas', 'executantes'];
  const MULTI = ['frota', 'sit', 'prog', 'tipo', 'exec', 'esp', 'equip', 'serv', 'ccusto', 'filial', 'idade', 'prev', 'mesAb', 'mesFim', 'lanc'];
  const PRINC = ['frota', 'sit', 'exec', 'prog'];
  const GUARDA_MAIS = 'painel-os-mais-filtros';
  const lerMais = () => { try { return localStorage.getItem(GUARDA_MAIS) === '1'; } catch (e) { return false; } };
  const guardarMais = () => { try { localStorage.setItem(GUARDA_MAIS, V.mais ? '1' : '0'); } catch (e) { /* sem armazenamento */ } };
  const F = { periodo: '12s', per: null, q: '', neg: new Set(), r: {} };
  for (const k of MULTI) F[k] = new Set();
  const V = { aba: ABAS.includes(aba) ? aba : 'geral', ord: {}, cart: {}, execQuem: 'aponta', mais: lerMais(), frotaOrd: 'ab', tudo: {}, regras: false, pg: { esc: 'semana', ref: D.base, por: 'exec' },
    av: { esc: 'semana', ref: D.base, por: 'exec', lista: 'fechou' } };
  // o período livre (09/11/2026): o começo e o fim escolhidos no calendário
  const periodo = () => (F.periodo === 'livre' && F.per
    ? { k: 'livre', rot: F.per.desde === F.per.ate ? 'Em ' + br(F.per.desde) : `De ${br(F.per.desde)} a ${br(F.per.ate)}`, desde: F.per.desde, ate: F.per.ate }
    : PERIODOS.find((p) => p.k === F.periodo) || PERIODOS[1]);
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
    sit: { rot: 'Situação', g: 'A OS', ops: () => [['A', 'Aberta · liberada para execução'], ['P', 'Aberta · aguardando liberação'], ['F', 'Finalizada']].map(([v, rot]) => ({ v, rot, cor: COR[v] })) },
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
    const base = todas.filter((o) => o.sit !== 'F' || (o.fim >= p.desde && o.fim <= p.ate));
    return { p, todas, base, abertas: base.filter((o) => o.sit !== 'F'), fechadas: base.filter((o) => o.sit === 'F') };
  }
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
  function pintarPeriodo() {
    const p = periodo();
    $('#f-periodo-txt').textContent = p.k === 'livre' ? (p.desde === p.ate ? dma(p.desde) : `${dma(p.desde)} a ${dma(p.ate)}`) : p.rot;
    fPer.setAttribute('aria-expanded', String(!!pop && pop.k === 'periodo'));
    fPer.classList.toggle('on', p.k !== '12s');
  }
  let espera;
  fQ.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => { F.q = fQ.value; zerarPaginas(); desenhar(); }, 220); });
  const nomeDe = (k, v) => { const o = DEF[k].ops().find((x) => x.v === v); return o ? o.rot : v; };
  const fmtFx = (k, v) => (FX[k].tipo === 'date' ? br(v) : nh.format(Number(v)) + (FX[k].un ? ' ' + FX[k].un : ''));
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
    const campo = (rot, v) => el('input', { type: 'date', value: v, max: D.base, 'aria-label': 'Finalizadas ' + rot });
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
    popEl.replaceChildren(el('div', { class: 'pop-tit', text: 'Finalizadas em · o período vale para as fechadas; as abertas aparecem todas' }),
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
  const vazio = (caixa, s) => caixa.replaceChildren(el('div', { class: 'vazio', text: s }));

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

  /** Duas colunas por frota, lado a lado: as abertas, empilhadas em liberadas (embaixo) e aguardando liberação,
   *  com o total em cima; e as fechadas no período. A frota e o equipamento embaixo. As que não cabem ficam
   *  para o "Mostrar todas". Devolve se a caixa ficou rolando. */
  function colunasPar(caixa, { linhas: todas, titulo, H = 300, passoMin = 54, passoMax = 96, aoClicar = null, dica = null, limite = 0, chave = '', quem = ['frota', 'frotas'] }) {
    const ab = (l) => l.A + l.P;
    if (!todas.length || !todas.some((l) => ab(l) + l.F)) { vazio(caixa, 'Nada com estes filtros.'); botaoTodas(caixa); return false; }
    const { linhas, corta, nVis } = recortar(todas, caixa, { limite, chave, passoMin });
    const disp = Math.max(caixa.clientWidth || 640, 240);
    const passo = Math.max(passoMin, Math.min(passoMax, (disp - 8) / linhas.length));
    const W = Math.max(disp, Math.ceil(passo * linhas.length + 8));
    const x0 = (W - passo * linhas.length) / 2;
    const svg = d3.create('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', titulo);
    caixa.replaceChildren(svg.node());
    const base = H - 38, topo = 22;
    const sy = d3.scaleLinear([0, d3.max(linhas, (l) => Math.max(ab(l), l.F)) || 1], [base, topo]).nice();
    const bw = Math.min(22, Math.max(8, Math.floor((passo - 12) / 2)));
    for (const v of sy.ticks(4)) if (v) svg.append('line').attr('x1', 0).attr('x2', W).attr('y1', Math.round(sy(v)) + 0.5).attr('y2', Math.round(sy(v)) + 0.5).style('stroke', 'var(--linha)');
    svg.append('line').attr('x1', 0).attr('x2', W).attr('y1', base + 0.5).attr('y2', base + 0.5).style('stroke', 'var(--borda)');
    const med = medidor(svg, 10);
    const cabe = passo - 6;
    const corta2 = (x) => { if (!x || med.w(x) <= cabe) return x; let y = x; while (y.length > 2 && med.w(y + '…') > cabe) y = y.slice(0, -1); return y + '…'; };
    linhas.forEach((l, i) => {
      const cx = x0 + passo * i + passo / 2, xa = cx - bw - 1, xf = cx + 1;
      const g = svg.append('g').attr('class', 'col' + (aoClicar ? ' clica' : ''));
      g.append('rect').attr('x', cx - passo / 2 + 1).attr('width', passo - 2).attr('y', 0).attr('height', H).attr('rx', 6).style('fill', 'transparent');
      if (ab(l)) {
        // as abertas: liberadas embaixo, aguardando liberação em cima, 2px entre as duas
        const hA = l.A ? Math.max(2, base - sy(l.A)) : 0, hT = Math.max(2, base - sy(ab(l)));
        if (l.A) barra(g, xa, base - hA, bw, hA, COR.A, !l.P);
        if (l.P) barra(g, xa, base - hT, bw, Math.max(1, hT - hA - (l.A ? 2 : 0)), COR.P);
        txt(g, xa + bw / 2, base - hT - 9, nf.format(ab(l)), { anchor: 'middle', cor: 'var(--texto)', peso: 700, tam: 11 });
      }
      if (l.F) {
        const h = Math.max(2, base - sy(l.F));
        barra(g, xf, base - h, bw, h, COR.F);
        txt(g, xf + bw / 2, base - h - 9, nf.format(l.F), { anchor: 'middle', cor: 'var(--fraco)', peso: 650, tam: 11 });
      }
      txt(g, cx, base + 14, l.chave, { anchor: 'middle', cor: 'var(--texto)', peso: 650, tam: 11.5 });
      if (l.sub) txt(g, cx, base + 28, corta2(l.sub), { anchor: 'middle', cor: 'var(--muito-fraco)', tam: 10 });
      g.on('mousemove', (ev) => mostrarDica(ev, l.nome, dica ? dica(l) : [['Abertas (para fechar)', nf.format(ab(l)), COR.A], ['Fechadas no período', nf.format(l.F), COR.F]]))
        .on('mouseleave', esconderDica).on('click', () => aoClicar && aoClicar(l));
    });
    med.fim();
    botaoTodas(caixa, { n: todas.length, nVis, chave, quem, corta });
    return W > disp + 1;
  }

  /** A rosca (09/11/2026): parte do todo, com poucas fatias. O total no meio; ao lado, cada fatia com o número
   *  e a porcentagem. 2px de vão entre as fatias, e cada uma (e a linha dela na legenda) se clica para filtrar. */
  function rosca(caixa, fatias, { titulo, sub = 'OS', aoClicar = null, tam = 168 }) {
    const vivas = fatias.filter((f) => f.valor > 0), total = d3.sum(vivas, (f) => f.valor);
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
    const de = (f) => { if (!m.has(f)) m.set(f, { chave: f, frota: f, sub: eqDe.get(f) || '', nome: f + (eqDe.get(f) ? ' · ' + eqDe.get(f) : ''), A: 0, P: 0, F: 0, v90: 0, sem: 0 }); return m.get(f); };
    for (const o of R.base) { const x = de(o.frota); x[o.sit]++; if (o.sit !== 'F') { if (o.faixa === 3) x.v90++; if (o.grupo === 'S') x.sem++; } }
    return [...m.values()];
  }
  const ORD_FROTA = { ab: ['Abertas', (a, b) => b.A + b.P - a.A - a.P || b.F - a.F], fe: ['Fechadas', (a, b) => b.F - a.F || b.A + b.P - a.A - a.P],
    tot: ['Total', (a, b) => b.A + b.P + b.F - a.A - a.P - a.F], frota: ['Frota', () => 0] };
  const ordenaFrotas = (l) => [...l].sort((a, b) => ORD_FROTA[V.frotaOrd][1](a, b) || a.frota.localeCompare(b.frota, 'pt', { numeric: true }));
  const dicaFrota = (R) => (l) => [['Abertas', nf.format(l.A + l.P), COR.A], ['· liberadas para execução', nf.format(l.A)], ['· aguardando liberação', nf.format(l.P)],
    ['Fechadas no período', nf.format(l.F), COR.F], ['Abertas há mais de 90 dias', nf.format(l.v90)], ['Abertas sem executante', nf.format(l.sem)]];
  const LEG_FROTA = [['Abertas: liberadas para execução', COR.A], ['Abertas: aguardando liberação', COR.P], ['Fechadas no período', COR.F]];
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
  const badge = (o) => el('span', { class: 'badge b-' + o.sit, text: o.sit === 'F' ? 'Finalizada' : o.sit === 'P' ? 'Pendente' : 'Liberada', title: SIT[o.sit] });
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
  // v7: a coluna Programada para entra para quem já tinha escolhido as colunas
  try { if (!localStorage.getItem('painel-os-v7-colunas')) { colunasOn.add('progEm'); colunasOn.delete('prev'); localStorage.setItem('painel-os-v7-colunas', '1');
    localStorage.setItem(GUARDA_COLS, JSON.stringify([...colunasOn])); } } catch (e) { colunasOn.add('progEm'); }
  const salvarCols = () => { try { localStorage.setItem(GUARDA_COLS, JSON.stringify([...colunasOn])); } catch (e) { /* sem armazenamento */ } };
  let colunasAbertas = false;

  // os botões de situação no alto da carteira mexem no mesmo filtro da barra
  const SITS = [['todas', 'Todas'], ['abrir', 'Para fechar'], ['A', 'Liberadas'], ['P', 'Pendentes de liberação'], ['F', 'Finalizadas']];
  function carteira(alvo, lista, semSit, { chave, titulo, nota, semFrota = false, semSegm = false }) {
    const est = V.cart[chave] || (V.cart[chave] = { lim: 100 });
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
      ...(semSegm ? [] : [el('div', { class: 'cart-barra' }, segm)]), caixa, pe);
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
    const entrou = R.todas.filter((o) => o.abertura >= R.p.desde && o.abertura <= R.p.ate).length;
    const saldo = entrou - fe.length;
    const v90 = ab.filter((o) => o.faixa === 3).length, sem = ab.filter((o) => o.grupo === 'S').length;
    const { b, unid } = baldes(R.p);
    // a média por semana (ou por mês) pelos dias que já passaram no período — a semana de hoje, ainda
    // pela metade, não conta como uma inteira (revisão de 03/11/2026)
    const diasPer = Math.max(1, Math.round((Math.min(t(R.p.ate), ref) - t(R.p.desde)) / DIA) + 1);
    const porUnid = fe.length / (unid === 'dia' ? diasPer : unid === 'semana' ? diasPer / 7 : diasPer / 30.44);
    const kpi = (rot, val, pe, { cls = '', cor = null, fazer = null, trilho = null } = {}) => el(fazer ? 'button' : 'div', { class: 'kpi', type: fazer ? 'button' : null, on: fazer ? { click: fazer } : {} },
      el('span', { class: 'rot' }, cor ? el('i', { class: 'ponto', style: 'background:' + cor }) : null, rot), el('span', { class: 'val ' + cls, text: val }),
      trilho, el('span', { class: 'pe', text: pe }));
    const trilho = ab.length ? el('span', { class: 'trilho', title: `${nf.format(lib)} liberadas para execução · ${nf.format(pen)} aguardando liberação` },
      el('i', { style: `flex:${lib};background:${COR.A}` }), el('i', { style: `flex:${pen};background:${COR.P}` })) : null;
    const irSit = (...s) => aplicar(() => so('sit', ...s), 'carteira');
    const sem7 = contaProg(recorte({ sem: 'sit' }).todas, periodoDe('semana', D.base));
    $('#kpis').replaceChildren(
      kpi('Abertas agora', nf.format(ab.length), `${nf.format(lib)} liberadas · ${nf.format(pen)} aguardando`, { trilho, fazer: () => irSit('A', 'P') }),
      kpi('Fechadas', nf.format(fe.length), `${R.p.rot.toLowerCase()} · ${nh.format(porUnid)} por ${unid}`, { cor: COR.F, fazer: () => irSit('F') }),
      kpi('Sem executante', nf.format(sem), ab.length ? `${pc.format(sem / ab.length)} das abertas` : '—', { cls: sem ? 'ruim' : '', cor: COR.alerta, fazer: () => aplicar(() => so('exec', 'g:S'), 'carteira') }),
      kpi('Abertas há mais de 90 dias', nf.format(v90), ab.length ? pc.format(v90 / ab.length) + ' das abertas' : '—', { cls: v90 ? 'ruim' : '', cor: COR.alerta, fazer: () => aplicar(() => so('idade', '3'), 'carteira') }),
      kpi('Programadas nesta semana', nf.format(sem7.n), `${nf.format(sem7.prazo)} já fechadas (${sem7.n ? pc.format(sem7.prazo / sem7.n) : '—'})`,
        { cor: 'var(--fraco)', fazer: () => { V.pg = { ...V.pg, esc: 'semana', ref: D.base }; irPara('programacao'); } }));

    // abertas e fechadas por frota, lado a lado (pedido de 03/11/2026)
    const pf = ordenaFrotas(porFrota(R));
    controlesFrota($('#ctl-frotas'));
    legenda('#leg-frotas', LEG_FROTA);
    const rolaF = colunasPar($('#g-frotas'), { linhas: pf, titulo: 'OS abertas e fechadas por frota', dica: dicaFrota(R), limite: 24, chave: 'geral-frotas',
      aoClicar: (l) => aplicar(() => so('frota', l.chave), 'frotas') });
    $('#nota-frotas').textContent = `${plural(ab.length, 'aberta', 'abertas')} e ${plural(fe.length, 'fechada', 'fechadas')} (${R.p.rot.toLowerCase()}) em ${plural(pf.length, 'frota', 'frotas')}` +
      ` · por ${ORD_FROTA[V.frotaOrd][0].toLowerCase()}` + (rolaF ? ' · role para o lado' : '');

    // entrada e saída: o número de cada coluna aparece ao passar o mouse; o saldo vai escrito
    $('#nota-fluxo').textContent = `Por ${unid} · ${R.p.rot.toLowerCase()}: entraram ${nf.format(entrou)} e saíram ${nf.format(fe.length)} — ` +
      (saldo > 0 ? `a carteira cresceu ${nf.format(saldo)}` : saldo < 0 ? `a carteira diminuiu ${nf.format(-saldo)}` : 'a carteira ficou igual');
    legenda('#leg-fluxo', [['Entraram (abertas no Protheus)', COR.criadas], ['Saíram (finalizadas)', COR.F]]);
    const fl = b.map((x) => ({ ...x, entrou: 0, saiu: 0 }));
    for (const o of R.todas) if (o.abertura >= R.p.desde && o.abertura <= R.p.ate) { const x = achaBalde(fl, o.abertura); if (x) x.entrou++; }
    for (const o of fe) { const x = achaBalde(fl, o.fim); if (x) x.saiu++; }
    colunas($('#g-fluxo'), { grupos: fl, series: [{ k: 'entrou', nome: 'Entraram', cor: COR.criadas }, { k: 'saiu', nome: 'Saíram', cor: COR.F }],
      titulo: 'Entrada e saída da carteira', minLarg: 26, numeros: fl.length <= 8 });

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
  function desenharIndicadores(R) {
    const raiz = $('#indicadores');
    const p = { desde: R.p.desde, ate: R.p.ate, base: D.base }, pa = IND.anterior(p);
    const k = IND.indicadores(R.todas, p), a = IND.indicadores(R.todas, pa);
    const nomeAnt = `${dma(pa.desde)} a ${dma(pa.ate)}`;
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
    const sinal = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + nf.format(Math.abs(v));
    // a regra de cada conta fica recolhida: o botão mostra todas de uma vez
    const botaoRegras = () => el('button', { type: 'button', class: 'botao mini', 'aria-pressed': String(V.regras), text: 'Como é calculado',
      on: { click: (e) => { V.regras = !V.regras; raiz.classList.toggle('regras', V.regras); e.currentTarget.setAttribute('aria-pressed', String(V.regras)); } } });
    raiz.classList.toggle('regras', V.regras);
    raiz.replaceChildren(el('div', { class: 'grade' },
      el('article', { class: 'cartao c12' },
        el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Indicadores de PCM' }),
          el('p', { class: 'nota', text: `${R.p.rot} · comparado com ${nomeAnt}` })),
          el('div', { class: 'acoes' }, botaoRegras())),
        grupo('Carteira', 'o que está aberto hoje',
          ind('Carteira (abertas)', nf.format(k.carteira), `liberadas e aguardando liberação · eram ${nf.format(k.noComeco)} no começo do período`,
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
          ind('Aderência à programação', fmtPc(k.aderencia), k.programadas ? `das ${nf.format(k.programadas)} programadas para uma semana que já acabou, ${nf.format(k.cumpridas)} finalizadas até o domingo dela`
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
      cartaoGraf('c-tipo', 'Corretiva e preventiva', 'Fechadas no período', 'c6'),
      cartaoGraf('c-sit', 'Situação das abertas', 'Abertas hoje', 'c6'),
      cartaoGraf('c-tempo', 'Tempo para fechar', `Mediana de dias até fechar, por ${baldes(R.p).unid}`, 'c6'),
      cartaoGraf('c-ader', 'Aderência à programação', `% das programadas que fecharam até o domingo, por ${baldes(R.p).unid}`, 'c6')));
    const fe = R.fechadas, ab = R.abertas;
    rosca($('#g-tipo'), [{ nome: 'Preventiva', valor: fe.filter((o) => o.tipo === 'Preventiva').length, cor: COR.prog, v: 'Preventiva' },
      { nome: 'Corretiva', valor: fe.filter((o) => o.tipo !== 'Preventiva').length, cor: COR.nprog, v: 'Corretiva' }],
      { titulo: 'Corretiva e preventiva', sub: 'fechadas', aoClicar: (f) => aplicar(() => { so('tipo', f.v); so('sit', 'F'); }, 'carteira') });
    rosca($('#g-sit'), [{ nome: 'Liberadas para execução', valor: ab.filter((o) => o.sit === 'A').length, cor: COR.A, v: 'A' },
      { nome: 'Aguardando liberação', valor: ab.filter((o) => o.sit === 'P').length, cor: COR.P, v: 'P' }],
      { titulo: 'Situação das abertas', sub: 'abertas', aoClicar: (f) => aplicar(() => so('sit', f.v), 'carteira') });
    const { b } = baldes(R.p);
    const pb = IND.porBalde(R.todas, b, D.base).map((x) => ({ ...x, med: x.tempo == null ? 0 : x.tempo, falta: x.programadas - x.cumpridas }));
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
  const cartaoGraf = (id, tit, nota, larg) => el('article', { class: 'cartao ' + larg, id, 'data-imagem': true },
    el('div', { class: 'cab' }, el('div', {}, el('h2', { text: tit }), el('p', { class: 'nota', text: nota })), el('div', { class: 'acoes' })),
    el('div', { class: 'graf rolar-x', id: id.replace(/^c-/, 'g-') }));

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
  /** As contas de um período. `fechAte`: até quando a fechada conta "no período" (a semana cortada
   *  pelo mês conta até o domingo dela). */
  function contaProg(lista, p) {
    const fechAte = p.fechAte || p.ate;
    const x = { ...p, n: 0, prazo: 0, depois: 0, ab: 0 };
    for (const o of lista) {
      if (!o.progEm || o.progEm < p.de || o.progEm > p.ate) continue;
      x.n++;
      if (o.sit === 'F') { if (o.fim <= fechAte) x.prazo++; else x.depois++; } else x.ab++;
    }
    return x;
  }
  const doPeriodo = (lista, p) => lista.filter((o) => o.progEm && o.progEm >= p.de && o.progEm <= p.ate);
  const PARTES_PROG = (passou) => [{ k: 'prazo', nome: 'Fechadas no período', cor: COR.F, texto: 'claro' },
    { k: 'depois', nome: 'Fechadas depois', cor: 'var(--fech-depois)', texto: 'escuro' }, { k: 'ab', nome: passou ? 'Não fechadas' : 'Ainda abertas', cor: COR.A, texto: 'claro' }];
  const dicaProg = (l) => [['Programadas', nf.format(l.n)], ['Fechadas no período', `${nf.format(l.prazo)} · ${l.n ? pc.format(l.prazo / l.n) : '—'}`, COR.F],
    ['Fechadas depois', nf.format(l.depois), 'var(--fech-depois)'], [l.ate < D.base ? 'Não fechadas' : 'Ainda abertas', nf.format(l.ab), COR.A]];

  function desenharProg() {
    const raiz = $('#programacao');
    const pg = V.pg;
    const todas = recorte({ sem: 'sit' }).todas;
    const sel = periodoDe(pg.esc, pg.ref);
    const x = contaProg(todas, sel);
    const passou = sel.ate < D.base, hoje = periodoDe(pg.esc, D.base).chave === sel.chave;
    const ir = (d) => { pg.ref = d; zerarPaginas(); desenhar(); };
    // o alto: ver por dia, semana ou mês, e andar
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Ver por' }, ...[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']].map(([k, rot]) =>
      el('button', { type: 'button', 'aria-pressed': String(pg.esc === k), text: rot,
        on: { click: () => { pg.ref = D.base >= sel.de && D.base <= sel.ate ? D.base : sel.de; pg.esc = k; zerarPaginas(); desenhar(); } } })));
    const nav = el('div', { class: 'pg-nav' },
      el('button', { type: 'button', class: 'botao mini', 'aria-label': 'Período anterior', text: '‹', on: { click: () => ir(andar(pg.esc, sel.de, -1)) } }),
      el('b', { class: 'pg-rot', text: sel.rot }),
      el('button', { type: 'button', class: 'botao mini', 'aria-label': 'Próximo período', text: '›', on: { click: () => ir(andar(pg.esc, sel.de, 1)) } }),
      hoje ? null : el('button', { type: 'button', class: 'botao mini', text: { dia: 'Hoje', semana: 'Esta semana', mes: 'Este mês' }[pg.esc], on: { click: () => ir(D.base) } }));
    const pct = (v) => (x.n ? pc.format(v / x.n) : '—');
    const k = (rot, val, pe, cor, cls = '', fazer = null) => el(fazer ? 'button' : 'div', { class: 'kpi', type: fazer ? 'button' : null, on: fazer ? { click: fazer } : {} },
      el('span', { class: 'rot' }, cor ? el('i', { class: 'ponto', style: 'background:' + cor }) : null, rot), el('span', { class: 'val ' + cls, text: val }), el('span', { class: 'pe', text: pe }));
    const naLista = (...s) => aplicar(() => so('sit', ...s));
    const kpis = el('div', { class: 'kpis mini pg-kpis' },
      k('Programadas', nf.format(x.n), sel.rot, 'var(--fraco)', '', () => aplicar(() => F.sit.clear())),
      k('Fechadas no período', nf.format(x.prazo), `${pct(x.prazo)} das programadas · até ${dm(sel.ate)}`, COR.F, x.n && x.prazo / x.n >= 0.8 ? 'bom' : '', () => naLista('F')),
      k('Fechadas depois', nf.format(x.depois), `${pct(x.depois)} · finalizadas após ${dm(sel.ate)}`, 'var(--fech-depois)', '', () => naLista('F')),
      k(passou ? 'Não fechadas' : 'Ainda abertas', nf.format(x.ab), passou ? `${pct(x.ab)} · o período já passou` : `${pct(x.ab)} · o período ainda não acabou`,
        passou && x.ab ? COR.alerta : COR.A, passou && x.ab ? 'ruim' : '', () => naLista('A', 'P')));
    // quais: todas, só as com alguém (da equipe ou terceiro) ou só as sem executante — é o filtro Executante
    const ex = [...F.exec].sort().join(), quais = F.neg.has('exec') ? '' : !ex ? 'todas' : ex === 'g:I,g:T' ? 'com' : ex === 'g:S' ? 'sem' : '';
    const segQuais = el('div', { class: 'seg', role: 'group', 'aria-label': 'Quais OS' }, ...[['todas', 'Todas'], ['com', 'Com executante'], ['sem', 'Sem executante']].map(([kk, rot]) =>
      el('button', { type: 'button', 'aria-pressed': String(quais === kk), text: rot,
        on: { click: () => aplicar(() => { if (kk === 'todas') { F.exec.clear(); F.neg.delete('exec'); } else so('exec', ...(kk === 'com' ? ['g:I', 'g:T'] : ['g:S'])); }) } })));
    const topo = el('article', { class: 'cartao c12' },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Programação' }),
        el('p', { class: 'nota', text: 'As OS programadas para o período e quantas já fecharam',
          title: 'A data programada é a previsão de início da manutenção no Protheus; quando ninguém a mudou, é o próprio dia da abertura.' })),
        el('div', { class: 'acoes' }, el('div', { class: 'ctl' }, segQuais, seg))),
      nav, kpis);
    // a sequência: os períodos em volta do escolhido (e os 2 seguintes, já programados)
    const N = { dia: 14, semana: 12, mes: 12 }[pg.esc];
    const janela = [];
    for (let i = -(N - 3); i <= 2; i++) janela.push(contaProg(todas, periodoDe(pg.esc, andar(pg.esc, sel.de, i))));
    const gSeq = el('div', { class: 'graf rolar-x' });
    const seq = el('article', { class: 'cartao c12', 'data-imagem': true },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Programadas e fechadas · ' + { dia: 'dia a dia', semana: 'semana a semana', mes: 'mês a mês' }[pg.esc] }),
        el('p', { class: 'nota', text: 'Programadas por período · embaixo, a % que fechou' })), el('div', { class: 'acoes' })),
      el('div', { class: 'legenda' }, ...PARTES_PROG(false).map((p) => el('span', {}, el('i', { style: 'background:' + p.cor }), p.k === 'ab' ? 'Abertas (não fechadas)' : p.nome))),
      gSeq);
    // dentro do período: os dias da semana, ou as semanas do mês
    let det = null, gDet = null, subs = [];
    if (pg.esc !== 'dia') {
      if (pg.esc === 'semana') for (let i = 0; i < 7; i++) subs.push(periodoDe('dia', iso(t(sel.de) + i * DIA)));
      else for (let d = sel.de; d <= sel.ate; d = andar('semana', d, 1)) {
        const w = periodoDe('semana', d);
        subs.push({ ...w, de: w.de < sel.de ? sel.de : w.de, ate: w.ate > sel.ate ? sel.ate : w.ate, fechAte: w.ate, rot: w.rot, sub: `${dm(w.de < sel.de ? sel.de : w.de)} a ${dm(w.ate > sel.ate ? sel.ate : w.ate)}` });
      }
      subs = subs.map((p) => contaProg(todas, p));
      gDet = el('div', { class: 'graf rolar-x' });
      det = el('article', { class: 'cartao c12', 'data-imagem': true },
        el('div', { class: 'cab' }, el('div', {}, el('h2', { text: pg.esc === 'semana' ? 'Dia a dia da semana' : 'Semana a semana do mês' }),
          el('p', { class: 'nota', text: pg.esc === 'semana' ? `As OS programadas para cada dia · ${sel.rot}` : `As OS programadas para cada semana · ${sel.rot}` })), el('div', { class: 'acoes' })),
        gDet);
    }
    // quem e onde: por executante ou por frota, no período
    const por = pg.por || 'exec';
    const segPor = el('div', { class: 'seg', role: 'group', 'aria-label': 'Agrupar por' }, ...[['exec', 'Executante'], ['frota', 'Frota']].map(([kk, rot]) =>
      el('button', { type: 'button', 'aria-pressed': String(por === kk), text: rot, on: { click: () => { pg.por = kk; desenhar(); } } })));
    const tPor = el('div', { class: 'bt-rolagem' });
    const quem = el('article', { class: 'cartao c12' },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Por ' + (por === 'exec' ? 'executante' : 'frota') + ' · ' + sel.rot })), el('div', { class: 'acoes' }, el('div', { class: 'ctl' }, segPor))),
      tPor);
    const lista = el('article', { class: 'cartao c12' });
    raiz.replaceChildren(el('div', { class: 'grade' }, topo, seq, det, quem, lista));
    prepararImagem(seq);
    if (det) prepararImagem(det);
    colunasEmPe(gSeq, { linhas: janela, partes: PARTES_PROG(false), titulo: 'Programadas e fechadas', H: 300, passoMin: 46, passoMax: 92,
      nomes: (l) => ({ fortes: [l.curto], fracos: [l.n ? pc.format(l.prazo / l.n) + ' no período' : 'nada programado'] }), dica: dicaProg,
      marcado: (l) => l.chave === sel.chave, aoClicar: (l) => ir(l.de) });
    if (det) colunasEmPe(gDet, { linhas: subs, partes: PARTES_PROG(passou), titulo: det.querySelector('h2').textContent, H: 260, passoMin: 60, passoMax: 130,
      nomes: (l) => ({ fortes: [pg.esc === 'semana' ? `${l.sub} ${l.curto}` : l.curto], fracos: [pg.esc === 'semana' ? (l.n ? pc.format(l.prazo / l.n) : '—') : l.sub] }), dica: dicaProg,
      aoClicar: (l) => { pg.esc = pg.esc === 'semana' ? 'dia' : 'semana'; ir(l.de); } });
    // a tabela por executante ou frota
    const progs = doPeriodo(todas, sel);
    const m = new Map();
    for (const o of progs) {
      const chaves = por === 'frota' ? [o.frota] : o.pessoas.length ? o.pessoas.map((q) => q.nome) : [GRUPO[o.grupo]];
      for (const c of chaves) {
        if (!m.has(c)) m.set(c, { chave: c, nome: c, prazo: 0, depois: 0, ab: 0, ader: 0 });
        const y = m.get(c);
        if (o.sit === 'F') { if (o.fim <= sel.ate) y.prazo++; else y.depois++; } else y.ab++;
      }
    }
    for (const y of m.values()) y.ader = y.prazo / Math.max(1, y.prazo + y.depois + y.ab);
    const grupoDe = { [GRUPO.S]: 'g:S', [GRUPO.T]: 'g:T' };
    tabelaNums(tPor, { id: 'prog-' + por, linhas: [...m.values()], totalRot: 'Programadas', padrao: { k: '_tot', dir: 'desc' },
      nome: { rot: por === 'exec' ? 'Executante' : 'Frota', ver: (l) => [l.nome, por === 'frota' ? eqDe.get(l.chave) || '' : grupoDe[l.chave] ? 'ninguém da equipe na STL' : ''] },
      partes: [{ k: 'prazo' }, { k: 'depois' }, { k: 'ab' }],
      cols: [{ k: 'prazo', rot: 'Fechadas no período' }, { k: 'depois', rot: 'Fechadas depois' }, { k: 'ab', rot: passou ? 'Não fechadas' : 'Abertas', ruim: passou },
        { k: 'ader', rot: '% no período', fmt: (v) => pc.format(v) }],
      vazioTxt: 'Nada programado para este período com estes filtros.',
      aoClicar: (l) => aplicar(() => (por === 'frota' ? so('frota', l.chave) : so('exec', grupoDe[l.chave] || l.chave))) });
    // a lista das OS do período (com a situação da barra)
    carteira(lista, progs.filter((o) => casa('sit', o)), progs, { chave: 'prog', titulo: 'OS programadas · ' + sel.rot,
      nota: `${plural(progs.length, 'OS programada', 'OS programadas')} para o período, com os filtros · a situação de hoje` });
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
  const avancoDe = (o, de, ate) => {
    if (!o.abertura || o.abertura > ate) return null;
    const fechou = o.sit === 'F' && o.fim && o.fim <= ate;
    if (o.abertura < de) {
      if (o.sit === 'F' && o.fim && o.fim < de) return null;     // já estava fechada antes do período
      return fechou ? 'fechou' : 'ainda';
    }
    return fechou ? 'entrouFechou' : 'entrouAberta';
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
  const LISTAS_AV = [['fechou', 'Fecharam'], ['ainda', 'Ainda para fechar'], ['entrou', 'Entraram']];
  function desenharAvanco() {
    const raiz = $('#avanco');
    const av = V.av;
    const todas = recorte({ sem: 'sit' }).todas;
    const sel = periodoDe(av.esc, av.ref);
    const atual = periodoDe(av.esc, D.base), noAtual = atual.chave === sel.chave;
    const x = contaAvanco(todas, sel);
    const vespera = iso(t(sel.de) - DIA);
    const ir = (d) => { av.ref = d > D.base ? D.base : d; zerarPaginas(); desenhar(); };
    const unid = { dia: 'dia', semana: 'semana', mes: 'mês' }[av.esc];
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Ver por' }, ...[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']].map(([k, rot]) =>
      el('button', { type: 'button', 'aria-pressed': String(av.esc === k), text: rot,
        on: { click: () => { av.ref = D.base >= sel.de && D.base <= sel.ate ? D.base : sel.de; av.esc = k; zerarPaginas(); desenhar(); } } })));
    const por = av.por;
    const segPor = el('div', { class: 'seg', role: 'group', 'aria-label': 'Cada um por' }, ...[['exec', 'Executante'], ['frota', 'Frota']].map(([k, rot]) =>
      el('button', { type: 'button', 'aria-pressed': String(por === k), text: rot, on: { click: () => { av.por = k; desenhar(); } } })));
    const nav = el('div', { class: 'pg-nav' },
      el('button', { type: 'button', class: 'botao mini', 'aria-label': 'Período anterior', text: '‹', on: { click: () => ir(andar(av.esc, sel.de, -1)) } }),
      el('b', { class: 'pg-rot', text: sel.rot }),
      el('button', { type: 'button', class: 'botao mini', 'aria-label': 'Próximo período', text: '›', disabled: noAtual ? true : null, on: { click: () => ir(andar(av.esc, sel.de, 1)) } }),
      noAtual ? null : el('button', { type: 'button', class: 'botao mini', text: { dia: 'Hoje', semana: 'Esta semana', mes: 'Este mês' }[av.esc], on: { click: () => ir(D.base) } }));
    const verLista = (k) => { av.lista = k; zerarPaginas(); desenhar(); const l = $('#av-lista'); if (l) l.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    const k = (rot, val, pe, cor, cls = '', fazer = null) => el(fazer ? 'button' : 'div', { class: 'kpi', type: fazer ? 'button' : null, on: fazer ? { click: fazer } : {} },
      el('span', { class: 'rot' }, cor ? el('i', { class: 'ponto', style: 'background:' + cor }) : null, rot), el('span', { class: 'val ' + cls, text: val }), el('span', { class: 'pe', text: pe }));
    const dif = x.fim - x.tinha;
    const kpis = el('div', { class: 'kpis mini av-kpis' },
      k('Tinham para fechar', nf.format(x.tinha), `no começo: abertas até ${dm(vespera)}`, COR.A, '', () => verLista('ainda')),
      k('Fecharam', nf.format(x.fechou), x.tinha ? `${pc.format(x.pct)} das que tinham · até ${dm(x.ateReal)}` : 'nada para fechar no começo', COR.F,
        x.pct !== null && x.pct >= 0.5 ? 'bom' : '', () => verLista('fechou')),
      k('Entraram', nf.format(x.entrou), `abertas no período · ${nf.format(x.entrouFechou)} já fechadas`, 'var(--nova)', '', () => verLista('entrou')),
      k(noAtual ? 'Para fechar hoje' : 'Ficaram para fechar', nf.format(x.fim),
        dif > 0 ? `a carteira cresceu ${nf.format(dif)} no período` : dif < 0 ? `a carteira diminuiu ${nf.format(-dif)} no período` : 'a carteira ficou igual',
        'var(--fraco)', dif > 0 ? 'ruim' : dif < 0 ? 'bom' : ''));
    // quais: todas, só as com alguém (da equipe ou terceiro) ou só as sem executante — é o filtro Executante
    const ex = [...F.exec].sort().join(), quais = F.neg.has('exec') ? '' : !ex ? 'todas' : ex === 'g:I,g:T' ? 'com' : ex === 'g:S' ? 'sem' : '';
    const segQuais = el('div', { class: 'seg', role: 'group', 'aria-label': 'Quais OS' }, ...[['todas', 'Todas'], ['com', 'Com executante'], ['sem', 'Sem executante']].map(([kk, rot]) =>
      el('button', { type: 'button', 'aria-pressed': String(quais === kk), text: rot,
        on: { click: () => aplicar(() => { if (kk === 'todas') { F.exec.clear(); F.neg.delete('exec'); } else so('exec', ...(kk === 'com' ? ['g:I', 'g:T'] : ['g:S'])); }) } })));
    const topo = el('article', { class: 'cartao c12' },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Avanço do fechamento' }),
        el('p', { class: 'nota', text: 'O que tinha no começo, o que fechou, o que entrou e com quanto ficou',
          title: 'Pelas datas do Protheus (abertura e fim da manutenção) e por quem está na mão de obra da STL hoje.' })),
        el('div', { class: 'acoes' }, el('div', { class: 'ctl' }, segQuais, seg))),
      nav, kpis);
    // a sequência: a carteira no fim de cada período, até o escolhido (e os 2 seguintes, se já passaram)
    const N = { dia: 14, semana: 12, mes: 12 }[av.esc];
    let fimRef = sel.de;
    for (let j = 1; j <= 2; j++) { const prox = andar(av.esc, sel.de, j); if (prox <= D.base) fimRef = prox; }
    const janela = [];
    for (let i = -(N - 1); i <= 0; i++) janela.push(contaAvanco(todas, periodoDe(av.esc, andar(av.esc, fimRef, i))));
    const PARTES_FIM = [{ k: 'ainda', nome: 'Das que já tinha', cor: COR.A, texto: 'claro' }, { k: 'entrouAberta', nome: 'Entraram no período', cor: 'var(--nova)', texto: 'tema' }];
    const dicaAv = (l) => [['Tinham no começo', nf.format(l.tinha), COR.A], ['Fecharam', `${nf.format(l.fechou)}${l.tinha ? ' · ' + pc.format(l.pct) : ''}`, COR.F],
      ['Entraram', `${nf.format(l.entrou)} · ${nf.format(l.entrouFechou)} já fechadas`, 'var(--nova)'], ['No fim', nf.format(l.fim)]];
    const gSeq = el('div', { class: 'graf rolar-x' });
    const seq = el('article', { class: 'cartao c12', 'data-imagem': true },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: `A carteira no fim de cada ${unid}` }),
        el('p', { class: 'nota', text: 'Para fechar no fim de cada período · embaixo, a % que fechou do começo' })), el('div', { class: 'acoes' })),
      el('div', { class: 'legenda' }, ...PARTES_FIM.map((p) => el('span', {}, el('i', { style: 'background:' + p.cor }), p.nome)), el('span', { text: 'o número em cima é o total no fim' })),
      gSeq);
    // cada pessoa (ou frota): das que tinha no começo, quantas fechou
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
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: (por === 'exec' ? 'Cada pessoa da equipe' : 'Cada frota') + ' · ' + sel.rot }), notaCada),
        el('div', { class: 'acoes' }, el('div', { class: 'ctl' }, segPor))),
      el('div', { class: 'legenda' }, el('span', {}, el('i', { style: 'background:' + COR.F }), 'Fechou'), el('span', {}, el('i', { style: 'background:' + COR.A }), 'Ainda para fechar')),
      gCada);
    const tCada = el('div', { class: 'bt-rolagem' });
    const tab = el('article', { class: 'cartao c12' },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Os números de ' + (por === 'exec' ? 'cada pessoa' : 'cada frota') + ' · ' + sel.rot }))),
      tCada);
    // a lista: as que fecharam, as que ainda estão para fechar, ou as que entraram
    const qual = av.lista;
    const daLista = (o) => { const kk = avancoDe(o, sel.de, x.ateReal); return qual === 'entrou' ? kk === 'entrouFechou' || kk === 'entrouAberta' : kk === qual; };
    const itens = todas.filter(daLista);
    const conta = { fechou: x.fechou, ainda: x.ainda, entrou: x.entrou };
    const lista = el('article', { class: 'cartao c12', id: 'av-lista' });
    raiz.replaceChildren(el('div', { class: 'grade' }, topo, seq, cada, tab, lista));
    prepararImagem(seq);
    prepararImagem(cada);
    colunasEmPe(gSeq, { linhas: janela, partes: PARTES_FIM, titulo: `A carteira no fim de cada ${unid}`, H: 300, passoMin: 46, passoMax: 92,
      nomes: (l) => ({ fortes: [l.curto], fracos: [l.tinha ? 'fechou ' + pc.format(l.pct) : '—'] }), dica: dicaAv,
      marcado: (l) => l.chave === sel.chave, aoClicar: (l) => ir(l.de) });
    const rola = colunasEmPe(gCada, { linhas: noGrafico, titulo: 'Avanço de ' + (por === 'exec' ? 'cada pessoa' : 'cada frota'), H: 320, passoMin: por === 'exec' ? 64 : 54, passoMax: 96,
      limite: 30, chave: 'av-' + por, quem: por === 'exec' ? ['pessoa', 'pessoas'] : ['frota', 'frotas'],
      partes: [{ k: 'fechou', nome: 'Fechou', cor: COR.F, texto: 'escuro' }, { k: 'ainda', nome: 'Ainda para fechar', cor: COR.A, texto: 'claro' }],
      nomes: (l) => ({ fortes: [por === 'exec' ? curto.get(l.nome) : l.nome], fracos: [(l.pct === null ? '—' : pc.format(l.pct)) + (por === 'exec' && !l.aponta ? ' · não aponta' : '')] }),
      dica: (l) => [['Tinha no começo', nf.format(l.tinha)], ['Fechou', `${nf.format(l.fechou)} · ${l.pct === null ? '—' : pc.format(l.pct)}`, COR.F], ['Ainda para fechar', nf.format(l.ainda), COR.A],
        ['Entraram no período', `${nf.format(l.entrou)} · ${nf.format(l.entrouFechou)} já fechadas`, 'var(--nova)'], ['Para fechar no fim', nf.format(l.fim)]],
      aoClicar: (l) => aplicar(() => (por === 'frota' ? so('frota', l.chave) : so('exec', l.chave))) });
    notaCada.textContent = noGrafico.length ? `${plural(noGrafico.length, por === 'exec' ? 'pessoa' : 'frota', por === 'exec' ? 'pessoas' : 'frotas')} com OS para fechar no começo` + (rola ? ' · role para o lado' : '') : '';
    tabelaNums(tCada, { id: 'av-' + por, linhas, totalRot: 'Tinha no começo', padrao: { k: '_tot', dir: 'desc' },
      nome: { rot: por === 'exec' ? 'Executante' : 'Frota', ver: (l) => [l.nome, por === 'frota' ? eqDe.get(l.chave) || '' : grupoDe[l.chave] ? 'ninguém da equipe na STL' : l.aponta ? '' : foraTxt(l.nome)] },
      partes: [{ k: 'tinha' }],
      cols: [{ k: 'fechou', rot: 'Fechou' }, { k: 'pct', rot: '% fechado', val: (l) => (l.pct === null ? -1 : l.pct), fmt: (v) => (v < 0 ? '—' : pc.format(v)) },
        { k: 'ainda', rot: 'Ainda para fechar' }, { k: 'entrou', rot: 'Entraram' }, { k: 'fim', rot: noAtual ? 'Para fechar hoje' : 'Ficaram para fechar' }],
      vazioTxt: 'Nada para fechar neste período com estes filtros.',
      aoClicar: (l) => aplicar(() => (por === 'frota' ? so('frota', l.chave) : so('exec', grupoDe[l.chave] || l.chave))) });
    carteira(lista, itens, itens, { chave: 'av', semSegm: true,
      titulo: { fechou: 'As que fecharam', ainda: 'As que ainda estão para fechar', entrou: 'As que entraram' }[qual] + ' · ' + sel.rot,
      nota: { fechou: `Das que estavam para fechar no começo, as finalizadas até ${dm(x.ateReal)}`, ainda: `Das que estavam para fechar no começo, as que não fecharam até ${dm(x.ateReal)}`,
        entrou: 'Abertas no Protheus dentro do período, já fechadas ou não' }[qual] });
    lista.querySelector('.cab .acoes').prepend(el('div', { class: 'ctl' }, el('div', { class: 'seg', role: 'group', 'aria-label': 'Quais OS' }, ...LISTAS_AV.map(([kk, rot]) =>
      el('button', { type: 'button', 'aria-pressed': String(qual === kk), text: `${rot} · ${nf.format(conta[kk])}`, on: { click: () => { av.lista = kk; zerarPaginas(); desenhar(); } } })))));
  }

  // ── Não liberadas: as OS abertas no Protheus que ainda aguardam liberação (05/11/2026) ──
  // Todas, de qualquer data; os filtros da barra valem, menos a Situação (a aba já é ela). A idade conta da
  // abertura, numa cor só, do claro ao escuro. As liberadas vêm da data de liberação da STJ.
  const FAIXAS_P = [{ k: 'f0', nome: 'Até 30 dias', cor: 'var(--pend1)', texto: 'tema' }, { k: 'f1', nome: '31 a 90 dias', cor: 'var(--pend2)', texto: 'escuro' },
    { k: 'f2', nome: 'Mais de 90 dias', cor: 'var(--pend3)', texto: 'inv' }];
  const faixaP = (o) => (o.dias == null || o.dias <= 30 ? 0 : o.dias <= 90 ? 1 : 2);
  function desenharPendentes() {
    const raiz = $('#pendentes');
    const S = recorte({ sem: 'sit' });
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
    const rola = colunasEmPe(gF, { linhas: linF, partes: FAIXAS_P, titulo: 'Não liberadas por frota', H: 320, passoMin: 56, passoMax: 92, limite: 30, chave: 'pend', quem: ['frota', 'frotas'],
      nomes: (l) => ({ fortes: [l.frota], fracos: [eqDe.get(l.frota) || ''] }),
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
    const semSit = recorte({ sem: 'sit' }).base;
    carteira($('#c-carteira'), R.base, semSit, { chave: 'carteira', titulo: 'Carteira de OS',
      nota: `Para fechar e finalizadas (${R.p.rot.toLowerCase()}) · ${plural(R.base.length, 'OS', 'OS')} com os filtros · escolha as colunas em "Colunas"` });
    $('#c-carteira .cab .acoes').prepend(botaoFolha());
  }

  // ── a tabela dos números ──
  // Uma linha por frota (ou por pessoa): o nome, o total e as colunas com os números. Clicar no título de
  // uma coluna ordena por ela; clicar na linha abre a frota (ou a pessoa).
  function tabelaNums(alvo, { id, linhas, nome, partes, totalRot, cols, padrao, aoClicar, vazioTxt = 'Nada com estes filtros.' }) {
    if (!linhas.length) return alvo.replaceChildren(el('div', { class: 'vazio', text: vazioTxt }));
    const o = V.ord[id] || (V.ord[id] = { ...padrao });
    const total = (l) => partes.reduce((s, p) => s + (l[p.k] || 0), 0);
    const vDe = Object.fromEntries(cols.filter((c) => c.val).map((c) => [c.k, c.val]));
    const valor = (l, k) => (k === '_tot' ? total(l) : k === '_nome' ? l.chave : vDe[k] ? vDe[k](l) : l[k] || 0);
    const ord = [...linhas].sort((a, b) => {
      const x = valor(a, o.k), y = valor(b, o.k);
      const d = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'pt', { numeric: true });
      return (o.dir === 'asc' ? d : -d) || total(b) - total(a) || String(a.chave).localeCompare(String(b.chave), 'pt', { numeric: true });
    });
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
      A: 0, P: 0, F: 0, prog: 0, nprog: 0, v90: 0, sem: 0, venc: 0 }]));
    for (const o of R.base) {
      const x = m.get(o.frota);
      if (!x) continue;
      x[o.sit]++;
      if (o.sit !== 'F') { if (o.classe === 'P') x.prog++; if (o.classe === 'N') x.nprog++; if (o.faixa === 3) x.v90++; if (o.grupo === 'S') x.sem++; if (o.prevEstado === 'vencida') x.venc++; }
    }
    const linhas = [...m.values()];
    const soma = linhas.reduce((s, x) => s + x.A + x.P, 0);
    const nota = el('p', { class: 'nota' }), graf = el('div', { class: 'graf rolar-x' }), caixa = el('div', { class: 'bt-rolagem' }), ctl = el('div', { class: 'ctl' });
    const cartao = el('article', { class: 'cartao', 'data-imagem': true },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'OS abertas e fechadas por frota' }), nota), el('div', { class: 'acoes' }, ctl)),
      el('div', { class: 'legenda' }, ...LEG_FROTA.map(([rot, cor]) => el('span', {}, el('i', { style: 'background:' + cor }), rot))),
      graf);
    raiz.replaceChildren(cartao, el('article', { class: 'cartao' },
      el('div', { class: 'cab' }, el('div', {}, el('h2', { text: 'Os números de cada frota' }),
        el('p', { class: 'nota', text: `Todas as frotas da lista · finalizadas: ${R.p.rot.toLowerCase()}` })), el('div', { class: 'acoes' }, botaoFolha())),
      caixa));
    prepararImagem(cartao);
    controlesFrota(ctl);
    const comAlgo = ordenaFrotas(linhas.filter((x) => x.A + x.P + x.F));
    const rola = colunasPar(graf, { linhas: comAlgo, titulo: 'OS abertas e fechadas por frota', H: 330, limite: 30, chave: 'frotas',
      dica: (l) => [['Abertas', nf.format(l.A + l.P), COR.A], ['· liberadas para execução', nf.format(l.A)], ['· aguardando liberação', nf.format(l.P)],
        ['Fechadas no período', nf.format(l.F), COR.F], ['Há mais de 90 dias', nf.format(l.v90)], ['Programadas', nf.format(l.prog)], ['Não programadas', nf.format(l.nprog)],
        ['Sem executante', nf.format(l.sem)], ['Prevista e vencida', nf.format(l.venc)]],
      aoClicar: (l) => aplicar(() => so('frota', l.frota)) });
    nota.textContent = `${plural(soma, 'aberta', 'abertas')} (para fechar hoje) e ${plural(linhas.reduce((x, l) => x + l.F, 0), 'fechada', 'fechadas')} (${R.p.rot.toLowerCase()}) em ${plural(comAlgo.length, 'frota', 'frotas')}` +
      ` · por ${ORD_FROTA[V.frotaOrd][0].toLowerCase()}` + (rola ? ' · role para o lado' : '');
    tabelaNums(caixa, { id: 'frotas', linhas, totalRot: 'Carteira', padrao: { k: '_tot', dir: 'desc' },
      nome: { rot: 'Frota', ver: (l) => [l.frota, l.equip] },
      partes: [{ k: 'A' }, { k: 'P' }],
      cols: [{ k: 'A', rot: 'Liberadas' }, { k: 'P', rot: 'Pendentes' }, { k: 'v90', rot: '+90 dias', ruim: true }, { k: 'prog', rot: 'Programadas' },
        { k: 'nprog', rot: 'Não programadas' }, { k: 'sem', rot: 'Sem executante' }, { k: 'venc', rot: 'Prevista vencida', ruim: true }, { k: 'F', rot: 'Finalizadas' }],
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
        k('Finalizadas', nf.format(fe.length), R.p.rot.toLowerCase(), COR.F),
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
    for (const o of fe) { const x = achaBalde(fl, o.fim); if (x) x.saiu++; }
    $('#nota-ficha-fluxo').textContent = `OS da frota abertas e finalizadas em cada ${unid}`;
    legenda('#leg-ficha-fluxo', [['Entraram (abertas)', COR.criadas], ['Saíram (finalizadas)', COR.F]]);
    colunas($('#g-ficha-fluxo'), { grupos: fl, series: [{ k: 'entrou', nome: 'Entraram', cor: COR.criadas }, { k: 'saiu', nome: 'Saíram', cor: COR.F }], H: 200, titulo: 'Entrada e saída da frota', minLarg: 26 });
    carteira(cart, daF, recorte({ sem: 'sit' }).base.filter((o) => o.frota === f), { chave: 'ficha', titulo: 'OS da frota ' + f, nota: 'Para fechar e finalizadas no período, com os filtros', semFrota: true });
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
    legenda('#leg-exec', [['Para fechar: já programadas para a pessoa na STL', COR.A], ['Finalizadas no período', COR.F]]);
    $('#leg-exec').append(el('span', { text: 'o número em cima é o total de OS da pessoa' }));
    const h = (v) => (v ? nh.format(v) + ' h' : '—');
    const porFechar = [...linhas].sort((a, b) => b.abrir - a.abrir || b.abrir + b.F - a.abrir - a.F || a.nome.localeCompare(b.nome, 'pt'));
    const curto = curtos([...new Set([...todas, ...linhas].map((l) => l.nome))]);
    const rola = colunasEmPe($('#g-exec'), { linhas: porFechar, titulo: 'OS por executante', H: 360, passoMin: 64, passoMax: 96, limite: 40, chave: 'exec-' + modo, quem: ['pessoa', 'pessoas'],
      partes: [{ k: 'abrir', nome: 'Para fechar', cor: COR.A, texto: 'claro', sempre: true }, { k: 'F', nome: 'Finalizadas no período', cor: COR.F, texto: 'escuro' }],
      nomes: (l) => ({ fortes: [curto.get(l.nome)], fracos: [l.aponta ? '' : 'não aponta'] }),
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
  async function baixarImagem(card, botao, aviso) {
    const svgs = [...card.querySelectorAll('.graf svg')];
    if (!svgs.length) { aviso.textContent = 'Este gráfico está vazio.'; return; }
    botao.disabled = true;
    aviso.textContent = 'Gerando a imagem…';
    try {
      const css = getComputedStyle(raiz.host || document.documentElement);
      const cor = (v) => css.getPropertyValue(v).trim();
      const partes = svgs.map((svg) => { const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal; const sec = svg.closest('.par > div'); return { svg, w: r.width, h: r.height, k: vb && vb.width ? r.width / vb.width : 1, rot: sec && sec !== card.querySelector('.par > div') ? sec.querySelector('h2').textContent.trim() : '' }; });
      const leg = [...card.querySelectorAll('.legenda span, .rosca-leg > div')].map((sp) => { const i = sp.querySelector('i'); return [[...sp.children].filter((x) => x !== i).map((x) => x.textContent.trim()).filter(Boolean).join(' · ') || sp.textContent.trim(), i ? getComputedStyle(i).backgroundColor : null]; });
      const titulo = card.querySelector('h2').textContent.trim();
      const sub = [$('#chips').textContent.replace(/×/g, ' · ').replace(/Limpar filtros/, '').trim(), 'Protheus de ' + br(D.base)].filter(Boolean).join(' · ');
      const pad = 28, larg = Math.max(...partes.map((p) => p.w)), W = Math.ceil(Math.max(720, larg + pad * 2));
      const tela = document.createElement('canvas'), c = tela.getContext('2d');
      c.font = `12px ${cor('--fonte')}`;
      const linhasLeg = []; let atual = [], x = 0;
      for (const [nome, cl] of leg) { const w = (cl ? 16 : 0) + c.measureText(nome).width + 18; if (x + w > W - pad * 2 && atual.length) { linhasLeg.push(atual); atual = []; x = 0; } atual.push([nome, cl, x]); x += w; }
      if (atual.length) linhasLeg.push(atual);
      const yLeg = pad + 52, y0 = yLeg + linhasLeg.length * 20 + 12;
      const H = Math.ceil(y0 + partes.reduce((s, p) => s + p.h + 12 + (p.rot ? 30 : 0), 0) + 36);
      // o dobro da tela para ficar nítido, menos quando passa do que o celular aguenta num canvas (16 milhões de pixels)
      const esc = Math.min(2, Math.sqrt(16e6 / (W * H)));
      tela.width = Math.round(W * esc); tela.height = Math.round(H * esc); c.scale(esc, esc);
      c.fillStyle = cor('--papel'); c.fillRect(0, 0, W, H);
      c.fillStyle = cor('--texto'); c.font = `700 18px ${cor('--fonte')}`; c.fillText(titulo, pad, pad + 16);
      c.fillStyle = cor('--muito-fraco'); c.font = `12px ${cor('--fonte')}`; c.fillText(sub, pad, pad + 38, W - pad * 2);
      linhasLeg.forEach((l, i) => { const y = yLeg + i * 20; for (const [nome, cl, lx] of l) { if (cl) { c.fillStyle = cl; c.fillRect(pad + lx, y + 1, 10, 10); } c.fillStyle = cor(cl ? '--fraco' : '--muito-fraco'); c.fillText(nome, pad + lx + (cl ? 16 : 0), y + 10); } });
      let y = y0;
      for (const p of partes) {
        if (p.rot) { y += 8; c.fillStyle = cor('--texto'); c.font = `700 15px ${cor('--fonte')}`; c.fillText(p.rot, pad, y + 12); y += 22; }
        c.save(); c.translate(pad, y); c.scale(p.k, p.k); pintarSVG(c, p.svg); c.restore(); y += p.h + 12;
      }
      c.fillStyle = cor('--muito-fraco'); c.font = `11px ${cor('--fonte')}`; c.fillText('Painel de OS · Makro', pad, H - 14);
      const blob = await new Promise((ok, erro) => tela.toBlob((bl) => (bl ? ok(bl) : erro(new Error('sem imagem'))), 'image/png'));
      const d = await downloadsP;
      if (!d) throw { code: 'unavailable' };
      await d.save({ filename: `${slug(titulo)}-${D.base}.png`, data: blob });
      aviso.textContent = 'Imagem salva.';
    } catch (e) { tratarErro(e, aviso); } finally { botao.disabled = false; }
  }
  function prepararImagem(card) {
    const acoes = card.querySelector('.acoes');
    if (!acoes || acoes.querySelector('.baixar')) return;
    const aviso = el('span', { class: 'aviso-img', 'aria-live': 'polite' });
    const b = el('button', { class: 'botao mini baixar', type: 'button', hidden: true, title: 'Baixar este gráfico como imagem, para mandar no grupo' });
    b.innerHTML = ICONE_BAIXAR + '<span>Imagem</span>';
    b.addEventListener('click', () => baixarImagem(card, b, aviso));
    acoes.append(aviso, b);
    downloadsP.then((d) => { if (d) b.hidden = false; });
  }
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
        fech: FOLHA.fech ? l.filter((o) => o.sit === 'F' && o.fim >= desde && o.fim <= D.base).sort((a, b) => b.fim.localeCompare(a.fim) || a.os.localeCompare(b.os)) : [] };
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
      conta.fech.textContent = nf.format(S.todas.filter((o) => set.has(o.frota) && o.sit === 'F' && o.fim >= desde && o.fim <= D.base).length);
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
  const pdfTxt = (x) => String(x ?? '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\n\x20-\x7e\xa0-\xff]/g, '');
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
  const DESENHO = { geral: desenharGeral, indicadores: desenharIndicadores, programacao: desenharProg, avanco: desenharAvanco, pendentes: desenharPendentes, carteira: desenharCarteira, frotas: desenharFrotas, executantes: desenharExecutantes };
  function desenhar() {
    esconderDica();
    sincronizarCampos();
    desenharPills();
    desenharChips();
    for (const a of ABAS) { $('#' + a).hidden = a !== V.aba; const b = $('#aba-' + a); b.setAttribute('aria-selected', String(a === V.aba)); b.classList.toggle('on', a === V.aba); }
    const R = recorte();
    $('#sub').textContent = `${D.base_rotulo || 'Protheus de ' + br(D.base)} · STJ e STL · ${plural(D.frotas_lista.length, 'frota', 'frotas')} da lista do PCM`;
    $('#aviso').hidden = !D.aviso;
    $('#aviso').textContent = D.aviso || '';
    $('#n-carteira').textContent = nf.format(R.base.length);
    $('#n-pendentes').textContent = nf.format(recorte({ sem: 'sit' }).abertas.filter((o) => o.sit === 'P').length);
    const f1 = unicaFrota();
    $('#n-frotas').textContent = f1 || (F.frota.size ? (F.neg.has('frota') ? 'sem ' : '') + nf.format(F.frota.size) : '');
    $('#n-frotas').hidden = !F.frota.size;
    DESENHO[V.aba](R);
  }
  let redim;
  ouvir(window, 'resize', () => { clearTimeout(redim); redim = setTimeout(desenhar, 150); });
  desenhar();
  return { parar: () => { fim.abort(); clearTimeout(redim); clearTimeout(espera); esconderDica(); } };
}
