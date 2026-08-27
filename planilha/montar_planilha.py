# -*- coding: utf-8 -*-
"""
Programação de Serviços — Makro Transportes
============================================
A unidade é a ATIVIDADE (o que antes era "pendência" dentro de uma tarefa):

    aderência = atividades concluídas ÷ atividades programadas no período

Programar é escrever a SEMANA (segunda-feira) e o DIA — a data sai sozinha,
e é isso que deixa repetir uma semana inteira trocando uma célula só.

Uma atividade aceita até três executantes, cada um na sua coluna. A conta
por pessoa soma as três, então serviço feito a quatro mãos aparece na carga
de cada um sem contar duas vezes no total.

A coluna ORIGEM separa o que estava no plano da semana do que entrou depois
("Extra"). Extra não entra no denominador da aderência — não dá para cobrar
cumprimento de uma coisa que nunca foi programada —, e tem contador próprio,
que é o que mostra quanto da oficina a semana perdeu para o imprevisto.

    python3 montar_planilha.py [dados.json] [--semana AAAA-MM-DD]

`dados.json` vem do extrair_pdf.py. `--semana` limita a importação à semana
que começa naquela segunda-feira.
"""
import sys, json, io
from datetime import date, timedelta
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule, DataBarRule, FormulaRule
from openpyxl.comments import Comment

SAIDA="/home/user/gestaomkt/planilha/Programacao_Servicos_Makro.xlsx"

NAVY="FF13164E"; NAVY2="FF2A3170"; RED="FFE4002A"
CINZA="FFD9DEE8"; CINZA_C="FFEEF1F7"; AMARELO="FFFFF3CF"
BORDA="FFC8D0DE"; BRANCO="FFFFFFFF"; TINTA="FF14181F"; T2="FF4A5464"
OK_V="FFE3F5EA"; OK_T="FF116B3E"; AL_V="FFFDF0D8"; AL_T="FF8A5A05"
RU_V="FFFDE4E7"; RU_T="FFB00020"; AZ_V="FFE7EEFB"; AZ_T="FF1749C4"

F=lambda **k: Font(name="Arial", **k)
fina=Side(style="thin", color=BORDA)
box=Border(left=fina,right=fina,top=fina,bottom=fina)
def fill(c): return PatternFill("solid", fgColor=c)

PRIM=5; ULT=1004; LIN_LISTA=84; N_SEMANAS=130
DIAS_PT=["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"]
def segunda(d): return d - timedelta(days=d.weekday())

# ═══════════════════════════════════ dados do PDF
args=[a for a in sys.argv[1:] if not a.startswith("--")]
SEM_ALVO=None
if "--semana" in sys.argv:
    a,m,d=sys.argv[sys.argv.index("--semana")+1].split("-")
    SEM_ALVO=date(int(a),int(m),int(d))
DADOS=json.load(io.open(args[0],encoding="utf-8")) if args else None

def d2(s):
    a,m,d=s.split("-"); return date(int(a),int(m),int(d))

def montar_linhas(dados):
    linhas=[]; execs=set(); frotas=set(); tipos=set(); fora=[]
    if not dados: return linhas,execs,frotas,tipos,fora

    orig={}; motiv={}
    for r in dados.get("reprogramacoes",[]):
        ch=(r["frota"], r["servico"].split(" — ")[0].strip())
        d,m,a=r["de"].split("/")
        orig[ch]=date(2000+int(a),int(m),int(d))
        if r["motivo"] and ch not in motiv: motiv[ch]=r["motivo"]
    def casa(frota,titulo):
        for (f,s),v in orig.items():
            if f!=frota: continue
            a,b=s.lower(),titulo.lower()
            if a[:20] in b or b[:20] in a: return v, motiv.get((f,s),"")
        return None,""

    for s in dados["servicos"]:
        ini=d2(s["ini"])
        # Só o que foi programado PARA a semana pedida. Serviço que começou
        # antes é programação da semana anterior arrastando — não entra.
        if SEM_ALVO and not (SEM_ALVO <= ini <= SEM_ALVO+timedelta(days=6)):
            fora.append((s["frota"],s["titulo"],ini,len(s["pendencias"]) or 1)); continue
        marcar_exec = "Em execução" if s["situacao"]=="EM EXECUÇÃO" else ""
        p_orig,p_mot=casa(s["frota"],s["titulo"])
        if p_orig==ini: p_orig=None
        obs=s["obs"]
        if s.get("sistema"):
            obs=("Sistema: "+s["sistema"]+(" · "+obs if obs else ""))
        eq=[x.strip() for x in s["executantes"].split(",") if x.strip()] \
           if "(externo)" not in s["executantes"] else [s["executantes"].strip()]
        for e in eq: execs.add(e)
        frotas.add(s["frota"]); tipos.add(s["tipo"])
        itens=s["pendencias"] or [{"texto":s["titulo"],"feito":s["situacao"]=="CONCLUÍDA"}]
        nd=max(1,s["dias"])
        for k,p in enumerate(itens):
            dk=ini+timedelta(days=(k*nd)//max(1,len(itens)))
            linhas.append(dict(os=s["os"], frota=s["frota"], servico=s["titulo"],
                atividade=p["texto"], tipo=s["tipo"], equipe=eq[:3],
                semana=segunda(dk), dia=DIAS_PT[dk.weekday()],
                concluida=None, marcar=("Concluída" if p["feito"] else marcar_exec),
                orig=p_orig, motivo=(p_mot if p_orig else ""), obs=obs))
    return linhas,execs,frotas,tipos,fora

LINHAS,EXECS,FROTAS,TIPOS,FORA=montar_linhas(DADOS)
EXEC_LISTA=sorted(EXECS, key=lambda x:(("(externo)" in x), x.lower()))
FROTA_LISTA=sorted(FROTAS)
TIPO_LISTA=sorted(TIPOS)
for t in ("Corretiva","Preventiva","Preditiva","Melhoria","Inspeção"):
    if t not in TIPO_LISTA: TIPO_LISTA.append(t)

# lista de segundas-feiras para a caixa de seleção da aba Semana
base=segunda(min([l["semana"] for l in LINHAS] or [date.today()])) - timedelta(weeks=26)
SEMANAS=[base+timedelta(weeks=i) for i in range(N_SEMANAS)]

wb=Workbook()

# ═══════════════════════════════════ LISTAS
ls=wb.active; ls.title="Listas"
COLS_L=[("Executantes",EXEC_LISTA),("Frotas",FROTA_LISTA),("Tipo de serviço",TIPO_LISTA),
        ("Marcar",["Concluída","Em execução","Cancelada"]),
        ("Motivo da reprogramação",["Peça não chegou","Frota em viagem","Falta de mão de obra",
          "Serviço maior que o previsto","Mudou a prioridade","Oficina cheia",
          "Aguardando terceiro","Box bloqueado"]),
        ("Dia",DIAS_PT)]
ls["A1"]="LISTAS DE APOIO"
ls["A1"].font=F(bold=True,size=11,color=BRANCO); ls["A1"].fill=fill(NAVY)
ls["A1"].alignment=Alignment(vertical="center",indent=1)
ls.merge_cells("A1:G1"); ls.row_dimensions[1].height=24
ls["A2"]=("Alimentam as caixas de seleção. Acrescente nomes aqui e as caixas acompanham. "
          "Não deixe linha em branco no meio de uma lista.")
ls["A2"].font=F(size=9,italic=True,color=T2); ls.merge_cells("A2:G2")
for j,(tit,vals) in enumerate(COLS_L,start=1):
    c=ls.cell(row=4,column=j,value=tit)
    c.font=F(bold=True,size=10,color=BRANCO); c.fill=fill(NAVY2)
    c.alignment=Alignment(horizontal="center"); c.border=box
    for i in range(5,LIN_LISTA+1):
        cc=ls.cell(row=i,column=j)
        if i-5<len(vals): cc.value=vals[i-5]
        cc.font=F(size=10); cc.border=box
c=ls.cell(row=4,column=7,value="Semanas")
c.font=F(bold=True,size=10,color=BRANCO); c.fill=fill(NAVY2)
c.alignment=Alignment(horizontal="center"); c.border=box
for i,dt_ in enumerate(SEMANAS):
    cc=ls.cell(row=5+i,column=7,value=dt_)
    cc.font=F(size=10); cc.border=box; cc.number_format="dd/mm/yyyy"
    cc.alignment=Alignment(horizontal="center")
ls["I4"]=("Segundas-feiras que aparecem na caixa de seleção da aba Semana. "
          "Vão de %s a %s." % (SEMANAS[0].strftime("%d/%m/%Y"),SEMANAS[-1].strftime("%d/%m/%Y")))
ls["I4"].font=F(size=9,italic=True,color=T2)
for j,w in enumerate([26,12,16,14,28,8,13],start=1):
    ls.column_dimensions[get_column_letter(j)].width=w
ls.sheet_view.showGridLines=False; ls.freeze_panes="A5"
FIM_SEM=5+N_SEMANAS-1
REF_SEMANAS=f"Listas!$G$5:$G${FIM_SEM}"

# ═══════════════════════════════════ PROGRAMAÇÃO
pg=wb.create_sheet("Programação")
# A Situação é o que mais se lê e vivia na ponta direita, a 17 colunas de
# distância de onde se digita. Subiu para a frente; o resto do cálculo fica
# no fim, onde não atrapalha.
COLS=[("A","Nº",5,"c"),("B","Situação",18,"c"),
      ("C","OS",11,"1"),("D","Frota",9,"1"),("E","Serviço",26,"1"),
      ("F","Atividade",42,"1"),("G","Tipo",11,"1"),("H","Origem",13,"1"),
      ("I","Executante 1",17,"q"),("J","Executante 2",17,"q"),("K","Executante 3",17,"q"),
      ("L","Semana",11,"2"),("M","Dia",7,"2"),("N","Data programada",14,"c"),
      ("O","Concluída em",13,"3"),("P","Marcar",12,"3"),("Q","1ª data",11,"3"),
      ("R","Motivo",22,"3"),("S","Obs.",24,"3"),
      ("T","Oficina",12,"c"),("U","Plano",11,"c"),
      ("V","No prazo",8,"c"),("W","No plano",8,"c"),("X","Atraso",8,"c"),
      ("Y","Reprog.",8,"c"),("Z","Concl.",8,"c")]
CORB={"1":AMARELO,"q":"FFE9F3E6","2":"FFDCE9FA","3":"FFEDEFF4","c":CINZA}

pg["A1"]="PROGRAMAÇÃO DE SERVIÇOS  ·  MAKRO TRANSPORTES  ·  uma linha por atividade"
pg["A1"].font=F(bold=True,size=13,color=BRANCO); pg["A1"].fill=fill(NAVY)
pg["A1"].alignment=Alignment(vertical="center",indent=1)
pg.merge_cells("A1:Z1"); pg.row_dimensions[1].height=30

for a,b,txt,g in [("A","B","CALCULADO","c"),("C","H","1 · O QUE É O SERVIÇO","1"),
                  ("I","K","2 · QUEM FAZ — até três","q"),
                  ("L","N","3 · PROGRAMAR — semana e dia","2"),
                  ("O","S","4 · SÓ QUANDO ACONTECER","3"),
                  ("T","Z","CALCULADO — não digite aqui","c")]:
    pg.merge_cells(f"{a}2:{b}2")
    c=pg[f"{a}2"]; c.value=txt
    c.font=F(bold=True,size=9,color=T2); c.fill=fill(CORB[g])
    c.alignment=Alignment(horizontal="center",vertical="center"); c.border=box
pg.row_dimensions[2].height=18

for letra,tit,larg,grp in COLS:
    c=pg[letra+"3"]; c.value=tit
    c.font=F(bold=True,size=9.5,color=BRANCO)
    c.fill=fill(NAVY if grp in "12q3" else NAVY2)
    c.alignment=Alignment(horizontal="center",vertical="center",wrap_text=True)
    c.border=box
    pg.column_dimensions[letra].width=larg
pg.row_dimensions[3].height=30

pg["B3"].comment=Comment(
 "Sai sozinha do que você preencheu. Não digite aqui.\n\n"
 "Na carteira · Programada · Hoje · Em execução · VENCIDA · "
 "Concluída · Concluída com atraso · Cancelada","PCM")
pg["F3"].comment=Comment(
 "A ATIVIDADE é a unidade: “trocar as lonas”, “regular a catraca”.\n\n"
 "Um serviço com três atividades ocupa três linhas — mesma OS, mesmo Serviço.\n\n"
 "A aderência é medida por aqui.","PCM")
pg["H3"].comment=Comment(
 "PROGRAMADA (ou em branco): estava no plano da semana.\n\n"
 "EXTRA: entrou depois — quebra, urgência, pedido da operação.\n\n"
 "Extra NÃO entra no denominador da aderência: não dá para cobrar "
 "cumprimento de uma coisa que nunca foi programada. Ela tem contador "
 "próprio, que mostra quanto da semana foi para o imprevisto.","PCM")
pg["I3"].comment=Comment(
 "Até três pessoas na mesma atividade, uma por coluna.\n\n"
 "Na aba Semana e na Aderência, a atividade entra na carga de cada uma "
 "delas — e conta uma vez só no total.\n\n"
 "Empresa externa: escreva o nome com “(externo)” no fim.","PCM")
pg["L3"].comment=Comment(
 "A SEGUNDA-FEIRA da semana. Escreva numa linha e arraste para baixo.\n\n"
 "Para repetir a semana passada: copie as linhas, cole no fim e troque só "
 "esta coluna — todas as datas andam junto.","PCM")
pg["M3"].comment=Comment("Seg, Ter, Qua, Qui, Sex, Sáb ou Dom.\n\nSemana + Dia = Data programada.","PCM")
pg["O3"].comment=Comment("Preencher esta data já conclui a atividade.","PCM")
pg["Q3"].comment=Comment("Só ao REPROGRAMAR: guarde aqui a data que estava antes.","PCM")

for i,d in enumerate(LINHAS):
    r=PRIM+i
    eq=d["equipe"]+["",""]
    for col,val in (("C",d["os"]),("D",d["frota"]),("E",d["servico"]),("F",d["atividade"]),
                    ("G",d["tipo"]),("H",d.get("origem","")),
                    ("I",eq[0]),("J",eq[1]),("K",eq[2]),
                    ("L",d["semana"]),("M",d["dia"]),("O",d["concluida"]),
                    ("P",d["marcar"]),("Q",d["orig"]),("R",d["motivo"]),("S",d["obs"])):
        if val not in (None,""): pg[f"{col}{r}"]=val

for r in range(PRIM,ULT+1):
    pg[f"A{r}"]=f'=IF($F{r}="","",COUNTA($F${PRIM}:$F{r}))'
    pg[f"N{r}"]=f'=IF(OR($L{r}="",$M{r}=""),"",$L{r}+MATCH($M{r},Listas!$F$5:$F$11,0)-1)'
    pg[f"B{r}"]=(f'=IF($F{r}="","",'
      f'IF($P{r}="Cancelada","Cancelada",'
      f'IF(OR($O{r}<>"",$P{r}="Concluída"),'
      f'IF(OR($N{r}="",$O{r}="",$O{r}<=$N{r}),"Concluída","Concluída com atraso"),'
      f'IF($N{r}="","Na carteira",'
      f'IF($N{r}<TODAY(),"VENCIDA",'
      f'IF($P{r}="Em execução","Em execução",'
      f'IF($N{r}=TODAY(),"Hoje","Programada")))))))')
    pg[f"T{r}"]=(f'=IF($F{r}="","",IF(ISNUMBER(SEARCH("(externo)",$I{r}&$J{r}&$K{r})),'
                 f'"Terceirizada","Interna"))')
    pg[f"U{r}"]=f'=IF($N{r}="","",IF($Q{r}="",$N{r},$Q{r}))'
    pg[f"V{r}"]=f'=IF($F{r}="","",IF(OR($O{r}="",$N{r}=""),0,IF($O{r}<=$N{r},1,0)))'
    pg[f"W{r}"]=f'=IF($F{r}="","",IF(OR($O{r}="",$U{r}=""),0,IF($O{r}<=$U{r},1,0)))'
    pg[f"X{r}"]=f'=IF(OR($O{r}="",$N{r}=""),"",MAX(0,$O{r}-$N{r}))'
    pg[f"Y{r}"]=f'=IF($F{r}="","",IF(AND($Q{r}<>"",$N{r}<>"",$Q{r}<>$N{r}),1,0))'
    pg[f"Z{r}"]=(f'=IF($F{r}="","",IF($P{r}="Cancelada",0,'
                 f'IF(OR($O{r}<>"",$P{r}="Concluída"),1,0)))')
    for letra,tit,larg,grp in COLS:
        c=pg[letra+str(r)]
        c.font=F(size=10, color=TINTA if grp in "12q3" else T2)
        c.border=box
        if grp=="c": c.fill=fill(CINZA_C)
        elif grp=="2": c.fill=fill("FFF4F9FF")
        elif grp=="q": c.fill=fill("FFF6FBF5")
        if letra in ("L","N","O","Q","U"): c.number_format="dd/mm/yyyy"
        if letra in ("A","B","G","H","M","P","T","V","W","X","Y","Z"):
            c.alignment=Alignment(horizontal="center")
    pg.row_dimensions[r].height=16.5

def dv(col, formula, titulo, msg):
    v=DataValidation(type="list", formula1=formula, allow_blank=True, showDropDown=False)
    v.error=msg; v.errorTitle=titulo; v.showErrorMessage=True
    pg.add_data_validation(v); v.add(f"{col}{PRIM}:{col}{ULT}")
dv("D", f"=Listas!$B$5:$B${LIN_LISTA}", "Frota", "Escolha uma frota da aba Listas.")
dv("G", f"=Listas!$C$5:$C${LIN_LISTA}", "Tipo", "Escolha um tipo da aba Listas.")
dv("H", '"Programada,Extra"', "Origem",
   "Programada (estava no plano) ou Extra (entrou depois).")
for cx in ("I","J","K"):
    dv(cx, f"=Listas!$A$5:$A${LIN_LISTA}", "Executante", "Escolha um nome da aba Listas.")
dv("M", "=Listas!$F$5:$F$11", "Dia", "Seg, Ter, Qua, Qui, Sex, Sáb ou Dom.")
dv("P", "=Listas!$D$5:$D$7", "Marcar", "Deixe vazio, ou Concluída / Em execução / Cancelada.")
dv("R", f"=Listas!$E$5:$E${LIN_LISTA}", "Motivo", "Escolha da aba Listas ou escreva o seu.")

fx=f"B{PRIM}:B{ULT}"
for txt,fv,ft in (("VENCIDA",RU_V,RU_T),("Concluída",OK_V,OK_T),
                  ("Concluída com atraso",AL_V,AL_T),("Hoje",AZ_V,AZ_T),
                  ("Em execução",AZ_V,AZ_T),("Na carteira",CINZA,T2)):
    pg.conditional_formatting.add(fx, CellIsRule(operator="equal", formula=[f'"{txt}"'],
        fill=fill(fv), font=F(bold=True,size=10,color=ft)))
pg.conditional_formatting.add(f"X{PRIM}:X{ULT}", CellIsRule(operator="greaterThan",
    formula=["0"], font=F(bold=True,size=10,color=RU_T)))
# Extra programação salta aos olhos: é o que explica a aderência ter caído.
pg.conditional_formatting.add(f"H{PRIM}:H{ULT}", CellIsRule(operator="equal",
    formula=['"Extra"'], fill=fill("FFFFE0B2"), font=F(bold=True,size=10,color="FF9A4C00")))
# Um serviço ocupa várias linhas seguidas. Uma régua no alto da primeira
# linha de cada serviço separa um do outro sem pintar nada.
from openpyxl.styles.differential import DifferentialStyle
from openpyxl.formatting.rule import Rule
regua=Rule(type="expression", dxf=DifferentialStyle(
    border=Border(top=Side(style="medium", color="FF9AA8BF"))), stopIfTrue=False)
regua.formula=[f'AND($F{PRIM}<>"",$D{PRIM}&$E{PRIM}<>$D{PRIM-1}&$E{PRIM-1})']
pg.conditional_formatting.add(f"A{PRIM}:Z{ULT}", regua)

pg.freeze_panes="G5"
pg.auto_filter.ref=f"A3:Z{ULT}"
pg.sheet_view.showGridLines=False

# ═══════════════════════════════════ referências
PROG="Programação"
def rg(c): return f"{PROG}!${c}${PRIM}:${c}${ULT}"
ATIV   = rg("F")   # a atividade — linha preenchida
FROTA_ = rg("D"); TIPO_ = rg("G"); ORIG = rg("H")
EQ     = (rg("I"), rg("J"), rg("K"))          # os três executantes
DATA   = rg("N")   # data programada (semana + dia)
CONCLEM= rg("O"); MARC = rg("P"); PLANO = rg("U")
NOPRAZO= rg("V"); NOPLANO = rg("W"); ATRASO = rg("X")
REPROG = rg("Y"); CONCL = rg("Z"); OFIC = rg("T")
# "não é extra" cobre tanto vazio quanto "Programada"
NAOEXTRA=f'{ORIG},"<>Extra"'
NAOCANC =f'{MARC},"<>Cancelada"'
PLANEJ  =f'{NAOCANC},{NAOEXTRA}'
def porpessoa(alvo, extra, agregado="COUNTIFS", faixa=None):
    """Soma as três colunas de executante — uma atividade a quatro mãos
       entra na carga de cada um, e uma vez só no total da oficina."""
    ini=f"SUMIFS({faixa}," if agregado=="SUMIFS" else "COUNTIFS("
    return "+".join(f'{ini}{c},{alvo},{extra})' for c in EQ)

def titulo(ws, texto, ate, altura=30, tam=13):
    ws["A1"]=texto
    ws["A1"].font=F(bold=True,size=tam,color=BRANCO); ws["A1"].fill=fill(NAVY)
    ws["A1"].alignment=Alignment(vertical="center",indent=1)
    ws.merge_cells(f"A1:{ate}1"); ws.row_dimensions[1].height=altura
def cabec(ws, linha, itens, cor=NAVY2):
    for col,txt in itens:
        c=ws[f"{col}{linha}"]; c.value=txt
        c.font=F(bold=True,size=9.5,color=BRANCO); c.fill=fill(cor)
        c.alignment=Alignment(horizontal="center",vertical="center",wrap_text=True)
        c.border=box

# ═══════════════════════════════════ SEMANA
sm=wb.create_sheet("Semana")
titulo(sm,"GRADE DA SEMANA  ·  atividades por executante e por dia","L")

# ── escolher a semana ──
sm["A3"]="SEMANA:"
sm["A3"].font=F(bold=True,size=12,color=NAVY)
sm["A3"].alignment=Alignment(vertical="center",indent=1)
sm.merge_cells("A3:B3")
sm["C3"]=(LINHAS[0]["semana"] if LINHAS else date.today()-timedelta(days=date.today().weekday()))
c=sm["C3"]; c.font=F(bold=True,size=14,color=NAVY); c.fill=fill(AMARELO)
c.number_format="dd/mm/yyyy"; c.border=Border(*[Side(style="medium",color=NAVY)]*4)
c.alignment=Alignment(horizontal="center",vertical="center")
c.comment=Comment("Clique na célula e abra a setinha: a lista traz todas as "
 "segundas-feiras.\n\nA grade inteira, os números e a faixa “onde tem "
 "programação” acompanham o que você escolher aqui.","PCM")
dvS=DataValidation(type="list", formula1=f"={REF_SEMANAS}", allow_blank=False, showDropDown=False)
dvS.errorTitle="Semana"; dvS.error="Escolha uma segunda-feira da lista."
dvS.showErrorMessage=True
sm.add_data_validation(dvS); dvS.add("C3")
sm["D3"]="até"
sm["D3"].font=F(size=11,color=T2); sm["D3"].alignment=Alignment(horizontal="center",vertical="center")
sm["E3"]="=$C$3+6"
c=sm["E3"]; c.font=F(bold=True,size=14,color=T2); c.number_format="dd/mm/yyyy"
c.alignment=Alignment(horizontal="center",vertical="center"); c.fill=fill(CINZA_C); c.border=box
sm["F3"]="◀  clique na seta da célula amarela e escolha a segunda-feira"
sm["F3"].font=F(size=10,italic=True,color=NAVY)
sm["F3"].alignment=Alignment(vertical="center",indent=1); sm.merge_cells("F3:L3")
sm.row_dimensions[3].height=28

# ── resumo da semana escolhida ──
jan=f'{DATA},">="&$C$3,{DATA},"<="&$C$3+6'
sm["A4"]="NESTA SEMANA"
sm["A4"].font=F(bold=True,size=10,color=NAVY)
sm["A4"].alignment=Alignment(vertical="center",indent=1)
sm.merge_cells("A4:L4"); sm.row_dimensions[4].height=20
# Extra programação fica ao lado, e não dentro: aderência é sobre o que foi
# combinado, e extra nunca foi.
RES=[("A","PROGRAMADAS",f'=COUNTIFS({jan},{PLANEJ})',"0",NAVY,
      "atividades que estavam no plano da semana"),
     ("C","CONCLUÍDAS", f'=SUMIFS({CONCL},{jan},{NAOEXTRA})',"0",OK_T,
      "do plano, quantas saíram"),
     ("E","ADERÊNCIA",  '=IF($A$6=0,"",$C$6/$A$6)',"0%",NAVY,
      "concluídas ÷ programadas"),
     ("G","EXTRA",      f'=COUNTIFS({jan},{ORIG},"Extra",{NAOCANC})',"0","FF9A4C00",
      "entraram fora da programação — quebra, urgência, pedido da operação"),
     ("I","VENCIDAS",   f'=COUNTIFS({jan},{DATA},"<"&TODAY(),{CONCL},0,{NAOCANC})',"0",RU_T,
      "o dia passou e não saiu"),
     ("K","NA CARTEIRA",f'=COUNTIFS({DATA},"",{ATIV},"<>",{NAOCANC})',"0",T2,
      "ainda sem dia — não depende da semana escolhida")]
for col,rot,fml,fmt,cor,dica in RES:
    c2=get_column_letter(ord(col)-64+1)
    sm.merge_cells(f"{col}5:{c2}5"); sm.merge_cells(f"{col}6:{c2}6")
    a=sm[f"{col}5"]; a.value=rot
    a.font=F(bold=True,size=8.5,color=T2); a.alignment=Alignment(horizontal="center")
    a.fill=fill(CINZA_C); a.comment=Comment(dica,"PCM")
    b=sm[f"{col}6"]; b.value=fml
    b.font=F(bold=True,size=18,color=cor); b.number_format=fmt
    b.alignment=Alignment(horizontal="center",vertical="center")
    b.fill=fill("FFFFF1E0" if rot=="EXTRA" else CINZA_C)
    for cc in (col,c2):
        sm[f"{cc}5"].border=box; sm[f"{cc}6"].border=box
sm.row_dimensions[6].height=28

# ── onde tem programação: quatro semanas para cada lado ──
sm["A8"]="ONDE TEM PROGRAMAÇÃO"
sm["A8"].font=F(bold=True,size=10,color=NAVY)
sm["A8"].alignment=Alignment(vertical="center",indent=1); sm.merge_cells("A8:C8")
sm["D8"]="atividades programadas em cada semana — a do meio é a que você escolheu"
sm["D8"].font=F(size=9,italic=True,color=T2); sm.merge_cells("D8:L8")
NAV=["D","E","F","G","H","I","J","K","L"]
for k,col in enumerate(NAV):
    off=k-4
    a=sm[f"{col}9"]; a.value=f"=$C$3+{off*7}" if off else "=$C$3"
    a.number_format="dd/mm"
    a.font=F(bold=True,size=10,color=BRANCO if off==0 else T2)
    a.fill=fill(NAVY if off==0 else CINZA_C)
    a.alignment=Alignment(horizontal="center"); a.border=box
    b=sm[f"{col}10"]
    b.value=(f'=COUNTIFS({DATA},">="&{col}$9,{DATA},"<="&{col}$9+6,{MARC},"<>Cancelada")')
    b.font=F(bold=True,size=12,color=NAVY if off==0 else T2)
    b.alignment=Alignment(horizontal="center"); b.border=box
    b.fill=fill(AZ_V if off==0 else BRANCO)
sm["C9"]="semana de"; sm["C10"]="atividades"
for r in (9,10):
    sm[f"C{r}"].font=F(size=9,italic=True,color=T2)
    sm[f"C{r}"].alignment=Alignment(horizontal="right",vertical="center")
sm.conditional_formatting.add("D10:L10", CellIsRule(operator="equal", formula=["0"],
    font=F(size=12,color="FFB9C2D0")))
sm.row_dimensions[10].height=20

# ── a grade ──
LCAB=12
DS=["B","C","D","E","F","G","H"]
cabec(sm,LCAB,[("A","Executante")]+[(c,"") for c in DS]+
      [("I","Total"),("J","Concluídas"),("K","% feito"),("L","Vencidas")])
sm[f"I{LCAB}"].comment=Comment("Tudo que a pessoa tem na semana — plano e extra "
 "programação juntos. A grade é carga de trabalho; quem separa plano de extra "
 "é a faixa lá em cima e a aba Aderência.","PCM")
for i,col in enumerate(DS):
    c=sm[f"{col}{LCAB}"]; c.value=f"=$C$3+{i}" if i else "=$C$3"
    c.number_format='[$-416]ddd\\ dd/mm;@'
sm.row_dimensions[LCAB].height=30

NEX=22; P0=LCAB+1; P1=P0+NEX-1; LSEM=P1+1; LTOT=P1+2
naoCanc=f'{MARC},"<>Cancelada"'
for k in range(NEX):
    r=P0+k
    sm[f"A{r}"]=f'=IF(Listas!A{5+k}="","",Listas!A{5+k})'
    for i,col in enumerate(DS):
        soma=porpessoa(f"$A{r}", f'{DATA},{col}${LCAB},{naoCanc}')
        sm[f"{col}{r}"]=f'=IF($A{r}="","",{soma})'
    sm[f"I{r}"]=f'=IF($A{r}="","",SUM($B{r}:$H{r}))'
    sm[f"J{r}"]=f'=IF($A{r}="","",{porpessoa(f"$A{r}", jan, "SUMIFS", CONCL)})'
    sm[f"K{r}"]=f'=IF(OR($A{r}="",$I{r}=0),"",$J{r}/$I{r})'
    venc=f'{jan},{DATA},"<"&TODAY(),{CONCL},0,{naoCanc}'
    sm[f"L{r}"]=f'=IF($A{r}="","",{porpessoa(f"$A{r}", venc)})'

sm[f"A{LSEM}"]="— sem executante definido —"
sm[f"A{LSEM}"].font=F(size=10,italic=True,color=T2)
for i,col in enumerate(DS):
    sm[f"{col}{LSEM}"]=f'=COUNTIFS({EQ[0]},"",{DATA},{col}${LCAB},{naoCanc})'
sm[f"I{LSEM}"]=f'=SUM($B{LSEM}:$H{LSEM})'
sm[f"J{LSEM}"]=f'=SUMIFS({CONCL},{EQ[0]},"",{jan})'
sm[f"K{LSEM}"]=f'=IF($I{LSEM}=0,"",$J{LSEM}/$I{LSEM})'
sm[f"L{LSEM}"]=f'=COUNTIFS({EQ[0]},"",{jan},{DATA},"<"&TODAY(),{CONCL},0,{naoCanc})'

sm[f"A{LTOT}"]="TOTAL — plano + extra"
for i,col in enumerate(DS):
    sm[f"{col}{LTOT}"]=f'=COUNTIFS({DATA},{col}${LCAB},{naoCanc})'
sm[f"I{LTOT}"]=f'=COUNTIFS({jan},{naoCanc})'
sm[f"J{LTOT}"]=f'=SUMIFS({CONCL},{jan})'
sm[f"K{LTOT}"]=f'=IF($I{LTOT}=0,"",$J{LTOT}/$I{LTOT})'
sm[f"L{LTOT}"]=f'=COUNTIFS({jan},{DATA},"<"&TODAY(),{CONCL},0,{naoCanc})'

for r in range(P0,LTOT+1):
    for col in ["A"]+DS+["I","J","K","L"]:
        c=sm[f"{col}{r}"]; c.border=box; c.font=F(size=10)
        if col!="A": c.alignment=Alignment(horizontal="center")
        if col=="K": c.number_format="0%"
        if r==LTOT: c.font=F(size=10,bold=True,color=BRANCO); c.fill=fill(NAVY)
        elif r==LSEM: c.fill=fill(CINZA_C)
        elif col in ("I","J","K","L"): c.fill=fill(CINZA_C)
    sm.row_dimensions[r].height=17

sm.column_dimensions["A"].width=26
for col in DS: sm.column_dimensions[col].width=11
for col,w in (("I",12),("J",11),("K",11),("L",10)): sm.column_dimensions[col].width=w

sm.conditional_formatting.add(f"B{P0}:H{P1}",
    DataBarRule(start_type="num",start_value=0,end_type="num",end_value=8,
                color="FF9DB4DE",showValue=True))
sm.conditional_formatting.add(f"B{P0}:H{P1}", CellIsRule(operator="equal",
    formula=["0"], font=F(size=10,color="FFC3CBD8")))
sm.conditional_formatting.add(f"K{P0}:K{P1}", CellIsRule(operator="greaterThanOrEqual",
    formula=["0.85"], fill=fill(OK_V), font=F(bold=True,size=10,color=OK_T)))
sm.conditional_formatting.add(f"K{P0}:K{P1}", CellIsRule(operator="lessThan",
    formula=["0.6"], fill=fill(RU_V), font=F(bold=True,size=10,color=RU_T)))
sm.conditional_formatting.add(f"L{P0}:L{LSEM}", CellIsRule(operator="greaterThan",
    formula=["0"], fill=fill(RU_V), font=F(bold=True,size=10,color=RU_T)))

LC=LTOT+2
sm[f"A{LC}"]=("Para programar o que está na carteira: na aba Programação, filtre a coluna "
              "Situação por “Na carteira” e escreva a Semana e o Dia.")
sm[f"A{LC}"].font=F(size=9,italic=True,color=T2); sm.merge_cells(f"A{LC}:L{LC}")
sm.freeze_panes=f"B{LCAB+1}"; sm.sheet_view.showGridLines=False

# ═══════════════════════════════════ ADERÊNCIA
ad=wb.create_sheet("Aderência")
titulo(ad,"ADERÊNCIA DA PROGRAMAÇÃO  ·  medida por atividade","M")
ad["A3"]="De:"; ad["A4"]="Até:"
for ref in ("A3","A4"): ad[ref].font=F(bold=True,size=10)
ad["B3"]="=Semana!$C$3"; ad["B4"]="=Semana!$C$3+6"
for ref in ("B3","B4"):
    c=ad[ref]; c.font=F(bold=True,size=11); c.fill=fill(AMARELO)
    c.number_format="dd/mm/yyyy"; c.border=box; c.alignment=Alignment(horizontal="center")
ad["C3"]="←  vem da semana escolhida na aba Semana; escreva outras datas para analisar o mês, o trimestre…"
ad["C3"].font=F(size=9,italic=True,color=T2); ad.merge_cells("C3:M3")
ad["C4"]="As atividades entram pelo dia para o qual foram PROGRAMADAS."
ad["C4"].font=F(size=9,italic=True,color=T2); ad.merge_cells("C4:M4")

janA=f'{DATA},">="&$B$3,{DATA},"<="&$B$4'
janT=f'{PLANO},">="&$B$3,{PLANO},"<="&$B$4'

ad.merge_cells("A6:B9")
ad["A6"]='=IFERROR(B14,"—")'
ad["A6"].font=F(bold=True,size=40,color=NAVY)
ad["A6"].alignment=Alignment(horizontal="center",vertical="center")
ad["A6"].number_format="0%"; ad["A6"].fill=fill(CINZA_C)
ad.merge_cells("C6:M9")
ad["C6"]=('="ADERÊNCIA POR ATIVIDADE"&CHAR(10)&B13&" de "&B12&'
          '" atividades programadas no período foram concluídas."&CHAR(10)&'
          '"Cada linha da aba Programação é uma atividade — é ela que conta, não o serviço inteiro."')
ad["C6"].font=F(size=12,color=TINTA)
ad["C6"].alignment=Alignment(horizontal="left",vertical="center",wrap_text=True,indent=2)
ad["C6"].fill=fill(CINZA_C)
for r in range(6,10):
    for col in "ABCDEFGHIJKLM": ad[f"{col}{r}"].border=box
    ad.row_dimensions[r].height=22

cabec(ad,11,[("A","Indicador"),("B","Valor"),("C","Como é medido")],NAVY)
for _c in "DEFGHIJKLM":
    _x=ad[f"{_c}11"]; _x.fill=fill(NAVY); _x.border=box
ad.merge_cells("C11:M11")
ad["C11"].alignment=Alignment(horizontal="left",vertical="center",indent=1)

IND=[
 ("Atividades programadas", f'=COUNTIFS({janA},{PLANEJ})',"0",
  "estavam no plano da semana — extra programação não entra aqui"),
 ("Concluídas", f'=SUMIFS({CONCL},{janA},{NAOEXTRA})',"0",
  "do plano, quantas saíram"),
 ("Aderência por atividade", '=IFERROR(B13/B12,"")',"0%",
  "concluídas ÷ programadas — o indicador principal"),
 ("Concluídas no prazo",
  f'=IF(COUNTIFS({janA},{CONCLEM},"<>")=0,"",SUMIFS({NOPRAZO},{janA},{NAOEXTRA}))',"0",
  "concluídas até o próprio dia — só conta quem tem data de conclusão"),
 ("Pontualidade", f'=IFERROR(B15/COUNTIFS({janA},{CONCLEM},"<>",{PLANEJ}),"")',"0%",
  "concluídas no prazo ÷ concluídas COM data"),
 ("Programadas no plano original", f'=COUNTIFS({janT},{PLANEJ})',"0",
  "pela 1ª data programada, e não pela data de hoje"),
 ("Concluídas até a 1ª data",
  f'=IF(COUNTIFS({janT},{CONCLEM},"<>")=0,"",SUMIFS({NOPLANO},{janT},{NAOEXTRA}))',"0",
  "entregues sem precisar empurrar o dia"),
 ("Aderência ao plano original", f'=IF(COUNTIFS({janT},{CONCLEM},"<>")=0,"",IFERROR(B18/B17,""))',"0%",
  "não melhora quando se reprograma — mostra se a semana combinada foi cumprida"),
 ("Vencidas", f'=COUNTIFS({janA},{DATA},"<"&TODAY(),{CONCL},0,{MARC},"<>Cancelada")',"0",
  "o dia passou e a atividade não foi concluída nem cancelada"),
 ("Canceladas", f'=COUNTIFS({janA},{MARC},"Cancelada")',"0","fora do cálculo da aderência"),
 ("Extra programação", f'=COUNTIFS({janA},{ORIG},"Extra",{NAOCANC})',"0",
  "entraram fora do plano: quebra, urgência, pedido da operação"),
 ("Extras concluídas", f'=SUMIFS({CONCL},{janA},{ORIG},"Extra")',"0",
  "quanto do imprevisto a oficina deu conta de resolver"),
 ("Quanto da semana foi extra", '=IFERROR(B22/(B12+B22),"")',"0%",
  "extra ÷ (plano + extra) — o quanto do trabalho não estava combinado"),
 ("Atividades reprogramadas", f'=SUMIFS({REPROG},{janA})',"0",
  "a 1ª data programada é diferente da data de hoje"),
 ("Atraso médio, quando atrasa", f'=IFERROR(SUMIFS({ATRASO},{janA})/COUNTIFS({janA},{ATRASO},">0"),0)',"0.0",
  "dias entre o programado e o concluído, só das que passaram do dia"),
 ("Na carteira, sem dia", f'=COUNTIFS({DATA},"",{ATIV},"<>",{MARC},"<>Cancelada")',"0",
  "não depende do período — é o que ainda espera encaixe"),
 ("Atividades em empresa externa", f'=COUNTIFS({janA},{OFIC},"Terceirizada")',"0",
  "algum executante escrito com “(externo)” no fim"),
]
for i,(rot,fml,fmt,expl) in enumerate(IND):
    r=12+i
    ad[f"A{r}"]=rot; ad[f"B{r}"]=fml; ad[f"C{r}"]=expl
    dest=rot.startswith("Aderência")
    ad[f"A{r}"].font=F(size=10,bold=dest)
    ad[f"B{r}"].font=F(size=11,bold=True,color=NAVY if dest else TINTA)
    ad[f"B{r}"].number_format=fmt
    ad[f"B{r}"].alignment=Alignment(horizontal="center")
    ad[f"C{r}"].font=F(size=9,color=T2)
    for col in "ABC": ad[f"{col}{r}"].border=box
    if dest:
        for col in "ABC": ad[f"{col}{r}"].fill=fill("FFEDF1F9")
    ad.merge_cells(f"C{r}:M{r}")
    ad.row_dimensions[r].height=17
ad.conditional_formatting.add("B20", CellIsRule(operator="greaterThan",
    formula=["0"], fill=fill(RU_V), font=F(bold=True,size=11,color=RU_T)))
for ref in ("B14","B16","B19","A6"):
    tam=40 if ref=="A6" else 11
    ad.conditional_formatting.add(ref, CellIsRule(operator="greaterThanOrEqual",
        formula=["0.85"], font=F(bold=True,size=tam,color=OK_T)))
    ad.conditional_formatting.add(ref, CellIsRule(operator="lessThan",
        formula=["0.6"], font=F(bold=True,size=tam,color=RU_T)))

def recorte(lin, col0, tit, lista, coluna, n=22, equipe=False):
    cols=[get_column_letter(col0+i) for i in range(6)]
    a,b,c,d,e,g=cols
    ad[f"{a}{lin}"]=tit
    ad[f"{a}{lin}"].font=F(bold=True,size=11,color=NAVY)
    ad.merge_cells(f"{a}{lin}:{g}{lin}")
    cabec(ad,lin+1,[(a,"Nome"),(b,"Progr."),(c,"Concl."),(d,"Aderência"),
                    (e,"Vencidas"),(g,"Extra")])
    for k in range(n):
        r=lin+2+k
        ad[f"{a}{r}"]=f'=IF(Listas!{lista}{5+k}="","",Listas!{lista}{5+k})'
        venc=f'{janA},{DATA},"<"&TODAY(),{CONCL},0,{NAOCANC}'
        extra=f'{janA},{ORIG},"Extra",{NAOCANC}'
        if equipe:
            fb=porpessoa(f"${a}{r}", f'{janA},{PLANEJ}')
            fc=porpessoa(f"${a}{r}", f'{janA},{NAOEXTRA}', "SUMIFS", CONCL)
            fe=porpessoa(f"${a}{r}", venc)
            fg=porpessoa(f"${a}{r}", extra)
        else:
            fb=f'COUNTIFS({coluna},${a}{r},{janA},{PLANEJ})'
            fc=f'SUMIFS({CONCL},{coluna},${a}{r},{janA},{NAOEXTRA})'
            fe=f'COUNTIFS({coluna},${a}{r},{venc})'
            fg=f'COUNTIFS({coluna},${a}{r},{extra})'
        for cl,fm in ((b,fb),(c,fc),(e,fe),(g,fg)):
            ad[f"{cl}{r}"]=f'=IF(${a}{r}="","",{fm})'
        ad[f"{d}{r}"]=f'=IF(OR(${a}{r}="",${b}{r}=0),"",${c}{r}/${b}{r})'
        for col in cols:
            cc=ad[f"{col}{r}"]; cc.border=box; cc.font=F(size=10)
            if col!=a: cc.alignment=Alignment(horizontal="center")
            if col==d: cc.number_format="0%"
            if col in (b,c,d,e,g): cc.fill=fill(CINZA_C)
        ad.row_dimensions[r].height=16
    ad.conditional_formatting.add(f"{g}{lin+2}:{g}{lin+1+n}", CellIsRule(
        operator="greaterThan", formula=["0"],
        fill=fill("FFFFF1E0"), font=F(bold=True,size=10,color="FF9A4C00")))
    fa=f"{d}{lin+2}:{d}{lin+1+n}"
    ad.conditional_formatting.add(fa, CellIsRule(operator="greaterThanOrEqual",
        formula=["0.85"], fill=fill(OK_V), font=F(bold=True,size=10,color=OK_T)))
    ad.conditional_formatting.add(fa, CellIsRule(operator="lessThan",
        formula=["0.6"], fill=fill(RU_V), font=F(bold=True,size=10,color=RU_T)))
    ad.conditional_formatting.add(f"{e}{lin+2}:{e}{lin+1+n}", CellIsRule(
        operator="greaterThan", formula=["0"], font=F(bold=True,size=10,color=RU_T)))

# Os blocos são do tamanho das listas, com folga: um recorte cortado no meio
# some com dado sem avisar — foi o que aconteceu com a 23ª frota.
N_EX=max(14, len(EXEC_LISTA)+3)
N_FR=max(14, len(FROTA_LISTA)+3)
recorte(31, 1, "POR EXECUTANTE  ·  soma as três colunas de quem faz", "A", None, N_EX, equipe=True)
recorte(31, 8, "POR FROTA", "B", FROTA_, N_FR)
recorte(31+max(N_EX,N_FR)+4, 1, "POR TIPO DE SERVIÇO", "C", TIPO_, len(TIPO_LISTA)+2)

ad.column_dimensions["A"].width=30
for col,w in (("B",10),("C",10),("D",11),("E",10),("F",9),("G",3),
              ("H",15),("I",10),("J",10),("K",11),("L",10),("M",9)):
    ad.column_dimensions[col].width=w
ad.sheet_view.showGridLines=False; ad.freeze_panes="A5"

# ═══════════════════════════════════ COMO USAR
ins=wb.create_sheet("Como usar", 0)
titulo(ins,"PROGRAMAÇÃO DE SERVIÇOS  ·  MAKRO TRANSPORTES","H",34,15)
ins["A2"]="Planejamento e Controle de Manutenção  ·  aderência medida por atividade"
ins["A2"].font=F(size=10,color=BRANCO); ins["A2"].fill=fill(NAVY2)
ins["A2"].alignment=Alignment(vertical="center",indent=1)
ins.merge_cells("A2:H2"); ins.row_dimensions[2].height=20

def sec(r, txt):
    ins[f"A{r}"]=txt
    ins[f"A{r}"].font=F(bold=True,size=11,color=NAVY)
    ins.merge_cells(f"A{r}:H{r}"); ins.row_dimensions[r].height=24
def par(r, txt, alt=None, cor=TINTA):
    ins[f"A{r}"]=txt
    ins[f"A{r}"].font=F(size=10,color=cor)
    ins[f"A{r}"].alignment=Alignment(vertical="top",wrap_text=True,indent=1)
    ins.merge_cells(f"A{r}:H{r}")
    if alt: ins.row_dimensions[r].height=alt
def passo(r, n, txt, cor=NAVY):
    ins[f"A{r}"]=n
    ins[f"A{r}"].font=F(bold=True,size=13,color=BRANCO); ins[f"A{r}"].fill=fill(cor)
    ins[f"A{r}"].alignment=Alignment(horizontal="center",vertical="center")
    ins[f"A{r}"].border=box
    ins[f"B{r}"]=txt
    ins[f"B{r}"].font=F(size=10.5)
    ins[f"B{r}"].alignment=Alignment(vertical="center",wrap_text=True,indent=1)
    ins.merge_cells(f"B{r}:H{r}")
    for col in "BCDEFGH": ins[f"{col}{r}"].border=box
    ins.row_dimensions[r].height=34

L=4
sec(L,"TROCAR DE SEMANA — uma célula só"); L+=1
passo(L,"►","Na aba SEMANA, clique na célula amarela grande e abra a setinha: "
           "a lista traz todas as segundas-feiras. Escolha uma e a grade inteira "
           "acompanha — os dias no topo, os números de cada executante e o resumo.",NAVY2); L+=1
passo(L,"◄","Logo abaixo, a faixa ONDE TEM PROGRAMAÇÃO mostra quantas atividades "
           "existem em cada uma das quatro semanas antes e depois. Assim você vê "
           "onde tem trabalho antes de trocar.",NAVY2); L+=2

sec(L,"MONTAR A PROGRAMAÇÃO DA SEMANA — quatro passos"); L+=1
passo(L,"1","Na aba PROGRAMAÇÃO, clique na setinha do filtro da coluna SITUAÇÃO "
           "e deixe marcado só “Na carteira”. Sobram as atividades sem dia."); L+=1
passo(L,"2","Nas que você vai fazer, escreva a SEGUNDA-FEIRA na coluna SEMANA. "
           "Escreva numa linha e arraste para baixo — vale para todas."); L+=1
passo(L,"3","Escolha o DIA (Seg, Ter, Qua…) e quem faz, em EXECUTANTE 1, 2 e 3. "
           "A coluna Data programada e a SITUAÇÃO, lá na frente, se preenchem sozinhas."); L+=1
passo(L,"4","Tire o filtro e volte à aba SEMANA: ela mostra a carga que cada um "
           "ficou por dia, e apaga os zeros para o que tem trabalho saltar aos olhos."); L+=2

sec(L,"VÁRIOS EXECUTANTES NA MESMA ATIVIDADE"); L+=1
par(L,"São três colunas — Executante 1, 2 e 3 — cada uma com sua caixa de seleção. "
      "Serviço feito a quatro mãos entra na carga de cada um deles na aba Semana e "
      "na Aderência, e conta uma vez só no total da oficina.",alt=32); L+=1
par(L,"Empresa externa: escreva o nome com “(externo)” no fim, em qualquer uma das três. "
      "A coluna Oficina se marca sozinha como Terceirizada.",alt=28); L+=2

sec(L,"SERVIÇO EXTRA PROGRAMAÇÃO"); L+=1
par(L,"Na coluna ORIGEM, escolha EXTRA quando a atividade entrou fora do plano: "
      "quebra na estrada, urgência, pedido da operação. Em branco (ou “Programada”) "
      "quer dizer que estava no plano da semana.",alt=30); L+=1
par(L,"Extra NÃO entra no denominador da aderência — não dá para cobrar cumprimento de "
      "uma coisa que nunca foi programada. Ela ganha contador próprio na faixa da aba "
      "Semana e três indicadores na aba Aderência, entre eles “quanto da semana foi "
      "extra”. É esse número que explica uma aderência baixa numa semana em que a "
      "oficina não parou.",alt=42); L+=1
par(L,"Na grade da aba Semana, plano e extra aparecem juntos: ali o que importa é a "
      "carga de trabalho de cada um, venha de onde vier.",alt=28); L+=2

sec(L,"REPETIR A SEMANA QUE PASSOU"); L+=1
passo(L,"1","Selecione as linhas da semana passada, copie e cole no fim da lista.",NAVY2); L+=1
passo(L,"2","Troque só a coluna SEMANA pela nova segunda-feira. Todas as datas "
           "andam junto — é para isso que Semana e Dia são separados.",NAVY2); L+=1
passo(L,"3","Apague o que ficou em CONCLUÍDA EM e em MARCAR nas linhas coladas.",NAVY2); L+=2

sec(L,"O DIA A DIA"); L+=1
for perg,resp in [
 ("Concluiu uma atividade?","Escreva a data em CONCLUÍDA EM. Só isso — a situação "
  "muda sozinha e a aderência já conta."),
 ("Vai empurrar para outro dia?","Antes de mudar, copie a data de hoje para a coluna "
  "1ª DATA. Depois troque o Dia (ou a Semana) e escreva o MOTIVO."),
 ("Cancelou?","Escolha “Cancelada” na coluna MARCAR. Sai dos dois lados da conta."),
 ("Serviço novo sem dia ainda?","Escreva tudo menos a Semana e o Dia. Fica na "
  "carteira até você programar.")]:
    ins[f"A{L}"]=perg; ins[f"A{L}"].font=F(bold=True,size=10,color=NAVY)
    ins[f"A{L}"].alignment=Alignment(vertical="top",wrap_text=True,indent=1)
    ins.merge_cells(f"A{L}:B{L}")
    ins[f"C{L}"]=resp; ins[f"C{L}"].font=F(size=10)
    ins[f"C{L}"].alignment=Alignment(vertical="top",wrap_text=True,indent=1)
    ins.merge_cells(f"C{L}:H{L}")
    for col in "ABCDEFGH": ins[f"{col}{L}"].border=box
    ins.row_dimensions[L].height=30
    L+=1
L+=1

sec(L,"COMO A ADERÊNCIA É CALCULADA"); L+=1
ins[f"A{L}"]="Aderência  =  atividades concluídas  ÷  atividades programadas no período"
ins[f"A{L}"].font=F(bold=True,size=12,color=NAVY); ins[f"A{L}"].fill=fill("FFEDF1F9")
ins[f"A{L}"].alignment=Alignment(vertical="center",indent=1)
ins.merge_cells(f"A{L}:H{L}"); ins.row_dimensions[L].height=26
for col in "ABCDEFGH": ins[f"{col}{L}"].border=box
L+=1
par(L,"Cada linha da aba Programação é uma ATIVIDADE. Um serviço com três atividades "
      "ocupa três linhas: se duas saírem e uma ficar, a aderência mostra 67% — nem some "
      "da conta, nem finge que fechou.",alt=30); L+=1
par(L,"    •  Pontualidade — das concluídas, quantas saíram até o próprio dia.",alt=16); L+=1
par(L,"    •  Aderência ao plano original — mede contra a 1ª data programada. É a única "
      "que não melhora quando se empurra o serviço para a frente.",alt=28); L+=2

sec(L,"AS CORES DA ABA PROGRAMAÇÃO"); L+=1
for corv,nome,txt in [(AMARELO,"Amarelo","o que é o serviço — preenche sempre"),
       ("FFF6FBF5","Verde claro","quem faz — até três executantes"),
       ("FFF4F9FF","Azul claro","semana e dia — é onde se programa"),
       ("FFEDEFF4","Cinza claro","só quando acontecer: concluir, cancelar, reprogramar"),
       (CINZA_C,"Cinza","calculado — Situação na frente, o resto no fim; não digite"),
       ("FFFFE0B2","Laranja","origem EXTRA — entrou fora da programação"),
       (RU_V,"Vermelho","vencida, ou aderência abaixo de 60%"),
       (OK_V,"Verde","concluída no prazo, ou aderência de 85% para cima")]:
    c=ins[f"A{L}"]; c.value=nome; c.fill=fill(corv); c.border=box
    c.font=F(size=10,bold=True); c.alignment=Alignment(horizontal="center")
    ins[f"B{L}"]=txt; ins[f"B{L}"].font=F(size=10)
    ins[f"B{L}"].alignment=Alignment(vertical="center",indent=1)
    ins.merge_cells(f"B{L}:H{L}")
    for col in "BCDEFGH": ins[f"{col}{L}"].border=box
    ins.row_dimensions[L].height=18
    L+=1
L+=1

if LINHAS:
    sem=LINHAS[0]["semana"]
    txt=("A planilha veio com a semana de %s a %s: %d atividades em %d serviços. "
         % (sem.strftime("%d/%m"), (sem+timedelta(days=4)).strftime("%d/%m/%y"),
            len(LINHAS), len(set((l["frota"],l["servico"]) for l in LINHAS))))
    if FORA:
        txt+=("Ficaram de fora %d serviço(s) programados antes desta semana (%s) e a "
              "carteira sem dia, porque você pediu só o desta semana."
              % (len(FORA), ", ".join(f[0] for f in FORA)))
    ins[f"A{L}"]=txt
    ins[f"A{L}"].font=F(size=10,color=OK_T); ins[f"A{L}"].fill=fill(OK_V)
    ins[f"A{L}"].alignment=Alignment(vertical="center",wrap_text=True,indent=1)
    ins.merge_cells(f"A{L}:H{L}"); ins.row_dimensions[L].height=42
    for col in "ABCDEFGH": ins[f"{col}{L}"].border=box
    L+=2
par(L,"Há 1.000 linhas prontas na aba Programação, com as fórmulas das colunas cinzas "
      "já em todas elas. Para imprimir a semana: filtre a coluna Data programada pelo "
      "período e mande imprimir — sai só o que o filtro deixou visível.",cor=T2,alt=32)

ins.column_dimensions["A"].width=14
for col in "BCDEFGH": ins.column_dimensions[col].width=17
ins.sheet_view.showGridLines=False

# ═══════════════════════════════════ IMPRESSÃO E FECHO
for ws,orient,tr in ((pg,"landscape",3),(sm,"landscape",LCAB),
                     (ad,"portrait",None),(ins,"portrait",None),(ls,"portrait",None)):
    ws.page_setup.orientation=orient
    ws.page_setup.paperSize=ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth=1; ws.page_setup.fitToHeight=0
    ws.sheet_properties.pageSetUpPr.fitToPage=True
    ws.print_options.horizontalCentered=True
    ws.page_margins.left=ws.page_margins.right=0.4
    ws.page_margins.top=ws.page_margins.bottom=0.5
    if tr: ws.print_title_rows=f"1:{tr}"
# A folha impressa dispensa as colunas auxiliares 1/0 do fim: sem elas a
# letra cresce e o papel fica legível.
pg.print_area=f"A1:S{PRIM+max(len(LINHAS),60)+5}"
sm.print_area=f"A1:L{LTOT+3}"
ls.page_setup.fitToHeight=1
ls.print_area=f"A1:F{LIN_LISTA}"

wb.calculation.fullCalcOnLoad=True
for ws in wb.worksheets: ws.sheet_properties.tabColor=NAVY[2:]
wb.active=0
wb.save(SAIDA)
print("planilha montada:",SAIDA)
print("  atividades:",len(LINHAS),"| executantes:",len(EXEC_LISTA),"| frotas:",len(FROTA_LISTA))
if FORA: print("  fora da semana:",", ".join(f"{f[0]} ({f[2]}, {f[3]} ativ.)" for f in FORA))
