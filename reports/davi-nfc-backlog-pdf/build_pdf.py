from pathlib import Path
import importlib.util
import math
from datetime import date

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[2]
BACKLOG_SOURCE = ROOT / "reports/backlog-docs/build_backlogs.py"
OUT = ROOT / "output/pdf/Axon_DAVI_NFC_Integration_Product_Backlog.pdf"

W, H = letter
M = 42

INK = HexColor("#16213A")
NAVY = HexColor("#10192F")
PURPLE = HexColor("#6328CE")
VIOLET = HexColor("#8B4DFF")
ORANGE = HexColor("#F46922")
GREEN = HexColor("#15916C")
RED = HexColor("#D94747")
AMBER = HexColor("#B66A00")
BLUE = HexColor("#2369B3")
MID = HexColor("#64708A")
LIGHT = HexColor("#DDE4EF")
PAPER = HexColor("#FCFAF6")
WHITE = HexColor("#FFFFFF")
LILAC = HexColor("#F2ECFF")
MINT = HexColor("#E8F7F1")
CREAM = HexColor("#FFF4E6")
SKY = HexColor("#EAF4FF")
ROSE = HexColor("#FDECEC")
SOFT = HexColor("#F6F7FB")


EPIC_COLORS = [PURPLE, VIOLET, ORANGE, GREEN, BLUE, AMBER, RED, NAVY]

CURRENT_AXON_WORKING = [
    "Event creation, public registration pages, and ticket selection already exist in Axon.",
    "Manual payment proof upload and verification workflows already exist for paid registrations.",
    "QR ticketing, attendee lookup, and live QR/manual check-in already exist in current operations.",
    "Attendance analytics, exports, and administrative reporting already exist as the operating baseline.",
]

CURRENT_AXON_GAPS = [
    "No NFC card registry, assignment history, replacement lifecycle, or card-to-attendee mapping exists yet.",
    "No kiosk/station credential model exists yet for event-scoped NFC devices.",
    "Current attendance records need a stronger immutable event ledger for NFC, retries, and overrides.",
    "No controlled offline NFC queue or freebie entitlement/collection workflow exists yet.",
]

ORGANIZER_FLOW = [
    ("Create the event", "Current Axon state", "Organizers already create events, tiers, and registration flows in Axon.", PURPLE),
    ("Collect registrations", "Current Axon state", "Attendees already register, pay, upload proof if needed, and receive Axon ticket records.", BLUE),
    ("Prepare event operations", "New NFC impact", "Organizers will add approved devices, stations, card assignment, freebie rules, and fallback owners.", ORANGE),
    ("Run entrance and freebies", "New NFC impact", "Attendees tap NFC cards, but Axon remains the authority for entry, stock release, duplicates, and exceptions.", GREEN),
    ("Monitor and support", "New NFC impact", "Leads watch station health, switch to QR/manual if needed, and resolve card or connectivity exceptions.", RED),
    ("Close and reconcile", "New NFC impact", "Axon reconciles attendance, freebies, offline queues, overrides, and post-event learnings.", AMBER),
]

IMPACTS = [
    ("Faster front-door flow", "Entrance teams can move from scan-or-search to tap-and-decide while keeping QR/manual fallback.", PURPLE),
    ("Stronger operational control", "Freebies, overrides, and duplicate prevention become governed inside Axon instead of manual side processes.", GREEN),
    ("Better stakeholder visibility", "Attendance and redemption become easier to explain in operations reviews, reconciliations, and future dashboards.", BLUE),
    ("Higher platform value", "Axon moves closer to an event operating system, not only a registration and ticketing system.", ORANGE),
]


def load_backlog():
    spec = importlib.util.spec_from_file_location("axon_backlogs", BACKLOG_SOURCE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.DAVI_EPICS


def clean(value):
    if value is None:
        return ""
    return (
        str(value)
        .replace("Davi", "DAVI")
        .replace("DAVI/Dotside", "DAVI/Dotside")
        .replace("’", "'")
        .replace("“", '"')
        .replace("”", '"')
        .replace("·", "-")
        .replace("—", "-")
        .replace("–", "-")
        .replace("×", "x")
    )


def register_fonts():
    candidates = [
        ("/System/Library/Fonts/SFNS.ttf", "AxonSans"),
        ("/System/Library/Fonts/SFNSRounded.ttf", "AxonRound"),
        ("/System/Library/Fonts/SFNSMono.ttf", "AxonMono"),
        ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", "AxonBold"),
    ]
    for path, name in candidates:
        if Path(path).exists():
            try:
                pdfmetrics.registerFont(TTFont(name, path))
            except Exception:
                pass
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


def text(c, s, x, y, size=10, color=INK, font="AxonSans"):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawString(x, y, clean(s))


def center_text(c, s, x, y, size=10, color=INK, font="AxonSans"):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawCentredString(x, y, clean(s))


def right_text(c, s, x, y, size=10, color=INK, font="AxonSans"):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawRightString(x, y, clean(s))


def wrap_lines(s, width, size=10, font="AxonSans"):
    s = clean(s)
    if not s:
        return []
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
    return lines


def wrapped(c, s, x, y, width, size=10, leading=None, color=INK, font="AxonSans", max_lines=None):
    leading = leading or size * 1.35
    lines = wrap_lines(s, width, size, font)
    if max_lines is not None:
        lines = lines[:max_lines]
    c.setFillColor(color)
    c.setFont(font, size)
    yy = y
    for line in lines:
        c.drawString(x, yy, line)
        yy -= leading
    return yy


def pill(c, s, x, y, bg=LILAC, fg=PURPLE, size=7.2, pad=8):
    s = clean(s).upper()
    w = stringWidth(s, "AxonBold", size) + pad * 2
    rounded(c, x, y - 4, w, 18, bg, 9)
    text(c, s, x + pad, y + 1.5, size, fg, "AxonBold")
    return w


def brand(c, x, y, dark=False):
    icon_fill = ORANGE if dark else PURPLE
    rounded(c, x, y, 32, 32, icon_fill, 8)
    c.setStrokeColor(WHITE)
    c.setLineWidth(2)
    c.line(x + 8, y + 7, x + 16, y + 25)
    c.line(x + 16, y + 25, x + 25, y + 7)
    c.line(x + 11, y + 14, x + 22, y + 14)
    text(c, "AXON", x + 42, y + 18, 13, WHITE if dark else INK, "AxonBold")
    text(c, "T I C K E T S", x + 42, y + 5, 5.8, HexColor("#C8B8FF") if dark else MID, "AxonBold")


def page_base(c, page_num, section=None, dark=False):
    c.setFillColor(NAVY if dark else PAPER)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    if dark:
        c.setFillColor(PURPLE)
        c.circle(W + 10, H - 40, 190, fill=1, stroke=0)
        c.setFillColor(ORANGE)
        c.circle(W - 54, H - 70, 54, fill=1, stroke=0)
        c.setFillColor(Color(1, 1, 1, 0.06))
        for i in range(11):
            c.circle(75 + i * 26, 126 + (i % 2) * 19, 5.5, fill=1, stroke=0)
    else:
        c.setFillColor(PURPLE)
        c.rect(0, H - 7, W, 7, fill=1, stroke=0)
        if section:
            pill(c, section, M, H - 32, bg=LILAC, fg=PURPLE, size=6.8)
    right_text(c, f"{page_num:02d}", W - M, 24, 8, WHITE if dark else MID, "AxonMono")
    text(c, "Axon x DAVI NFC Product Backlog", M, 24, 7.5, HexColor("#ADB5C8") if dark else MID, "AxonMono")


def section_title(c, title, subtitle=None, y=H - 78):
    yy = wrapped(c, title, M, y, W - 2 * M, 24, 26, INK, "AxonBold")
    if subtitle:
        wrapped(c, subtitle, M, yy - 8, W - 2 * M, 10.5, 15, MID, "AxonSans")


def metric_card(c, x, y, w, h, value, label, color=PURPLE):
    rounded(c, x, y, w, h, WHITE, 16, LIGHT, 0.8)
    text(c, str(value), x + 16, y + h - 34, 24, color, "AxonBold")
    wrapped(c, label, x + 16, y + h - 52, w - 32, 8.2, 10.5, MID, "AxonSans", 2)


def small_card(c, x, y, w, h, heading, body, color=PURPLE, fill=WHITE):
    rounded(c, x, y, w, h, fill, 14, LIGHT, 0.8)
    c.setFillColor(color)
    c.roundRect(x, y + h - 7, w, 7, 4, fill=1, stroke=0)
    text(c, heading, x + 14, y + h - 31, 10.2, INK, "AxonBold")
    wrapped(c, body, x + 14, y + h - 50, w - 28, 8.2, 11.2, MID, "AxonSans")


def list_block(c, x, y, w, heading, items, accent=PURPLE, fill=WHITE):
    h = 50
    item_heights = []
    for item in items:
        lines = max(1, min(3, len(wrap_lines(item, w - 46, 8.1, "AxonSans"))))
        block_h = lines * 11 + 7
        item_heights.append(block_h)
        h += block_h
    rounded(c, x, y - h, w, h, fill, 16, LIGHT, 0.8)
    text(c, heading, x + 16, y - 24, 10.2, accent, "AxonBold")
    yy = y - 46
    for item, block_h in zip(items, item_heights):
        rounded(c, x + 16, yy - 3, 6, 6, accent, 3)
        wrapped(c, item, x + 30, yy, w - 46, 8.1, 10.8, MID, "AxonSans", 3)
        yy -= block_h
    return h


def status_color(status):
    return {"ready": GREEN, "blocked": RED, "verified": GREEN, "partial": AMBER, "gap": RED}.get(clean(status).lower(), BLUE)


def status_fill(status):
    return {"ready": MINT, "blocked": ROSE, "verified": MINT, "partial": CREAM, "gap": ROSE}.get(clean(status).lower(), SKY)


def all_stories(epics):
    return [s for epic in epics for s in epic["stories"]]


def points_by(items, key):
    data = {}
    for item in items:
        k = clean(item.get(key, "Unknown"))
        data[k] = data.get(k, 0) + int(item.get("points", 0))
    return data


def count_by(items, key):
    data = {}
    for item in items:
        k = clean(item.get(key, "Unknown"))
        data[k] = data.get(k, 0) + 1
    return data


def cover(c):
    page_base(c, 1, dark=True)
    brand(c, M, H - 90, dark=True)
    pill(c, "Product backlog package", M, H - 142, bg=Color(1, 1, 1, 0.13), fg=WHITE, size=7.5)
    wrapped(c, "DAVI/NFC Integration Product Backlog", M, H - 208, W - 2 * M, 34, 37, WHITE, "AxonBold")
    wrapped(
        c,
        "A Core-Team-friendly delivery plan for NFC card assignment, Axon-owned check-in, freebie collection, kiosk operations, security, offline recovery, and event-day readiness.",
        M,
        H - 306,
        438,
        13.5,
        19,
        HexColor("#DDE3F4"),
        "AxonSans",
    )
    rounded(c, M, 112, W - 2 * M, 116, Color(1, 1, 1, 0.08), 20, Color(1, 1, 1, 0.18), 0.8)
    text(c, "CORE ARCHITECTURE DECISION", M + 22, 197, 7.8, ORANGE, "AxonBold")
    yy = wrapped(c, "DAVI provides the NFC kiosk foundation. Axon owns the live operational truth.", M + 22, 174, W - 2 * M - 44, 16.5, 20, WHITE, "AxonBold")
    wrapped(c, "Check-in and freebies must continue through Axon even if DAVI is unavailable during the event.", M + 22, yy - 8, W - 2 * M - 44, 9.8, 13.5, HexColor("#DDE3F4"))
    text(c, "Prepared for product, engineering, operations, and Core Team alignment", M, 66, 8.4, HexColor("#AEB8D2"), "AxonMono")
    right_text(c, "Version 1.0 - 24 June 2026", W - M, 66, 8.4, ORANGE, "AxonBold")
    c.showPage()


def executive_summary(c, epics, page):
    stories = all_stories(epics)
    page_base(c, page, "Executive summary")
    section_title(
        c,
        "Axon is adding an NFC operating layer, not replacing its core platform.",
        "Axon keeps ownership of admission, freebies, and fallback while NFC improves the event-day experience.",
    )
    y = 562
    metric_card(c, M, y, 118, 86, len(epics), "delivery epics", PURPLE)
    metric_card(c, M + 132, y, 118, 86, len(stories), "product stories", ORANGE)
    metric_card(c, M + 264, y, 118, 86, sum(s["points"] for s in stories), "planning points", GREEN)
    metric_card(c, M + 396, y, 118, 86, count_by(stories, "status").get("blocked", 0), "blocked until discovery evidence arrives", RED)
    y = 412
    small_card(c, M, y, 164, 108, "For nontechnical teams", "The card is only the key. Axon still checks if the attendee is allowed, whether the item was already claimed, and what to do if the scan fails.", PURPLE, WHITE)
    small_card(c, M + 182, y, 164, 108, "For engineering", "Build event-scoped APIs, immutable ledgers, idempotent retries, atomic duplicate prevention, kiosk credentials, and minimum offline cache.", ORANGE, WHITE)
    small_card(c, M + 364, y, 164, 108, "For operations", "Approve devices, train staff, rehearse exceptions, prepare QR fallback, assign owners, monitor stations, and reconcile after the event.", GREEN, WHITE)
    rounded(c, M, 160, W - 2 * M, 178, INK, 18)
    text(c, "THIS BACKLOG IS ALIGNED TO THE READINESS CENTER MODEL", M + 22, 300, 7.8, ORANGE, "AxonBold")
    yy = wrapped(c, "Every event-day capability must have an owner, a release gate, a rehearsal path, a visible blocker state, and stakeholder-safe reporting.", M + 22, 268, W - 2 * M - 44, 18, 22, WHITE, "AxonBold")
    wrapped(c, "This mirrors the Core Team package: event-centric ownership, RACI-style accountability, readiness scoring, stakeholder visibility, and closure/reconciliation after the event.", M + 22, yy - 8, W - 2 * M - 44, 9.5, 14, HexColor("#D8DEF0"))
    c.showPage()
    return page + 1


def current_state_page(c, page):
    page_base(c, page, "Current Axon state")
    section_title(
        c,
        "What Axon already does today, and what NFC changes.",
        "This anchors the NFC plan to Axon's real operating baseline.",
    )
    list_block(c, M, 546, 248, "Working now in Axon", CURRENT_AXON_WORKING, accent=GREEN, fill=MINT)
    list_block(c, M + 280, 546, 248, "Required before NFC launch", CURRENT_AXON_GAPS, accent=RED, fill=ROSE)
    rounded(c, M, 136, W - 2 * M, 142, INK, 18)
    text(c, "PLATFORM IMPACT", M + 20, 240, 7.8, ORANGE, "AxonBold")
    yy = wrapped(c, "The NFC project extends Axon's existing registration, verification, QR, and attendance foundation into event-day operations.", M + 20, 210, W - 2 * M - 40, 15.5, 19, WHITE, "AxonBold")
    wrapped(c, "In practical terms, Axon moves from being the place where attendees register and get validated to also being the place where card identity, entrance control, freebies, and reconciliation are governed.", M + 20, yy - 10, W - 2 * M - 40, 9.3, 13.2, HexColor("#D8DEF0"))
    c.showPage()
    return page + 1


def organizer_workflow_page(c, page):
    page_base(c, page, "Organizer workflow")
    section_title(
        c,
        "How the organizer workflow changes with DAVI/NFC.",
        "This page shows exactly where the NFC layer changes real event operations for organizers.",
    )
    y = 586
    for idx, (title, label, body, color) in enumerate(ORGANIZER_FLOW, 1):
        box_y = y - (idx - 1) * 82
        rounded(c, M, box_y, W - 2 * M, 62, WHITE, 16, LIGHT, 0.8)
        rounded(c, M + 14, box_y + 16, 28, 28, color, 14)
        center_text(c, str(idx), M + 28, box_y + 25, 9.5, WHITE, "AxonBold")
        text(c, title, M + 56, box_y + 40, 10.5, INK, "AxonBold")
        pill(c, label, M + 270, box_y + 38, bg=SOFT if "Current" in label else CREAM, fg=BLUE if "Current" in label else ORANGE, size=6.2, pad=6)
        wrapped(c, body, M + 56, box_y + 22, W - 2 * M - 74, 8.2, 10.8, MID, "AxonSans", 2)
    c.showPage()
    return page + 1


def impact_page(c, page):
    page_base(c, page, "Business and operations impact")
    section_title(
        c,
        "What impact this brings to Axon Tickets.",
        "The gain is not only speed at the kiosk. It is stronger event-day control inside the existing Axon platform.",
    )
    y = 552
    for i, (title, body, color) in enumerate(IMPACTS):
        x = M + (i % 2) * 270
        yy = y - (i // 2) * 128
        small_card(c, x, yy, 248, 104, title, body, color)
    rounded(c, M, 132, W - 2 * M, 98, SKY, 18, HexColor("#BFD7F3"), 0.8)
    text(c, "IMPORTANT OPERATING TRADEOFF", M + 20, 194, 7.8, BLUE, "AxonBold")
    wrapped(c, "NFC can make the event feel smoother, but only after device certification, repository validation, staff training, and fallback rehearsal. The platform benefit comes from controlled rollout, not from skipping proof.", M + 20, 166, W - 2 * M - 40, 10, 14, INK, "AxonSans")
    c.showPage()
    return page + 1


def core_team_alignment(c, page):
    page_base(c, page, "Core Team alignment")
    section_title(
        c,
        "How this fits the Event Workspace and Readiness Center.",
        "The NFC iteration becomes an event-readiness workstream with named owners, clear status, and rehearsed fallback.",
    )
    roles = [
        ("Event Owner", "Approves go/no-go, scope box, fallback policy, and stakeholder updates.", PURPLE),
        ("Event Manager", "Coordinates readiness tasks, staffing, training, and rehearsal completion.", VIOLET),
        ("Registration Lead", "Owns attendee eligibility, QR fallback, card assignment support, and check-in rules.", ORANGE),
        ("Freebie Lead", "Owns entitlement rules, stock control, handover confirmation, and reconciliation.", GREEN),
        ("Kiosk Tech Lead", "Owns DAVI repository adaptation, approved devices, station setup, and diagnostics.", BLUE),
        ("Security Owner", "Owns kiosk credentials, local data protection, revocation, auditability, and privacy.", RED),
    ]
    y = 532
    for i, (role, body, color) in enumerate(roles):
        x = M + (i % 2) * 270
        yy = y - (i // 2) * 116
        small_card(c, x, yy, 248, 92, role, body, color)
    rounded(c, M, 102, W - 2 * M, 128, CREAM, 18, HexColor("#F0D3A8"), 0.8)
    text(c, "CORE TEAM DECISION TO MAKE EARLY", M + 20, 184, 7.8, AMBER, "AxonBold")
    yy = wrapped(c, "Confirm who has authority to switch from NFC to QR/manual baseline on event day.", M + 20, 160, W - 2 * M - 40, 14, 17.5, INK, "AxonBold")
    wrapped(c, "This avoids hallway decision-making when queues are forming. The incident commander should be named before rehearsal.", M + 20, yy - 8, W - 2 * M - 40, 9.3, 13, MID)
    c.showPage()
    return page + 1


def architecture_flow(c, page):
    page_base(c, page, "Operating model")
    section_title(c, "The tap journey: simple for staff, strict behind the scenes.")
    steps = [
        ("1", "NFC card", "Presents a safe identifier. It should not store attendee personal data.", PURPLE),
        ("2", "Kiosk", "Reads the identifier and sends event, station, and operation context to Axon.", VIOLET),
        ("3", "Axon API", "Authenticates the station, applies eligibility rules, and prevents duplicates.", ORANGE),
        ("4", "Ledger", "Stores accepted, duplicate, rejected, offline, and override events for audit.", GREEN),
        ("5", "Dashboard", "Shows station health, queue issues, attendance, freebies, and exceptions.", BLUE),
    ]
    y = 510
    for i, (num, title, body, color) in enumerate(steps):
        x = M + i * 104
        rounded(c, x, y, 92, 132, WHITE, 18, LIGHT, 0.8)
        rounded(c, x + 29, y + 91, 34, 34, color, 17)
        center_text(c, num, x + 46, y + 101, 13, WHITE, "AxonBold")
        center_text(c, title, x + 46, y + 70, 9.5, INK, "AxonBold")
        wrapped(c, body, x + 10, y + 51, 72, 6.8, 9.1, MID, "AxonSans")
        if i < len(steps) - 1:
            c.setStrokeColor(LIGHT)
            c.setLineWidth(2)
            c.line(x + 94, y + 67, x + 103, y + 67)
    y = 300
    small_card(c, M, y, 248, 122, "What DAVI should not do in the live path", "DAVI should not approve check-in, decide freebie eligibility, store the event attendance truth, or become the dependency that blocks the queue.", RED, ROSE)
    small_card(c, M + 280, y, 248, 122, "What Axon must own", "Card assignment, attendee resolution, station authorization, duplicate prevention, audit logs, offline recovery, QR/manual fallback, dashboards, and reconciliation.", GREEN, MINT)
    rounded(c, M, 126, W - 2 * M, 104, SKY, 18, HexColor("#BFD7F3"), 0.8)
    text(c, "PHONE NFC NOTE", M + 20, 194, 7.8, BLUE, "AxonBold")
    wrapped(c, "NFC exists on modern iPhones and Android phones, but implementation differs. Android browser Web NFC support cannot be assumed on iPhone Safari. If iPhones are production kiosks, validate native Core NFC or supported reader behavior before committing.", M + 20, 166, W - 2 * M - 40, 10.5, 15, INK)
    c.showPage()
    return page + 1


def backlog_dashboard(c, epics, page):
    stories = all_stories(epics)
    page_base(c, page, "Delivery backlog")
    section_title(c, "Scope, status, and delivery shape.", "This is the working delivery package after the business context and organizer-workflow review.")
    phase_counts = count_by(stories, "phase")
    status_counts = count_by(stories, "status")
    priority_counts = count_by(stories, "priority")
    y = 592
    metric_card(c, M, y, 118, 78, priority_counts.get("Must", 0), "must-have stories", PURPLE)
    metric_card(c, M + 132, y, 118, 78, phase_counts.get("Discovery", 0), "discovery stories", BLUE)
    metric_card(c, M + 264, y, 118, 78, phase_counts.get("July MVP", 0), "July MVP stories", ORANGE)
    metric_card(c, M + 396, y, 118, 78, phase_counts.get("After July", 0), "post-July stories", GREEN)
    y = 462
    rounded(c, M, y, W - 2 * M, 88, WHITE, 16, LIGHT, 0.8)
    text(c, "STATUS MIX", M + 18, y + 59, 7.8, PURPLE, "AxonBold")
    x = M + 18
    total_w = W - 2 * M - 36
    total = len(stories)
    for status in ["ready", "blocked"]:
        count = status_counts.get(status, 0)
        bw = total_w * count / total
        c.setFillColor(status_color(status))
        c.rect(x, y + 31, bw, 18, fill=1, stroke=0)
        text(c, f"{status.upper()} {count}", x + 6, y + 14, 7.4, status_color(status), "AxonBold")
        x += bw
    y = 185
    text(c, "EPIC SUMMARY", M, y + 226, 7.8, PURPLE, "AxonBold")
    row_h = 25
    headers = ["Epic", "Focus", "Stories", "Points", "Blocked"]
    widths = [64, 272, 58, 58, 58]
    x = M
    for h, w in zip(headers, widths):
        text(c, h, x + 7, y + 198, 7.8, MID, "AxonBold")
        x += w
    c.setStrokeColor(LIGHT)
    c.line(M, y + 190, W - M, y + 190)
    yy = y + 166
    for i, epic in enumerate(epics):
        color = EPIC_COLORS[i % len(EPIC_COLORS)]
        if i % 2 == 0:
            c.setFillColor(WHITE)
            c.rect(M, yy - 6, W - 2 * M, row_h, fill=1, stroke=0)
        x = M
        text(c, epic["id"], x + 7, yy, 8.2, color, "AxonBold")
        x += widths[0]
        text(c, clean(epic["title"])[:52], x + 7, yy, 7.7, INK, "AxonSans")
        x += widths[1]
        text(c, len(epic["stories"]), x + 10, yy, 8.2, INK, "AxonBold")
        x += widths[2]
        text(c, sum(s["points"] for s in epic["stories"]), x + 10, yy, 8.2, INK, "AxonBold")
        x += widths[3]
        text(c, count_by(epic["stories"], "status").get("blocked", 0), x + 12, yy, 8.2, RED, "AxonBold")
        yy -= row_h
    c.showPage()
    return page + 1


def release_gates(c, page):
    page_base(c, page, "Readiness and release gates")
    section_title(c, "Do not launch NFC because it exists. Launch it because it is proven.")
    gates = [
        ("G1", "Repository", "The repository DAVI sent for the NFC kiosk builds and its external dependencies are documented.", "Stop NFC work and escalate."),
        ("G2", "Card/device", "Real cards read reliably on every approved production phone/reader.", "Reduce device scope or QR-only."),
        ("G3", "Data/security", "Card lifecycle, station permissions, and offline dataset are approved.", "No production credential rollout."),
        ("G4", "Correctness", "Atomic check-in and freebie concurrency tests pass.", "No multi-station launch."),
        ("G5", "Operations", "Full rehearsal, fallback, monitoring, and runbook are complete.", "Run QR/manual baseline only."),
    ]
    y = 592
    for i, (gid, title, evidence, fail) in enumerate(gates):
        color = EPIC_COLORS[i]
        rounded(c, M, y, W - 2 * M, 70, WHITE, 14, LIGHT, 0.8)
        rounded(c, M + 14, y + 20, 40, 32, color, 12)
        center_text(c, gid, M + 34, y + 30, 10, WHITE, "AxonBold")
        text(c, title, M + 70, y + 43, 11, INK, "AxonBold")
        wrapped(c, f"Required evidence: {evidence}", M + 70, y + 25, 286, 8.2, 10.6, MID, "AxonSans", 2)
        wrapped(c, f"If failed: {fail}", M + 370, y + 36, 132, 8.2, 10.6, RED, "AxonBold", 2)
        y -= 82
    rounded(c, M, 86, W - 2 * M, 138, INK, 18)
    text(c, "DEFINITION OF DONE FOR JULY STORIES", M + 22, 198, 7.8, ORANGE, "AxonBold")
    done = [
        "Acceptance criteria pass with real event rules.",
        "Plain-language kiosk messages are reviewed by operations.",
        "Authorization, idempotency, retries, and duplicate prevention are tested.",
        "Existing QR/manual flows still work.",
        "Runbook, owners, monitoring, and rollback path are ready.",
    ]
    x = M + 22
    y = 172
    for item in done:
        rounded(c, x, y - 3, 9, 9, ORANGE, 4.5)
        wrapped(c, item, x + 18, y, W - 2 * M - 62, 8.8, 12, WHITE, "AxonSans", 1)
        y -= 17.5
    c.showPage()
    return page + 1


def roadmap(c, epics, page):
    page_base(c, page, "Development sequence")
    section_title(c, "The safest build order.")
    lanes = [
        ("1", "Discovery", "Build the DAVI-sent kiosk repository, identify card protocol, test devices, freeze business rules.", PURPLE),
        ("2", "Foundations", "Card records, station permissions, credentials, immutable ledgers.", VIOLET),
        ("3", "Core flows", "NFC check-in, freebie validation, handover confirmation, fallback.", ORANGE),
        ("4", "Kiosk adaptation", "Replace live DAVI dependencies with Axon endpoints and plain states.", GREEN),
        ("5", "Offline and recovery", "Minimum encrypted cache, provisional queue, idempotent sync.", BLUE),
        ("6", "Rehearsal and release", "Device tests, concurrency tests, runbook, incident command, reconciliation.", RED),
    ]
    y = 594
    for i, (num, title, body, color) in enumerate(lanes):
        x = M + (i % 2) * 270
        yy = y - (i // 2) * 116
        rounded(c, x, yy, 248, 92, WHITE, 16, LIGHT, 0.8)
        rounded(c, x + 16, yy + 52, 28, 28, color, 14)
        center_text(c, num, x + 30, yy + 61, 10, WHITE, "AxonBold")
        text(c, title, x + 56, yy + 70, 10.5, INK, "AxonBold")
        wrapped(c, body, x + 56, yy + 49, 172, 8.2, 11.1, MID, "AxonSans")
    rounded(c, M, 132, W - 2 * M, 120, CREAM, 18, HexColor("#F0D3A8"), 0.8)
    text(c, "GREATEST-VALUE NEXT STORY", M + 20, 210, 7.8, AMBER, "AxonBold")
    wrapped(c, "DAVI-DISC-01 - Receive and build the kiosk repository", M + 20, 182, W - 2 * M - 40, 15, 19, INK, "AxonBold")
    wrapped(c, "DAVI already sent a repository we can use as the starting point for the NFC kiosk. Building and inspecting it first unlocks card behavior, dependency mapping, device decisions, realistic estimates, and safe API design.", M + 20, 150, W - 2 * M - 40, 8.8, 12.3, MID)
    c.showPage()
    return page + 1


def story_height(story):
    w = W - 2 * M
    h = 118
    for ac in story["ac"][:3]:
        h += max(1, min(2, len(wrap_lines(clean(ac), w - 44, 7.3, "AxonSans")))) * 11 + 6
    if story.get("depends"):
        h += max(1, min(2, len(wrap_lines("Depends on: " + ", ".join(clean(d) for d in story["depends"]), w - 28, 7.1, "AxonBold")))) * 10 + 8
    if story.get("notes"):
        h += max(1, min(2, len(wrap_lines("Note: " + clean(story["notes"]), w - 28, 7.1, "AxonSans")))) * 10 + 8
    return max(190, h)


def draw_story(c, story, x, y, w, h, color):
    rounded(c, x, y - h, w, h, WHITE, 14, LIGHT, 0.7)
    c.setFillColor(color)
    c.roundRect(x, y - 7, w, 7, 4, fill=1, stroke=0)
    text(c, story["id"], x + 14, y - 26, 7.4, color, "AxonBold")
    wrapped(c, story["title"], x + 82, y - 24, w - 96, 10.8, 12.2, INK, "AxonBold", 2)
    yy = y - 50
    pill(c, story["priority"], x + 14, yy + 4, bg=LILAC, fg=PURPLE, size=6.2, pad=6)
    pill(c, story["status"], x + 78, yy + 4, bg=status_fill(story["status"]), fg=status_color(story["status"]), size=6.2, pad=6)
    pill(c, f"{story['points']} SP", x + 144, yy + 4, bg=SOFT, fg=MID, size=6.2, pad=6)
    pill(c, story["phase"], x + 196, yy + 4, bg=SKY, fg=BLUE, size=6.2, pad=6)
    yy -= 18
    plain_value = story["value"]
    if story["id"] == "DAVI-DISC-01":
        plain_value = "the team understands the DAVI-sent repository that can be used as the starting point for the NFC kiosk"
    wrapped(c, f"Plain English: {plain_value}.", x + 14, yy, w - 28, 8.6, 11.4, INK, "AxonSans", 2)
    yy -= 33
    user_need = f"As a {story['role']}, I need to {story['want']}."
    if story["id"] == "DAVI-DISC-01":
        user_need = "As a technical lead, I need to receive, build, and inspect the repository DAVI sent for the NFC kiosk."
    wrapped(c, f"User need: {user_need}", x + 14, yy, w - 28, 8.1, 10.8, MID, "AxonSans", 2)
    yy -= 32
    text(c, "Acceptance checks", x + 14, yy, 7.4, color, "AxonBold")
    yy -= 14
    for ac in story["ac"][:3]:
        rounded(c, x + 15, yy - 3, 6, 6, color, 3)
        yy = wrapped(c, clean(ac).replace("GIVEN ", "Given ").replace(" WHEN ", ", when ").replace(" THEN ", ", then "), x + 28, yy, w - 44, 7.3, 9.6, MID, "AxonSans", 2)
        yy -= 4
    if story.get("depends"):
        wrapped(c, "Depends on: " + ", ".join(clean(d) for d in story["depends"]), x + 14, yy, w - 28, 7.1, 9.2, RED if clean(story["status"]).lower() == "blocked" else MID, "AxonBold", 2)
        yy -= 16
    if story.get("notes"):
        note = clean(story["notes"])
        if story["id"] == "DAVI-DISC-01":
            note = "DAVI has already sent a repository that can be used for the NFC kiosk. This first story proves how much of it is reusable, what it depends on, and what Axon must replace or own."
        wrapped(c, "Note: " + note, x + 14, yy, w - 28, 7.1, 9.2, AMBER, "AxonSans", 2)


def epic_pages(c, epics, page):
    for ei, epic in enumerate(epics):
        color = EPIC_COLORS[ei % len(EPIC_COLORS)]
        page_base(c, page, epic["id"])
        section_title(c, f"{epic['id']} - {epic['title']}", epic["value"], y=H - 74)
        y = H - 166
        rounded(c, M, y - 56, W - 2 * M, 58, color, 18)
        text(c, "EPIC OUTCOME", M + 20, y - 22, 7.6, WHITE, "AxonBold")
        wrapped(c, clean(epic["value"]), M + 20, y - 40, W - 2 * M - 40, 9.2, 12.4, WHITE, "AxonSans", 2)
        y -= 80
        for story in epic["stories"]:
            h = story_height(story)
            if y - h < 62:
                c.showPage()
                page += 1
                page_base(c, page, epic["id"])
                section_title(c, f"{epic['id']} continued", "Remaining user stories for this epic.", y=H - 74)
                y = H - 142
            draw_story(c, story, M, y, W - 2 * M, h, color)
            y -= h + 14
        c.showPage()
        page += 1
    return page


def closing(c, page):
    page_base(c, page, "Implementation checklist")
    section_title(c, "Step-by-step development work to make this happen.")
    steps = [
        ("1", "Confirm repository and device evidence", "Build the DAVI kiosk, inspect dependencies, test real cards on approved phones/readers."),
        ("2", "Freeze operational rules", "Approve check-in eligibility, duplicate behavior, freebie rules, replacements, overrides, and fallback authority."),
        ("3", "Build Axon data foundations", "Add card lifecycle, assignment history, station identity, kiosk credentials, immutable check-in and freebie ledgers."),
        ("4", "Create secure Axon APIs", "Expose NFC check-in, freebie validation, handover confirmation, offline sync, revocation, and dashboard endpoints."),
        ("5", "Adapt kiosk UX", "Replace live DAVI transaction dependency, show plain-language states, and support QR/manual fallback."),
        ("6", "Prove readiness", "Run automated tests, concurrency tests, real-device tests, offline drills, staff rehearsal, and post-event reconciliation."),
    ]
    y = 596
    for i, (num, title, body) in enumerate(steps):
        color = EPIC_COLORS[i % len(EPIC_COLORS)]
        rounded(c, M, y, W - 2 * M, 66, WHITE, 14, LIGHT, 0.8)
        rounded(c, M + 14, y + 18, 30, 30, color, 15)
        center_text(c, num, M + 29, y + 27, 10, WHITE, "AxonBold")
        text(c, title, M + 58, y + 42, 10.5, INK, "AxonBold")
        wrapped(c, body, M + 58, y + 24, W - 2 * M - 80, 8.3, 11.4, MID, "AxonSans", 2)
        y -= 78
    rounded(c, M, 82, W - 2 * M, 82, INK, 18)
    text(c, "FINAL PRODUCT RULE", M + 20, 130, 7.8, ORANGE, "AxonBold")
    wrapped(c, "If the Core Team cannot prove the repository, cards, devices, duplicate prevention, and fallback in rehearsal, the correct event-day decision is QR/manual baseline - not an unproven NFC launch.", M + 20, 104, W - 2 * M - 40, 10.2, 14.5, WHITE, "AxonBold")
    c.showPage()
    return page + 1


def build_pdf():
    register_fonts()
    epics = load_backlog()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=letter)
    c.setTitle("Axon DAVI NFC Integration Product Backlog")
    c.setAuthor("Codex")
    cover(c)
    page = 2
    page = executive_summary(c, epics, page)
    page = current_state_page(c, page)
    page = organizer_workflow_page(c, page)
    page = impact_page(c, page)
    page = core_team_alignment(c, page)
    page = architecture_flow(c, page)
    page = backlog_dashboard(c, epics, page)
    page = release_gates(c, page)
    page = roadmap(c, epics, page)
    page = epic_pages(c, epics, page)
    closing(c, page)
    c.save()
    return OUT


if __name__ == "__main__":
    print(build_pdf())
