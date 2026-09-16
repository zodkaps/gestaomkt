# -*- coding: utf-8 -*-
"""
O miolo de texto da planilha: identidade de atividade e padronização
====================================================================
Duas perguntas moram aqui, e só aqui:

  1. "esta atividade é a mesma que aquela?"      → chave / posicao / esqueleto
  2. "como este texto deveria estar escrito?"    → padronizar

**Por que posição é o centro de tudo.** Manutenção escreve atividades que
diferem só pelo lugar da peça: "lona de freio dianteira LD" e "lona de freio
dianteiro LE" são dois serviços, em duas rodas, com duas peças. Um comparador
por parecença acha 182 pares suspeitos nas 271 atividades da planilha e erra em
quase todos. O mesmo comparador, ensinado a separar POSIÇÃO de SERVIÇO, acha 4
— e acerta os 4.

Então a identidade de uma atividade tem duas metades:

    esqueleto  = o serviço, sem posição   ("substituir lona freio")
    posicao    = onde                     ({dianteiro, ld})

Mesmo esqueleto + mesma posição = a mesma atividade.
Mesmo esqueleto + posição diferente = irmãs, e não se alerta nada.
"""
import re, unicodedata

# ── tokens que dizem ONDE, não O QUÊ ──
# Ficam de fora do esqueleto e viram a segunda metade da identidade.
POSICAO = re.compile(
    r"\b(ld|le|lda|lea|"
    r"dianteir[oa]s?|traseir[oa]s?|frontal|"
    r"superior(?:es)?|inferior(?:es)?|"
    r"esquerd[oa]s?|direit[oa]s?|lado|"
    r"eixo|eixos|"
    r"[1-9]|[1-9]o|[1-9]a|"
    r"primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|sext[oa])\b")

# ── palavras que não distinguem nada ──
VAZIAS = set("de da do das dos e a o as os no na nos nas em com para por um uma "
             "ao aos que se sua seu suas seus mesmo mesma mesmos mesmas".split())


def base(t):
    """Texto cru para comparação: sem acento, sem caixa, sem pontuação, sem o
    que está entre parênteses e sem código de peça ou OS grudado no meio.

    Os parênteses saem porque é onde o PDF de inspeção despejou número de peça,
    "OS ABRIR OS" e nome de oficina — nada disso identifica a atividade."""
    t = re.sub(r"\([^()]*\)", " ", str(t or ""))
    t = re.sub(r"\([^)]*\)?", " ", t)          # sobra de parêntese aninhado ou aberto
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()
    t = re.sub(r"\b\d{4,}\b", " ", t)          # 20855371, 007011: código, não serviço
    t = re.sub(r"\bos\b", " ", t.lower())      # "OS 7185" já perdeu o número acima
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def posicao(t):
    """Onde a atividade acontece. Frozenset porque é metade de uma chave."""
    return frozenset(POSICAO.findall(base(t)))


# Sufixos que só mudam a forma da palavra, não a peça nem o serviço. Sem isto,
# "Trocar pneus" e "Realizar troca dos pneus" passam por atividades diferentes —
# e são a mesma, escrita por duas pessoas.
SUFIXOS = ("issimos", "issimas", "amento", "imento", "mentos", "ssao", "coes",
           "cao", "agem", "ncia", "ados", "adas", "idos", "idas", "ado", "ada",
           "ido", "ida", "ar", "er", "ir", "es", "ns", "s")


# Radicais que são a mesma coisa na oficina. Só entram aqui os que um mecânico
# usaria um pelo outro sem mudar o serviço — "trocar o amortecedor" e
# "substituir o amortecedor" são a mesma ordem. "Recuperar", "corrigir" e
# "repor" ficam de fora de propósito: recuperar é reformar a peça, repor é pôr
# a que sumiu, e tratá-los como sinônimo esconderia serviço de verdade.
SINONIMOS = {"troc": "substitu"}


def raiz(p):
    """Radical grosseiro: corta o sufixo mais longo que couber, sem deixar a
    palavra com menos de 4 letras. 'trocar', 'troca' e 'trocadas' viram 'troc'."""
    for s in SUFIXOS:
        if p.endswith(s) and len(p) - len(s) >= 4:
            p = p[: -len(s)]
            break
    return SINONIMOS.get(p, p)


def esqueleto(t):
    """O serviço sem o onde e sem a forma da palavra.

    Reduz ANTES de comparar: é o que faz "Realizar troca dos pneus" e "Trocar
    pneus" caírem no mesmo lugar.

    Usa `_nucleo`, não `padronizar`, e a diferença importa: padronizar pode
    RECUSAR a reescrita (parêntese aninhado, texto cortado) e devolver o texto
    cru. Se a identidade dependesse disso, duas cópias da mesma atividade — uma
    inteira, outra truncada no PDF — passariam por atividades diferentes. Poder
    reescrever e poder comparar são perguntas separadas."""
    s = POSICAO.sub(" ", base(_nucleo(t)[0]))
    return " ".join(raiz(p) for p in s.split()
                    if p not in VAZIAS and len(p) > 2)


def chave(frota, t):
    """A identidade completa: quem, o quê, onde."""
    return (str(frota or "").strip(), esqueleto(t), posicao(t))


def mesma_atividade(frota_a, ta, frota_b, tb):
    return chave(frota_a, ta) == chave(frota_b, tb)


# ═══════════════════════════════════════════════════════════════════════
#  Padronização: verbo no infinitivo + objeto + posição
# ═══════════════════════════════════════════════════════════════════════

# A cauda explicativa. Diz por que o serviço existe, não o que fazer — e é ela
# que faz o texto passar de 130 caracteres e não caber na tela do tablet.
CAUDA = re.compile(
    r"[,;:]?\s*\b(devido|para melhor|para evitar|evitando|visando|"
    r"pois|ja que|já que|conforme|uma vez que|a fim de|sob pena|"
    r"por conta d[oae]|em razao d[oae]|em razão d[oae])\b.*$", re.IGNORECASE)

# Verbo de enchimento: "Realizar troca de X" não diz mais que "Trocar X".
# São 32 atividades hoje (22 "Realizar", 10 "Programar"), fora os bullets de PDF.
#
# O conector "de/do/da" é opcional porque ele às vezes escreve "substituição
# lona de freio", sem o "da". Mas o que vem depois NÃO pode ser o objeto em duas
# famílias de palavra: conjunção e preposição, que quebrariam a frase ("Realizar
# troca OU calibração" viraria "Trocar ou calibração", "Realizar limpeza NOS
# bornes" viraria "Limpar nos bornes"); e adjetivo que qualifica o substantivo
# em vez de ser qualificado por ele — "lubrificação GERAL" viraria "Lubrificar
# geral", que não é ordem de serviço nenhuma. Quando a frase não é
# <verbo> <substantivo> <complemento>, o texto fica como está: português
# quebrado é pior que texto comprido.
_NAO_OBJETO = (r"(?:ou|e|no|na|nos|nas|em|com|para|por|ao|aos|a|o|se|que"
               r"|geral|gerais|complet[oa]s?|total|parcial|peri[óo]dic[oa]"
               r"|preventiv[oa]|corretiv[oa]|simples)")
_D = r"(?:\s+d[oaeu]s?)?\s+(?!" + _NAO_OBJETO + r"\b)"
ENCHIMENTO = [
    (re.compile(r"^\s*[*\-–·•]+\s*"), ""),
    (re.compile(r"^(?:realizar|efetuar|fazer|executar|proceder\s+a?o?|programar)"
                r"(?:\s+a|\s+o)?\s+troca" + _D, re.I), "Trocar "),
    (re.compile(r"^(?:realizar|efetuar|fazer|executar|programar)"
                r"(?:\s+a|\s+o)?\s+substitui[çc][ãa]o" + _D, re.I), "Substituir "),
    (re.compile(r"^(?:realizar|efetuar|fazer|executar|programar)"
                r"(?:\s+a|\s+o)?\s+recupera[çc][ãa]o" + _D, re.I), "Recuperar "),
    (re.compile(r"^(?:realizar|efetuar|fazer|executar|programar)"
                r"(?:\s+a|\s+o)?\s+limpeza" + _D, re.I), "Limpar "),
    (re.compile(r"^(?:realizar|efetuar|fazer|executar|programar)"
                r"(?:\s+a|\s+o)?\s+repara[çc][ãa]o" + _D, re.I), "Reparar "),
    (re.compile(r"^(?:realizar|efetuar|fazer|executar|programar)"
                r"(?:\s+a|\s+o)?\s+revis[ãa]o" + _D, re.I), "Revisar "),
    (re.compile(r"^(?:realizar|efetuar|fazer|executar|programar)"
                r"(?:\s+a|\s+o)?\s+regulagem" + _D, re.I), "Regular "),
    (re.compile(r"^(?:realizar|efetuar|fazer|executar|programar)"
                r"(?:\s+a|\s+o)?\s+instala[çc][ãa]o" + _D, re.I), "Instalar "),
    (re.compile(r"^(?:realizar|efetuar|fazer|executar|programar)"
                r"(?:\s+a|\s+o)?\s+lubrifica[çc][ãa]o" + _D, re.I), "Lubrificar "),
]
# Não existe regra que apague "Realizar" sozinho. "Realizar alinhamento" viraria
# "Alinhamento", que é um substantivo: deixa de ser uma ordem de serviço e vira
# um assunto. Só se dissolve o verbo quando há outro verbo para pôr no lugar.

MIN = 8          # abaixo disto o texto deixou de dizer o que fazer


def _parenteses_ok(t):
    """Parêntese aninhado ou aberto significa que o texto veio picado do PDF.
    A extração por regex erra nesses, deixando ')' solto ou embaralhando a
    ordem — então nem tenta."""
    if t.count("(") != t.count(")"):
        return False
    return not re.search(r"\([^()]*\(", t)


def _nucleo(t):
    """A redução, sem julgar se é seguro gravá-la. Devolve (texto, [observações]).

    É o miolo comum de `padronizar` (que ainda vai aplicar as travas) e de
    `esqueleto` (que só quer comparar)."""
    obs = []
    for m in re.finditer(r"\(([^()]*)\)", str(t or "")):
        p = m.group(1).strip(" ·.,;")
        if p:
            obs.append(p)
    novo = re.sub(r"\([^()]*\)", " ", str(t or ""))
    novo = re.sub(r"\([^)]*$", " ", novo)      # parêntese que o PDF não fechou

    m = CAUDA.search(novo)
    if m:
        c = m.group(0).strip(" ,;:")
        if c:
            obs.append(c)
        novo = CAUDA.sub("", novo)

    for rx, rep in ENCHIMENTO:
        n2 = rx.sub(rep, novo, count=1)
        if n2 != novo:
            novo = n2
            break

    novo = re.sub(r"\s+", " ", novo).strip(" .,;:-·/")
    if novo:
        novo = novo[0].upper() + novo[1:]
    return novo, obs


def padronizar(t):
    """Devolve (atividade, obs_extra, motivo).

    motivo == "" quer dizer que deu para padronizar. Com motivo preenchido a
    atividade volta INTACTA, obs_extra vem vazia, e quem chama tem de listar a
    linha — com o motivo — para revisão à mão. Nunca reescreve no escuro."""
    orig = str(t or "").strip()
    if not orig:
        return orig, "", ""
    if orig.count("(") != orig.count(")"):
        return orig, "", "texto cortado na origem — não fecha parêntese"
    if re.search(r"\([^()]*\(", orig):
        return orig, "", "parêntese dentro de parêntese"

    novo, obs = _nucleo(orig)

    # ── as travas ──
    if novo == orig and not obs:
        return orig, "", ""          # nada a fazer não é motivo de alarme
    if len(novo) < MIN:
        return orig, "", "sobraria curto demais para dizer o que fazer"
    if posicao(novo) != posicao(orig):
        # perdeu o LD, o LE ou o eixo: viraria outra atividade
        return orig, "", "perderia a posição da peça"

    return novo, " · ".join(obs), ""
