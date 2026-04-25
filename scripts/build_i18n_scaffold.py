#!/usr/bin/env python3

from __future__ import annotations

import json
import re
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path
from copy import deepcopy


ROOT = Path(__file__).resolve().parents[1]
LOCALES_DIR = ROOT / "locales"

FILES = [
    "index.html",
    "about.html",
    "ultraviolet-city.html",
    "immersive-sketching.html",
    "holo-botanics.html",
    "ar-apps.html",
    "contact.html",
]

PAGE_TARGETS = [
    ("section-title-lg", "section-title-lg"),
    ("section-title", "section-title"),
    ("section-subtitle", "section-subtitle"),
    ("page-title-centered", "page-title-centered"),
    ("page-title", "page-title"),
    ("sub-title", "sub-title"),
    ("img-cap-title", "img-cap-title"),
    ("img-cap-body", "img-cap-body"),
    ("img-caption", "img-caption"),
    ("garden-name", "garden-name"),
    ("garden-desc", "garden-desc"),
    ("video-heading", "video-heading"),
    ("video-quality-note", "video-quality-note"),
    ("overlay-title-top", "overlay-title-top"),
    ("overlay-caption-body", "overlay-caption-body"),
    ("overlay-bottom-left-title", "overlay-bottom-left-title"),
    ("overlay-center-bottom", "overlay-center-bottom"),
    ("caption-below-bar", "caption-below-bar"),
    ("caption-below", "caption-below"),
    ("caption", "caption"),
    ("compare-caption", "compare-caption"),
    ("body-text", "body-text"),
    ("questions", "questions"),
    ("styled-list", "styled-list"),
    ("pull-quote", "pull-quote"),
    ("label", "label"),
    ("tech-label", "tech-label"),
    ("tech-value", "tech-value"),
    ("tech-subsection-heading", "tech-subsection-heading"),
    ("tech-app-name", "tech-app-name"),
    ("tech-app-desc", "tech-app-desc"),
    ("contact-title", "contact-title"),
    ("contact-text", "contact-text"),
]

GLOBAL_NAV_KEYS = {
    "about.html": "nav.about",
    "ultraviolet-city.html": "nav.ultraviolet-city",
    "immersive-sketching.html": "nav.immersive-sketching",
    "holo-botanics.html": "nav.holo-botanics",
    "ar-apps.html": "nav.ar-apps",
    "contact.html": "nav.contact",
}

INDEX_SPECIALS = {
    r'(<span class="lang-section-label")(>)': "overlay.language-label",
    r'(<div class="settings-hint" id="settings-hint")(>)': "overlay.settings-hint",
    r'(<span class="setting-label" id="snd-label")(>)': "overlay.sound-label",
    r'(<span class="setting-label" id="fs-label")(>)': "overlay.fullscreen-label",
    r'(<button class="settings-enter" id="settings-enter")(>)': "overlay.enter-button",
    r'(<div class="spolia-subtitle landing-el")(>)': "landing.subtitle",
    r'(<div class="details")(>)': "landing.details",
    r'(<button class="enter-button" id="discover-btn")(>)': "landing.discover-button",
    r'(<div class="copyright landing-el")(>)': "landing.copyright",
}

def add_data_i18n_to_opening_tag(open_tag: str, key: str) -> str:
    if "data-i18n=" in open_tag:
        return open_tag
    return open_tag[:-1] + f' data-i18n="{key}">'


def annotate_specials(html: str, specials: dict[str, str]) -> str:
    for pattern, key in specials.items():
        regex = re.compile(pattern)

        def repl(match: re.Match[str]) -> str:
            full = match.group(0)
            if "data-i18n=" in full:
                return full
            if full.endswith(">") and not full.endswith("/>"):
                return add_data_i18n_to_opening_tag(full, key)
            return full

        html = regex.sub(repl, html, count=1)
    return html


def annotate_nav_links(html: str) -> str:
    for target, key in GLOBAL_NAV_KEYS.items():
        regex = re.compile(
            rf'(<a class="[^"]*\bnav-link\b[^"]*"[^>]*(?:href|data-href)="{re.escape(target)}"[^>]*)(>)'
        )
        html = regex.sub(
            lambda m: m.group(0)
            if "data-i18n=" in m.group(0)
            else f'{m.group(1)} data-i18n="{key}"{m.group(2)}',
            html,
        )
    return html


SECTION_RE = re.compile(
    r'(<section\b[^>]*\bid="(?P<id>[^"]+)"[^>]*>)(?P<content>.*?)(</section>)',
    re.S,
)

OPENING_TAG_RE = re.compile(
    r'<(?P<tag>[a-zA-Z0-9]+)(?P<attrs>[^>]*?\bclass="(?P<class>[^"]+)"[^>]*?)>',
    re.S,
)


def annotate_sections(html: str) -> str:
    def section_repl(match: re.Match[str]) -> str:
        section_id = match.group("id")
        content = match.group("content")
        counts: dict[str, int] = defaultdict(int)

        def tag_repl(tag_match: re.Match[str]) -> str:
            open_tag = tag_match.group(0)
            if "data-i18n=" in open_tag:
                return open_tag

            classes = set(tag_match.group("class").split())
            for class_name, slug in PAGE_TARGETS:
                if class_name in classes:
                    counts[slug] += 1
                    key = f"{section_id}.{slug}-{counts[slug]}"
                    return add_data_i18n_to_opening_tag(open_tag, key)
            return open_tag

        updated_content = OPENING_TAG_RE.sub(tag_repl, content)
        return match.group(1) + updated_content + match.group(4)

    return SECTION_RE.sub(section_repl, html)


TITLE_RE = re.compile(r"<title>(.*?)</title>", re.S)


class I18nParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.title = ""
        self._in_title = False
        self._stack: list[dict[str, object]] = []
        self.entries: dict[str, str] = {}

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        raw = self.get_starttag_text()

        for item in self._stack:
            item["parts"].append(raw)
            if item["tag"] == tag:
                item["depth"] += 1

        if tag == "title":
            self._in_title = True

        key = attrs_dict.get("data-i18n")
        if key:
            self._stack.append({"tag": tag, "key": key, "parts": [], "depth": 1})

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False

        if self._stack:
            current = self._stack[-1]
            if current["tag"] == tag and current["depth"] == 1:
                finished = self._stack.pop()
                self.entries[finished["key"]] = "".join(finished["parts"]).strip()
                return

        for item in self._stack:
            item["parts"].append(f"</{tag}>")
            if item["tag"] == tag:
                item["depth"] -= 1

    def handle_startendtag(self, tag, attrs):
        raw = self.get_starttag_text()
        for item in self._stack:
            item["parts"].append(raw)

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        for item in self._stack:
            item["parts"].append(data)

    def handle_entityref(self, name):
        token = f"&{name};"
        if self._in_title:
            self.title += token
        for item in self._stack:
            item["parts"].append(token)

    def handle_charref(self, name):
        token = f"&#{name};"
        if self._in_title:
            self.title += token
        for item in self._stack:
            item["parts"].append(token)

    def handle_comment(self, data):
        token = f"<!--{data}-->"
        for item in self._stack:
            item["parts"].append(token)


def build_locale_payload() -> dict[str, object]:
    payload = {"global": {}, "pages": {}, "titles": {}}

    for filename in FILES:
        html = (ROOT / filename).read_text()
        parser = I18nParser()
        parser.feed(html)

        stem = Path(filename).stem
        payload["titles"][stem] = parser.title.strip()

        page_entries = {}
        for key, value in parser.entries.items():
            if key.startswith("nav."):
                payload["global"][key] = value
            else:
                page_entries[key] = value
        payload["pages"][stem] = page_entries

    return payload


def deep_merge_preserve(existing, scaffold):
    if isinstance(existing, dict) and isinstance(scaffold, dict):
        merged = deepcopy(scaffold)
        for key, value in existing.items():
            if key in merged:
                merged[key] = deep_merge_preserve(value, merged[key])
            else:
                merged[key] = value
        return merged
    return existing


def main() -> None:
    for filename in FILES:
        path = ROOT / filename
        html = path.read_text()
        html = annotate_nav_links(html)
        html = annotate_sections(html)

        if filename == "index.html":
            html = annotate_specials(html, INDEX_SPECIALS)
        path.write_text(html)

    payload = build_locale_payload()
    LOCALES_DIR.mkdir(exist_ok=True)
    en_path = LOCALES_DIR / "en.json"
    fr_path = LOCALES_DIR / "fr.json"

    en_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")

    if fr_path.exists():
      try:
        existing_fr = json.loads(fr_path.read_text())
      except Exception:
        existing_fr = {}
      fr_payload = deep_merge_preserve(existing_fr, payload)
    else:
      fr_payload = payload

    fr_path.write_text(json.dumps(fr_payload, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
