"""Выгрузка текстового слоя Устава построчно с координатами.

Запуск (из каталога docs/charter):
    python extract-lines.py ustav.pdf ustav.lines.json

Зависимость: pdfplumber (pip install pdfplumber==0.11.9).
Выход детерминирован: тот же PDF и та же версия pdfplumber дают тот же файл
(проверяется по SHA256 в tests/charter-content.test.ts).

Что в выгрузке: для каждой страницы список строк текстового слоя в порядке
сверху вниз; text — как в слое (маркеры списков Wingdings/Symbol остаются
символами U+F0A7/U+F0B7, дефисы на концах строк сохранены, номера страниц
остаются отдельными строками справа внизу); x0/x1 — левый/правый край строки,
top/bottom — вертикальные границы, в пунктах PDF от левого верхнего угла.
Разбор в абзацы/списки/разделы делается позже, в scripts/build-charter-content.ts.
"""
import hashlib
import json
import sys

import pdfplumber


def main(pdf_path: str, out_path: str) -> None:
    sha = hashlib.sha256(open(pdf_path, "rb").read()).hexdigest()
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for number, page in enumerate(pdf.pages, 1):
            lines = [
                {
                    "text": ln["text"],
                    "x0": round(ln["x0"], 1),
                    "x1": round(ln["x1"], 1),
                    "top": round(ln["top"], 1),
                    "bottom": round(ln["bottom"], 1),
                }
                for ln in page.extract_text_lines()
            ]
            pages.append({"page": number, "lines": lines})
        page_size = [round(pdf.pages[0].width, 2), round(pdf.pages[0].height, 2)]
    out = {
        "source": {
            "file": "ustav.pdf",
            "sha256": sha,
            "pages": len(pages),
            "pageSize": page_size,
            "extractor": f"pdfplumber {pdfplumber.__version__} page.extract_text_lines()",
            "units": "pt, origin top-left; x0/x1 = left/right edge of the line, top/bottom = vertical extent",
        },
        "pages": pages,
    }
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
        fh.write("\n")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
