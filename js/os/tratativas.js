// As tratativas de OS do painel (26/11/2026, pedido do Mateus). O supervisor marca a OS que precisa de uma tratativa
// no Protheus (reprogramar, finalizar, trocar ou excluir alguma coisa); quem atualiza o painel faz e confirma, ou
// recusa com a justificativa. Os pedidos e as respostas moram na fita (`eventos`), com o alvo `tratativa` e o id do
// pedido como alvo (sql/08_tratativas.sql: o banco confere quem pode o quê). Aqui só a conta — montar o estado de
// cada pedido a partir dos lançamentos — e o formato deles. Quem grava é a tela (js/tela/os.js), direto no banco.

export const ACOES = {
  reprogramar: { rot: 'Reprogramar', dica: 'mudar a data da programação' },
  finalizar: { rot: 'Finalizar a OS', dica: 'o serviço foi feito: encerrar no Protheus' },
  trocar: { rot: 'Trocar', dica: 'executante, serviço, frota ou outro dado da OS' },
  excluir: { rot: 'Excluir ou cancelar', dica: 'a OS ou alguma coisa dela' },
  outra: { rot: 'Outra', dica: 'escreva o que precisa' },
};
export const SITUACOES = { pendente: 'Pendente', feita: 'Feita', recusada: 'Recusada', cancelada: 'Cancelada' };
// o que precisa vir escrito: trocar e excluir dizem o quê; outra diz tudo; reprogramar pede a data ou o texto
const PRECISA_TEXTO = new Set(['trocar', 'excluir', 'outra']);
export const MAX_TEXTO = 500;

// o que vem da fita foi escrito por qualquer pessoa do PCM: texto curto, nunca objeto
const txt = (v, max = MAX_TEXTO) => (v == null ? '' : String(v)).slice(0, max);
const dataIso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');

/** Os pedidos, a partir da fita (na ordem dela): Map(id do pedido → pedido). Só valem as passagens que fazem sentido:
 *  a resposta é para o pendente; cancelar, só quem pediu e enquanto está pendente; reabrir, o feito ou o recusado. O
 *  resto (dois aparelhos respondendo o mesmo pedido, por exemplo) fica de fora, e o primeiro que chegou vale. */
export function montarTratativas(log) {
  const m = new Map();
  for (const e of log || []) {
    if (!e || e.alvo_tipo !== 'tratativa' || !e.alvo) continue;
    if (e.tipo === 'trat_pedida') {
      if (m.has(e.alvo)) continue;
      const d = e.dados || {};
      m.set(e.alvo, {
        id: e.alvo, os: txt(d.os, 20), filial: txt(d.filial, 20), k: txt(d.k, 40), frota: txt(d.frota, 40), servico: txt(d.servico, 200),
        acao: Object.prototype.hasOwnProperty.call(ACOES, d.acao) ? d.acao : 'outra', texto: txt(d.texto), para: dataIso(d.para),
        pedidaPor: txt(e.autor, 80), pedidaEm: txt(e.ts, 40), situacao: 'pendente', por: '', em: '', resposta: '',
        passos: [{ tipo: 'trat_pedida', autor: txt(e.autor, 80), ts: txt(e.ts, 40), motivo: '' }],
      });
      continue;
    }
    const t = m.get(e.alvo);
    if (!t) continue;
    const vai = e.tipo === 'trat_cancelada' ? (t.situacao === 'pendente' && e.autor === t.pedidaPor ? 'cancelada' : '')
      : e.tipo === 'trat_feita' ? (t.situacao === 'pendente' ? 'feita' : '')
      : e.tipo === 'trat_recusada' ? (t.situacao === 'pendente' && txt(e.motivo).trim() ? 'recusada' : '')
      : e.tipo === 'trat_reaberta' ? (t.situacao === 'feita' || t.situacao === 'recusada' ? 'pendente' : '') : '';
    if (!vai) continue;
    t.situacao = vai;
    t.por = vai === 'pendente' ? '' : txt(e.autor, 80);
    t.em = vai === 'pendente' ? '' : txt(e.ts, 40);
    t.resposta = vai === 'pendente' ? '' : txt(e.motivo);
    t.passos.push({ tipo: e.tipo, autor: txt(e.autor, 80), ts: txt(e.ts, 40), motivo: txt(e.motivo) });
  }
  return m;
}

/** A lista para a tela: os pendentes primeiro, do mais antigo (quem pediu primeiro é atendido primeiro); depois os
 *  respondidos, do mais recente. */
export function ordenar(lista) {
  const pend = lista.filter((t) => t.situacao === 'pendente').sort((a, b) => a.pedidaEm.localeCompare(b.pedidaEm));
  const resp = lista.filter((t) => t.situacao !== 'pendente').sort((a, b) => b.em.localeCompare(a.em) || b.pedidaEm.localeCompare(a.pedidaEm));
  return [...pend, ...resp];
}

/** O que falta para o pedido estar completo ('' quando está): a ação, e o texto quando ela pede. */
export function faltaNoPedido({ acao, texto = '', para = '' }) {
  if (!Object.prototype.hasOwnProperty.call(ACOES, acao)) return 'Escolha a tratativa.';
  const t = String(texto || '').trim();
  if (t.length > MAX_TEXTO) return `Escreva até ${MAX_TEXTO} letras.`;
  if (acao === 'reprogramar' && !para && !t) return 'Diga a nova data ou escreva para quando.';
  if (PRECISA_TEXTO.has(acao) && !t) return acao === 'trocar' ? 'Escreva o que trocar.' : acao === 'excluir' ? 'Escreva o que excluir ou cancelar.' : 'Escreva o que precisa.';
  return '';
}

/** Os lançamentos de um pedido, um por OS (o mesmo pedido para várias OS marcadas vira um pedido para cada uma). `ids`:
 *  um id novo por OS. Sem id, autor e instante: quem grava completa. */
export function pedidos(oss, { acao, texto = '', para = '' }, ids) {
  return oss.map((o, i) => ({ tipo: 'trat_pedida', alvo_tipo: 'tratativa', alvo: ids[i], motivo: '',
    dados: { os: txt(o.os, 20), filial: txt(o.filial, 20), k: txt(o.k, 40), frota: txt(o.frota, 40), servico: txt(o.servico, 200), acao,
      texto: String(texto || '').trim().slice(0, MAX_TEXTO), para: acao === 'reprogramar' ? dataIso(para) : '' } }));
}

/** A resposta a um pedido: feita (nota opcional), recusada (motivo obrigatório), cancelada (quem pediu) ou reaberta. */
export function resposta(id, tipo, motivo = '') {
  if (!['trat_feita', 'trat_recusada', 'trat_cancelada', 'trat_reaberta'].includes(tipo)) throw new Error('resposta desconhecida: ' + tipo);
  const m = String(motivo || '').trim().slice(0, MAX_TEXTO);
  if (tipo === 'trat_recusada' && !m) throw new Error('A recusa precisa da justificativa.');
  return { tipo, alvo_tipo: 'tratativa', alvo: id, motivo: m, dados: {} };
}

/** O que o painel (a última atualização com o Protheus) diz da OS do pedido, para quem vai tratar conferir: `o` é a OS
 *  no painel (ou nada, se ela não está), `cancelada` se ela está entre as canceladas da STJ. `{ txt, feito }`: feito
 *  quando o Protheus já mostra o que foi pedido (encerrada, para finalizar; programada na data, para reprogramar). */
export function noProtheus(t, o, cancelada = false) {
  if (!o) return cancelada ? { txt: 'cancelada no Protheus', feito: t.acao === 'excluir' } : { txt: 'não está no painel', feito: false };
  if (o.sit === 'F') return { txt: 'encerrada no Protheus' + (o.fim ? ' em ' + dm(o.fim) : ''), feito: t.acao === 'finalizar' };
  if (t.acao === 'reprogramar' && t.para && (o.progEm === t.para || (o.prevs || []).includes(t.para)))
    return { txt: 'programada para ' + dm(t.para) + ' no Protheus', feito: true };
  return { txt: (o.sit === 'P' ? 'aberta, aguardando liberação' : 'aberta') + (o.progEm ? ' · programada para ' + dm(o.progEm) : ''), feito: false };
}
const dm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
