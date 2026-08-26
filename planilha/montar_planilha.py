# -*- coding: utf-8 -*-
"""
Programação de Serviços — Makro Transportes
============================================
A unidade é a ATIVIDADE (o que antes era "pendência" dentro de uma tarefa).
É por atividade que se programa, se executa e se mede:

    aderência = atividades concluídas ÷ atividades programadas no período

Programar é escrever a SEMANA (segunda-feira) e o DIA. A data sai sozinha —
é isso que deixa repetir uma semana inteira trocando uma célula só.

    python3 montar_planilha.py [dados.json]

`dados.json` é o que o extrair_pdf.py devolve a partir da folha impressa
pelo site. Sem ele, a planilha sai vazia.
"""
import sys, json, io
from datetime import date, timedelta
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule, DataBarRule
from openpyxl.comments import Comment

SAIDA="/home/user/gestaomkt/planilha/Programacao_Servicos_Makro.xlsx"

# Cores lidas do logotipo oficial da Makro
NAVY="FF13164E"; NAVY2="FF2A3170"; RED="FFE4002A"
CINZA="FFD9DEE8"; CINZA_C="FFEEF1F7"; AMARELO="FFFFF3CF"
BORDA="FFC8D0DE"; BRANCO="FFFFFFFF"; TINTA="FF14181F"; T2="FF4A5464"
OK_V="FFE3F5EA"; OK_T="FF116B3E"; AL_V="FFFDF0D8"; AL_T="FF8A5A05"
RU_V="FFFDE4E7"; RU_T="FFB00020"; AZ_V="FFE7EEFB"; AZ_T="FF1749C4"

F=lambda **k: Font(name="Arial", **k)
fina=Side(style="thin", color=BORDA)
box=Border(left=fina,right=fina,top=fina,bottom=fina)
def fill(c): return PatternFill("solid", fgColor=c)

PRIM=5; ULT=1004; LIN_LISTA=64
DIAS_PT=["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"]

# ═══════════════════════════════════ dados vindos do PDF
def carregar(caminho):
    if not caminho: return None
    return json.load(io.open(caminho,encoding="utf-8"))

def d2(s):
    a,m,d=s.split("-"); return date(int(a),int(m),int(d))

def segunda(d): return d - timedelta(days=d.weekday())

def montar_linhas(dados):
    """Uma linha por atividade. Serviço sem pendência vira uma linha só."""
    linhas=[]; execs=set(); frotas=set(); tipos=set()
    if not dados: return linhas,execs,frotas,tipos

    # A 1ª data programada de cada serviço vem da remarcação mais antiga.
    # A lista do site sai da mais nova para a mais velha, então a última
    # ocorrência de um serviço carrega a data original.
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
            if a[:20] in b or b[:20] in a:
                return v, motiv.get((f,s),"")
        return None,""

    for s in dados["servicos"]:
        ini=d2(s["ini"]); sem=segunda(ini); dia=DIAS_PT[ini.weekday()]
        concl = ini if s["situacao"]=="CONCLUÍDA" else None
        marcar = "Em execução" if s["situacao"]=="EM EXECUÇÃO" else ""
        p_orig,p_mot=casa(s["frota"],s["titulo"])
        if p_orig==ini: p_orig=None
        obs=s["obs"]
        if s.get("sistema"): obs=("Sistema: "+s["sistema"]+(" · "+obs if obs else ""))
        execs.add(s["executantes"]); frotas.add(s["frota"]); tipos.add(s["tipo"])
        itens=s["pendencias"] or [{"texto":s["titulo"],"feito":s["situacao"]=="CONCLUÍDA"}]
        # Um serviço de 3 dias com 34 atividades não tem as 34 no primeiro dia.
        # A folha impressa não diz qual cai em qual dia, então elas entram
        # distribuídas pelo intervalo — mais perto da verdade do que empilhar
        # tudo na abertura, e já deixa a grade da semana com cara de real.
        nd=max(1,s["dias"])
        for k,p in enumerate(itens):
            dk=ini+timedelta(days=(k*nd)//max(1,len(itens)))
            linhas.append(dict(os=s["os"], frota=s["frota"], servico=s["titulo"],
                atividade=p["texto"], tipo=s["tipo"], executante=s["executantes"],
                semana=segunda(dk), dia=DIAS_PT[dk.weekday()],
                # A folha impressa mostra a pendência riscada, mas não em que
                # dia ela saiu. Marcar "Concluída" registra o fato sem inventar
                # uma data — e mantém a pontualidade honesta, medida só sobre
                # as conclusões que têm data de verdade.
                concluida=None, marcar=("Concluída" if p["feito"] else marcar),
                orig=p_orig, motivo=(p_mot if p_orig else ""), obs=obs))

    for f in dados.get("fila",[]):
        frotas.add(f["frota"])
        linhas.append(dict(os="", frota=f["frota"], servico=f["titulo"],
            atividade=f["titulo"], tipo="Corretiva", executante="",
            semana=None, dia="", concluida=None, marcar="", orig=None, motivo="",
            obs="%d pendência(s) a detalhar — quebre em uma linha por atividade "
                "quando for programar" % f["pend"]))
    return linhas,execs,frotas,tipos

DADOS=carregar(sys.argv[1] if len(sys.argv)>1 else None)
LINHAS,EXECS,FROTAS,TIPOS=montar_linhas(DADOS)

# nomes soltos por vírgula viram executantes individuais nas listas
nomes=set()
for e in EXECS:
    if not e: continue
    if "(externo)" in e: nomes.add(e.strip())
    else:
        for n in e.split(","): 
            if n.strip(): nomes.add(n.strip())
EXEC_LISTA=sorted(nomes, key=lambda x:(("(externo)" in x), x.lower()))
FROTA_LISTA=sorted(FROTAS)
TIPO_LISTA=sorted(TIPOS) or ["Corretiva","Preventiva"]
for t in ("Corretiva","Preventiva","Preditiva","Melhoria","Inspeção"):
    if t not in TIPO_LISTA: TIPO_LISTA.append(t)

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
ls.merge_cells("A1:F1"); ls.row_dimensions[1].height=24
ls["A2"]=("Alimentam as caixas de seleção da aba Programação. Acrescente nomes aqui e as caixas "
          "acompanham. Não deixe linha em branco no meio de uma lista.")
ls["A2"].font=F(size=9,italic=True,color=T2); ls.merge_cells("A2:F2")
for j,(tit,vals) in enumerate(COLS_L,start=1):
    c=ls.cell(row=4,column=j,value=tit)
    c.font=F(bold=True,size=10,color=BRANCO); c.fill=fill(NAVY2)
    c.alignment=Alignment(horizontal="center"); c.border=box
    for i in range(5,LIN_LISTA+1):
        cc=ls.cell(row=i,column=j)
        if i-5<len(vals): cc.value=vals[i-5]
        cc.font=F(size=10); cc.border=box
for j,w in enumerate([26,12,16,14,28,8],start=1):
    ls.column_dimensions[get_column_letter(j)].width=w
ls.sheet_view.showGridLines=False; ls.freeze_panes="A5"
DIA_REF=f"Listas!$F$5:$F$11"

# ═══════════════════════════════════ PROGRAMAÇÃO
pg=wb.create_sheet("Programação")
COLS=[("A","Nº",6,"c"),
      ("B","OS",13,"1"),("C","Frota",10,"1"),("D","Serviço",30,"1"),
      ("E","Atividade",46,"1"),("F","Tipo",12,"1"),("G","Executante",22,"1"),
      ("H","Semana",12,"2"),("I","Dia",8,"2"),("J","Data programada",15,"c"),
      ("K","Concluída em",13,"3"),("L","Marcar",13,"3"),("M","1ª data",11,"3"),
      ("N","Motivo",24,"3"),("O","Obs.",26,"3"),
      ("P","Situação",19,"c"),("Q","Oficina",12,"c"),("R","Plano",11,"c"),
      ("S","No prazo",8,"c"),("T","No plano",8,"c"),("U","Atraso",8,"c"),
      ("V","Reprog.",8,"c"),("W","Concl.",8,"c")]
CORB={"1":AMARELO,"2":"FFDCE9FA","3":"FFEDEFF4","c":CINZA}

pg["A1"]="PROGRAMAÇÃO DE SERVIÇOS  ·  MAKRO TRANSPORTES  ·  uma linha por atividade"
pg["A1"].font=F(bold=True,size=13,color=BRANCO); pg["A1"].fill=fill(NAVY)
pg["A1"].alignment=Alignment(vertical="center",indent=1)
pg.merge_cells("A1:W1"); pg.row_dimensions[1].height=30

BANDAS=[("A","A","",CINZA),("B","G","1 · SEMPRE — o que é o serviço","1"),
        ("H","J","2 · PROGRAMAR — escreva a semana e o dia","2"),
        ("K","O","3 · SÓ QUANDO ACONTECER","3"),
        ("P","W","CALCULADO — não digite aqui","c")]
for a,b,txt,g in BANDAS:
    pg.merge_cells(f"{a}2:{b}2")
    c=pg[f"{a}2"]; c.value=txt
    c.font=F(bold=True,size=9,color=T2); c.fill=fill(CORB.get(g,g))
    c.alignment=Alignment(horizontal="center",vertical="center"); c.border=box
pg.row_dimensions[2].height=18

for letra,tit,larg,grp in COLS:
    c=pg[letra+"3"]; c.value=tit
    c.font=F(bold=True,size=9.5,color=BRANCO)
    c.fill=fill(NAVY if grp in "123" else NAVY2)
    c.alignment=Alignment(horizontal="center",vertical="center",wrap_text=True)
    c.border=box
    pg.column_dimensions[letra].width=larg
pg.row_dimensions[3].height=30

pg["E3"].comment=Comment(
 "A ATIVIDADE é a unidade desta planilha: “trocar as lonas”, “regular a catraca”.\n\n"
 "Um serviço com três atividades ocupa três linhas — mesma OS, mesmo Serviço.\n\n"
 "A aderência é medida por aqui.","PCM")
pg["H3"].comment=Comment(
 "A SEGUNDA-FEIRA da semana. Escreva numa linha e arraste para baixo.\n\n"
 "Para repetir a semana passada: copie as linhas, cole no fim e troque só "
 "esta coluna — todas as datas andam junto.","PCM")
pg["I3"].comment=Comment("Seg, Ter, Qua, Qui, Sex, Sáb ou Dom.\n\n"
 "Semana + Dia = Data programada, na coluna ao lado.","PCM")
pg["J3"].comment=Comment("Sai sozinha de Semana + Dia. Não digite aqui.","PCM")
pg["K3"].comment=Comment("Preencher esta data já conclui a atividade — "
 "não precisa mexer em mais nada.","PCM")
pg["M3"].comment=Comment("Só ao REPROGRAMAR: guarde aqui a data que estava antes.\n\n"
 "É contra ela que sai a aderência ao plano original — o indicador que não "
 "melhora quando se empurra o serviço para a frente.","PCM")

# ── dados ──
for i,d in enumerate(LINHAS):
    r=PRIM+i
    for col,val in (("B",d["os"]),("C",d["frota"]),("D",d["servico"]),("E",d["atividade"]),
                    ("F",d["tipo"]),("G",d["executante"]),("H",d["semana"]),("I",d["dia"]),
                    ("K",d["concluida"]),("L",d["marcar"]),("M",d["orig"]),
                    ("N",d["motivo"]),("O",d["obs"])):
        if val not in (None,""): pg[f"{col}{r}"]=val

# ── fórmulas e formatação ──
for r in range(PRIM,ULT+1):
    pg[f"A{r}"]=f'=IF($E{r}="","",COUNTA($E${PRIM}:$E{r}))'
    pg[f"J{r}"]=(f'=IF(OR($H{r}="",$I{r}=""),"",$H{r}+MATCH($I{r},{DIA_REF},0)-1)')
    pg[f"P{r}"]=(f'=IF($E{r}="","",'
      f'IF($L{r}="Cancelada","Cancelada",'
      f'IF(OR($K{r}<>"",$L{r}="Concluída"),'
      f'IF(OR($J{r}="",$K{r}="",$K{r}<=$J{r}),"Concluída","Concluída com atraso"),'
      f'IF($J{r}="","Na carteira",'
      f'IF($J{r}<TODAY(),"VENCIDA",'
      f'IF($L{r}="Em execução","Em execução",'
      f'IF($J{r}=TODAY(),"Hoje","Programada")))))))')
    pg[f"Q{r}"]=(f'=IF($E{r}="","",IF(ISNUMBER(SEARCH("(externo)",$G{r})),"Terceirizada","Interna"))')
    pg[f"R{r}"]=f'=IF($J{r}="","",IF($M{r}="",$J{r},$M{r}))'
    pg[f"S{r}"]=f'=IF($E{r}="","",IF(OR($K{r}="",$J{r}=""),0,IF($K{r}<=$J{r},1,0)))'
    pg[f"T{r}"]=f'=IF($E{r}="","",IF(OR($K{r}="",$R{r}=""),0,IF($K{r}<=$R{r},1,0)))'
    pg[f"U{r}"]=f'=IF(OR($K{r}="",$J{r}=""),"",MAX(0,$K{r}-$J{r}))'
    pg[f"V{r}"]=f'=IF($E{r}="","",IF(AND($M{r}<>"",$J{r}<>"",$M{r}<>$J{r}),1,0))'
    pg[f"W{r}"]=(f'=IF($E{r}="","",IF($L{r}="Cancelada",0,'
                 f'IF(OR($K{r}<>"",$L{r}="Concluída"),1,0)))')
    for letra,tit,larg,grp in COLS:
        c=pg[letra+str(r)]
        c.font=F(size=10, color=TINTA if grp in "123" else T2)
        c.border=box
        if grp=="c": c.fill=fill(CINZA_C)
        elif grp=="2": c.fill=fill("FFF4F9FF")
        if letra in ("H","J","K","M","R"): c.number_format="dd/mm/yyyy"
        if letra in ("A","F","I","L","S","T","U","V","Q"):
            c.alignment=Alignment(horizontal="center")
        if letra=="P": c.alignment=Alignment(horizontal="center")
    pg.row_dimensions[r].height=15

def dv(col, formula, titulo, msg):
    v=DataValidation(type="list", formula1=formula, allow_blank=True, showDropDown=False)
    v.error=msg; v.errorTitle=titulo; v.showErrorMessage=True
    pg.add_data_validation(v); v.add(f"{col}{PRIM}:{col}{ULT}")
dv("C", f"=Listas!$B$5:$B${LIN_LISTA}", "Frota", "Escolha uma frota da aba Listas.")
dv("F", f"=Listas!$C$5:$C${LIN_LISTA}", "Tipo", "Escolha um tipo da aba Listas.")
dv("G", f"=Listas!$A$5:$A${LIN_LISTA}", "Executante", "Escolha um executante da aba Listas.")
dv("I", "=Listas!$F$5:$F$11", "Dia", "Seg, Ter, Qua, Qui, Sex, Sáb ou Dom.")
dv("L", f"=Listas!$D$5:$D$7", "Marcar",
   "Deixe vazio, ou use Concluída / Em execução / Cancelada.")
dv("N", f"=Listas!$E$5:$E${LIN_LISTA}", "Motivo", "Escolha da aba Listas ou escreva o seu.")

fx=f"P{PRIM}:P{ULT}"
for txt,fv,ft in (("VENCIDA",RU_V,RU_T),("Concluída",OK_V,OK_T),
                  ("Concluída com atraso",AL_V,AL_T),("Hoje",AZ_V,AZ_T),
                  ("Em execução",AZ_V,AZ_T),("Na carteira",CINZA,T2)):
    pg.conditional_formatting.add(fx, CellIsRule(operator="equal", formula=[f'"{txt}"'],
        fill=fill(fv), font=F(bold=True,size=10,color=ft)))
pg.conditional_formatting.add(f"U{PRIM}:U{ULT}", CellIsRule(operator="greaterThan",
    formula=["0"], font=F(bold=True,size=10,color=RU_T)))

pg.freeze_panes="E5"
pg.auto_filter.ref=f"A3:W{ULT}"
pg.sheet_view.showGridLines=False

# ═══════════════════════════════════ referências
PROG="Programação"
def rg(c): return f"{PROG}!${c}${PRIM}:${c}${ULT}"
G_,J_,L_,K_,E_,C_,F_,R_,S_,T_,U_,V_,P_,W_=[rg(c) for c in "GJLKECFRSTUVPW"]

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
sm["A3"]="Semana (segunda-feira):"
sm["A3"].font=F(bold=True,size=10); sm.merge_cells("A3:B3")
sm["C3"]="=TODAY()-WEEKDAY(TODAY(),3)"
sm["C3"].font=F(bold=True,size=11); sm["C3"].fill=fill(AMARELO)
sm["C3"].number_format="dd/mm/yyyy"; sm["C3"].border=box
sm["C3"].alignment=Alignment(horizontal="center")
sm["D3"]="←  troque para ver outra semana"
sm["D3"].font=F(size=9,italic=True,color=T2); sm.merge_cells("D3:F3")
sm["G3"]="Alerta acima de:"; sm["G3"].font=F(bold=True,size=10)
sm.merge_cells("G3:H3")
sm["I3"]=4
sm["I3"].font=F(bold=True,size=11); sm["I3"].fill=fill(AMARELO)
sm["I3"].border=box; sm["I3"].alignment=Alignment(horizontal="center")
sm["I3"].comment=Comment("Quantas atividades por pessoa por dia você considera cheio. "
 "Acima disso o dia fica em vermelho na grade.","PCM")
sm["J3"]="atividades por dia"
sm["J3"].font=F(size=9,italic=True,color=T2); sm.merge_cells("J3:L3")

DS=["B","C","D","E","F","G","H"]
cabec(sm,5,[("A","Executante")]+[(c,"") for c in DS]+
        [("I","Programadas"),("J","Concluídas"),("K","Aderência"),("L","Vencidas")])
for i,col in enumerate(DS):
    c=sm[f"{col}5"]; c.value=f"=$C$3+{i}" if i else "=$C$3"
    c.number_format='[$-416]ddd\\ dd/mm;@'
sm.row_dimensions[5].height=30

NEX=24; P0=6; P1=P0+NEX-1; LSEM=P1+1; LTOT=P1+2
for k in range(NEX):
    r=P0+k
    sm[f"A{r}"]=f'=IF(Listas!A{5+k}="","",Listas!A{5+k})'
    for i,col in enumerate(DS):
        sm[f"{col}{r}"]=(f'=IF($A{r}="","",COUNTIFS({G_},"*"&$A{r}&"*",{J_},{col}$5,'
                         f'{L_},"<>Cancelada"))')
    sm[f"I{r}"]=f'=IF($A{r}="","",SUM($B{r}:$H{r}))'
    sm[f"J{r}"]=(f'=IF($A{r}="","",SUMIFS({W_},{G_},"*"&$A{r}&"*",{J_},">="&$C$3,'
                 f'{J_},"<="&$C$3+6))')
    sm[f"K{r}"]=f'=IF(OR($A{r}="",$I{r}=0),"",$J{r}/$I{r})'
    sm[f"L{r}"]=(f'=IF($A{r}="","",COUNTIFS({G_},"*"&$A{r}&"*",{J_},">="&$C$3,'
                 f'{J_},"<="&$C$3+6,{J_},"<"&TODAY(),{W_},0,{L_},"<>Cancelada"))')

sm[f"A{LSEM}"]="— sem executante definido —"
sm[f"A{LSEM}"].font=F(size=10,italic=True,color=T2)
for i,col in enumerate(DS):
    sm[f"{col}{LSEM}"]=f'=COUNTIFS({G_},"",{J_},{col}$5,{L_},"<>Cancelada")'
sm[f"I{LSEM}"]=f'=SUM($B{LSEM}:$H{LSEM})'
sm[f"J{LSEM}"]=f'=SUMIFS({W_},{G_},"",{J_},">="&$C$3,{J_},"<="&$C$3+6)'
sm[f"K{LSEM}"]=f'=IF($I{LSEM}=0,"",$J{LSEM}/$I{LSEM})'
sm[f"L{LSEM}"]=(f'=COUNTIFS({G_},"",{J_},">="&$C$3,{J_},"<="&$C$3+6,{J_},"<"&TODAY(),'
                f'{W_},0,{L_},"<>Cancelada")')

# O total conta as atividades, e não a soma das pessoas: um serviço com dois
# executantes aparece nas duas linhas, mas é uma atividade só.
sm[f"A{LTOT}"]="TOTAL DE ATIVIDADES"
for i,col in enumerate(DS):
    sm[f"{col}{LTOT}"]=f'=COUNTIFS({J_},{col}$5,{L_},"<>Cancelada")'
sm[f"I{LTOT}"]=f'=COUNTIFS({J_},">="&$C$3,{J_},"<="&$C$3+6,{L_},"<>Cancelada")'
sm[f"J{LTOT}"]=f'=SUMIFS({W_},{J_},">="&$C$3,{J_},"<="&$C$3+6)'
sm[f"K{LTOT}"]=f'=IF($I{LTOT}=0,"",$J{LTOT}/$I{LTOT})'
sm[f"L{LTOT}"]=(f'=COUNTIFS({J_},">="&$C$3,{J_},"<="&$C$3+6,{J_},"<"&TODAY(),'
                f'{W_},0,{L_},"<>Cancelada")')

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
sm.conditional_formatting.add(f"B{P0}:H{P1}", CellIsRule(operator="greaterThan",
    formula=["$I$3"], fill=fill(RU_V), font=F(bold=True,size=10,color=RU_T)))
sm.conditional_formatting.add(f"K{P0}:K{P1}", CellIsRule(operator="greaterThanOrEqual",
    formula=["0.85"], fill=fill(OK_V), font=F(bold=True,size=10,color=OK_T)))
sm.conditional_formatting.add(f"K{P0}:K{P1}", CellIsRule(operator="lessThan",
    formula=["0.6"], fill=fill(RU_V), font=F(bold=True,size=10,color=RU_T)))
sm.conditional_formatting.add(f"L{P0}:L{LSEM}", CellIsRule(operator="greaterThan",
    formula=["0"], fill=fill(RU_V), font=F(bold=True,size=10,color=RU_T)))

LC=LTOT+2
sm[f"A{LC}"]="Na carteira, ainda sem dia:"
sm[f"A{LC}"].font=F(bold=True,size=10); sm.merge_cells(f"A{LC}:B{LC}")
sm[f"C{LC}"]=f'=COUNTIFS({J_},"",{E_},"<>",{L_},"<>Cancelada")'
sm[f"C{LC}"].font=F(bold=True,size=12,color=RED)
sm[f"C{LC}"].alignment=Alignment(horizontal="center")
sm[f"C{LC}"].border=box; sm[f"C{LC}"].fill=fill(CINZA_C)
sm[f"D{LC}"]=("atividade(s) esperando encaixe — filtre a coluna Situação por “Na carteira” "
              "na aba Programação e escreva a Semana e o Dia")
sm[f"D{LC}"].font=F(size=9,italic=True,color=T2); sm.merge_cells(f"D{LC}:L{LC}")
sm.freeze_panes="B6"; sm.sheet_view.showGridLines=False

# ═══════════════════════════════════ ADERÊNCIA
ad=wb.create_sheet("Aderência")
titulo(ad,"ADERÊNCIA DA PROGRAMAÇÃO  ·  medida por atividade","K")
ad["A3"]="De:"; ad["A4"]="Até:"
for ref in ("A3","A4"): ad[ref].font=F(bold=True,size=10)
ad["B3"]="=TODAY()-WEEKDAY(TODAY(),3)"; ad["B4"]="=B3+6"
for ref in ("B3","B4"):
    c=ad[ref]; c.font=F(bold=True,size=11); c.fill=fill(AMARELO)
    c.number_format="dd/mm/yyyy"; c.border=box; c.alignment=Alignment(horizontal="center")
ad["C3"]="←  troque as duas datas para analisar outro período"
ad["C3"].font=F(size=9,italic=True,color=T2); ad.merge_cells("C3:H3")
ad["C4"]="As atividades entram pelo dia para o qual foram PROGRAMADAS."
ad["C4"].font=F(size=9,italic=True,color=T2); ad.merge_cells("C4:H4")

jan=f'{J_},">="&$B$3,{J_},"<="&$B$4'
janR=f'{R_},">="&$B$3,{R_},"<="&$B$4'

ad.merge_cells("A6:B9")
ad["A6"]='=IFERROR(B14,"—")'
ad["A6"].font=F(bold=True,size=40,color=NAVY)
ad["A6"].alignment=Alignment(horizontal="center",vertical="center")
ad["A6"].number_format="0%"; ad["A6"].fill=fill(CINZA_C)
ad.merge_cells("C6:K9")
ad["C6"]=('="ADERÊNCIA POR ATIVIDADE"&CHAR(10)&B13&" de "&B12&'
          '" atividades programadas no período foram concluídas."&CHAR(10)&'
          '"Cada linha da aba Programação é uma atividade — é ela que conta, não o serviço inteiro."')
ad["C6"].font=F(size=12,color=TINTA)
ad["C6"].alignment=Alignment(horizontal="left",vertical="center",wrap_text=True,indent=2)
ad["C6"].fill=fill(CINZA_C)
for r in range(6,10):
    for col in "ABCDEFGHIJK": ad[f"{col}{r}"].border=box
    ad.row_dimensions[r].height=22

cabec(ad,11,[("A","Indicador"),("B","Valor"),("C","Como é medido")],NAVY)
for _c in "DEFGHIJK":
    _x=ad[f"{_c}11"]; _x.fill=fill(NAVY); _x.border=box
ad.merge_cells("C11:K11")
ad["C11"].alignment=Alignment(horizontal="left",vertical="center",indent=1)

IND=[
 ("Atividades programadas", f'=COUNTIFS({jan},{L_},"<>Cancelada")', "0",
  "com data programada no período, exceto as canceladas"),
 ("Concluídas", f'=SUMIFS({W_},{jan})', "0",
  "com data em Concluída em, ou marcadas como Concluída"),
 ("Aderência por atividade", '=IFERROR(B13/B12,"")', "0%",
  "concluídas ÷ programadas — o indicador principal"),
 ("Concluídas no prazo", f'=IF(COUNTIFS({jan},{K_},"<>")=0,"",SUMIFS({S_},{jan}))', "0",
  "concluídas até o próprio dia programado — só conta quem tem data de conclusão"),
 ("Pontualidade", f'=IFERROR(B15/COUNTIFS({jan},{K_},"<>",{L_},"<>Cancelada"),"")', "0%",
  "concluídas no prazo ÷ concluídas COM data — as sem data ficam de fora"),
 ("Programadas no plano original", f'=COUNTIFS({janR},{L_},"<>Cancelada")', "0",
  "pela 1ª data programada, e não pela data de hoje"),
 ("Concluídas até a 1ª data", f'=IF(COUNTIFS({janR},{K_},"<>")=0,"",SUMIFS({T_},{janR}))', "0",
  "entregues sem precisar empurrar o dia"),
 ("Aderência ao plano original", f'=IF(COUNTIFS({janR},{K_},"<>")=0,"",IFERROR(B18/B17,""))', "0%",
  "não melhora quando se reprograma — mostra se a semana combinada foi cumprida"),
 ("Vencidas", f'=COUNTIFS({jan},{J_},"<"&TODAY(),{W_},0,{L_},"<>Cancelada")', "0",
  "o dia passou e a atividade não foi concluída nem cancelada"),
 ("Canceladas", f'=COUNTIFS({jan},{L_},"Cancelada")', "0",
  "fora do cálculo da aderência"),
 ("Atividades reprogramadas", f'=SUMIFS({V_},{jan})', "0",
  "a 1ª data programada é diferente da data de hoje"),
 ("Atraso médio, quando atrasa", f'=IFERROR(SUMIFS({U_},{jan})/COUNTIFS({jan},{U_},">0"),0)', "0.0",
  "dias entre o programado e o concluído, só das que passaram do dia"),
 ("Na carteira, sem dia", f'=COUNTIFS({J_},"",{E_},"<>",{L_},"<>Cancelada")', "0",
  "não depende do período — é o que ainda espera encaixe"),
 ("Atividades em empresa externa", f'=COUNTIFS({jan},{rg("Q")},"Terceirizada")', "0",
  "executante escrito com “(externo)” no fim"),
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
    ad.merge_cells(f"C{r}:K{r}")
    ad.row_dimensions[r].height=17
ad.conditional_formatting.add("B20", CellIsRule(operator="greaterThan",
    formula=["0"], fill=fill(RU_V), font=F(bold=True,size=11,color=RU_T)))
for ref in ("B14","B16","B19","A6"):
    tam=40 if ref=="A6" else 11
    ad.conditional_formatting.add(ref, CellIsRule(operator="greaterThanOrEqual",
        formula=["0.85"], font=F(bold=True,size=tam,color=OK_T)))
    ad.conditional_formatting.add(ref, CellIsRule(operator="lessThan",
        formula=["0.6"], font=F(bold=True,size=tam,color=RU_T)))

def recorte(lin, col0, tit, lista, coluna, n=24, curinga=False):
    cols=[get_column_letter(col0+i) for i in range(5)]
    a,b,c,d,e=cols
    ad[f"{a}{lin}"]=tit
    ad[f"{a}{lin}"].font=F(bold=True,size=11,color=NAVY)
    ad.merge_cells(f"{a}{lin}:{e}{lin}")
    cabec(ad,lin+1,[(a,"Nome"),(b,"Progr."),(c,"Concl."),(d,"Aderência"),(e,"Vencidas")])
    for k in range(n):
        r=lin+2+k
        ad[f"{a}{r}"]=f'=IF(Listas!{lista}{5+k}="","",Listas!{lista}{5+k})'
        alvo=f'"*"&${a}{r}&"*"' if curinga else f'${a}{r}'
        crit=f'{coluna},{alvo}'
        ad[f"{b}{r}"]=f'=IF(${a}{r}="","",COUNTIFS({crit},{jan},{L_},"<>Cancelada"))'
        ad[f"{c}{r}"]=f'=IF(${a}{r}="","",SUMIFS({W_},{crit},{jan}))'
        ad[f"{d}{r}"]=f'=IF(OR(${a}{r}="",${b}{r}=0),"",${c}{r}/${b}{r})'
        ad[f"{e}{r}"]=(f'=IF(${a}{r}="","",COUNTIFS({crit},{jan},{J_},"<"&TODAY(),'
                       f'{W_},0,{L_},"<>Cancelada"))')
        for col in cols:
            cc=ad[f"{col}{r}"]; cc.border=box; cc.font=F(size=10)
            if col!=a: cc.alignment=Alignment(horizontal="center")
            if col==d: cc.number_format="0%"
            if col in (b,c,d,e): cc.fill=fill(CINZA_C)
        ad.row_dimensions[r].height=16
    fa=f"{d}{lin+2}:{d}{lin+1+n}"
    ad.conditional_formatting.add(fa, CellIsRule(operator="greaterThanOrEqual",
        formula=["0.85"], fill=fill(OK_V), font=F(bold=True,size=10,color=OK_T)))
    ad.conditional_formatting.add(fa, CellIsRule(operator="lessThan",
        formula=["0.6"], fill=fill(RU_V), font=F(bold=True,size=10,color=RU_T)))
    ad.conditional_formatting.add(f"{e}{lin+2}:{e}{lin+1+n}", CellIsRule(
        operator="greaterThan", formula=["0"], font=F(bold=True,size=10,color=RU_T)))

recorte(28, 1, "POR EXECUTANTE", "A", G_, 24, curinga=True)
recorte(28, 7, "POR FROTA", "B", C_, 24)
recorte(55, 1, "POR TIPO DE SERVIÇO", "C", F_, 8)

ad.column_dimensions["A"].width=30
for col,w in (("B",10),("C",11),("D",11),("E",10),("F",3),
              ("G",16),("H",10),("I",11),("J",11),("K",10)):
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
def par(r, txt, alt=None, cor=TINTA, negrito=False):
    ins[f"A{r}"]=txt
    ins[f"A{r}"].font=F(size=10,bold=negrito,color=cor)
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
sec(L,"MONTAR A PROGRAMAÇÃO DA SEMANA — quatro passos"); L+=1
passo(L,"1","Na aba PROGRAMAÇÃO, clique na setinha do filtro da coluna "
           "SITUAÇÃO e deixe marcado só “Na carteira”. Sobram as atividades "
           "que ainda não têm dia."); L+=1
passo(L,"2","Nas que você vai fazer, escreva a SEGUNDA-FEIRA da semana na coluna "
           "SEMANA. Escreva numa linha e arraste para baixo — vale para todas."); L+=1
passo(L,"3","Escolha o DIA (Seg, Ter, Qua…) e o EXECUTANTE. "
           "A coluna Data programada se preenche sozinha."); L+=1
passo(L,"4","Tire o filtro. A aba SEMANA já mostra quantas atividades cada um "
           "ficou por dia — e pinta de vermelho quem passou do limite."); L+=2

sec(L,"REPETIR A SEMANA QUE PASSOU"); L+=1
par(L,"Boa parte da semana se repete: preventivas, calibrações, inspeções. Em vez de "
      "digitar tudo de novo:",alt=18); L+=1
passo(L,"1","Selecione as linhas da semana passada, copie e cole no fim da lista.",NAVY2); L+=1
passo(L,"2","Troque só a coluna SEMANA pela nova segunda-feira. Todas as datas "
           "andam junto — é para isso que existe a coluna Semana.",NAVY2); L+=1
passo(L,"3","Apague o que ficou em CONCLUÍDA EM e em MARCAR nas linhas coladas.",NAVY2); L+=2

sec(L,"O DIA A DIA"); L+=1
DIA=[("Concluiu uma atividade?","Escreva a data em CONCLUÍDA EM. Só isso — a situação "
      "muda sozinha e a aderência já conta."),
     ("Vai empurrar para outro dia?","Antes de mudar, copie a data de hoje para a coluna "
      "1ª DATA. Depois troque o Dia (ou a Semana) e escreva o MOTIVO. Sem a 1ª data, a "
      "aderência ao plano original não tem contra o que medir."),
     ("Serviço em empresa externa?","Escreva o nome da empresa no EXECUTANTE com "
      "“(externo)” no fim — a coluna Oficina se marca sozinha como Terceirizada."),
     ("Cancelou?","Escolha “Cancelada” na coluna MARCAR. Ela sai dos dois lados da "
      "conta da aderência."),
     ("Serviço novo sem dia ainda?","Escreva tudo menos a Semana e o Dia. Ele fica "
      "na carteira até você programar.")]
for perg,resp in DIA:
    ins[f"A{L}"]=perg; ins[f"A{L}"].font=F(bold=True,size=10,color=NAVY)
    ins[f"A{L}"].alignment=Alignment(vertical="top",wrap_text=True,indent=1)
    ins.merge_cells(f"A{L}:B{L}")
    ins[f"C{L}"]=resp; ins[f"C{L}"].font=F(size=10)
    ins[f"C{L}"].alignment=Alignment(vertical="top",wrap_text=True,indent=1)
    ins.merge_cells(f"C{L}:H{L}")
    for col in "ABCDEFGH": ins[f"{col}{L}"].border=box
    ins.row_dimensions[L].height=34
    L+=1
L+=1

sec(L,"COMO A ADERÊNCIA É CALCULADA"); L+=1
ins[f"A{L}"]="Aderência  =  atividades concluídas  ÷  atividades programadas no período"
ins[f"A{L}"].font=F(bold=True,size=12,color=NAVY); ins[f"A{L}"].fill=fill("FFEDF1F9")
ins[f"A{L}"].alignment=Alignment(vertical="center",indent=1)
ins.merge_cells(f"A{L}:H{L}"); ins.row_dimensions[L].height=26
for col in "ABCDEFGH": ins[f"{col}{L}"].border=box
L+=1
par(L,"Cada linha da aba Programação é uma ATIVIDADE — “trocar as lonas”, “regular a "
      "catraca”. Um serviço com três atividades ocupa três linhas. Se duas saírem e uma "
      "ficar, a aderência mostra 67%: nem some da conta, nem finge que fechou.",alt=32); L+=1
par(L,"A aba Aderência traz ainda dois recortes que a conta principal não mostra:",alt=16); L+=1
par(L,"    •  Pontualidade — das que foram concluídas, quantas saíram até o próprio dia.",alt=16); L+=1
par(L,"    •  Aderência ao plano original — mede contra a 1ª data programada. É a única "
      "que não melhora quando se empurra o serviço para a frente.",alt=28); L+=2

sec(L,"AS ABAS E AS CORES"); L+=1
ABAS=[("Programação","Onde se trabalha. Uma linha por atividade."),
      ("Semana","A carga de cada executante em cada dia."),
      ("Aderência","Os indicadores do período, por executante, frota e tipo."),
      ("Listas","Os nomes das caixas de seleção.")]
for nome,txt in ABAS:
    ins[f"A{L}"]=nome; ins[f"A{L}"].font=F(bold=True,size=10)
    ins[f"A{L}"].alignment=Alignment(vertical="center",indent=1)
    ins[f"B{L}"]=txt; ins[f"B{L}"].font=F(size=10)
    ins[f"B{L}"].alignment=Alignment(vertical="center",indent=1)
    ins.merge_cells(f"B{L}:H{L}")
    for col in "ABCDEFGH": ins[f"{col}{L}"].border=box
    ins.row_dimensions[L].height=18
    L+=1
CORES=[(AMARELO,"Amarelo","o que você sempre preenche, e as células de controle"),
       ("FFF4F9FF","Azul claro","Semana e Dia — é onde se programa"),
       ("FFEDEFF4","Cinza claro","só quando acontecer: concluir, cancelar, reprogramar"),
       (CINZA_C,"Cinza","calculado pela planilha — não digite")]
for corv,nome,txt in CORES:
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
    nfila=sum(1 for d in LINHAS if d["semana"] is None)
    ins[f"A{L}"]=("A planilha já veio carregada com a programação de 24 a 28/08/26 que você "
                  "imprimiu do site: %d atividades, sendo %d ainda na carteira. As da carteira "
                  "entraram como uma linha por serviço, porque a folha impressa só traz a "
                  "contagem de pendências — quebre em uma linha por atividade quando for "
                  "programar." % (len(LINHAS), nfila))
    ins[f"A{L}"].font=F(size=10,color=OK_T); ins[f"A{L}"].fill=fill(OK_V)
    ins[f"A{L}"].alignment=Alignment(vertical="center",wrap_text=True,indent=1)
    ins.merge_cells(f"A{L}:H{L}"); ins.row_dimensions[L].height=46
    for col in "ABCDEFGH": ins[f"{col}{L}"].border=box
    L+=2
par(L,"Há 1.000 linhas prontas na aba Programação, com as fórmulas das colunas cinzas já "
      "em todas elas. Para imprimir a semana: filtre a coluna Data programada pelo período "
      "e mande imprimir — sai só o que o filtro deixou visível.",cor=T2,alt=32)

ins.column_dimensions["A"].width=14
for col in "BCDEFGH": ins.column_dimensions[col].width=17
ins.sheet_view.showGridLines=False

# ═══════════════════════════════════ IMPRESSÃO E FECHO
for ws,orient,tit_rows in ((pg,"landscape",3),(sm,"landscape",5),
                           (ad,"portrait",None),(ins,"portrait",None),(ls,"portrait",None)):
    ws.page_setup.orientation=orient
    ws.page_setup.paperSize=ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth=1; ws.page_setup.fitToHeight=0
    ws.sheet_properties.pageSetUpPr.fitToPage=True
    ws.print_options.horizontalCentered=True
    ws.page_margins.left=ws.page_margins.right=0.4
    ws.page_margins.top=ws.page_margins.bottom=0.5
    if tit_rows: ws.print_title_rows=f"1:{tit_rows}"
pg.print_area=f"A1:W{PRIM+max(len(LINHAS),60)+5}"
sm.print_area=f"A1:L{LTOT+3}"
ls.print_area=f"A1:F{LIN_LISTA}"

wb.calculation.fullCalcOnLoad=True
for ws in wb.worksheets: ws.sheet_properties.tabColor=NAVY[2:]
wb.active=0
wb.save(SAIDA)
print("planilha montada:",SAIDA)
print("  atividades carregadas:",len(LINHAS))
print("  executantes:",len(EXEC_LISTA),"| frotas:",len(FROTA_LISTA))
