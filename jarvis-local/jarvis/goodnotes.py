"""Export von Zusammenfassungen fuer Goodnotes.

Goodnotes importiert am zuverlaessigsten PDF. Deshalb schreiben wir immer
Markdown (zum Weiterbearbeiten in Obsidian) plus eine druckfertige HTML-Datei
im A4-Layout: im Browser oeffnen, "Als PDF sichern", nach Goodnotes teilen.
"""

from __future__ import annotations

import datetime as dt
import html
import re
from pathlib import Path

HTML_TEMPLATE = """<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<title>{title}</title>
<style>
  @page {{ size: A4; margin: 18mm 16mm; }}
  body {{ font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color:#111;
         line-height:1.55; font-size:11.5pt; max-width:800px; margin:0 auto; padding:24px; }}
  h1 {{ font-size:21pt; margin:0 0 2px; border-bottom:2.5px solid #111; padding-bottom:8px; }}
  h2 {{ font-size:14pt; margin:22px 0 6px; color:#0b4f57; }}
  h3 {{ font-size:12pt; margin:16px 0 4px; }}
  .meta {{ color:#666; font-size:9.5pt; margin-bottom:22px; }}
  ul,ol {{ margin:6px 0 6px 20px; }}  li {{ margin:3px 0; }}
  code {{ background:#f2f4f5; padding:1px 5px; border-radius:3px; font-size:10pt; }}
  pre {{ background:#f7f8f9; border-left:3px solid #0b4f57; padding:10px 12px;
         overflow-x:auto; border-radius:3px; font-size:9.5pt; }}
  pre code {{ background:none; padding:0; }}
  blockquote {{ border-left:3px solid #ccc; margin:8px 0; padding:2px 14px; color:#444; }}
  .box {{ border:1.5px solid #0b4f57; border-radius:5px; padding:10px 14px; margin:14px 0;
          background:#f4fbfc; }}
  .writein {{ border:1px dashed #999; border-radius:5px; height:150px; margin-top:10px; }}
  @media print {{ body {{ padding:0; }} }}
</style></head>
<body>
<h1>{title}</h1>
<div class="meta">{meta}</div>
{body}
<h2>Eigene Notizen</h2>
<div class="writein"></div>
</body></html>
"""


class GoodnotesExport:
    def __init__(self, config):
        self.config = config

    def target_dir(self) -> Path:
        raw = self.config.get("paths.goodnotes_export") or ""
        if raw:
            path = Path(raw).expanduser()
        else:
            vault = self.config.vault
            path = (vault / "Goodnotes") if vault else Path(__file__).resolve().parent.parent / "export"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def write(self, title: str, markdown_body: str, subtitle: str = "") -> dict:
        """Schreibt <slug>.md und <slug>.html. Gibt beide Pfade zurueck."""
        stamp = dt.datetime.now()
        slug = f"{stamp:%Y-%m-%d}-{_slug(title)}"
        directory = self.target_dir()

        meta = subtitle or f"JARVIS Zusammenfassung // {stamp:%d.%m.%Y %H:%M}"
        md_path = directory / f"{slug}.md"
        md_path.write_text(
            f"# {title}\n\n> {meta}\n\n{markdown_body.strip()}\n\n---\n\n## Eigene Notizen\n\n\n",
            encoding="utf-8",
        )

        html_path = directory / f"{slug}.html"
        html_path.write_text(
            HTML_TEMPLATE.format(
                title=html.escape(title),
                meta=html.escape(meta),
                body=_md_to_html(markdown_body),
            ),
            encoding="utf-8",
        )
        return {
            "title": title,
            "markdown": str(md_path),
            "html": str(html_path),
            "directory": str(directory),
            "hint": "HTML im Browser oeffnen, drucken, 'Als PDF sichern', dann nach Goodnotes teilen.",
        }

    def from_vision(self, result: dict, topic: str = "") -> dict:
        mode = result.get("mode", "allgemein")
        title = topic or {"mathe": "Mathematik - geloeste Aufgabe",
                          "code": "Code-Erklaerung"}.get(mode, "Bildschirm-Analyse")
        return self.write(title, result.get("answer", ""),
                          subtitle=f"Analysiert am {dt.datetime.now():%d.%m.%Y um %H:%M}")

    def from_briefing(self, briefing: dict) -> dict:
        sections = briefing.get("sections", {})
        school = briefing.get("school", {})
        training = briefing.get("training", {})

        lines = ["## Wetter", sections.get("weather", "-"), "", "## Schule"]
        lessons = school.get("lessons") or []
        if lessons:
            lines.append("### Stundenplan")
            lines += [
                f"- {l.get('time') or '--:--'} {l['subject']}"
                + (f" ({l['room']})" if l.get("room") else "")
                for l in lessons
            ]
        homework = school.get("homework") or []
        if homework:
            lines += ["", "### Offene Aufgaben"]
            lines += [
                f"- [ ] {t['text']}" + (f"  _(faellig: {t['due']})_" if t.get("due") else "")
                for t in homework
            ]
        exams = school.get("exams") or []
        if exams:
            lines += ["", "### Anstehende Pruefungen"]
            lines += [f"- **{e['date_de']}** - {e['subject']} (in {e['days_left']} Tagen)" for e in exams]

        lines += ["", "## Training", f"**{training.get('title', '-')}**", training.get("detail", "")]
        if training.get("equipment"):
            lines += ["", "### Einpacken"]
            lines += [f"- [ ] {item}" for item in training["equipment"]]
        clothing = briefing.get("clothing")
        if clothing and clothing.get("items"):
            lines += ["", "### Bekleidung"]
            lines += [f"- {item}" for item in clothing["items"]]

        date = briefing.get("date", dt.date.today().isoformat())
        return self.write(f"Tagesuebersicht {date}", "\n".join(lines),
                          subtitle=f"JARVIS Briefing // {date}")


def _slug(text: str) -> str:
    replacements = {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss",
                    "Ä": "Ae", "Ö": "Oe", "Ü": "Ue"}
    for source, target in replacements.items():
        text = text.replace(source, target)
    text = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE).strip().lower()
    return re.sub(r"[\s_-]+", "-", text)[:60] or "notiz"


def _md_to_html(markdown: str) -> str:
    """Kleiner Markdown-Renderer - deckt ab, was Claude tatsaechlich ausgibt."""
    out: list[str] = []
    in_code = False
    list_type: str | None = None

    def close_list():
        nonlocal list_type
        if list_type:
            out.append(f"</{list_type}>")
            list_type = None

    for raw in markdown.splitlines():
        if raw.strip().startswith("```"):
            close_list()
            out.append("<pre><code>" if not in_code else "</code></pre>")
            in_code = not in_code
            continue
        if in_code:
            out.append(html.escape(raw))
            continue

        line = raw.rstrip()
        if not line.strip():
            close_list()
            continue

        heading = re.match(r"^(#{1,6})\s+(.*)$", line)
        if heading:
            close_list()
            level = min(max(len(heading.group(1)), 2), 6)  # h1 ist der Dokumenttitel
            out.append(f"<h{level}>{_inline(heading.group(2))}</h{level}>")
            continue

        checkbox = re.match(r"^\s*[-*+]\s*\[([ xX])\]\s*(.*)$", line)
        if checkbox:
            if list_type != "ul":
                close_list(); out.append("<ul>"); list_type = "ul"
            mark = "☑" if checkbox.group(1).lower() == "x" else "☐"
            out.append(f"<li>{mark} {_inline(checkbox.group(2))}</li>")
            continue

        bullet = re.match(r"^\s*[-*+]\s+(.*)$", line)
        if bullet:
            if list_type != "ul":
                close_list(); out.append("<ul>"); list_type = "ul"
            out.append(f"<li>{_inline(bullet.group(1))}</li>")
            continue

        numbered = re.match(r"^\s*\d+[.)]\s+(.*)$", line)
        if numbered:
            if list_type != "ol":
                close_list(); out.append("<ol>"); list_type = "ol"
            out.append(f"<li>{_inline(numbered.group(1))}</li>")
            continue

        quote = re.match(r"^\s*>\s?(.*)$", line)
        if quote:
            close_list()
            out.append(f"<blockquote>{_inline(quote.group(1))}</blockquote>")
            continue

        if re.match(r"^\s*([-*_])\s*(\1\s*){2,}$", line):
            close_list(); out.append("<hr>")
            continue

        close_list()
        out.append(f"<p>{_inline(line)}</p>")

    if in_code:
        out.append("</code></pre>")
    close_list()
    return "\n".join(out)


def _inline(text: str) -> str:
    text = html.escape(text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<![\w*])\*([^*\n]+)\*(?![\w*])", r"<em>\1</em>", text)
    text = re.sub(r"(?<![\w_])__([^_\n]+)__(?![\w_])", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<![\w_])_([^_\n]+)_(?![\w_])", r"<em>\1</em>", text)
    return text
