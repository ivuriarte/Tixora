from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


OUTPUT = Path("output/pdf/event-workspace-readiness-center-executive-brief.pdf")


PALETTE = {
    "ink": colors.HexColor("#183642"),
    "teal": colors.HexColor("#0E7490"),
    "teal_dark": colors.HexColor("#155E75"),
    "mint": colors.HexColor("#D9F4F0"),
    "sand": colors.HexColor("#FFF7E8"),
    "gold": colors.HexColor("#D97706"),
    "rose": colors.HexColor("#FDECEC"),
    "slate": colors.HexColor("#52616B"),
    "light": colors.HexColor("#F7FAFC"),
    "line": colors.HexColor("#D7E3E8"),
    "white": colors.white,
}


def build_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="Body",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=15,
            textColor=PALETTE["ink"],
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Small",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=PALETTE["slate"],
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SectionEyebrow",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=10,
            textColor=PALETTE["teal_dark"],
            spaceAfter=6,
            uppercase=True,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H1",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=23,
            leading=28,
            textColor=PALETTE["ink"],
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H2",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=20,
            textColor=PALETTE["ink"],
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CardTitle",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=11.5,
            leading=14,
            textColor=PALETTE["ink"],
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CardBody",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=13,
            textColor=PALETTE["slate"],
            spaceAfter=0,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Quote",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=20,
            textColor=PALETTE["ink"],
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BulletText",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=PALETTE["ink"],
            leftIndent=0,
            spaceAfter=3,
        )
    )
    return styles


def footer(canvas, doc):
    page = canvas.getPageNumber()
    canvas.saveState()
    canvas.setStrokeColor(PALETTE["line"])
    canvas.setLineWidth(0.6)
    canvas.line(doc.leftMargin, 0.55 * inch, letter[0] - doc.rightMargin, 0.55 * inch)
    canvas.setFont("Helvetica", 8.5)
    canvas.setFillColor(PALETTE["slate"])
    canvas.drawString(doc.leftMargin, 0.34 * inch, "Axon Tickets | Executive Brief")
    canvas.drawRightString(letter[0] - doc.rightMargin, 0.34 * inch, f"Page {page}")
    canvas.restoreState()


def hero(canvas, doc):
    canvas.saveState()
    width, height = letter

    canvas.setFillColor(PALETTE["light"])
    canvas.rect(0, 0, width, height, fill=1, stroke=0)

    canvas.setFillColor(PALETTE["mint"])
    canvas.roundRect(-0.4 * inch, height - 3.7 * inch, 5.8 * inch, 2.6 * inch, 28, fill=1, stroke=0)
    canvas.setFillColor(PALETTE["sand"])
    canvas.roundRect(4.25 * inch, height - 4.45 * inch, 4.0 * inch, 3.3 * inch, 28, fill=1, stroke=0)
    canvas.setFillColor(PALETTE["teal"])
    canvas.circle(6.85 * inch, height - 1.35 * inch, 0.55 * inch, fill=1, stroke=0)
    canvas.setFillColor(PALETTE["gold"])
    canvas.circle(5.95 * inch, height - 4.9 * inch, 0.28 * inch, fill=1, stroke=0)
    canvas.restoreState()


def section_title(styles, eyebrow, title, body=None):
    blocks = [
        Paragraph(eyebrow, styles["SectionEyebrow"]),
        Paragraph(title, styles["H2"]),
    ]
    if body:
        blocks.append(Paragraph(body, styles["Body"]))
    return blocks


def bullet_list(styles, items):
    return ListFlowable(
        [
            ListItem(Paragraph(item, styles["BulletText"]), leftIndent=0)
            for item in items
        ],
        bulletType="bullet",
        start="circle",
        leftIndent=14,
        bulletFontName="Helvetica-Bold",
        bulletFontSize=8,
        bulletOffsetY=2,
    )


def card(styles, title, body, bg_color, width):
    table = Table(
        [[Paragraph(title, styles["CardTitle"])], [Paragraph(body, styles["CardBody"])]],
        colWidths=[width - 0.4 * inch],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), bg_color),
                ("BOX", (0, 0), (-1, -1), 0.7, PALETTE["line"]),
                ("ROUNDEDCORNERS", (0, 0), (-1, -1), 10),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
                ("TOPPADDING", (0, 0), (-1, -1), 12),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
            ]
        )
    )
    return table


def two_col_cards(styles, items):
    width = 3.05 * inch
    rows = []
    row = []
    colors_cycle = [PALETTE["mint"], PALETTE["sand"], colors.HexColor("#EEF6FF"), colors.HexColor("#F5F0FF")]
    for idx, item in enumerate(items):
        row.append(card(styles, item["title"], item["body"], colors_cycle[idx % len(colors_cycle)], width))
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        row.append(Spacer(width, 0.1 * inch))
        rows.append(row)
    table = Table(rows, colWidths=[width, width], hAlign="LEFT", spaceBefore=6, spaceAfter=12)
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return table


def comparison_table(styles):
    data = [
        [
            Paragraph("<b>Today’s pain</b>", styles["CardTitle"]),
            Paragraph("<b>What the new workspace changes</b>", styles["CardTitle"]),
        ],
        [
            Paragraph("Teams juggle spreadsheets, chats, and email.", styles["CardBody"]),
            Paragraph("One event workspace becomes the operating home for the whole event.", styles["CardBody"]),
        ],
        [
            Paragraph("Leaders do not know what is slipping.", styles["CardBody"]),
            Paragraph("Readiness score, blocked items, and milestones make progress visible at a glance.", styles["CardBody"]),
        ],
        [
            Paragraph("Updates to sponsors and executives are manual and inconsistent.", styles["CardBody"]),
            Paragraph("A clean read-only dashboard shares progress without exposing internal work.", styles["CardBody"]),
        ],
    ]
    table = Table(data, colWidths=[2.55 * inch, 3.7 * inch], spaceBefore=6, spaceAfter=12)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EAF5F7")),
                ("BACKGROUND", (0, 1), (-1, -1), PALETTE["white"]),
                ("BOX", (0, 0), (-1, -1), 0.8, PALETTE["line"]),
                ("INNERGRID", (0, 0), (-1, -1), 0.6, PALETTE["line"]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return table


def roadmap_table(styles):
    data = [
        [
            Paragraph("<b>Phase</b>", styles["CardTitle"]),
            Paragraph("<b>Focus</b>", styles["CardTitle"]),
            Paragraph("<b>What the business gets</b>", styles["CardTitle"]),
        ],
        [
            Paragraph("Phase 1", styles["CardBody"]),
            Paragraph("Foundation", styles["CardBody"]),
            Paragraph("Organizer onboarding, event workspace, readiness tracking, ownership, stakeholder dashboard.", styles["CardBody"]),
        ],
        [
            Paragraph("Phase 2", styles["CardBody"]),
            Paragraph("Event operations", styles["CardBody"]),
            Paragraph("Volunteers, risk tracking, dependencies, escalations, stronger reporting.", styles["CardBody"]),
        ],
        [
            Paragraph("Phase 3", styles["CardBody"]),
            Paragraph("Operational insight", styles["CardBody"]),
            Paragraph("Historical trends, organizer learnings, event benchmarks.", styles["CardBody"]),
        ],
        [
            Paragraph("Phase 4", styles["CardBody"]),
            Paragraph("Event intelligence", styles["CardBody"]),
            Paragraph("Recommendations, predictive readiness, event performance forecasting.", styles["CardBody"]),
        ],
    ]
    table = Table(data, colWidths=[1.0 * inch, 1.55 * inch, 3.75 * inch], spaceBefore=6, spaceAfter=12)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EAF5F7")),
                ("BOX", (0, 0), (-1, -1), 0.8, PALETTE["line"]),
                ("INNERGRID", (0, 0), (-1, -1), 0.6, PALETTE["line"]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return table


def callout(styles, title, body, fill):
    table = Table(
        [[Paragraph(title, styles["CardTitle"])], [Paragraph(body, styles["Body"])]],
        colWidths=[6.2 * inch],
        spaceBefore=4,
        spaceAfter=10,
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), fill),
                ("BOX", (0, 0), (-1, -1), 0.8, PALETTE["line"]),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return table


def stat_band(styles):
    labels = [
        ("One shared workspace", "Instead of scattered files and chat threads."),
        ("Clear ownership", "Each important task has a named owner and due date."),
        ("Visible readiness", "Leaders can see if the event is on track or blocked."),
    ]
    cells = []
    for title, body in labels:
        cells.append(
            Table(
                [[Paragraph(title, styles["CardTitle"])], [Paragraph(body, styles["CardBody"])]],
                colWidths=[1.95 * inch],
                style=TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), PALETTE["white"]),
                        ("BOX", (0, 0), (-1, -1), 0.6, PALETTE["line"]),
                        ("LEFTPADDING", (0, 0), (-1, -1), 12),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                        ("TOPPADDING", (0, 0), (-1, -1), 10),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                    ]
                ),
            )
        )
    band = Table([cells], colWidths=[2.06 * inch, 2.06 * inch, 2.06 * inch], spaceBefore=18)
    band.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return band


def story(styles):
    flow = []

    flow.extend(
        [
            Spacer(1, 2.15 * inch),
            Paragraph("AXON TICKETS", styles["SectionEyebrow"]),
            Paragraph("Event Workspace &<br/>Event Readiness Center", styles["H1"]),
            Paragraph(
                "Executive brief for a simpler, safer, and more visible way to run events",
                ParagraphStyle(
                    "Sub",
                    parent=styles["Body"],
                    fontName="Helvetica",
                    fontSize=12.5,
                    leading=17,
                    textColor=PALETTE["slate"],
                    spaceAfter=18,
                ),
            ),
            Paragraph(
                "This version is intentionally written for business readers. It focuses on the customer problem, the product idea, the first release, and why it matters.",
                styles["Body"],
            ),
            stat_band(styles),
            Spacer(1, 0.55 * inch),
            Paragraph(
                f"Updated {date(2026, 7, 4).strftime('%B %d, %Y')}",
                styles["Small"],
            ),
            PageBreak(),
        ]
    )

    flow.extend(section_title(styles, "Why this matters", "The opportunity in plain language"))
    flow.append(
        Paragraph(
            "Event organizers often manage one live event across too many places: spreadsheets for planning, chat threads for follow-ups, email for approvals, and a ticketing platform for registrations and payments. That split makes it hard to know what is done, what is late, and who owns the next move.",
            styles["Body"],
        )
    )
    flow.append(comparison_table(styles))
    flow.append(
        callout(
            styles,
            "The core idea",
            "Every event gets its own operational workspace inside Axon. The team can track progress, assign owners, monitor blockers, and share a clean status view with sponsors or executives.",
            PALETTE["mint"],
        )
    )
    flow.extend(section_title(styles, "Why Axon can win", "A more useful position than ticketing alone"))
    flow.append(
        bullet_list(
            styles,
            [
                "Eventbrite is strong in discovery, but this is about execution after the event is already planned.",
                "Ticket Fairy is strong in sales and marketing, but this focuses on getting the event operationally ready.",
                "HelixPay is strong in commerce, but this adds day-to-day execution visibility that buyers can feel.",
                "Axon already handles events, registrations, payments, QR validation, attendance, and reporting, so readiness is a natural next layer.",
            ]
        )
    )
    flow.append(PageBreak())

    flow.extend(section_title(styles, "What the product is", "A practical operating home for each event"))
    flow.append(
        Paragraph(
            "The product is not a generic project management tool. It is a focused event workspace built around the questions organizers ask every week before event day.",
            styles["Body"],
        )
    )
    flow.append(
        two_col_cards(
            styles,
            [
                {
                    "title": "Event overview",
                    "body": "A clear snapshot of readiness, milestones, open work, and blocked items.",
                },
                {
                    "title": "Readiness checklist",
                    "body": "A reusable checklist that helps teams avoid starting from a blank spreadsheet every time.",
                },
                {
                    "title": "Ownership",
                    "body": "Each important item has a named owner and due date so follow-through is easier.",
                },
                {
                    "title": "Stakeholder view",
                    "body": "Sponsors, investors, and executives can see progress without seeing internal details.",
                },
            ],
        )
    )
    flow.append(
        callout(
            styles,
            "The simplest product promise",
            "Replace the event readiness spreadsheet with one shared workspace that people actually use.",
            PALETTE["sand"],
        )
    )
    flow.extend(section_title(styles, "What success looks like", "Signs that the first release is working"))
    flow.append(
        bullet_list(
            styles,
            [
                "Organizers create an event workspace without extra setup.",
                "Teams use a checklist template instead of starting in a spreadsheet.",
                "Important work gets assigned to real owners with due dates.",
                "Blocked items become visible early rather than appearing at the last minute.",
                "Leaders can open one dashboard and understand overall readiness in seconds.",
                "Pilot customers say they depend less on spreadsheets and chat-based follow-up.",
            ]
        )
    )
    flow.append(PageBreak())

    flow.extend(section_title(styles, "First release", "What fits in the 8-week MVP"))
    flow.append(
        Paragraph(
            "The first release should stay intentionally small. Its job is to prove real customer value, not to become a full event operations suite on day one.",
            styles["Body"],
        )
    )
    flow.append(
        two_col_cards(
            styles,
            [
                {
                    "title": "Included now",
                    "body": "Organizer onboarding, organization profile, event workspace, checklist templates, status updates, blocked items, owners, due dates, readiness score, and a read-only stakeholder dashboard.",
                },
                {
                    "title": "Saved for later",
                    "body": "Volunteer tools, advanced risk tracking, full dependency mapping, automation, AI recommendations, benchmarking, and financial planning.",
                },
                {
                    "title": "Why this is the right size",
                    "body": "It tackles the biggest pain first: scattered execution tracking. That gives the team a clean test of product-market value.",
                },
                {
                    "title": "What not to do",
                    "body": "Do not broaden the MVP into a generic team workspace. The focus must stay on running events well.",
                },
            ],
        )
    )
    flow.append(
        callout(
            styles,
            "Recommended success gate",
            "Move into the next phase only if pilot organizers actively use readiness tracking and report that it meaningfully reduces spreadsheet dependency.",
            colors.HexColor("#EEF6FF"),
        )
    )
    flow.extend(section_title(styles, "July delivery update", "Four adjacent product packages are ready for UAT"))
    flow.append(
        two_col_cards(
            styles,
            [
                {
                    "title": "Referral campaigns",
                    "body": "Event-scoped codes support controlled discounts, usage limits, tier rules, attribution, and reporting without trusting browser pricing.",
                },
                {
                    "title": "Better attendee insight",
                    "body": "Birthday, gender, and city are collected consistently, creating a foundation for privacy-safe aggregate demographic reporting.",
                },
                {
                    "title": "Stronger sponsor visibility",
                    "body": "Public sponsor cards now support tiers, descriptions, websites, visibility controls, and safe raster logos - without becoming sponsor CRM.",
                },
                {
                    "title": "Flexible event storytelling",
                    "body": "Ordered custom sections let organizers present programs, policies, performers, causes, or other event-specific content beyond conferences.",
                },
            ],
        )
    )
    flow.append(
        callout(
            styles,
            "Release posture",
            "The database change is additive. Referral pricing is recalculated by the API, concurrent final-use redemptions are serialized, sensitive demographics stay out of public responses, and organizer-controlled images are not proxied through Axon infrastructure.",
            colors.HexColor("#EEF6FF"),
        )
    )
    flow.extend(section_title(styles, "Who benefits most", "Best initial buyers"))
    flow.append(
        bullet_list(
            styles,
            [
                "Event agencies running multiple stakeholders and many moving parts.",
                "Institutions and organizers that need professional reporting for sponsors or leadership.",
                "Teams that already feel pain from missed deliverables, unclear ownership, or late surprises.",
                "Recurring event operators who want a repeatable operating rhythm, not just a ticketing tool.",
            ]
        )
    )
    flow.append(PageBreak())

    flow.extend(section_title(styles, "Business upside", "Why this matters beyond product polish"))
    flow.append(
        two_col_cards(
            styles,
            [
                {
                    "title": "Higher retention",
                    "body": "Axon becomes useful before, during, and after ticket sales instead of only during transaction moments.",
                },
                {
                    "title": "Stronger differentiation",
                    "body": "The platform owns execution readiness, not only registrations and payments.",
                },
                {
                    "title": "Better enterprise fit",
                    "body": "Stakeholder visibility helps Axon speak to sponsors, executives, investors, and institutional buyers.",
                },
                {
                    "title": "Foundation for future insight",
                    "body": "Once readiness data is trusted, Axon can later add smarter reporting, trends, and predictive capabilities.",
                },
            ],
        )
    )
    flow.append(
        KeepTogether(
            [
                Paragraph("If Axon does nothing", styles["H2"]),
                Paragraph(
                    "Organizers will continue to run the real work of events in external tools. Axon would remain important for transactions, but not for the day-to-day operational behavior that creates stickiness and long-term strategic advantage.",
                    styles["Body"],
                ),
            ]
        )
    )
    flow.append(PageBreak())

    flow.extend(section_title(styles, "Roadmap", "A simple path from MVP to long-term value"))
    flow.append(roadmap_table(styles))
    flow.append(
        callout(
            styles,
            "Final recommendation",
            "Proceed with the initiative, but keep the first release disciplined. The best version of this idea is smaller, sharper, and highly event-specific: one workspace per event, clear owners, visible blockers, and a stakeholder-safe dashboard.",
            PALETTE["mint"],
        )
    )
    flow.append(
        Paragraph(
            "In short: the first release should prove that Axon can become the operational source of truth for events, not just the place where tickets are sold.",
            styles["Quote"],
        )
    )
    return flow


def build_pdf():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    styles = build_styles()

    frame = Frame(0.95 * inch, 0.8 * inch, 6.6 * inch, 9.2 * inch, id="normal")
    doc = BaseDocTemplate(
        str(OUTPUT),
        pagesize=letter,
        leftMargin=0.95 * inch,
        rightMargin=0.95 * inch,
        topMargin=0.8 * inch,
        bottomMargin=0.8 * inch,
        title="Axon Tickets Event Workspace & Event Readiness Center Executive Brief",
        author="Codex",
    )
    doc.addPageTemplates(
        [
            PageTemplate(id="cover", frames=[frame], onPage=hero),
            PageTemplate(id="body", frames=[frame], onPage=footer),
        ]
    )

    flow = story(styles)

    def apply_templates(canvas, doc_instance):
        if canvas.getPageNumber() == 1:
            hero(canvas, doc_instance)
        else:
            footer(canvas, doc_instance)

    doc.pageTemplates = [PageTemplate(id="all", frames=[frame], onPage=apply_templates)]
    doc.build(flow)


if __name__ == "__main__":
    build_pdf()
