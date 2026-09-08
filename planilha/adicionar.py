# -*- coding: utf-8 -*-
"""
Lote de atividades novas, sem duplicar
======================================
Substitui os scripts descartáveis de importação (um por lote, quatro até aqui).
O que ele manda toda semana entra por aqui.

    python3 adicionar.py planilha.json lote.txt  > novo.json   # grava o lote
    python3 adicionar.py planilha.json --limpar  > novo.json   # padroniza textos
    python3 adicionar.py planilha.json --juntar  > novo.json   # funde duplicatas
    python3 adicionar.py planilha.json --fechar-semana 36 --em 2026-09-04

O FORMATO DO LOTE — uma linha por atividade:

    F-815 · Trocar amortecedor da cabine · Adilton
    F-964 · Revisar freios do 2º eixo · OS 007301
    F-331 · Lavagem · Júnior · Gabriel · seg
    F-1065 · Ferrar pneus · extra

Os dois primeiros campos são posicionais: frota, depois o que fazer. Do terceiro
em diante a ordem não importa — cada pedaço se identifica sozinho contra as
listas que a planilha já tem. Pedaço que não casa com nada vira observação e
aparece no relatório: nada é inventado e nada é descartado em silêncio.

DUPLICATA, em três faixas (ver texto.py para o porquê da posição):

    1. mesma atividade, ainda em aberto  → NÃO grava, avisa
    2. mesma atividade, já fechada       → grava: é recorrência
    3. mesmo serviço, posição diferente  → grava, sem alarme
"""
import sys, json, io, re, unicodedata
from datetime import date

import texto as T

HOJE = date.today()
# Separadores aceitos. O hífen só conta cercado de espaço: "para-sol" e
# "anti-tombamento" têm hífen no meio da palavra e não podem ser partidos.
SEP = re.compile(r"\s*[·|]\s*|\s+[-–—]\s+")

# Dentro de um campo, "e" separa pessoas: "LUIZ PAULO E AIRTON" são dois.
E_TAMBEM = re.compile(r"\s+e\s+", re.IGNORECASE)

# Siglas que continuam em maiúscula quando a linha vem toda em CAIXA ALTA.
SIGLAS = {"ld","le","os","abd","ac","arla","obd","top","led","abs","ecu",
          "cd","dpf","scr","gps","usb","12v","24v","pcm"}


def caixa(t):
    """CAIXA ALTA vira frase normal.

    Ele digita boa parte da programação em maiúsculas, e no meio de 267 linhas
    em caixa de frase isso vira ruído. As siglas ficam de pé — "ABD" e "LD" não
    são palavras."""
    letras = [c for c in t if c.isalpha()]
    if not letras or sum(c.isupper() for c in letras) < len(letras) * 0.7:
        return t
    saida = []
    for p in t.split(" "):
        base = re.sub(r"[^A-Za-zÀ-Ú0-9]", "", p).lower()
        saida.append(p if base in SIGLAS else p.lower())
    t = " ".join(saida)
    return t[0].upper() + t[1:] if t else t


def sem_acento(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore")
    return s.decode().lower().strip()


# Como ele pode escrever cada dia da semana.
DIA3 = {}
for _abrev, _formas in (("seg","segunda seg 2a"), ("ter","terca terça ter 3a"),
                        ("qua","quarta qua 4a"),  ("qui","quinta qui 5a"),
                        ("sex","sexta sex 6a"),   ("sab","sabado sábado sab sáb"),
                        ("dom","domingo dom")):
    for _f in _formas.split():
        DIA3[sem_acento(_f)] = _abrev

def norm_frota(f, conhecidas):
    """'815', 'f815', 'F 815' e 'F-815' são a mesma frota."""
    b = sem_acento(f).replace(" ", "")
    m = re.match(r"^f?-?(\d{2,5})[a-z]?$", b)
    alvo = f"F-{m.group(1)}" if m else str(f).strip()
    for c in conhecidas:                       # respeita a grafia já cadastrada
        if sem_acento(c) == sem_acento(alvo):
            return c, False
    return alvo, True                          # frota nova


# ══════════════════════════════════════════════════════════════════
#  Leitura do lote
# ══════════════════════════════════════════════════════════════════

def ler_lote(caminho, listas):
    execs = listas.get("Executantes", [])
    dias = listas.get("Dia", [])
    tipos = listas.get("Tipo de serviço", [])
    frotas = listas.get("Frotas", [])
    itens, avisos = [], []

    for n, linha in enumerate(io.open(caminho, encoding="utf-8"), 1):
        linha = linha.strip()
        if not linha or linha.startswith("#"):
            continue
        campos = [c for c in SEP.split(linha) if c.strip()]
        if len(campos) < 2:
            avisos.append(f"linha {n} ignorada — faltou a frota ou a atividade: "
                          f"{linha[:60]!r}")
            continue

        # "F814, 815, 331, 617, 618 - lubrificação geral" é uma atividade
        # para cada frota, não uma atividade compartilhada: cada caminhão tem
        # a sua, e a aderência conta caminhão por caminhão.
        brutas = [f for f in re.split(r"\s*[,/;]\s*|\s+e\s+", campos[0]) if f.strip()]
        lista_frotas = []
        for bruta in brutas:
            fr_, nova = norm_frota(bruta, frotas)
            if nova:
                avisos.append(f"{fr_} não estava nas listas — cadastrei. "
                              f"Confere se não é engano?")
                frotas.append(fr_)
            lista_frotas.append(fr_)

        it = dict(frota=lista_frotas[0], frotas=lista_frotas,
                  atividade=caixa(campos[1].strip()), os="", equipe=[],
                  dia="", semana=None, dias=None, tipo="", origem="Programada",
                  servico="", obs=[], concluida="", marcar="", linha=n)

        for p in campos[2:]:
            p = p.strip()
            b = sem_acento(p)

            m = re.match(r"^(?:servi[çc]o|serv)\s*[:=]\s*(.+)$", p, re.I)
            if m:
                it["servico"] = m.group(1).strip(); continue
            m = re.match(r"^(?:obs|observa[çc][ãa]o)\s*[:=]\s*(.+)$", p, re.I)
            if m:
                it["obs"].append(m.group(1).strip()); continue
            m = re.match(r"^(?:os\s*[:=]?\s*)?(\d{3,7})$", b)
            if m:
                it["os"] = m.group(1); continue
            m = re.match(r"^(?:sem|semana|s)\s*[:=]?\s*(\d{1,2})$", b)
            if m:
                it["semana"] = int(m.group(1)); continue
            m = re.match(r"^(\d{1,2})\s*dias?$", b)
            if m:
                it["dias"] = int(m.group(1)); continue
            if re.fullmatch(r"extra(\s+prog(ramad[oa]|amacao|\.?)?)?", b):
                it["origem"] = "Extra"; continue
            if b in ("feito", "ok", "concluido", "concluida", "pronto"):
                it["marcar"] = "Concluída"
                it["concluida"] = HOJE.isoformat(); continue

            # o campo pode trazer mais de uma pessoa: "Luiz Paulo e Airton"
            pedacos = [x for x in E_TAMBEM.split(p) if x.strip()]
            gente = []
            for pe in pedacos:
                for q in execs:
                    if sem_acento(q) == sem_acento(pe):
                        gente.append(q); break
            if gente and len(gente) == len(pedacos):
                for q in gente:
                    if q not in it["equipe"]:
                        it["equipe"].append(q)
                continue
            # dia da semana: "seg", "segunda" e "segunda-feira" são o mesmo
            # dia. Vocabulário fechado de propósito — casar por prefixo de três
            # letras faria "Terceirizada" virar terça-feira.
            achou = False
            d3 = DIA3.get(re.sub(r"[^a-z]", "", b.split("-")[0]))
            if d3:
                for dd in dias:
                    if sem_acento(dd)[:3] == d3:
                        it["dia"] = dd; achou = True; break
            if achou: continue
            for tp in tipos:                                 # tipo de serviço
                if sem_acento(tp) == b:
                    it["tipo"] = tp; achou = True; break
            if achou: continue

            it["obs"].append(p)     # não casou: preserva, não inventa
            avisos.append(f"linha {n}: não entendi {p!r} — mandei para a "
                          f"observação da atividade {it['atividade'][:36]!r}")
        itens.append(it)
    return itens, avisos


# ══════════════════════════════════════════════════════════════════
#  Duplicata
# ══════════════════════════════════════════════════════════════════

FECHADA = ("Concluída", "Cancelada")


def indexar(linhas):
    """chave → linhas existentes, com a posição na planilha para o relatório."""
    idx = {}
    for i, x in enumerate(linhas):
        if not x.get("atividade"):
            continue
        idx.setdefault(T.chave(x.get("frota", ""), x["atividade"]), []).append((i, x))
    return idx


def aberta(x):
    return (x.get("marcar") or "") not in FECHADA and not x.get("concluida")


def contida(a, b):
    """Uma atividade é o texto curto da outra?

    Ele escreve "Lubrificar travas da cabine"; guardado está "Lubrificar travas
    da cabine com dificuldade de liberar a mesma para bascular". Mesmo serviço,
    descrito com mais detalhe numa das pontas — e o esqueleto não casa, porque
    a cauda "com dificuldade de…" não é uma das que se sabe descartar.

    Isto NÃO grava nem move nada: só levanta a mão no relatório. Conter não é
    ser igual — "Fixar farol LD" está contida em "Fixar farol LD e a grade", e
    são serviços diferentes. Quem decide é ele."""
    ta, tb = set(a.split()), set(b.split())
    if not ta or not tb or ta == tb:
        return False
    return ta < tb or tb < ta


def descreve(i, x):
    return (f"linha ~{i + 5} · semana {x.get('semana') or '—'} · "
            f"{x.get('marcar') or 'pendente'} · OS {x.get('os') or '—'}"
            + (f" · {', '.join(x['equipe'])}" if x.get("equipe") else ""))


# ══════════════════════════════════════════════════════════════════
#  Modos
# ══════════════════════════════════════════════════════════════════

def modo_lote(d, caminho, rel, semana=None, mover=False, dia=None):
    listas = d.setdefault("listas", {})
    itens, avisos = ler_lote(caminho, listas)
    idx = indexar(d["linhas"])
    gravadas, barradas, movidas, parecidas = [], [], [], []
    serv_padrao = f"Programação {HOJE.strftime('%d/%m')}"

    for it in itens:
        ativ, obs_extra, motivo = T.padronizar(it["atividade"])
        obs = list(it["obs"])
        if obs_extra:
            obs.append(obs_extra)
        if motivo:
            obs.append(f"⚠️ VERIFICAR o texto da atividade — {motivo}")

        # uma linha por frota: "F814, 815, 331 - lubrificação geral" são três
        # caminhões, e a duplicata se decide caminhão a caminhão.
        for fr_ in it.get("frotas") or [it["frota"]]:
            k = T.chave(fr_, ativ)
            conflito = [(i, x) for i, x in idx.get(k, []) if aberta(x)]
            if conflito and mover:
                # Ele repetiu uma atividade que já está aberta: toda segunda o
                # que não saiu rola para a semana seguinte. Reprograma em vez
                # de criar uma segunda linha do mesmo serviço.
                for i, x in conflito:
                    de = x.get("semana")
                    # a origem só se escreve UMA vez: reprogramar duas vezes não
                    # pode apagar contra qual semana a aderência é medida
                    if not x.get("semorig") and de and de != semana:
                        x["semorig"] = de
                    x["semana"] = semana
                    # a janela se recalcula na semana nova
                    x["dia"] = it["dia"] or dia or ""
                    x["data"] = None; x["prazo"] = None
                    for q in it["equipe"]:          # soma, nunca substitui
                        if q not in (x.get("equipe") or []):
                            x.setdefault("equipe", []).append(q)
                    novas_obs = [o for o in obs if o and o not in (x.get("obs") or "")]
                    if novas_obs:
                        x["obs"] = " · ".join(p for p in
                                              [x.get("obs") or ""] + novas_obs if p)
                    movidas.append((fr_, ativ, x, de))
                continue
            if conflito:
                barradas.append((dict(it, frota=fr_), ativ, conflito))
                continue

            # não é a mesma atividade, mas pode ser a mesma escrita mais curta
            esq_novo, pos_novo = k[1], k[2]
            for (fr2, esq2, pos2), linhas2 in idx.items():
                if fr2 != fr_ or pos2 != pos_novo:
                    continue
                if not contida(esq_novo, esq2):
                    continue
                for i, x in linhas2:
                    if aberta(x):
                        parecidas.append((fr_, ativ, i, x))

            nova = dict(
                os=it["os"], frota=fr_,
                servico=it["servico"] or serv_padrao,
                atividade=ativ, tipo=it["tipo"] or "Corretiva",
                origem=it["origem"], equipe=list(it["equipe"]),
                semana=it["semana"] if it["semana"] is not None else semana,
                dia=it["dia"] or dia or "", dias=it["dias"],
                data=None, prazo=None,
                concluida=it["concluida"], marcar=it["marcar"],
                semorig=None, orig="", motivo="",
                obs=" · ".join(o for o in obs if o), oficina="Interna")
            d["linhas"].append(nova)
            idx.setdefault(k, []).append((len(d["linhas"]) - 1, nova))
            gravadas.append((dict(it, frota=fr_), ativ))

    rel.append(f"LOTE {HOJE.strftime('%d/%m')} · {len(itens)} linhas lidas\n")
    rel.append(f"GRAVEI ({len(gravadas)})")
    for it, ativ in gravadas:
        det = [f"OS {it['os']}" if it["os"] else "sem OS"]
        if it["equipe"]: det.append(", ".join(it["equipe"]))
        if it["dia"]:    det.append(it["dia"])
        if it["semana"]: det.append(f"sem {it['semana']}")
        if it["dias"]:   det.append(f"{it['dias']} dias")
        if it["tipo"]:   det.append(it["tipo"])
        if it["origem"] == "Extra": det.append("EXTRA")
        rel.append(f"  {it['frota']} · {ativ} · {' · '.join(det)}")
    if movidas:
        rel.append(f"\nREPROGRAMEI para a semana {semana} ({len(movidas)})")
        rel.append("  já existiam e estavam em aberto — movi, não dupliquei")
        for fr_, ativ, x, de in movidas:
            det = f"OS {x.get('os') or '—'} · semana {de or '—'} → {semana}"
            if x.get("semorig"): det += f" · origem registrada: {x['semorig']}"
            if x.get("equipe"): det += f" · {', '.join(x['equipe'])}"
            rel.append(f"  {fr_} · {ativ}")
            rel.append(f"      {det}")
    if barradas:
        rel.append(f"\nNÃO GRAVEI — já está lá ({len(barradas)})")
        for it, ativ, conf in barradas:
            rel.append(f"  {it['frota']} · {ativ}")
            for i, x in conf:
                rel.append(f"      {descreve(i, x)}")
            rel.append("      → se for serviço novo mesmo, me fala que eu gravo")
    if parecidas:
        rel.append(f"\nGRAVEI, MAS OLHA ISTO — parece a mesma, escrita mais "
                   f"curta ou mais longa ({len(parecidas)})")
        for fr_, ativ, i, x in parecidas:
            rel.append(f"  gravei : {fr_} · {ativ}")
            rel.append(f"  existe : {x['atividade'][:76]}")
            rel.append(f"           {descreve(i, x)}")
            rel.append("      → se for a mesma, me fala que eu junto")
    if avisos:
        rel.append(f"\nATENÇÃO ({len(avisos)})")
        for a in dict.fromkeys(avisos):
            rel.append(f"  {a}")
    return len(gravadas)


def modo_limpar(d, rel):
    """Padroniza o texto das atividades que já estão lá.

    Duas travas: o que sai da atividade entra na observação, e linha que
    texto.py marcar como insegura sai intacta e vai para a lista de revisão."""
    mudou, inseguras, resgatadas = [], [], []

    # O PDF de inspeção trazia a OS escrita no meio da frase — "(OS 7185 ·
    # serviço interno)" — e ela nunca subiu para a coluna. A régua de cores
    # então pinta de âmbar, "falta abrir no Protheus", uma atividade que já
    # tem OS aberta. O número é dele e está no próprio dado: sobe para a coluna.
    for x in d["linhas"]:
        if x.get("os") or not x.get("atividade"):
            continue
        campo = f"{x.get('atividade') or ''} {x.get('obs') or ''}"
        achou = [v for v in re.findall(r"\bOS\s*[:#]?\s*(\d{3,7})\b", campo, re.I)
                 if not re.fullmatch(r"0+", v)]
        if len(set(achou)) == 1:          # ambíguo com duas OS: não escolhe
            x["os"] = achou[0]
            resgatadas.append((x, achou[0]))

    # ── a OS é um campo de 6 dígitos ──
    # A planilha convive com 007157, 21301 e 7166, e as três são da mesma
    # numeração: os curtos só perderam o zero à esquerda no caminho — a linha
    # da F-815 trazia "007157" na coluna e "OS 7157" no texto, provando o par.
    # Como texto, "7166" e "007166" não casam em filtro nem em busca colada no
    # Protheus, então o campo se uniformiza.
    LARG = 6
    zeros, naonum = [], []
    for x in d["linhas"]:
        o = str(x.get("os") or "").strip()
        if not o:
            continue
        if not o.isdigit():
            naonum.append((x, o))       # "-" não é OS: a célula volta a vazia
            x["os"] = ""
            continue
        if len(o) < LARG:
            x["os"] = o.zfill(LARG)
            zeros.append((x, o, x["os"]))

    for x in d["linhas"]:
        t = x.get("atividade")
        if not t:
            continue
        novo, extra, motivo = T.padronizar(t)
        if motivo:
            inseguras.append((x, motivo)); continue
        if novo == t and not extra:
            continue
        # "ABRIR OS" era o texto que ele digitava no PDF de inspeção quando a OS
        # ainda não existia. Onde a coluna OS já está preenchida, esse pedaço
        # contradiz a planilha — some. Onde não está, a própria célula laranja
        # já diz a mesma coisa, com mais força.
        partes = [p for p in extra.split(" · ")
                  if p and not re.fullmatch(r"OS\s+ABRIR\s+OS", p.strip(), re.I)]
        partes = [re.sub(r"^OS\s+ABRIR\s+OS\s*[·,;-]\s*", "", p, flags=re.I)
                  for p in partes]
        antes_obs = x.get("obs") or ""
        nova_obs = " · ".join(p for p in ([antes_obs] + partes) if p.strip())
        mudou.append((t, novo, x.get("obs") or "", nova_obs))
        x["atividade"], x["obs"] = novo, nova_obs

    rel.append(f"FAXINA DE TEXTO · {len(mudou)} atividades reescritas")
    if mudou:
        antes = sum(len(a) for a, _, _, _ in mudou) // len(mudou)
        dep = sum(len(b) for _, b, _, _ in mudou) // len(mudou)
        rel.append(f"  média de caracteres: {antes} → {dep}")
    if zeros:
        import collections as _c
        por = _c.Counter(len(a) for _, a, _b in zeros)
        rel.append(f"\nZEROS À ESQUERDA COMPLETADOS ({len(zeros)})")
        for k in sorted(por):
            ex = next(f"{a} → {b}" for _, a, b in zeros if len(a) == k)
            rel.append(f"  {por[k]:3} tinham {k} dígitos   ex: {ex}")
    if naonum:
        rel.append(f"\nOS QUE NÃO SÃO NÚMERO — apaguei a célula ({len(naonum)})")
        rel.append("  a célula volta a ficar âmbar, que é a verdade: não há OS ali")
        for x, o in naonum:
            rel.append(f"  {x.get('frota'):8} tinha {o!r} · {x.get('atividade','')[:52]}")
    if resgatadas:
        rel.append(f"\nOS QUE ESTAVAM NO TEXTO E SUBIRAM PARA A COLUNA "
                   f"({len(resgatadas)})")
        rel.append("  estavam pintadas de âmbar como se faltasse abrir no Protheus")
        for x, o in resgatadas:
            rel.append(f"  {x.get('frota'):8} OS {o:<8} {x['atividade'][:62]}")
    if inseguras:
        rel.append(f"\nNÃO TOQUEI — precisam de revisão à mão ({len(inseguras)})")
        for x, motivo in inseguras:
            rel.append(f"  {x.get('frota')} · [{motivo}]")
            rel.append(f"      {x['atividade']}")
    return mudou, inseguras


def modo_fechar(d, rel, sem, em):
    """Fecha a semana: o que ficou em aberto sai como concluído na data dada.

    São dois casos, e a diferença entre eles é a lição desta rodada. Uns estão
    de fato pendentes; outros ele já marcou "Concluída" e ficaram SEM DATA — e
    aí a planilha se contradiz, porque a coluna Situação lê a marcação e a
    aderência conta por data. A Situação dizia concluída e o indicador dizia
    que não. Os dois grupos fecham, mas entram separados no relatório."""
    pend, marcadas = [], []
    for x in d["linhas"]:
        if not x.get("atividade") or x.get("semana") != sem:
            continue
        if x.get("concluida"):
            continue                     # já tem data: a antiga nunca se perde
        if x.get("marcar") == "Cancelada":
            continue                     # cancelada não se entrega
        (marcadas if x.get("marcar") == "Concluída" else pend).append(x)
        x["concluida"] = em
        x["marcar"] = "Concluída"

    rel.append(f"FECHEI A SEMANA {sem} em {em[8:10]}/{em[5:7]} "
               f"({len(pend) + len(marcadas)})")
    for titulo, g in (("estavam PENDENTES", pend),
                      ("estavam MARCADAS sem data", marcadas)):
        if not g:
            continue
        rel.append(f"\n  {titulo} ({len(g)})")
        for x in sorted(g, key=lambda y: (y.get("frota") or "")):
            rel.append(f"    {x.get('frota'):8} "
                       f"{('OS ' + x['os']) if x.get('os') else 'sem OS  ':11} "
                       f"{x['atividade'][:56]}")
    sem_os = [x for x in pend + marcadas if not x.get("os")]
    if sem_os:
        rel.append(f"\n  FECHARAM SEM OS ({len(sem_os)})")
        rel.append("    serviço executado sem OS aberta no Protheus")
        for x in sem_os:
            rel.append(f"    {x.get('frota'):8} {x['atividade'][:60]}")
    return pend, marcadas


def modo_juntar(d, rel):
    """Funde grupos de atividades idênticas numa linha só.

    Fica a mais completa — a que tem OS, e no empate a que tem mais informação.
    As OS distintas das outras descem para a observação, porque o Protheus às
    vezes emite várias para o mesmo serviço (a preventiva da F-425 saiu com
    três). Nenhum número se perde; o que sai é a linha repetida, que contava o
    mesmo serviço duas vezes na aderência."""
    grupos = {}
    for i, x in enumerate(d["linhas"]):
        if x.get("atividade"):
            grupos.setdefault(T.chave(x.get("frota", ""), x["atividade"]), []).append(x)
    fora = []
    for k, g in grupos.items():
        if len(g) < 2:
            continue
        def peso(x):
            # o texto entra na conta porque nem toda informação está na coluna
            # certa: o PDF de inspeção deixou número de peça e OS dentro da
            # própria atividade, e é essa cópia que vale a pena manter.
            return (bool(x.get("os")), bool(x.get("concluida")), bool(x.get("semana")),
                    len(x.get("equipe") or []), len(x.get("obs") or ""),
                    len(x.get("atividade") or ""))
        g = sorted(g, key=peso, reverse=True)
        fica, saem = g[0], g[1:]
        outras = [x.get("os") for x in saem if x.get("os") and x.get("os") != fica.get("os")]
        if outras:
            obs_atual = fica.get("obs") or ""
            # se ele já anotou os números na observação, não repete a lista
            if not all(o in obs_atual for o in outras):
                todas = ", ".join(dict.fromkeys([fica.get("os")] + outras))
                fica["obs"] = " · ".join(p for p in [obs_atual,
                                                     f"OS do Protheus: {todas}"] if p)
        rel.append(f"  {fica.get('frota')} · {fica['atividade'][:60]}")
        rel.append(f"      fica  : OS {fica.get('os') or '—'} · "
                   f"semana {fica.get('semana') or '—'} · "
                   f"{fica.get('marcar') or 'pendente'}")
        for x in saem:
            rel.append(f"      sai   : OS {x.get('os') or '—'} · "
                       f"semana {x.get('semana') or '—'} · "
                       f"{x.get('marcar') or 'pendente'}")
        fora.extend(id(x) for x in saem)
    d["linhas"] = [x for x in d["linhas"] if id(x) not in set(fora)]
    rel.insert(0, f"DUPLICATAS FUNDIDAS · {len(fora)} linhas saíram")
    return fora


# ══════════════════════════════════════════════════════════════════

def main():
    args = [a for a in sys.argv[1:]]
    if not args:
        sys.stderr.write(__doc__); sys.exit(1)
    semana = None
    if "--semana" in args:
        semana = int(args[args.index("--semana") + 1])
    mover = "--mover-repetidas" in args
    # --dia Ter: sem dia a atividade tem semana mas não tem data, e a Situação
    # a joga em "Na carteira" — fica fora da grade do dia e da aba Hoje.
    dia = None
    if "--dia" in args:
        alvo = sem_acento(args[args.index("--dia") + 1])
        d3 = DIA3.get(re.sub(r"[^a-z]", "", alvo.split("-")[0]))
        if not d3:
            sys.stderr.write(f"não reconheci o dia {alvo!r}\n"); sys.exit(1)
        dia = d3.capitalize()
    if mover and semana is None:
        sys.stderr.write("--mover-repetidas precisa de --semana N: "
                         "para onde eu movo?\n")
        sys.exit(1)
    d = json.load(io.open(args[0], encoding="utf-8"))
    d.setdefault("linhas", []); d.setdefault("listas", {})
    rel = []
    n0 = len(d["linhas"])

    if "--fechar-semana" in args:
        alvo = int(args[args.index("--fechar-semana") + 1])
        if "--em" not in args:
            sys.stderr.write("--fechar-semana precisa de --em AAAA-MM-DD: é a "
                             "data que decide no prazo contra com atraso, e "
                             "adivinhar isso seria escolher o indicador por "
                             "você\n")
            sys.exit(1)
        em = args[args.index("--em") + 1]
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", em):
            sys.stderr.write(f"data inválida: {em!r} (use AAAA-MM-DD)\n")
            sys.exit(1)
        modo_fechar(d, rel, alvo, em)
    elif "--limpar" in args:
        modo_limpar(d, rel)
    elif "--juntar" in args:
        modo_juntar(d, rel)
    else:
        lote = next((a for a in args[1:] if not a.startswith("-")
                     and not a.isdigit()), None)
        if not lote:
            sys.stderr.write("falta o arquivo do lote (ou --limpar / --juntar)\n")
            sys.exit(1)
        modo_lote(d, lote, rel, semana=semana, mover=mover, dia=dia)

    for l in rel:
        sys.stderr.write(l + "\n")
    sys.stderr.write(f"\nlinhas: {n0} → {len(d['linhas'])}\n")
    json.dump(d, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
