# Builds BYO Spot icons from the locked brand mark (teal bottle + coral pin).
# Source: icons/logo-source.jpg (copy of /workspace/byospot-logo-bottle.jpg)
# Run: python3 make_icons.py
from PIL import Image
from pathlib import Path

SRC = Path("icons/logo-source.jpg")
CREAM = (251, 246, 239, 255)

def square_icon(size, pad_frac=0.0):
    img = Image.open(SRC).convert("RGBA")
    canvas = Image.new("RGBA", (size, size), CREAM)
    if pad_frac > 0:
        inner = int(size * (1 - 2 * pad_frac))
        mark = img.copy()
        mark.thumbnail((inner, inner), Image.LANCZOS)
        x = (size - mark.width) // 2
        y = (size - mark.height) // 2
        canvas.paste(mark, (x, y), mark)
        return canvas
    return img.resize((size, size), Image.LANCZOS)

def main():
    square_icon(512).convert("RGB").save("icons/icon-512.png")
    square_icon(192).convert("RGB").save("icons/icon-192.png")
    square_icon(180).convert("RGB").save("icons/apple-touch-icon.png")
    square_icon(512, pad_frac=0.12).convert("RGB").save("icons/icon-maskable-512.png")
    print("icons written from", SRC)

if __name__ == "__main__":
    main()
