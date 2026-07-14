from pathlib import Path

from PIL import Image, ImageDraw


for folder in ["qa-product", "qa-executive", "qa-privacy", "qa-security"]:
    files = sorted(Path("tmp/pdfs", folder).glob("*.png"))
    for start in range(0, len(files), 9):
        thumbs = []
        for index, path in enumerate(files[start : start + 9]):
            image = Image.open(path).convert("RGB")
            image.thumbnail((300, 390))
            card = Image.new("RGB", (320, 430), "white")
            card.paste(image, ((320 - image.width) // 2, 25))
            ImageDraw.Draw(card).text((8, 6), path.stem, fill="black")
            thumbs.append(card)

        sheet = Image.new("RGB", (960, 1290), "#cccccc")
        for index, image in enumerate(thumbs):
            sheet.paste(image, ((index % 3) * 320, (index // 3) * 430))
        sheet.save(
            Path("tmp/pdfs", f"{folder}-contact-{start // 9 + 1}.jpg"),
            quality=88,
        )
