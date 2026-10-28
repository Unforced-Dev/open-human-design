#!/usr/bin/env python3
"""Narrated summary of the OHD hardening branch, signed as Uni: what was open, what's closed.
Slides are 1280x720 PIL drawings around the real screenshots in this folder; one Kokoro line per scene.
Adapted from uni-ops/research/ohd-audit/tools/make_video.py.
Run: ~/studio/.venv/bin/python make_video.py OUTDIR  -> OUTDIR/ohd-hardening.mp4 and narration.md here."""
import hashlib
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 1280, 720
BG, FG, DIM, OK, BAD, ACC = "#14161b", "#e8e6e1", "#8b8f98", "#6fcf8f", "#ef6b6b", "#7cb7ff"
SANS = "/usr/share/fonts/noto/NotoSans-Regular.ttf"
SANSB = "/usr/share/fonts/noto/NotoSans-Bold.ttf"
MONO = "/usr/share/fonts/noto/NotoSansMono-Regular.ttf"


def font(path, size):
    return ImageFont.truetype(path if os.path.exists(path) else MONO, size)


class Slide:
    def __init__(self, title, kicker="Uni · Open HD hardening · 2026-10-28"):
        self.im = Image.new("RGB", (W, H), BG)
        self.d = ImageDraw.Draw(self.im)
        self.d.text((60, 30), kicker, font=font(SANS, 20), fill=DIM)
        self.d.text((60, 58), title, font=font(SANSB, 36), fill=FG)
        self.y, self.x = 135, 60

    def text(self, s, size=24, color=FG, bold=False, mono=False, gap=12):
        f = font(MONO if mono else (SANSB if bold else SANS), size)
        self.d.text((self.x, self.y), s, font=f, fill=color)
        self.y += size + gap

    def image(self, name, box, label=None, color=DIM, crop=None):
        x, y, w, h = box
        im = Image.open(os.path.join(HERE, name)).convert("RGB")
        if crop:
            im = im.crop(crop)
        im.thumbnail((w, h), Image.LANCZOS)
        self.im.paste(im, (x, y))
        self.d.rectangle([x - 1, y - 1, x + im.width, y + im.height], outline="#3a3f4a")
        if label:
            self.d.text((x, y - 30), label, font=font(SANSB, 20), fill=color)


def s_title():
    s = Slide("What was open, and what's closed")
    for t in ["Branch: hardening, on top of origin/main.", "Not pushed, not deployed.", "",
              "1. Consent phishing and Worker hardening", "2. Invite-to-compare with a blank name",
              "3. Connect your AI before signing in", "4. Privacy quick wins"]:
        s.text(t, 26, DIM if t.startswith(("Branch", "Not")) else FG)
    return s, ("Hi Aaron, it's Uni. Here's the Open Human Design hardening pass: what was open, and what's closed. "
               "Nothing is pushed or deployed.")


def s_phish():
    s = Slide("1 · One link could hand a stranger your people")
    s.image("01-consent-phish-before.png", (40, 160, 590, 470), "Before: name only", BAD, crop=(250, 170, 750, 590))
    s.image("02-consent-phish-after.png", (650, 160, 590, 470), "After: the real address, and a warning", OK, crop=(250, 80, 750, 680))
    return s, ("The big one. A fake app called Claude, one link, one click, and a stranger could read and delete "
               "someone's saved people. Now consent shows where access really goes and warns for unknown apps. "
               "PKCE is required, and read-only means read-only.")


def s_probe():
    s = Slide("The audit's attack, replayed on a local copy")
    rows = [("Consent shows only a name; no PKCE; plain PKCE", "open", "closed"),
            ("Code exchanged with no verifier: 30-day access", "open", "closed"),
            ("Read-only token deletes people; % finds hidden names", "open", "closed"),
            ("Sign-in emails: rotate one header, send forever", "open", "closed"),
            ("Sync stores 400 KB junk and unlimited deletions", "open", "closed"),
            ("No CSP, HSTS, frame or nosniff headers; http served", "open", "closed"),
            ("Share previews repeat place + coordinates; indexable", "open", "closed")]
    s.d.text((60, s.y), "origin/main", font=font(SANSB, 22), fill=BAD)
    s.d.text((300, s.y), "hardening", font=font(SANSB, 22), fill=OK)
    s.y += 40
    for t, a, b in rows:
        s.d.text((60, s.y), a, font=font(SANSB, 22), fill=BAD)
        s.d.text((300, s.y), b, font=font(SANSB, 22), fill=OK)
        s.d.text((450, s.y), t, font=font(SANS, 22), fill=FG)
        s.y += 46
    s.y += 10
    s.text("tests/security-probe.mjs: 19 steps open before, 0 after", 22, ACC, mono=True)
    return s, ("I replayed the audit's attack on a local copy. Nineteen steps worked before. None work now, "
               "including email bombing, sync flooding and the missing headers.")


def s_connect():
    s = Slide("3 · Connect your AI, in the usual order")
    s.image("08-connect-after-magic-link-before.png", (40, 160, 590, 380), "Before: after the email link", BAD, crop=(0, 0, 640, 300))
    s.image("09-connect-after-magic-link-after.png", (650, 160, 590, 470), "After: straight to consent", OK, crop=(250, 50, 750, 590))
    s.d.text((40, 560), "Checked end to end with the official MCP client:", font=font(SANS, 20), fill=DIM)
    s.d.text((40, 590), "sign in, consent, token, then save and chart by name.", font=font(SANS, 20), fill=DIM)
    return s, ("Connecting your AI before signing in used to end on a raw error. Now the request waits on the server "
               "under a short id, and the email link lands on consent. Tested end to end with the official MCP client.")


def s_invite():
    s = Slide("2 · Invite to compare, with Name left blank")
    s.image("06-invite-blank-name-before.png", (40, 160, 590, 470), "Before: nothing to compare", BAD, crop=(0, 60, 760, 520))
    s.image("07-invite-blank-name-after.png", (650, 160, 590, 470), "After: the comparison", OK, crop=(0, 60, 760, 520))
    return s, ("Invite to compare showed nothing if the newcomer left the optional name blank. That's fixed, and the "
               "end-to-end tests now run it with and without a name.")


def s_privacy():
    s = Slide("4 · Privacy quick wins")
    s.image("05-invite-entry-after.png", (40, 150, 560, 480), crop=(250, 260, 750, 470))
    s.x, s.y = 640, 160
    s.text("Fonts served by us: Google no longer", 24)
    s.text("sees every visit.", 24, gap=26)
    s.text("Share previews: just date, time,", 24)
    s.text("offset and name. Not indexed.", 24, gap=26)
    s.text("Copy: stays on your device", 24, OK)
    s.text("unless you share it.", 24, OK, gap=26)
    s.text("Not done: chart state in the URL", 22, DIM)
    s.text("fragment. That needs your look.", 22, DIM)
    return s, ("Privacy. Fonts come from our own site, so Google no longer sees every visit. Share previews drop the "
               "place and coordinates and aren't indexed. The copy now says unless you share it. The URL fragment change "
               "waits for your look.")


def s_end():
    s = Slide("What it needs from you")
    s.text("Your go-ahead to deploy. Before deploying:", 26, gap=20)
    s.text("npx wrangler d1 migrations apply open-human-design --remote", 20, ACC, mono=True, gap=26)
    s.text("(one new table for the sign-in rate limit; additive)", 22, DIM, gap=30)
    s.text("Tests: 122 unit, e2e, connect flow, security probe — all green.", 24, OK)
    s.text("Walkthrough + numbers: WALKTHROUGH.md on the branch.", 24)
    return s, ("To ship it, it needs your go-ahead, and the one new database table applied first. The tests are green. "
               "The details are in the walkthrough on the branch. That's it from Uni.")


SCENES = [s_title, s_phish, s_probe, s_connect, s_invite, s_privacy, s_end]


def tts(k, text, path):
    import soundfile as sf
    if not os.path.exists(path):
        a, sr = k.create(text, voice="af_heart", speed=1.1, lang="en-us")
        sf.write(path, a, sr)
    info = sf.info(path)
    return info.frames / info.samplerate


def main():
    out = os.path.abspath(sys.argv[1])
    os.makedirs(out, exist_ok=True)
    from kokoro_onnx import Kokoro
    K = os.path.expanduser("~/.local/share/kokoro")
    k = Kokoro(f"{K}/kokoro.onnx", f"{K}/voices.bin")
    parts, script, total = [], [], 0.0
    for i, fn in enumerate(SCENES, 1):
        slide, say = fn()
        png = os.path.join(out, f"{i:02d}.png")
        slide.im.save(png)
        wav = os.path.join(out, f"{i:02d}-{hashlib.sha256(say.encode()).hexdigest()[:10]}.wav")
        dur = tts(k, say, wav)
        mp4 = os.path.join(out, f"{i:02d}.mp4")
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-loop", "1", "-i", png, "-i", wav, "-filter_complex",
                        "[0:v]fps=10,format=yuv420p[v];[1:a]aresample=48000,apad[a]", "-map", "[v]", "-map", "[a]",
                        "-t", f"{dur + 0.6:.2f}", "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage",
                        "-c:a", "aac", "-b:a", "96k", mp4], check=True)
        parts.append(mp4)
        total += dur + 0.6
        script.append(f"## Scene {i} ({dur:.1f} s)\n\n{say}\n")
        print(i, f"{dur:.1f}s", flush=True)
    lst = os.path.join(out, "parts.txt")
    open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
    final = os.path.join(out, "ohd-hardening.mp4")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lst, "-map_metadata", "-1",
                    "-c:v", "libx264", "-crf", "24", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", final],
                   check=True)
    open(os.path.join(HERE, "narration.md"), "w").write(
        f"# OHD hardening video: narration (signed as Uni, {total:.0f} s)\n\n" + "\n".join(script))
    print(final, f"{total:.1f}s")


if __name__ == "__main__":
    main()
