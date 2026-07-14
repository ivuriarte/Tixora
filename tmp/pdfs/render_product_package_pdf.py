from __future__ import annotations

import re
import os
import textwrap
import xml.sax.saxutils as saxutils
from collections import defaultdict, deque
from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.styles import ParagraphStyle, StyleSheet1, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.graphics.shapes import Drawing, Line, Polygon, Rect, String
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    ListFlowable,
    ListItem,
    LongTable,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)


SOURCE = Path(os.environ.get("PDF_SOURCE", "docs/event-workspace-readiness-center-product-package.md"))
OUTPUT = Path(os.environ.get("PDF_OUTPUT", "output/pdf/event-workspace-readiness-center-product-package.pdf"))


def source_title() -> str:
    for line in SOURCE.read_text().splitlines():
        if line.startswith("# "):
            return strip_md(line[2:])
    return SOURCE.stem.replace("-", " ").title()

PALETTE = {
    "ink": colors.HexColor("#183642"),
    "accent": colors.HexColor("#0E7490"),
    "accent_dark": colors.HexColor("#155E75"),
    "muted": colors.HexColor("#5B6770"),
    "line": colors.HexColor("#D9E2E8"),
    "line_dark": colors.HexColor("#B8C8D1"),
    "soft": colors.HexColor("#F6FBFC"),
    "soft_alt": colors.HexColor("#F9F6EC"),
    "white": colors.white,
    "code": colors.HexColor("#F4F7FA"),
}


def build_styles() -> StyleSheet1:
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="Body",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=9.7,
            leading=14,
            textColor=PALETTE["ink"],
            spaceAfter=7,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Small",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8.3,
            leading=11,
            textColor=PALETTE["muted"],
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CoverEyebrow",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=12,
            textColor=PALETTE["accent_dark"],
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CoverTitle",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=25,
            leading=30,
            textColor=PALETTE["ink"],
            spaceAfter=12,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H1",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=20,
            textColor=PALETTE["ink"],
            spaceBefore=6,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H2",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12.2,
            leading=15,
            textColor=PALETTE["accent_dark"],
            spaceBefore=8,
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H3",
            parent=styles["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=10.4,
            leading=13,
            textColor=PALETTE["ink"],
            spaceBefore=7,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H4",
            parent=styles["Heading4"],
            fontName="Helvetica-Bold",
            fontSize=9.8,
            leading=12,
            textColor=PALETTE["ink"],
            spaceBefore=6,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="MdBullet",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=13,
            textColor=PALETTE["ink"],
            spaceAfter=2,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CenterMeta",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10.2,
            leading=14,
            textColor=PALETTE["muted"],
            alignment=TA_CENTER,
            spaceAfter=6,
        )
    )
    return styles


def escape_and_format(text: str) -> str:
    text = text.strip()
    if not text:
        return ""
    text = saxutils.escape(text)
    text = re.sub(r"`([^`]+)`", r'<font face="Courier">\1</font>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", text)
    return text


def strip_md(text: str) -> str:
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"\1", text)
    return text.strip()


def is_table_separator(line: str) -> bool:
    body = line.strip().strip("|").replace(" ", "")
    return bool(body) and all(ch in "-:|" for ch in line.strip())


def parse_table_line(line: str) -> list[str]:
    raw = line.strip().strip("|")
    return [cell.strip() for cell in raw.split("|")]


def page_chrome(canvas, doc):
    canvas.saveState()
    width, _ = doc.pagesize
    canvas.setStrokeColor(PALETTE["line"])
    canvas.setLineWidth(0.6)
    canvas.line(doc.leftMargin, 0.55 * inch, width - doc.rightMargin, 0.55 * inch)
    canvas.setFont("Helvetica", 8.2)
    canvas.setFillColor(PALETTE["muted"])
    canvas.drawString(doc.leftMargin, 0.33 * inch, "Axon Tickets | Controlled Document")
    canvas.drawRightString(width - doc.rightMargin, 0.33 * inch, f"Page {canvas.getPageNumber()}")
    canvas.restoreState()


def cover_page(canvas, doc):
    canvas.saveState()
    width, height = doc.pagesize
    canvas.setFillColor(PALETTE["soft"])
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#DDF2F0"))
    canvas.roundRect(0.8 * inch, height - 3.2 * inch, 4.8 * inch, 1.9 * inch, 18, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#FDF5E6"))
    canvas.roundRect(4.4 * inch, height - 4.2 * inch, 3.0 * inch, 2.3 * inch, 20, fill=1, stroke=0)
    canvas.setFillColor(PALETTE["accent"])
    canvas.circle(6.8 * inch, height - 1.6 * inch, 0.42 * inch, fill=1, stroke=0)
    canvas.restoreState()


def build_table(rows: list[list[str]], styles: StyleSheet1, wide: bool) -> LongTable:
    clean_rows = [row for row in rows if row and not is_table_separator("|" + "|".join(row) + "|")]
    ncols = max(len(r) for r in clean_rows)
    padded = [r + [""] * (ncols - len(r)) for r in clean_rows]
    available = 9.6 * inch if wide else 6.95 * inch

    lengths = []
    for col in range(ncols):
        lens = [max(len(strip_md(row[col])), 4) for row in padded]
        lengths.append(min(max(max(lens), 8), 48))
    total = sum(lengths)
    col_widths = [(available * value / total) for value in lengths]

    header_style = ParagraphStyle(
        "TableHeader",
        parent=styles["Body"],
        fontName="Helvetica-Bold",
        fontSize=8.6 if wide else 8.9,
        leading=11 if wide else 11.5,
        textColor=PALETTE["ink"],
    )
    body_style = ParagraphStyle(
        "TableBody",
        parent=styles["Body"],
        fontName="Helvetica",
        fontSize=7.5 if wide else 8.3,
        leading=10.2 if wide else 11.2,
        textColor=PALETTE["ink"],
    )

    table_data = []
    for idx, row in enumerate(padded):
        style = header_style if idx == 0 else body_style
        table_data.append([Paragraph(escape_and_format(cell or " "), style) for cell in row])

    table = LongTable(table_data, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EAF5F7")),
                ("BACKGROUND", (0, 1), (-1, -1), PALETTE["white"]),
                ("BOX", (0, 0), (-1, -1), 0.7, PALETTE["line_dark"]),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, PALETTE["line"]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def parse_mermaid_node(token: str) -> tuple[str, str | None, str | None]:
    token = token.strip()
    match = re.match(r"^([A-Za-z0-9_]+)(.*)$", token)
    if not match:
        return token, None, None
    node_id, rest = match.groups()
    rest = rest.strip()
    if not rest:
        return node_id, None, None

    if rest.startswith("[") and rest.endswith("]"):
        label = rest[1:-1].strip().strip('"')
        return node_id, label, "process"
    if rest.startswith("{") and rest.endswith("}"):
        label = rest[1:-1].strip().strip('"')
        return node_id, label, "decision"
    return node_id, rest.strip('"'), "process"


def parse_mermaid_flowchart(code_lines: list[str]) -> tuple[dict, list[dict], list[str]]:
    nodes: dict[str, dict] = {}
    edges: list[dict] = []
    node_order: list[str] = []

    for raw_line in code_lines:
        line = raw_line.strip()
        if not line or line == "flowchart TD":
            continue
        if "-->" not in line:
            continue

        src_token, rhs = line.split("-->", 1)
        edge_label = None
        rhs = rhs.strip()
        if rhs.startswith("|"):
            closing = rhs.find("|", 1)
            edge_label = rhs[1:closing].strip()
            rhs = rhs[closing + 1 :].strip()

        src_id, src_label, src_shape = parse_mermaid_node(src_token)
        dst_id, dst_label, dst_shape = parse_mermaid_node(rhs)

        for node_id, label, shape in (
            (src_id, src_label, src_shape),
            (dst_id, dst_label, dst_shape),
        ):
            if node_id not in nodes:
                nodes[node_id] = {
                    "id": node_id,
                    "label": label or node_id,
                    "shape": shape or "process",
                }
                node_order.append(node_id)
            else:
                if label:
                    nodes[node_id]["label"] = label
                if shape:
                    nodes[node_id]["shape"] = shape

        edges.append({"src": src_id, "dst": dst_id, "label": edge_label})

    return nodes, edges, node_order


def node_fill(label: str, shape: str) -> colors.Color:
    lower = label.lower()
    if shape == "decision":
        return colors.HexColor("#FFF4DA")
    if "blocked" in lower or "reject" in lower or "suspend" in lower:
        return colors.HexColor("#FDECEC")
    if "on track" in lower or "activated" in lower or "created" in lower:
        return colors.HexColor("#E8F8F1")
    if "attention" in lower or "review" in lower or "request" in lower:
        return colors.HexColor("#FFF7E8")
    if "risk" in lower:
        return colors.HexColor("#FDECEC")
    if "summary" in lower or "dashboard" in lower:
        return colors.HexColor("#EEF6FF")
    return colors.HexColor("#F7FBFC")


def wrap_node_lines(label: str, shape: str) -> list[str]:
    width = 16 if shape == "decision" else 20
    return textwrap.wrap(label, width=width) or [label]


def add_arrow(drawing: Drawing, x1: float, y1: float, x2: float, y2: float, color=PALETTE["accent_dark"]):
    drawing.add(Line(x1, y1, x2, y2, strokeColor=color, strokeWidth=1.2))
    size = 5
    if abs(x2 - x1) > abs(y2 - y1):
        if x2 >= x1:
            points = [x2, y2, x2 - size, y2 + 2.6, x2 - size, y2 - 2.6]
        else:
            points = [x2, y2, x2 + size, y2 + 2.6, x2 + size, y2 - 2.6]
    else:
        if y2 >= y1:
            points = [x2, y2, x2 - 2.6, y2 - size, x2 + 2.6, y2 - size]
        else:
            points = [x2, y2, x2 - 2.6, y2 + size, x2 + 2.6, y2 + size]
    drawing.add(Polygon(points, fillColor=color, strokeColor=color))


def add_segment(drawing: Drawing, x1: float, y1: float, x2: float, y2: float, color=PALETTE["accent_dark"]):
    drawing.add(Line(x1, y1, x2, y2, strokeColor=color, strokeWidth=1.2))


def build_mermaid_drawing(code_lines: list[str]) -> Drawing:
    nodes, edges, node_order = parse_mermaid_flowchart(code_lines)
    graph_in = defaultdict(int)
    parents = defaultdict(list)
    children = defaultdict(list)

    for edge in edges:
        graph_in[edge["dst"]] += 1
        parents[edge["dst"]].append(edge["src"])
        children[edge["src"]].append(edge["dst"])

    roots = [node_id for node_id in node_order if graph_in[node_id] == 0] or node_order[:1]

    queue = deque(roots)
    seen = set()
    topo = []
    while queue:
        node_id = queue.popleft()
        if node_id in seen:
            continue
        seen.add(node_id)
        topo.append(node_id)
        for child in children[node_id]:
            graph_in[child] -= 1
            if graph_in[child] <= 0:
                queue.append(child)

    for node_id in node_order:
        if node_id not in seen:
            topo.append(node_id)

    levels = {node_id: 0 for node_id in node_order}
    for node_id in topo:
        for child in children[node_id]:
            levels[child] = max(levels[child], levels[node_id] + 1)

    grouped = defaultdict(list)
    for node_id in node_order:
        grouped[levels[node_id]].append(node_id)

    level_keys = sorted(grouped)
    pos_index = {node_id: idx for idx, node_id in enumerate(node_order)}
    for _ in range(4):
        for level in level_keys[1:]:
            grouped[level].sort(
                key=lambda node_id: (
                    sum(pos_index.get(parent, 0) for parent in parents[node_id]) / max(len(parents[node_id]), 1),
                    pos_index[node_id],
                )
            )
            for idx, node_id in enumerate(grouped[level]):
                pos_index[node_id] = idx

    for node in nodes.values():
        node["lines"] = wrap_node_lines(node["label"], node["shape"])
        node["width"] = 120 if node["shape"] == "process" else 110
        node["height"] = 22 + len(node["lines"]) * 12

    width = 6.9 * inch
    top_pad = 18
    side_pad = 18
    level_gap = 34
    level_y = {}
    y_cursor = None

    for level in level_keys:
        max_height = max(nodes[node_id]["height"] for node_id in grouped[level])
        if y_cursor is None:
            y_cursor = top_pad + max_height / 2
        else:
            y_cursor += prev_height / 2 + level_gap + max_height / 2
        level_y[level] = y_cursor
        prev_height = max_height

    height = (level_y[level_keys[-1]] + prev_height / 2 + 18) if level_keys else 160
    drawing = Drawing(width, height)
    drawing.add(Rect(0, 0, width, height, fillColor=colors.white, strokeColor=None))

    for level in level_keys:
        row = grouped[level]
        gap = 16
        row_width = sum(nodes[node_id]["width"] for node_id in row) + gap * (len(row) - 1)
        start_x = max(side_pad, (width - row_width) / 2)
        x_cursor = start_x
        for node_id in row:
            node = nodes[node_id]
            node["cx"] = x_cursor + node["width"] / 2
            node["cy"] = height - level_y[level]
            x_cursor += node["width"] + gap

    for edge in edges:
        src = nodes[edge["src"]]
        dst = nodes[edge["dst"]]
        src_bottom = src["cy"] - src["height"] / 2
        dst_top = dst["cy"] + dst["height"] / 2
        mid_y = (src_bottom + dst_top) / 2

        if abs(src["cx"] - dst["cx"]) < 8:
            add_arrow(drawing, src["cx"], src_bottom, dst["cx"], dst_top)
            label_x = src["cx"] + 6
            label_y = mid_y + 4
        else:
            add_segment(drawing, src["cx"], src_bottom, src["cx"], mid_y)
            add_segment(drawing, src["cx"], mid_y, dst["cx"], mid_y)
            add_arrow(drawing, dst["cx"], mid_y, dst["cx"], dst_top)
            label_x = (src["cx"] + dst["cx"]) / 2
            label_y = mid_y + 6

        if edge["label"]:
            label = edge["label"]
            pad = 4
            label_w = max(26, len(label) * 4.6 + pad * 2)
            label_h = 12
            drawing.add(
                Rect(
                    label_x - label_w / 2,
                    label_y - 6,
                    label_w,
                    label_h,
                    rx=5,
                    ry=5,
                    fillColor=colors.white,
                    strokeColor=PALETTE["line_dark"],
                    strokeWidth=0.5,
                )
            )
            drawing.add(
                String(
                    label_x,
                    label_y - 2.2,
                    label,
                    textAnchor="middle",
                    fontName="Helvetica-Bold",
                    fontSize=7.2,
                    fillColor=PALETTE["accent_dark"],
                )
            )

    for node_id in node_order:
        node = nodes[node_id]
        x = node["cx"] - node["width"] / 2
        y = node["cy"] - node["height"] / 2
        fill = node_fill(node["label"], node["shape"])

        if node["shape"] == "decision":
            drawing.add(
                Polygon(
                    [
                        node["cx"], y + node["height"],
                        x + node["width"], node["cy"],
                        node["cx"], y,
                        x, node["cy"],
                    ],
                    fillColor=fill,
                    strokeColor=PALETTE["accent_dark"],
                    strokeWidth=1.2,
                )
            )
        else:
            drawing.add(
                Rect(
                    x,
                    y,
                    node["width"],
                    node["height"],
                    rx=10,
                    ry=10,
                    fillColor=fill,
                    strokeColor=PALETTE["accent_dark"],
                    strokeWidth=1.1,
                )
            )

        line_y = node["cy"] + (len(node["lines"]) - 1) * 5.6
        for line in node["lines"]:
            drawing.add(
                String(
                    node["cx"],
                    line_y,
                    line,
                    textAnchor="middle",
                    fontName="Helvetica-Bold" if node["shape"] == "decision" else "Helvetica",
                    fontSize=8.4,
                    fillColor=PALETTE["ink"],
                )
            )
            line_y -= 11.2

    return drawing


def flush_paragraph(buffer: list[str], story: list, styles: StyleSheet1):
    if not buffer:
        return
    text = " ".join(part.strip() for part in buffer if part.strip())
    buffer.clear()
    if text:
        story.append(Paragraph(escape_and_format(text), styles["Body"]))


def flush_bullets(items: list[str], story: list, styles: StyleSheet1):
    if not items:
        return
    story.append(
        ListFlowable(
            [ListItem(Paragraph(escape_and_format(item), styles["MdBullet"])) for item in items],
            bulletType="bullet",
            start="circle",
            bulletFontName="Helvetica-Bold",
            bulletFontSize=8,
            leftIndent=16,
        )
    )
    story.append(Spacer(1, 0.05 * inch))
    items.clear()


def flush_numbered(items: list[str], story: list, styles: StyleSheet1):
    if not items:
        return
    story.append(
        ListFlowable(
            [ListItem(Paragraph(escape_and_format(item), styles["MdBullet"])) for item in items],
            bulletType="1",
            start=1,
            leftIndent=16,
        )
    )
    story.append(Spacer(1, 0.05 * inch))
    items.clear()


def parse_markdown(markdown: str, styles: StyleSheet1) -> list:
    lines = markdown.splitlines()
    story = []
    paragraph_buffer: list[str] = []
    bullet_buffer: list[str] = []
    numbered_buffer: list[str] = []
    idx = 0

    while idx < len(lines):
        line = lines[idx].rstrip()
        stripped = line.strip()

        if stripped.startswith("```"):
            flush_paragraph(paragraph_buffer, story, styles)
            flush_bullets(bullet_buffer, story, styles)
            flush_numbered(numbered_buffer, story, styles)

            language = stripped[3:].strip() or "Code"
            idx += 1
            code_lines = []
            while idx < len(lines) and not lines[idx].strip().startswith("```"):
                code_lines.append(lines[idx].rstrip("\n"))
                idx += 1
            if language.lower() == "mermaid":
                diagram = build_mermaid_drawing(code_lines)
                diagram_card = Table([[diagram]], colWidths=[6.85 * inch])
                diagram_card.setStyle(
                    TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                            ("BOX", (0, 0), (-1, -1), 0.8, PALETTE["line_dark"]),
                            ("LEFTPADDING", (0, 0), (-1, -1), 10),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                            ("TOPPADDING", (0, 0), (-1, -1), 10),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                        ]
                    )
                )
                story.append(diagram_card)
                story.append(Spacer(1, 0.12 * inch))
            else:
                story.append(Paragraph(f"{language.title()} Block", styles["H4"]))
                code_box = Table(
                    [[Preformatted("\n".join(code_lines), ParagraphStyle("Code", fontName="Courier", fontSize=7.8, leading=9.5, textColor=PALETTE["ink"]))]],
                    colWidths=[6.8 * inch],
                )
                code_box.setStyle(
                    TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, -1), PALETTE["code"]),
                            ("BOX", (0, 0), (-1, -1), 0.6, PALETTE["line_dark"]),
                            ("LEFTPADDING", (0, 0), (-1, -1), 10),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                            ("TOPPADDING", (0, 0), (-1, -1), 8),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                        ]
                    )
                )
                story.append(code_box)
                story.append(Spacer(1, 0.08 * inch))
            idx += 1
            continue

        if stripped.startswith("|"):
            flush_paragraph(paragraph_buffer, story, styles)
            flush_bullets(bullet_buffer, story, styles)
            flush_numbered(numbered_buffer, story, styles)

            table_lines = []
            while idx < len(lines) and lines[idx].strip().startswith("|"):
                table_lines.append(lines[idx].strip())
                idx += 1
            rows = [parse_table_line(table_line) for table_line in table_lines if not is_table_separator(table_line)]
            wide = max(len(r) for r in rows) >= 5
            if wide:
                story.append(NextPageTemplate("landscape"))
                story.append(PageBreak())
            story.append(build_table(rows, styles, wide=wide))
            story.append(Spacer(1, 0.1 * inch))
            if wide:
                story.append(NextPageTemplate("portrait"))
                story.append(PageBreak())
            continue

        if stripped.startswith("#"):
            flush_paragraph(paragraph_buffer, story, styles)
            flush_bullets(bullet_buffer, story, styles)
            flush_numbered(numbered_buffer, story, styles)

            level = len(stripped) - len(stripped.lstrip("#"))
            text = stripped[level:].strip()
            style_map = {1: "H1", 2: "H1", 3: "H2", 4: "H3"}
            style_name = style_map.get(level, "H4")
            next_idx = idx + 1
            while next_idx < len(lines) and not lines[next_idx].strip():
                next_idx += 1

            if next_idx < len(lines) and lines[next_idx].strip().startswith("|"):
                table_lines = []
                probe_idx = next_idx
                while probe_idx < len(lines) and lines[probe_idx].strip().startswith("|"):
                    table_lines.append(lines[probe_idx].strip())
                    probe_idx += 1
                rows = [parse_table_line(table_line) for table_line in table_lines if not is_table_separator(table_line)]
                wide = max(len(r) for r in rows) >= 5
                if wide:
                    story.append(NextPageTemplate("landscape"))
                    story.append(PageBreak())
                    story.append(Paragraph(escape_and_format(text), styles[style_name if level != 1 else "H1"]))
                    story.append(build_table(rows, styles, wide=True))
                    story.append(Spacer(1, 0.1 * inch))
                    story.append(NextPageTemplate("portrait"))
                    story.append(PageBreak())
                    idx = probe_idx
                    continue

            if level == 1:
                story.append(Paragraph(escape_and_format(text), styles["H1"]))
            else:
                story.append(Paragraph(escape_and_format(text), styles[style_name]))
            idx += 1
            continue

        bullet_match = re.match(r"^- (.+)$", stripped)
        if bullet_match:
            flush_paragraph(paragraph_buffer, story, styles)
            flush_numbered(numbered_buffer, story, styles)
            bullet_buffer.append(bullet_match.group(1))
            idx += 1
            continue

        number_match = re.match(r"^\d+\.\s+(.+)$", stripped)
        if number_match:
            flush_paragraph(paragraph_buffer, story, styles)
            flush_bullets(bullet_buffer, story, styles)
            numbered_buffer.append(number_match.group(1))
            idx += 1
            continue

        if not stripped:
            flush_paragraph(paragraph_buffer, story, styles)
            flush_bullets(bullet_buffer, story, styles)
            flush_numbered(numbered_buffer, story, styles)
            idx += 1
            continue

        paragraph_buffer.append(stripped)
        idx += 1

    flush_paragraph(paragraph_buffer, story, styles)
    flush_bullets(bullet_buffer, story, styles)
    flush_numbered(numbered_buffer, story, styles)
    return story


def build_story(styles: StyleSheet1) -> list:
    markdown = SOURCE.read_text()
    title = source_title()
    story = [
        Spacer(1, 1.65 * inch),
        Paragraph("AXON TICKETS", styles["CoverEyebrow"]),
        Paragraph(escape_and_format(title), styles["CoverTitle"]),
        Paragraph("Controlled PDF edition", styles["CenterMeta"]),
        Spacer(1, 0.2 * inch),
        Paragraph(
            "Converted from the master Markdown package for easier sharing and review. This PDF preserves the complete document contents, including sections, tables, and workflow blocks.",
            ParagraphStyle(
                "CoverBody",
                parent=styles["Body"],
                alignment=TA_CENTER,
                fontSize=10.4,
                leading=15,
                textColor=PALETTE["muted"],
            ),
        ),
        Spacer(1, 0.35 * inch),
        Table(
            [
                [Paragraph("<b>Source</b>", styles["Small"]), Paragraph(escape_and_format(str(SOURCE)), styles["Small"])],
                [Paragraph("<b>Generated</b>", styles["Small"]), Paragraph(date.today().strftime("%B %d, %Y"), styles["Small"])],
            ],
            colWidths=[1.2 * inch, 4.8 * inch],
            hAlign="CENTER",
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), PALETTE["white"]),
                    ("BOX", (0, 0), (-1, -1), 0.6, PALETTE["line_dark"]),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, PALETTE["line"]),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ]
            ),
        ),
        PageBreak(),
    ]
    story.extend(parse_markdown(markdown, styles))
    return story


def build_pdf():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    styles = build_styles()

    doc = BaseDocTemplate(
        str(OUTPUT),
        pagesize=letter,
        leftMargin=0.72 * inch,
        rightMargin=0.72 * inch,
        topMargin=0.78 * inch,
        bottomMargin=0.78 * inch,
        title=source_title(),
        author="Codex",
    )

    portrait_frame = Frame(doc.leftMargin, doc.bottomMargin, letter[0] - doc.leftMargin - doc.rightMargin, letter[1] - doc.topMargin - doc.bottomMargin, id="portrait")
    landscape_size = landscape(letter)
    landscape_frame = Frame(doc.leftMargin, doc.bottomMargin, landscape_size[0] - doc.leftMargin - doc.rightMargin, landscape_size[1] - doc.topMargin - doc.bottomMargin, id="landscape")

    doc.addPageTemplates(
        [
            PageTemplate(id="cover", frames=[portrait_frame], onPage=cover_page, pagesize=letter),
            PageTemplate(id="portrait", frames=[portrait_frame], onPage=page_chrome, pagesize=letter),
            PageTemplate(id="landscape", frames=[landscape_frame], onPage=page_chrome, pagesize=landscape_size),
        ]
    )

    story = build_story(styles)
    story.insert(0, NextPageTemplate("cover"))
    story.insert(2, NextPageTemplate("portrait"))
    doc.build(story)


if __name__ == "__main__":
    build_pdf()
