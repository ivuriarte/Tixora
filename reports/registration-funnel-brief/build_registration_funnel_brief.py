from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    FrameBreak,
    HRFlowable,
    KeepTogether,
    ListFlowable,
    ListItem,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


OUTPUT = "output/pdf/registration-funnel-improvements-uat-brief.pdf"


PURPLE = colors.HexColor("#7C3AED")
PURPLE_DARK = colors.HexColor("#4C1D95")
INK = colors.HexColor("#171717")
MUTED = colors.HexColor("#5F6368")
LIGHT_PURPLE = colors.HexColor("#F5ECFF")
SOFT_GRAY = colors.HexColor("#F7F7F8")
LINE = colors.HexColor("#E5E7EB")
RED = colors.HexColor("#EF4444")
GREEN = colors.HexColor("#16A34A")
AMBER = colors.HexColor("#D97706")


def styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=28,
            leading=32,
            textColor=INK,
            spaceAfter=8,
        ),
        "eyebrow": ParagraphStyle(
            "eyebrow",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=PURPLE,
            uppercase=True,
            tracking=2,
            spaceAfter=16,
        ),
        "subtitle": ParagraphStyle(
            "subtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=13,
            leading=18,
            textColor=MUTED,
            spaceAfter=10,
        ),
        "section": ParagraphStyle(
            "section",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=16,
            textColor=PURPLE,
            uppercase=True,
            tracking=1.5,
            spaceBefore=18,
            spaceAfter=10,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=15,
            textColor=INK,
            spaceAfter=8,
        ),
        "small": ParagraphStyle(
            "small",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=12,
            textColor=MUTED,
        ),
        "strong": ParagraphStyle(
            "strong",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10.5,
            leading=15,
            textColor=INK,
            spaceAfter=5,
        ),
        "metric": ParagraphStyle(
            "metric",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=24,
            alignment=TA_CENTER,
            textColor=INK,
        ),
        "metric_red": ParagraphStyle(
            "metric_red",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=24,
            alignment=TA_CENTER,
            textColor=RED,
        ),
        "metric_green": ParagraphStyle(
            "metric_green",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=24,
            alignment=TA_CENTER,
            textColor=GREEN,
        ),
        "card_text": ParagraphStyle(
            "card_text",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            alignment=TA_CENTER,
            textColor=MUTED,
        ),
        "callout": ParagraphStyle(
            "callout",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=18,
            textColor=PURPLE_DARK,
            spaceAfter=0,
        ),
        "bullet": ParagraphStyle(
            "bullet",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=13,
            textColor=INK,
            leftIndent=8,
            firstLineIndent=0,
        ),
        "table_head": ParagraphStyle(
            "table_head",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=11,
            textColor=INK,
        ),
        "table_cell": ParagraphStyle(
            "table_cell",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.2,
            leading=10.8,
            textColor=INK,
        ),
    }


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(20 * mm, 12 * mm, "Axon Tickets - Registration Funnel UAT Brief")
    canvas.drawRightString(190 * mm, 12 * mm, f"Page {doc.page}")
    canvas.restoreState()


def pill(text, color=PURPLE):
    return Table(
        [[Paragraph(text, ParagraphStyle("pill", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=color, alignment=TA_CENTER))]],
        colWidths=[34 * mm],
        rowHeights=[8 * mm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F4F0FF")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#DDD6FE")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]),
    )


def metric_card(value, label, style_name="metric"):
    s = STYLES
    return Table(
        [[Paragraph(value, s[style_name])], [Paragraph(label, s["card_text"])]],
        colWidths=[50 * mm],
        rowHeights=[13 * mm, 15 * mm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.white),
            ("BOX", (0, 0), (-1, -1), 0.7, LINE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]),
    )


def numbered_item(number, title, body):
    s = STYLES
    badge = Table(
        [[Paragraph(str(number), ParagraphStyle("badge", fontName="Helvetica-Bold", fontSize=12, leading=16, textColor=colors.white, alignment=TA_CENTER))]],
        colWidths=[9 * mm],
        rowHeights=[9 * mm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), RED),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]),
    )
    text = [Paragraph(title, s["strong"]), Paragraph(body, s["body"])]
    return Table(
        [[badge, text]],
        colWidths=[13 * mm, 150 * mm],
        style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]),
    )


def bullets(items):
    return ListFlowable(
        [ListItem(Paragraph(item, STYLES["bullet"]), bulletColor=PURPLE) for item in items],
        bulletType="bullet",
        start="circle",
        leftIndent=12,
        bulletFontSize=6,
        spaceAfter=8,
    )


def page_one(story):
    s = STYLES
    story.append(Spacer(1, 6 * mm))
    story.append(Table([[""]], colWidths=[18 * mm], rowHeights=[1.4 * mm], style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), PURPLE)])))
    story.append(Spacer(1, 10 * mm))
    story.append(Paragraph("PRODUCT CHANGE BRIEF - JULY 2026", s["eyebrow"]))
    story.append(Paragraph("Registration Funnel Improvements", s["title"]))
    story.append(Paragraph("Axon Tickets - Off The Record: Bar Talks Campaign", s["subtitle"]))
    story.append(Paragraph("Prepared for CEO review - Status: Deployed to UAT - Updated with UAT PR #47 / commit 21c18ec", s["small"]))
    story.append(Spacer(1, 9 * mm))
    story.append(HRFlowable(width="100%", thickness=0.6, color=LINE))

    story.append(Paragraph("WHAT HAPPENED", s["section"]))
    story.append(Table(
        [[Paragraph(
            "The Facebook ad campaign for Off The Record generated 21 link clicks and brought users to the registration page, but the earlier funnel produced zero completed email submissions. The latest UAT push addresses that by turning registration into a lightweight guest checkout: email first, then name and phone, then the order form, with OTP moved to the final booking confirmation step.",
            s["callout"],
        )]],
        colWidths=[170 * mm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), LIGHT_PURPLE),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ("TOPPADDING", (0, 0), (-1, -1), 11),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 11),
            ("LINEBEFORE", (0, 0), (-1, -1), 2, PURPLE),
        ]),
    ))
    story.append(Spacer(1, 8 * mm))
    story.append(Table(
        [[
            metric_card("21", "Ad link clicks reached the campaign destination"),
            metric_card("0", "Completed email submissions before the fix", "metric_red"),
            metric_card("UAT", "Latest simplified funnel is deployed for testing", "metric_green"),
        ]],
        colWidths=[55 * mm, 55 * mm, 55 * mm],
        style=TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 5)]),
    ))

    story.append(Paragraph("ROOT CAUSES IDENTIFIED", s["section"]))
    story.append(Paragraph("Analysis of the funnel and code path identified three conversion blockers in the earlier registration experience:", s["body"]))
    story.append(numbered_item(1, "A gate screen stopped users before the form", "The previous path asked users to make an account/sign-in decision before they could see the actual event registration form. Cold ad traffic had no context and left before committing."))
    story.append(numbered_item(2, "OTP appeared too early in the journey", "The old guest wizard sent OTP before a user had reviewed the order or uploaded payment proof. This made verification feel like a login wall instead of a booking confirmation."))
    story.append(numbered_item(3, "Too much work was required before value was clear", "A multi-field flow appeared before the user had confidence that the event, tier, price, and payment process were worth continuing."))

    story.append(Paragraph("WHAT UAT NOW SHIPS", s["section"]))
    data = [
        [Paragraph("Area", s["table_head"]), Paragraph("Updated UAT behavior", s["table_head"]), Paragraph("Business impact", s["table_head"])],
        [Paragraph("Guest start", s["table_cell"]), Paragraph("User enters only email, then proceeds to name and phone.", s["table_cell"]), Paragraph("Reduces the first action to a low-friction step.", s["table_cell"])],
        [Paragraph("Order review", s["table_cell"]), Paragraph("RegistrationForm is shown before OTP; guest details pre-fill the attendee fields.", s["table_cell"]), Paragraph("User sees the actual booking value before verification.", s["table_cell"])],
        [Paragraph("OTP", s["table_cell"]), Paragraph("OTP is requested only during final submit, after payment proof/order details are ready.", s["table_cell"]), Paragraph("Verification becomes a trust step, not an entry gate.", s["table_cell"])],
        [Paragraph("Duplicate guard", s["table_cell"]), Paragraph("Already-authenticated users are checked for existing registrations; guest users rely on server 409 handling.", s["table_cell"]), Paragraph("Avoids redirect loops while still preventing duplicate bookings.", s["table_cell"])],
        [Paragraph("Auth copy", s["table_cell"]), Paragraph("Access page now says \"Sign in or create account\" and explains first-time accounts are automatic.", s["table_cell"]), Paragraph("Removes ambiguity for new ad traffic.", s["table_cell"])],
    ]
    story.append(Table(
        data,
        colWidths=[28 * mm, 86 * mm, 52 * mm],
        repeatRows=1,
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), SOFT_GRAY),
            ("GRID", (0, 0), (-1, -1), 0.4, LINE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]),
    ))


def page_two(story):
    s = STYLES
    story.append(PageBreak())
    story.append(Paragraph("CEO DECISION SUMMARY", s["section"]))
    story.append(Table(
        [[pill("Deployed to UAT"), pill("No API migration"), pill("Ready for QA")]],
        colWidths=[40 * mm, 40 * mm, 40 * mm],
        style=TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]),
    ))
    story.append(Spacer(1, 5 * mm))
    story.append(Paragraph("This is a conversion repair, not a cosmetic change. The current UAT build removes the early account gate, keeps the user's momentum through the order form, and still preserves email verification before a registration is created.", s["body"]))
    story.append(bullets([
        "Expected impact: more ad visitors should reach the order form and registration submit step.",
        "Operational risk: low to moderate. The change is isolated to the web registration path and reuses existing OTP/auth endpoints.",
        "Primary QA risk: confirming OTP handoff reliably authenticates the guest before the registration API call.",
        "Production gate: promote only after a new guest can complete one paid registration and one free-registration/control path passes in UAT.",
    ]))

    story.append(Paragraph("UAT TESTING STEPS", s["section"]))
    test_rows = [
        [Paragraph("Step", s["table_head"]), Paragraph("Tester action", s["table_head"]), Paragraph("Expected result", s["table_head"])],
        [Paragraph("1", s["table_cell"]), Paragraph("Open UAT in a private/incognito window and go to the Off The Record event registration link from the campaign destination.", s["table_cell"]), Paragraph("Page loads without requiring sign-in first. User sees email entry as the first step.", s["table_cell"])],
        [Paragraph("2", s["table_cell"]), Paragraph("Enter a new test email address.", s["table_cell"]), Paragraph("Flow advances to name and mobile number. No OTP is sent yet.", s["table_cell"])],
        [Paragraph("3", s["table_cell"]), Paragraph("Enter first name, last name, and a 10-digit Philippine mobile number.", s["table_cell"]), Paragraph("The CTA becomes enabled and advances to order review / registration form.", s["table_cell"])],
        [Paragraph("4", s["table_cell"]), Paragraph("Review attendee details and payment/order fields. Upload or attach the required payment proof if the event is paid.", s["table_cell"]), Paragraph("Attendee fields are pre-filled from guest info; user can review before verification.", s["table_cell"])],
        [Paragraph("5", s["table_cell"]), Paragraph("Click final submit / continue registration.", s["table_cell"]), Paragraph("Only now, the app sends the email OTP and opens the confirmation modal.", s["table_cell"])],
        [Paragraph("6", s["table_cell"]), Paragraph("Enter the 6-digit OTP from the test mailbox.", s["table_cell"]), Paragraph("Modal closes, guest becomes authenticated, and the registration request completes.", s["table_cell"])],
        [Paragraph("7", s["table_cell"]), Paragraph("Confirm the post-submit page.", s["table_cell"]), Paragraph("Paid registration routes to payment/registration status as designed; free or pending approval routes to the registration detail page.", s["table_cell"])],
        [Paragraph("8", s["table_cell"]), Paragraph("Repeat with the same email/event after a completed registration.", s["table_cell"]), Paragraph("Duplicate booking is blocked by existing duplicate-registration safeguards/server response.", s["table_cell"])],
    ]
    story.append(Table(
        test_rows,
        colWidths=[12 * mm, 83 * mm, 70 * mm],
        repeatRows=1,
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), SOFT_GRAY),
            ("GRID", (0, 0), (-1, -1), 0.4, LINE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]),
    ))

    story.append(Paragraph("NEGATIVE TESTS", s["section"]))
    story.append(bullets([
        "Invalid email should stay on the email step with a clear validation message.",
        "Mobile number shorter than 10 digits should block progression.",
        "Wrong OTP should keep the modal open, clear the code field, and show an error.",
        "Cancel in the OTP modal should return the user to the form with a visible verification error and no registration created.",
        "Use a different email in the OTP modal should reset the guest flow back to email entry.",
        "Resend OTP should remain disabled for 60 seconds, then allow one new code request.",
    ]))

    story.append(Paragraph("WHAT TO CAPTURE DURING TESTING", s["section"]))
    story.append(bullets([
        "Screen recording from first landing through final registration result.",
        "The test email address used and timestamp of OTP receipt.",
        "Registration ID created, or the exact API/UI error if registration fails.",
        "Mobile viewport check, especially inside Facebook/Instagram in-app browser if available.",
        "Any point where the tester hesitates, has to reread copy, or is unsure what happens next.",
    ]))

    story.append(Paragraph("RECOMMENDATION", s["section"]))
    story.append(Table(
        [[Paragraph(
            "Proceed with focused UAT using the steps above. If one new-user paid registration completes cleanly and the negative OTP/cancel cases behave as expected, this change is a strong candidate for production promotion before restarting paid traffic.",
            ParagraphStyle("recommendation", parent=s["callout"], textColor=colors.HexColor("#064E3B")),
        )]],
        colWidths=[166 * mm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#ECFDF5")),
            ("LINEBEFORE", (0, 0), (-1, -1), 2, GREEN),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 9),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ]),
    ))


def build():
    doc = BaseDocTemplate(
        OUTPUT,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title="Registration Funnel Improvements - UAT Brief",
        author="Axon Tickets",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=footer)])
    story = []
    page_one(story)
    page_two(story)
    doc.build(story)


STYLES = styles()


if __name__ == "__main__":
    build()
