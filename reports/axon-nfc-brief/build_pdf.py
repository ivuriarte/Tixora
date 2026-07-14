from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor, Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
import textwrap


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/pdf/Axon_NFC_CheckIn_Freebies_Architecture_Brief.pdf"
LOGO = ROOT / "apps/web/public/logo.png"

W, H = A4
M = 42

INK = HexColor("#15213A")
PURPLE = HexColor("#6127C8")
VIOLET = HexColor("#8A4DFF")
ORANGE = HexColor("#F26A21")
CREAM = HexColor("#FFF8EF")
LILAC = HexColor("#F2ECFF")
MINT = HexColor("#E8F8F2")
SKY = HexColor("#EAF4FF")
RED = HexColor("#D84545")
AMBER = HexColor("#F4A629")
GREEN = HexColor("#168B66")
MID = HexColor("#657087")
LIGHT = HexColor("#E5E8EF")
PAPER = HexColor("#FCFBF8")
WHITE = HexColor("#FFFFFF")


def register_fonts():
    candidates = [
        ("/System/Library/Fonts/SFNS.ttf", "AxonSans"),
        ("/System/Library/Fonts/SFNSRounded.ttf", "AxonRound"),
        ("/System/Library/Fonts/SFNSMono.ttf", "AxonMono"),
        ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", "AxonBold"),
    ]
    for path, name in candidates:
        if Path(path).exists():
            pdfmetrics.registerFont(TTFont(name, path))
    if "AxonSans" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("AxonSans", "/System/Library/Fonts/Supplemental/Arial.ttf"))
    if "AxonBold" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("AxonBold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"))
    if "AxonRound" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("AxonRound", "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"))
    if "AxonMono" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("AxonMono", "/System/Library/Fonts/SFNSMono.ttf"))


def rounded(c, x, y, w, h, fill, radius=12, stroke=None, sw=1):
    c.setFillColor(fill)
    c.setStrokeColor(stroke or fill)
    c.setLineWidth(sw)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1 if stroke else 0)


def line(c, x1, y1, x2, y2, color=LIGHT, width=1):
    c.setStrokeColor(color)
    c.setLineWidth(width)
    c.line(x1, y1, x2, y2)


def text(c, s, x, y, size=10, color=INK, font="AxonSans"):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawString(x, y, s)


def right_text(c, s, x, y, size=10, color=INK, font="AxonSans"):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawRightString(x, y, s)


def wrapped(c, s, x, y, width, size=10, leading=None, color=INK, font="AxonSans", max_lines=None):
    leading = leading or size * 1.35
    words = s.split()
    lines = []
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        if stringWidth(trial, font, size) <= width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    if max_lines:
        lines = lines[:max_lines]
    c.setFillColor(color)
    c.setFont(font, size)
    yy = y
    for ln in lines:
        c.drawString(x, yy, ln)
        yy -= leading
    return yy


def label(c, s, x, y, color=PURPLE):
    text(c, s.upper(), x, y, 7.4, color, "AxonBold")


def title(c, s, x=M, y=H-82, size=25, width=None):
    return wrapped(c, s, x, y, width or W-2*M, size, size*1.08, INK, "AxonBold")


def page_base(c, page_num, section=None, dark=False):
    c.setFillColor(INK if dark else PAPER)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    if not dark:
        c.setFillColor(PURPLE)
        c.rect(0, H-8, W, 8, fill=1, stroke=0)
    if section:
        label(c, section, M, H-34, WHITE if dark else PURPLE)
    right_text(c, f"{page_num:02d}", W-M, 24, 8, WHITE if dark else MID, "AxonMono")


def pill(c, s, x, y, bg=LILAC, fg=PURPLE, pad=8):
    w = stringWidth(s, "AxonBold", 7.5) + pad*2
    rounded(c, x, y-4, w, 19, bg, 9)
    text(c, s.upper(), x+pad, y+2, 7.5, fg, "AxonBold")
    return w


def icon_circle(c, x, y, glyph, fill=PURPLE, r=16):
    c.setFillColor(fill)
    c.circle(x, y, r, fill=1, stroke=0)
    c.setFillColor(WHITE)
    font_size = min(13, max(6, r * 0.85))
    c.setFont("AxonBold", font_size)
    c.drawCentredString(x, y-font_size*0.32, glyph)


def white_brand(c, x, y):
    rounded(c, x, y, 32, 32, PURPLE, 8)
    c.setStrokeColor(WHITE)
    c.setLineWidth(2.2)
    c.line(x+8, y+7, x+16, y+25)
    c.line(x+16, y+25, x+25, y+7)
    c.line(x+11, y+14, x+22, y+14)
    text(c, "AXON", x+43, y+18, 13, WHITE, "AxonBold")
    text(c, "T I C K E T S", x+43, y+5, 5.5, HexColor("#BDA9FF"), "AxonBold")


def card(c, x, y, w, h, heading, body, accent=PURPLE, number=None):
    rounded(c, x, y, w, h, WHITE, 14, LIGHT, .8)
    c.setFillColor(accent)
    c.roundRect(x, y+h-7, w, 7, 3, fill=1, stroke=0)
    if number:
        icon_circle(c, x+24, y+h-32, str(number), accent, 13)
        hx = x+46
    else:
        hx = x+18
    text(c, heading, hx, y+h-37, 11, INK, "AxonBold")
    wrapped(c, body, x+18, y+h-60, w-36, 8.5, 11.5, MID, "AxonSans")


def arrow(c, x1, y1, x2, y2, color=PURPLE, width=2):
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(width)
    c.line(x1, y1, x2, y2)
    import math
    ang = math.atan2(y2-y1, x2-x1)
    a = 6
    pts = [
        (x2, y2),
        (x2-a*math.cos(ang-.55), y2-a*math.sin(ang-.55)),
        (x2-a*math.cos(ang+.55), y2-a*math.sin(ang+.55)),
    ]
    p = c.beginPath()
    p.moveTo(*pts[0]); p.lineTo(*pts[1]); p.lineTo(*pts[2]); p.close()
    c.drawPath(p, fill=1, stroke=0)


def footer_source(c, s):
    wrapped(c, s, M, 24, W-2*M-38, 6.5, 8, MID, "AxonSans", 2)


def cover(c):
    page_base(c, 1, dark=True)
    c.setFillColor(PURPLE)
    c.circle(W+20, H-50, 210, fill=1, stroke=0)
    c.setFillColor(ORANGE)
    c.circle(W-35, H-45, 58, fill=1, stroke=0)
    c.setFillColor(Color(1,1,1,.08))
    for i in range(6):
        c.circle(78+i*26, 170+(i%2)*19, 6, fill=1, stroke=0)
    white_brand(c, M, H-90)
    pill(c, "Architecture decision brief", M, H-142, bg=Color(1,1,1,.12), fg=WHITE)
    wrapped(c, "Tap. Validate. Welcome.", M, H-212, W-2*M, 36, 38, WHITE, "AxonBold")
    wrapped(c, "A human-first blueprint for NFC check-in and freebie collection - operated by Axon, resilient by design.", M, H-302, 420, 16, 22, HexColor("#D9DDF0"), "AxonSans")
    rounded(c, M, 110, W-2*M, 114, Color(1,1,1,.08), 18, Color(1,1,1,.18), .8)
    label(c, "The decision", M+22, 198, ORANGE)
    wrapped(c, "Davi contributes the NFC kiosk repository. Axon owns the live transaction.", M+22, 172, W-2*M-44, 18, 22, WHITE, "AxonBold")
    wrapped(c, "No Davi server is required to approve check-in or release a freebie.", M+22, 137, W-2*M-44, 10, 14, HexColor("#D9DDF0"), "AxonSans")
    text(c, "Prepared 20 June 2026  |  July live-validation edition", M, 62, 8.5, HexColor("#AEB6D2"), "AxonMono")
    right_text(c, "GO WITH CONDITIONS", W-M, 62, 8.5, ORANGE, "AxonBold")
    c.showPage()


def executive(c):
    page_base(c, 2, "01 / Executive view")
    title(c, "The architecture becomes simpler - and safer.")
    wrapped(c, "NFC is the way an attendee presents identity. Axon remains the system that decides and records what happens.", M, H-144, W-2*M, 12, 17, MID)
    y = 555
    items = [
        ("NFC kiosk", "Reads the card and sends an opaque identifier.", PURPLE),
        ("Axon", "Finds the attendee, applies the rules, and records the result.", ORANGE),
        ("Davi", "Not required in the live check-in or freebie path.", GREEN),
    ]
    for i, (h, b, col) in enumerate(items, 1):
        card(c, M+(i-1)*170, y, 155, 126, h, b, col, i)
    rounded(c, M, 360, W-2*M, 146, INK, 18)
    label(c, "One-sentence operating model", M+24, 474, ORANGE)
    wrapped(c, "The attendee taps the card; Axon recognizes the person and records the action.", M+24, 436, W-2*M-48, 20, 25, WHITE, "AxonBold")
    wrapped(c, "If NFC is unavailable, the same attendee can still use the existing QR ticket or staff-assisted search.", M+24, 391, W-2*M-48, 9.5, 14, HexColor("#CBD2E5"))
    label(c, "Why this is the right July scope", M, 321)
    reasons = [
        ("Fewer dependencies", "Admission does not wait for another platform."),
        ("One source of truth", "Axon owns attendance and collection records."),
        ("Graceful fallback", "QR and manual lookup remain available."),
        ("Clear accountability", "Event staff know exactly which system decides."),
    ]
    for i,(h,b) in enumerate(reasons):
        x=M+(i%2)*255; yy=262-(i//2)*88
        icon_circle(c, x+14, yy+25, "OK", GREEN, 12)
        text(c,h,x+34,yy+37,10,INK,"AxonBold")
        wrapped(c,b,x+34,yy+18,205,8.2,11,MID)
    c.showPage()


def journey(c):
    page_base(c, 3, "02 / Attendee journey")
    title(c, "A fast front-door experience with three safety nets.")
    wrapped(c, "The design optimizes for the happy path without trapping staff when hardware, connectivity, or a card fails.", M, H-140, W-2*M, 11, 16, MID)
    steps = [
        ("1", "Tap", "Attendee places the card near the kiosk."),
        ("2", "Recognize", "Axon resolves the card to an attendee."),
        ("3", "Validate", "Axon checks event, payment, ticket and prior use."),
        ("4", "Welcome", "Axon records the action and shows success."),
    ]
    y=490
    for i,(n,h,b) in enumerate(steps):
        x=M+i*128
        rounded(c,x,y,112,132,WHITE,18,LIGHT,.8)
        icon_circle(c,x+56,y+94,n,[PURPLE,VIOLET,ORANGE,GREEN][i],18)
        c.drawCentredString(x+56,y+62,h)
        c.setFont("AxonBold",12); c.setFillColor(INK); c.drawCentredString(x+56,y+62,h)
        wrapped(c,b,x+14,y+42,84,7.7,10.5,MID)
        if i<3: arrow(c,x+113,y+66,x+127,y+66,LIGHT,2)
    rounded(c,M,304,W-2*M,130,CREAM,18)
    label(c,"When a tap does not work",M+22,402,ORANGE)
    fallback = [("01","Scan the Axon QR"),("02","Search name, email or reference"),("03","Use a controlled manual exception")]
    for i,(n,s) in enumerate(fallback):
        x=M+22+i*167
        text(c,n,x,363,8,PURPLE,"AxonMono")
        wrapped(c,s,x,343,145,9.5,13,INK,"AxonBold")
    label(c,"What staff should see",M,264)
    messages=[
        ("SUCCESS","Juan Dela Cruz checked in","green"),
        ("DUPLICATE","Already checked in at 8:15 AM","amber"),
        ("ACTION","Card not linked - search attendee","red"),
    ]
    cols={"green":(MINT,GREEN),"amber":(CREAM,HexColor("#A46100")),"red":(HexColor("#FDECEC"),RED)}
    for i,(tag,msg,key) in enumerate(messages):
        bg,fg=cols[key]; x=M+i*170
        rounded(c,x,145,155,90,bg,14)
        label(c,tag,x+14,209,fg)
        wrapped(c,msg,x+14,184,127,9,12,INK,"AxonBold")
    c.showPage()


def architecture(c):
    page_base(c, 4, "03 / Target architecture")
    title(c, "Davi is outside the live decision loop.")
    wrapped(c, "This is the most important boundary in the design.", M, H-138, W-2*M, 11, 16, MID)
    # main flow
    nodes=[
        (M,500,104,88,"NFC card","Opaque token",PURPLE),
        (M+142,500,104,88,"Kiosk","Read + submit",VIOLET),
        (M+284,500,104,88,"Axon API","Decide",ORANGE),
        (M+426,500,84,88,"Axon DB","Record",GREEN),
    ]
    for x,y,w,h,hd,sub,col in nodes:
        rounded(c,x,y,w,h,WHITE,16,LIGHT,.8)
        c.setFillColor(col); c.circle(x+w/2,y+h-24,7,fill=1,stroke=0)
        c.setFont("AxonBold",10); c.setFillColor(INK); c.drawCentredString(x+w/2,y+42,hd)
        c.setFont("AxonSans",7.6); c.setFillColor(MID); c.drawCentredString(x+w/2,y+24,sub)
    for i in range(3):
        arrow(c,nodes[i][0]+nodes[i][2],544,nodes[i+1][0]-4,544,PURPLE,2)
    rounded(c,M,338,W-2*M,116,LILAC,18)
    label(c,"Live transaction boundary",M+22,422,PURPLE)
    wrapped(c,"Card tap -> Axon validation -> Axon record",M+22,390,360,18,22,INK,"AxonBold")
    wrapped(c,"There is no synchronous Davi approval, webhook, identity lookup, or redemption call here.",M+22,356,W-2*M-44,9.5,13,MID)
    # Davi side
    rounded(c,M,178,220,116,WHITE,16,LIGHT,.8)
    label(c,"Davi contribution",M+18,264,GREEN)
    wrapped(c,"NFC kiosk repository",M+18,235,184,14,18,INK,"AxonBold")
    wrapped(c,"Code handover, card-format documentation and implementation guidance.",M+18,206,184,8.5,11.5,MID)
    rounded(c,M+250,178,260,116,INK,16)
    label(c,"Not in scope for the tap",M+268,264,ORANGE)
    wrapped(c,"Davi production availability",M+268,235,224,14,18,WHITE,"AxonBold")
    wrapped(c,"A Davi outage must not prevent entry or freebie collection.",M+268,206,224,8.5,11.5,HexColor("#CBD2E5"))
    footer_source(c,"Repository status: the Davi NFC kiosk repository was not available in the Axon workspace during this assessment. Implementation details remain subject to repository review.")
    c.showPage()


def checkin(c):
    page_base(c, 5, "04 / Check-in rules")
    title(c, "A tap is a request - not automatic permission.")
    wrapped(c, "Axon must still apply every admission rule before recording attendance.", M, H-140, W-2*M, 11, 16, MID)
    checks=[
        ("Card active?","Reject revoked or replaced cards."),
        ("Correct event?","A card link does not grant entry everywhere."),
        ("Payment confirmed?","Registration must be verified or order paid."),
        ("Ticket valid?","Reject cancelled, refunded or invalid tickets."),
        ("First check-in?","Prevent repeated or simultaneous admission."),
    ]
    y=610
    for i,(h,b) in enumerate(checks):
        yy=y-i*73
        icon_circle(c,M+18,yy+8,str(i+1),PURPLE if i<4 else ORANGE,13)
        text(c,h,M+43,yy+15,10.5,INK,"AxonBold")
        wrapped(c,b,M+43,yy-3,220,8.5,11,MID)
        if i<4: line(c,M+18,yy-18,M+18,yy-51,LIGHT,2)
    rounded(c,330,334,223,290,INK,20)
    label(c,"Atomic check-in",352,590,ORANGE)
    wrapped(c,"Only one winner.",352,558,178,22,25,WHITE,"AxonBold")
    wrapped(c,"If two kiosks submit the same attendee at nearly the same moment, the database must accept one check-in and return the first result to the other.",352,510,178,10,15,HexColor("#D4D9E8"))
    line(c,352,436,530,436,Color(1,1,1,.16),1)
    label(c,"Required uniqueness",352,412,HexColor("#AFA0FF"))
    wrapped(c,"One accepted check-in per attendee + event.",352,382,178,10,15,WHITE,"AxonBold")
    rounded(c,M,154,W-2*M,126,MINT,18)
    label(c,"Existing Axon advantage",M+22,248,GREEN)
    wrapped(c,"The QR scanner already validates event, registration status and duplicate attendance.",M+22,218,W-2*M-44,14,18,INK,"AxonBold")
    wrapped(c,"The NFC endpoint should reuse the same business rules and produce the same audit result - only the input method changes.",M+22,180,W-2*M-44,9,13,MID)
    c.showPage()


def freebies(c):
    page_base(c, 6, "05 / Freebie collection")
    title(c, "The same tap, a different rulebook.")
    wrapped(c, "Check-in proves arrival. Freebie collection proves an entitlement was consumed. They must be stored as separate events.", M, H-140, W-2*M, 11, 16, MID)
    y=506
    flow=[
        ("Tap card","Identify attendee"),
        ("Load entitlement","Is this person eligible?"),
        ("Check prior claim","Has it already been collected?"),
        ("Record collection","Release the physical item"),
    ]
    for i,(h,b) in enumerate(flow):
        x=M+i*128
        rounded(c,x,y,112,122,[LILAC,SKY,CREAM,MINT][i],16)
        pill(c,str(i+1),x+12,y+91,bg=WHITE,fg=[PURPLE,PURPLE,ORANGE,GREEN][i],pad=7)
        text(c,h,x+12,y+66,9.5,INK,"AxonBold")
        wrapped(c,b,x+12,y+47,88,7.6,10.5,MID)
        if i<3: arrow(c,x+113,y+61,x+127,y+61,LIGHT,2)
    rounded(c,M,322,W-2*M,134,INK,18)
    label(c,"Non-negotiable control",M+22,424,ORANGE)
    wrapped(c,"One accepted claim per attendee + event + freebie.",M+22,390,W-2*M-44,18,22,WHITE,"AxonBold")
    wrapped(c,"Repeated taps, retries, double-clicks and simultaneous stations must return the original result - never issue a second item.",M+22,350,W-2*M-44,9,13,HexColor("#D4D9E8"))
    label(c,"What the freebie record should answer",M,278)
    qs=[
        "Who received it?",
        "What item was released?",
        "Which station and staff member?",
        "When was it collected?",
        "Was an override used - and why?",
        "Was the action online or provisional?",
    ]
    for i,q in enumerate(qs):
        x=M+(i%2)*255; yy=236-(i//2)*45
        text(c,"•",x,yy,12,PURPLE,"AxonBold")
        wrapped(c,q,x+16,yy+1,220,8.8,11,INK)
    c.showPage()


def nfc_reality(c):
    page_base(c, 7, "06 / NFC reality check")
    title(c, "NFC hardware is common. Access is not universal.")
    wrapped(c, "The phone may contain an NFC radio while the chosen browser or application still cannot use it in the required way.", M, H-140, W-2*M, 11, 16, MID)
    # comparison
    rounded(c,M,394,245,274,WHITE,18,LIGHT,.8)
    rounded(c,M+265,394,245,274,WHITE,18,LIGHT,.8)
    label(c,"Android kiosk",M+22,636,GREEN)
    wrapped(c,"Strong web option",M+22,604,200,18,22,INK,"AxonBold")
    android=[
        "Chrome for Android supports Web NFC.",
        "NDEF-compatible cards only.",
        "Requires HTTPS and permission.",
        "Page visible; device unlocked.",
        "Test exact phone, OS and card.",
    ]
    yy=558
    for s in android:
        icon_circle(c,M+28,yy+3,"OK",GREEN,8)
        wrapped(c,s,M+44,yy+7,178,8.4,11,MID)
        yy-=39
    label(c,"iPhone kiosk",M+287,636,ORANGE)
    wrapped(c,"Native path recommended",M+287,604,200,18,22,INK,"AxonBold")
    iphone=[
        "iPhones contain NFC hardware.",
        "Do not assume Safari Web NFC.",
        "Use a native Core NFC app.",
        "Or use a dedicated NFC reader.",
        "Verify entitlement and card protocol.",
    ]
    yy=558
    for s in iphone:
        icon_circle(c,M+293,yy+3,"!",ORANGE,8)
        wrapped(c,s,M+309,yy+7,178,8.4,11,MID)
        yy-=39
    rounded(c,M,230,W-2*M,120,LILAC,18)
    label(c,"July recommendation",M+22,318,PURPLE)
    wrapped(c,"Use a fixed, tested device fleet.",M+22,286,W-2*M-44,17,21,INK,"AxonBold")
    wrapped(c,"If the repository is browser-based Web NFC, prefer managed Android phones running Chrome. Keep QR as the universal fallback.",M+22,252,W-2*M-44,9.5,13,MID)
    rounded(c,M,121,W-2*M,72,CREAM,14)
    wrapped(c,"Needs verification: kiosk framework, iOS support, NFC protocol, NDEF compatibility, card write protection and use of card serial numbers.",M+18,164,W-2*M-36,9,13,INK,"AxonBold")
    footer_source(c,"Primary references: Chrome Web NFC documentation; Apple Core NFC documentation; MDN NDEFReader compatibility guidance. URLs are listed on the final page.")
    c.showPage()


def offline(c):
    page_base(c, 8, "07 / Resilience and offline mode")
    title(c, "Offline mode is a controlled exception, not magic.")
    wrapped(c, "A local cache can keep one station moving. It cannot perfectly coordinate multiple disconnected entrances by itself.", M, H-140, W-2*M, 11, 16, MID)
    # online/offline split
    rounded(c,M,408,245,254,MINT,18)
    label(c,"Online - preferred",M+22,630,GREEN)
    wrapped(c,"Server decides immediately.",M+22,598,200,16,20,INK,"AxonBold")
    online=["Read card","Call Axon","Apply current rules","Write final result","Return success"]
    yy=550
    for i,s in enumerate(online,1):
        icon_circle(c,M+29,yy+3,str(i),GREEN,10)
        text(c,s,M+47,yy,9,INK,"AxonBold")
        yy-=34
    rounded(c,M+265,408,245,254,CREAM,18)
    label(c,"Offline - provisional",M+287,630,ORANGE)
    wrapped(c,"Kiosk records intent locally.",M+287,598,200,16,20,INK,"AxonBold")
    off=["Read card","Check encrypted cache","Prevent same-device repeat","Queue signed event","Sync and reconcile"]
    yy=552
    for i,s in enumerate(off,1):
        icon_circle(c,M+294,yy+3,str(i),ORANGE,10)
        text(c,s,M+312,yy,9,INK,"AxonBold")
        yy-=39
    rounded(c,M,266,W-2*M,96,INK,16)
    label(c,"Hard truth",M+20,330,ORANGE)
    wrapped(c,"Two disconnected kiosks can both accept the same card.",M+20,298,W-2*M-40,16,20,WHITE,"AxonBold")
    wrapped(c,"For July, designate one offline entrance or provide a local venue network.",M+20,277,W-2*M-40,8.5,11,HexColor("#CBD2E5"))
    label(c,"Freebies need stricter fallback",M,224)
    cards=[
        ("One station","Only one offline station per freebie type."),
        ("Visible tally","Staff tracks physical stock and provisional claims."),
        ("Supervisor","Offline exceptions require named approval."),
    ]
    for i,(h,b) in enumerate(cards):
        card(c,M+i*170,112,155,88,h,b,[PURPLE,ORANGE,GREEN][i])
    c.showPage()


def security(c):
    page_base(c, 9, "08 / Security by design")
    title(c, "The card points to identity. It should not carry identity.")
    wrapped(c, "Treat the NFC card like a claim ticket: useful only when Axon validates it.", M, H-140, W-2*M, 11, 16, MID)
    rounded(c,M,440,245,224,LILAC,18)
    label(c,"Safe on the card",M+22,630,PURPLE)
    wrapped(c,"Opaque random token",M+22,592,200,18,22,INK,"AxonBold")
    wrapped(c,"or a signed Axon card token",M+22,565,200,10,14,MID)
    line(c,M+22,536,M+223,536,HexColor("#D8CCF5"),1)
    wrapped(c,"No name. No email. No payment state. No entitlement list.",M+22,510,200,10,15,INK,"AxonBold")
    rounded(c,M+265,440,245,224,HexColor("#FDECEC"),18)
    label(c,"Never on the card",M+287,630,RED)
    bad=["Personal details","Payment information","QR signing secret","Staff credentials","Full attendee record"]
    yy=590
    for s in bad:
        icon_circle(c,M+294,yy+3,"×",RED,9)
        text(c,s,M+312,yy,9.5,INK,"AxonBold")
        yy-=34
    label(c,"Kiosk least privilege",M,398)
    wrapped(c,"A kiosk account should only check in or redeem.",M,368,W-2*M,15,19,INK,"AxonBold")
    controls=[
        ("Station identity","Every device is registered."),
        ("Short-lived access","Credentials expire quickly."),
        ("Event scope","Only the assigned event."),
        ("Action scope","Check-in or freebie only."),
        ("Remote revoke","Disable a lost device."),
        ("Encrypted cache","Protect offline attendee data."),
    ]
    for i,(h,b) in enumerate(controls):
        x=M+(i%3)*170; yy=282-(i//3)*94
        rounded(c,x,yy,155,76,WHITE,12,LIGHT,.8)
        text(c,h,x+12,yy+49,9,INK,"AxonBold")
        wrapped(c,b,x+12,yy+30,131,7.8,10.5,MID)
    c.showPage()


def data_api(c):
    page_base(c, 10, "09 / Technical contract")
    title(c, "Small APIs. Strong guarantees.")
    wrapped(c, "The public experience stays simple because the server contract handles identity, concurrency, audit and retries.", M, H-140, W-2*M, 11, 16, MID)
    rounded(c,M,462,W-2*M,196,INK,18)
    label(c,"NFC check-in request",M+22,628,ORANGE)
    code = [
        'POST /event-operations/check-ins/nfc',
        '{',
        '  "eventId": "evt_...",',
        '  "cardToken": "opaque-token",',
        '  "stationId": "entrance-a-01",',
        '  "operationId": "unique-id",',
        '  "capturedAt": "ISO-8601"',
        '}',
    ]
    yy=598
    for ln in code:
        text(c,ln,M+22,yy,8.6,WHITE if yy<598 else HexColor("#BDA9FF"),"AxonMono")
        yy-=18
    rounded(c,M,286,245,132,WHITE,16,LIGHT,.8)
    label(c,"Idempotency",M+18,388,PURPLE)
    wrapped(c,"Retrying the same operation returns the same result.",M+18,358,207,13,17,INK,"AxonBold")
    wrapped(c,"It must not create another check-in or claim.",M+18,316,207,8.5,12,MID)
    rounded(c,M+265,286,245,132,WHITE,16,LIGHT,.8)
    label(c,"Audit",M+283,388,GREEN)
    wrapped(c,"Every tap produces a traceable outcome.",M+283,358,207,13,17,INK,"AxonBold")
    wrapped(c,"Station, staff, time, mode, decision and override reason.",M+283,316,207,8.5,12,MID)
    label(c,"Minimum new records",M,246)
    records=[
        ("nfc_cards","Card token and lifecycle"),
        ("attendee_card_assignments","Card-to-person link"),
        ("check_in_events","Immutable attempts/results"),
        ("event_stations","Kiosk identity and scope"),
        ("attendee_entitlements","Who can claim what"),
        ("freebie_redemptions","Collection ledger"),
    ]
    for i,(h,b) in enumerate(records):
        x=M+(i%2)*255; yy=208-(i//2)*42
        text(c,h,x,yy,8.6,PURPLE,"AxonMono")
        text(c,b,x+145,yy,7.8,MID,"AxonSans")
    c.showPage()


def operations(c):
    page_base(c, 11, "10 / Event-day playbook")
    title(c, "Design for the queue, not the demo.")
    wrapped(c, "A production-ready kiosk is equal parts software, hardware, staffing and fallback discipline.", M, H-140, W-2*M, 11, 16, MID)
    phases=[
        ("Before doors open",[
            "Sync confirmed attendees and card links",
            "Test every kiosk with production cards",
            "Confirm QR and staff-search fallback",
            "Verify hotspots, chargers and spare devices",
        ],PURPLE),
        ("During the event",[
            "Watch queue length and error rate",
            "Move unresolved cards to a support lane",
            "Never share administrator credentials",
            "Log every manual override",
        ],ORANGE),
        ("After the event",[
            "Synchronize provisional operations",
            "Reconcile attendance and physical stock",
            "Review duplicates and overrides",
            "Export the final Axon operational record",
        ],GREEN),
    ]
    for i,(h,items,col) in enumerate(phases):
        x=M+i*170
        rounded(c,x,355,155,300,WHITE,18,LIGHT,.8)
        c.setFillColor(col); c.roundRect(x,625,155,30,12,fill=1,stroke=0)
        text(c,h,x+14,635,9,WHITE,"AxonBold")
        yy=585
        for n,s in enumerate(items,1):
            icon_circle(c,x+19,yy+4,str(n),col,9)
            wrapped(c,s,x+36,yy+9,103,8.2,11,INK,"AxonBold")
            yy-=57
    rounded(c,M,198,W-2*M,110,INK,18)
    label(c,"Incident command",M+22,276,ORANGE)
    wrapped(c,"One person owns the operational decision.",M+22,246,W-2*M-44,17,21,WHITE,"AxonBold")
    wrapped(c,"Axon handles admission and freebies. Davi supports repository/card-format questions. Staff escalate through one named event lead.",M+22,216,W-2*M-44,8.8,12,HexColor("#CBD2E5"))
    pill(c,"NFC",M,145)
    pill(c,"QR fallback",M+58,145,bg=SKY,fg=PURPLE)
    pill(c,"Manual search",M+160,145,bg=CREAM,fg=ORANGE)
    pill(c,"Offline exception",M+274,145,bg=HexColor("#FDECEC"),fg=RED)
    pill(c,"Reconcile",M+407,145,bg=MINT,fg=GREEN)
    c.showPage()


def roadmap(c):
    page_base(c, 12, "11 / July decision")
    title(c, "GO WITH CONDITIONS")
    wrapped(c, "The revised design is safer, but the NFC implementation must be proven on the exact repository, cards and kiosk devices.", M, H-140, W-2*M, 11, 16, MID)
    rounded(c,M,500,W-2*M,160,MINT,20)
    label(c,"Minimum safe July scope",M+22,630,GREEN)
    required=[
        "Review the contributed kiosk repository",
        "Confirm card protocol and NDEF compatibility",
        "Direct kiosk-to-Axon integration",
        "Atomic, idempotent check-in",
        "QR and manual fallback",
        "One controlled freebie pilot",
        "Device-specific rehearsal",
        "Named offline procedure",
    ]
    for i,s in enumerate(required):
        x=M+22+(i%2)*250; yy=596-(i//2)*30
        icon_circle(c,x+7,yy+3,"OK",GREEN,7)
        text(c,s,x+20,yy,8.4,INK,"AxonBold")
    rounded(c,M,310,245,144,CREAM,18)
    label(c,"Defer",M+20,422,ORANGE)
    defer=["Replacing QR entirely","Mixed untested device fleet","Multi-station offline freebies","Virtual cards on attendee phones"]
    yy=389
    for s in defer:
        text(c,"—",M+20,yy,9,ORANGE,"AxonBold")
        text(c,s,M+36,yy,8.4,INK,"AxonBold"); yy-=27
    rounded(c,M+265,310,245,144,LILAC,18)
    label(c,"Repository questions",M+285,422,PURPLE)
    qs=["Web, Android, iOS or cross-platform?","Which NFC protocols are read?","Does it use UID or NDEF payload?","How does offline storage work?"]
    yy=389
    for s in qs:
        text(c,"?",M+285,yy,9,PURPLE,"AxonBold")
        text(c,s,M+301,yy,8.4,INK,"AxonBold"); yy-=27
    rounded(c,M,156,W-2*M,110,INK,18)
    label(c,"Decision rule",M+22,234,ORANGE)
    wrapped(c,"If NFC fails, the event must still run.",M+22,202,W-2*M-44,19,23,WHITE,"AxonBold")
    wrapped(c,"That is why NFC enhances Axon check-in; it does not replace the proven QR and staff-assisted paths for July.",M+22,172,W-2*M-44,8.8,12,HexColor("#CBD2E5"))
    c.showPage()


def close(c):
    page_base(c, 13, dark=True)
    c.drawImage(ImageReader(str(LOGO)), M, H-82, width=135, height=27, mask="auto")
    label(c,"Final recommendation",M,H-130,ORANGE)
    wrapped(c,"Keep the moment simple.",M,H-182,W-2*M,32,35,WHITE,"AxonBold")
    wrapped(c,"Tap the card. Let Axon decide. Keep QR ready.",M,H-255,450,19,25,HexColor("#D5DBEC"),"AxonSans")
    rounded(c,M,348,W-2*M,154,Color(1,1,1,.08),18,Color(1,1,1,.15),.8)
    wrapped(c,"Davi provides the NFC kiosk foundation.",M+22,466,W-2*M-44,13,17,HexColor("#BDA9FF"),"AxonBold")
    wrapped(c,"Axon owns identity resolution, eligibility, check-in, freebie collection, offline recovery, audit and reporting.",M+22,425,W-2*M-44,17,22,WHITE,"AxonBold")
    wrapped(c,"That boundary minimizes event-day failure, protects attendee data and keeps accountability clear.",M+22,374,W-2*M-44,9.5,14,HexColor("#CBD2E5"))
    label(c,"Primary references",M,284,ORANGE)
    refs=[
        "Chrome Web NFC: https://developer.chrome.com/docs/capabilities/nfc",
        "Apple Core NFC: https://developer.apple.com/documentation/corenfc",
        "MDN NDEFReader: https://developer.mozilla.org/en-US/docs/Web/API/NDEFReader",
        "Axon evidence: NestJS services, Prisma schema, QR utilities and admin check-in UI reviewed 20 June 2026.",
    ]
    yy=254
    for r in refs:
        wrapped(c,r,M,yy,W-2*M,7.4,10,HexColor("#AEB6D2"),"AxonMono")
        yy-=28
    text(c,"AXON TICKETS  /  NFC EVENT OPERATIONS BRIEF",M,54,8,HexColor("#8C96B2"),"AxonBold")
    c.showPage()


def build():
    register_fonts()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=A4, pageCompression=1)
    c.setTitle("Axon NFC Check-In and Freebies Architecture Brief")
    c.setAuthor("Axon Tickets")
    c.setSubject("NFC kiosk ownership, check-in, freebie collection, offline readiness and July validation")
    for page in [cover, executive, journey, architecture, checkin, freebies, nfc_reality, offline, security, data_api, operations, roadmap, close]:
        page(c)
    c.save()
    print(OUT)


if __name__ == "__main__":
    build()
