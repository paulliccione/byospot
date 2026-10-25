# Renders the BYOSpot pin + wordmark and PWA icons.
# The attached logo artwork was not present as files in this checkout, so this
# redraws it: burgundy map pin, white wine glass, navy ground and "Spot".
# Run: python3 make_icons.py
from pathlib import Path

import cairosvg
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
ICONS = ROOT / "icons"
FONT = Path("/usr/share/fonts/truetype/poppins/Poppins-ExtraBold.ttf")
if not FONT.exists():
    FONT = Path("/home/ubuntu/.local/share/fonts/Poppins-ExtraBold.ttf")
if not FONT.exists():
    FONT = Path("/tmp/fonts/Poppins-ExtraBold.ttf")

BURGUNDY = "#800020"
BURGUNDY_RGB = (128, 0, 32, 255)
NAVY = "#001838"
NAVY_RGB = (0, 24, 56, 255)
WHITE = "#ffffff"

PIN_SVG = f'''<svg xmlns="http://www.w3.org/2000/svg" width="280" height="320" viewBox="0 0 280 320">
  <ellipse cx="140" cy="300" rx="58" ry="15" fill="{NAVY}"/>
  <path fill="{BURGUNDY}" d="M62 176 A100 100 0 1 1 218 176 L140 286 Z"/>
  <path fill="{WHITE}" d="M96 108
    C96 66 184 66 184 108
    C184 142 162 158 140 164
    C118 158 96 142 96 108Z"/>
  <path fill="{BURGUNDY}" d="M106 118
    C118 104 132 112 140 118
    C148 112 162 104 174 118
    C172 140 158 154 140 156
    C122 154 108 140 106 118Z"/>
  <path d="M108 116 C122 104 132 114 140 118 C148 114 158 104 172 116"
    fill="none" stroke="{WHITE}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="133" y="160" width="14" height="64" rx="7" fill="{WHITE}"/>
  <ellipse cx="140" cy="230" rx="30" ry="9" fill="{WHITE}"/>
</svg>'''

ICON_PIN = f'''<svg xmlns="http://www.w3.org/2000/svg" width="320" height="360" viewBox="0 0 280 320">
  <ellipse cx="140" cy="300" rx="58" ry="15" fill="{WHITE}"/>
  <path fill="{WHITE}" d="M62 176 A100 100 0 1 1 218 176 L140 286 Z"/>
  <path d="M96 108
    C96 66 184 66 184 108
    C184 142 162 158 140 164
    C118 158 96 142 96 108Z"
    fill="none" stroke="{BURGUNDY}" stroke-width="10" stroke-linejoin="round"/>
  <path fill="{BURGUNDY}" d="M108 120
    C120 106 132 114 140 120
    C148 114 160 106 172 120
    C170 142 156 154 140 156
    C124 154 110 142 108 120Z"/>
  <rect x="133" y="162" width="14" height="58" rx="7" fill="{BURGUNDY}"/>
  <ellipse cx="140" cy="226" rx="28" ry="9" fill="{BURGUNDY}"/>
</svg>'''


def render_svg(svg, dest, width):
    cairosvg.svg2png(bytestring=svg.encode("utf-8"), write_to=str(dest), output_width=width)


def crop_alpha(im, pad=0):
    box = im.getbbox()
    if not box:
        return im
    l, t, r, b = box
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(im.width, r + pad)
    b = min(im.height, b + pad)
    return im.crop((l, t, r, b))


def text_image(text, size, color):
    font = ImageFont.truetype(str(FONT), size)
    # Measure ink with an anchor at the left baseline via getbbox offset.
    probe = Image.new("RGBA", (size * len(text) + 40, size * 2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(probe)
    draw.text((0, 0), text, font=font, fill=color)
    return crop_alpha(probe, 0)


def build_lockup():
    pin_path = ICONS / "_pin.png"
    render_svg(PIN_SVG, pin_path, 800)
    pin = crop_alpha(Image.open(pin_path).convert("RGBA"), 0)
    byo = text_image("BYO", 248, BURGUNDY_RGB)
    spot = text_image("Spot", 164, NAVY_RGB)
    gap_x = 36
    gap_y = 8
    text_w = max(byo.width, spot.width)
    text_h = byo.height + gap_y + spot.height
    # Scale the pin so its height matches the stacked wordmark.
    scale = text_h / pin.height
    pin = pin.resize((max(1, int(pin.width * scale)), text_h), Image.Resampling.LANCZOS)
    width = pin.width + gap_x + text_w
    canvas = Image.new("RGBA", (width, text_h), (0, 0, 0, 0))
    canvas.paste(pin, (0, 0), pin)
    text_x = pin.width + gap_x
    canvas.paste(byo, (text_x, 0), byo)
    canvas.paste(spot, (text_x, byo.height + gap_y), spot)
    out = crop_alpha(canvas, 6)
    out.save(ICONS / "logo-horizontal.png", optimize=True)
    pin_path.unlink(missing_ok=True)
    return out


def rounded_rect(size, radius, color):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=color)
    return im


def build_icons():
    pin = Image.open(ICONS / "_iconpin.png") if False else None
    tmp = ICONS / "_iconpin.png"
    render_svg(ICON_PIN, tmp, 640)
    mark = crop_alpha(Image.open(tmp).convert("RGBA"), 0)
    tmp.unlink(missing_ok=True)

    def compose(size, radius, bleed=False):
        bg = Image.new("RGBA", (size, size), BURGUNDY_RGB if bleed else (0, 0, 0, 0))
        if not bleed:
            plate = rounded_rect(size, radius, BURGUNDY_RGB)
            bg.paste(plate, (0, 0), plate)
        # Keep the pin inside the maskable safe zone (~80%).
        inner = int(size * (0.62 if bleed else 0.70))
        scale = inner / max(mark.width, mark.height)
        resized = mark.resize((max(1, int(mark.width * scale)), max(1, int(mark.height * scale))), Image.Resampling.LANCZOS)
        x = (size - resized.width) // 2
        y = (size - resized.height) // 2 - int(size * 0.01)
        bg.paste(resized, (x, y), resized)
        return bg

    compose(192, 42).save(ICONS / "icon-192.png", optimize=True)
    compose(512, 112).save(ICONS / "icon-512.png", optimize=True)
    compose(180, 40).save(ICONS / "apple-touch-icon.png", optimize=True)
    compose(512, 0, bleed=True).convert("RGB").save(ICONS / "icon-maskable-512.png", optimize=True)


def main():
    ICONS.mkdir(exist_ok=True)
    if not FONT.exists():
        raise SystemExit("Poppins ExtraBold was not found; logo text cannot be rendered.")
    build_lockup()
    build_icons()
    (ICONS / "logo-mark.svg").write_text(PIN_SVG, encoding="utf-8")
    print("wrote logo and icons")


if __name__ == "__main__":
    main()
