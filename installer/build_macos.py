"""Build the unsigned macOS app. ODA is not copied into the bundle."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pack_version import ROOT, app_version

OUTPUT_APP = ROOT / "dist" / "Tuyi.app"
APP_EXECUTABLE = OUTPUT_APP / "Contents" / "MacOS" / "Tuyi"
CLI_EXECUTABLE = OUTPUT_APP / "Contents" / "MacOS" / "tuyi-cli"
ICNS_PATH = ROOT / "build" / "Tuyi.icns"
PNG_ICON = ROOT / "docs" / "icons" / "app.png"
DMG_BACKGROUND = Path(__file__).resolve().parent / "dmg-background.png"
DMG_VOLNAME = "图译"
DMG_WINDOW = (540, 360)
DMG_ICON_SIZE = 128
DMG_APP_POS = (140, 165)
DMG_APPS_POS = (400, 165)


def run(*command: str, cwd: Path = ROOT, env: dict[str, str] | None = None) -> None:
    subprocess.run(command, cwd=cwd, env=env, check=True)


def architectures(binary: Path) -> set[str]:
    output = subprocess.check_output(["lipo", "-archs", str(binary)], text=True)
    return set(output.strip().split())


def write_icns() -> None:
    if sys.platform != "darwin" or not PNG_ICON.is_file():
        return
    iconset = ROOT / "build" / "Tuyi.iconset"
    if iconset.exists():
        shutil.rmtree(iconset)
    iconset.mkdir(parents=True, exist_ok=True)
    for size, retina in (
        (16, False),
        (16, True),
        (32, False),
        (32, True),
        (128, False),
        (128, True),
        (256, False),
        (256, True),
        (512, False),
        (512, True),
    ):
        pixel = size * (2 if retina else 1)
        name = f"icon_{size}x{size}{'@2x' if retina else ''}.png"
        run("sips", "-z", str(pixel), str(pixel), str(PNG_ICON), "--out", str(iconset / name))
    ICNS_PATH.parent.mkdir(parents=True, exist_ok=True)
    run("iconutil", "-c", "icns", "-o", str(ICNS_PATH), str(iconset))


def prepare_dmg_staging(app: Path, staging: Path) -> None:
    """Tuyi.app + Applications symlink. Never pass the .app itself to -srcfolder."""
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)
    shutil.copytree(app, staging / "Tuyi.app", symlinks=True)
    (staging / "Applications").symlink_to("/Applications")
    if DMG_BACKGROUND.is_file():
        background_dir = staging / ".background"
        background_dir.mkdir()
        shutil.copy2(DMG_BACKGROUND, background_dir / "background.png")


def _hdiutil_mount(text: str) -> tuple[str, str]:
    device = ""
    mount = ""
    for line in text.splitlines():
        parts = line.split()
        if not parts:
            continue
        if parts[0].startswith("/dev/") and (not device or "s" in parts[0][5:]):
            device = parts[0]
        for part in parts[1:]:
            if part.startswith("/Volumes/"):
                mount = part
                device = parts[0]
    if not device or not mount:
        raise RuntimeError(f"hdiutil attach did not return a mount point:\n{text}")
    return device, mount


def _detach(device: str) -> None:
    for _ in range(8):
        if subprocess.run(["hdiutil", "detach", device, "-quiet"]).returncode == 0:
            return
        time.sleep(1)
    run("hdiutil", "detach", device, "-force")


def layout_dmg_window(volname: str) -> None:
    """Finder icon view: app on the left, Applications on the right."""
    width, height = DMG_WINDOW
    ax, ay = DMG_APP_POS
    bx, by = DMG_APPS_POS
    script = f'''
tell application "Finder"
  tell disk "{volname}"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set bounds of container window to {{100, 100, {100 + width}, {100 + height}}}
    set theViewOptions to the icon view options of container window
    set arrangement of theViewOptions to not arranged
    set icon size of theViewOptions to {DMG_ICON_SIZE}
    try
      set background picture of theViewOptions to file ".background:background.png"
    end try
    set position of item "Tuyi.app" of container window to {{{ax}, {ay}}}
    set position of item "Applications" of container window to {{{bx}, {by}}}
    update without registering applications
    delay 1
    close
    open
    delay 1
    close
  end tell
end tell
'''
    subprocess.run(["osascript", "-e", script], check=True)


def create_drag_install_dmg(app: Path, dmg_output: Path, volname: str = DMG_VOLNAME) -> None:
    """Writable HFS+ image, Finder layout, then UDZO. Always includes Applications."""
    build_dir = ROOT / "build"
    build_dir.mkdir(parents=True, exist_ok=True)
    staging = build_dir / "dmg-root"
    rw = build_dir / "tuyi-rw.dmg"
    prepare_dmg_staging(app, staging)
    if rw.exists():
        rw.unlink()
    if dmg_output.exists():
        dmg_output.unlink()
    run(
        "hdiutil",
        "create",
        "-volname",
        volname,
        "-srcfolder",
        str(staging),
        "-fs",
        "HFS+",
        "-fsargs",
        "-c c=64,a=16,e=16",
        "-format",
        "UDRW",
        "-ov",
        str(rw),
    )
    limits = subprocess.check_output(["hdiutil", "resize", "-limits", str(rw)], text=True).strip().split()
    try:
        current = int(limits[0])
        run("hdiutil", "resize", "-sectors", str(current + 40000), str(rw))
    except (IndexError, ValueError):
        pass
    attached = subprocess.check_output(
        ["hdiutil", "attach", "-readwrite", "-noverify", "-noautoopen", str(rw)],
        text=True,
    )
    device, mount = _hdiutil_mount(attached)
    try:
        background_dir = Path(mount) / ".background"
        if background_dir.is_dir():
            subprocess.run(["chflags", "hidden", str(background_dir)], check=False)
        try:
            layout_dmg_window(volname)
        except subprocess.CalledProcessError:
            print("Finder DMG layout skipped (no GUI); Applications drop link is still in the image.")
        subprocess.run(["bless", "--folder", mount, "--openfolder", mount], check=False)
        time.sleep(1)
    finally:
        _detach(device)
    run(
        "hdiutil",
        "convert",
        str(rw),
        "-format",
        "UDZO",
        "-imagekey",
        "zlib-level=9",
        "-ov",
        "-o",
        str(dmg_output),
    )
    rw.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--identity",
        default="-",
        help="Developer ID Application identity; '-' creates a local ad-hoc signature",
    )
    parser.add_argument("--skip-frontend", action="store_true")
    parser.add_argument("--dmg", action="store_true", help="Create a compressed distributable DMG after building the app")
    parser.add_argument("--dmg-output", type=Path, help="DMG output path (requires --dmg)")
    args = parser.parse_args()

    if sys.platform != "darwin":
        raise SystemExit("macOS pack must run on macOS")
    if "--oda-dmg" in sys.argv:
        raise SystemExit("ODA is not packed. Install ODA File Converter yourself.")

    version = app_version()

    if not args.skip_frontend:
        run("npm", "ci", cwd=ROOT / "frontend")
        run("npm", "run", "build", cwd=ROOT / "frontend")

    try:
        write_icns()
    except subprocess.CalledProcessError:
        if ICNS_PATH.exists():
            ICNS_PATH.unlink()

    build_env = os.environ.copy()
    if args.identity != "-":
        build_env["MACOS_CODESIGN_IDENTITY"] = args.identity
    else:
        build_env.pop("MACOS_CODESIGN_IDENTITY", None)
    run(
        sys.executable,
        "-m",
        "PyInstaller",
        "--clean",
        "--noconfirm",
        "Tuyi_macos.spec",
        env=build_env,
    )
    if not APP_EXECUTABLE.is_file():
        raise SystemExit(f"macOS build output is missing: {APP_EXECUTABLE}")
    if not CLI_EXECUTABLE.is_file():
        raise SystemExit(f"macOS CLI is missing: {CLI_EXECUTABLE}")
    if (OUTPUT_APP / "Contents" / "Resources" / "ODAFileConverter.dmg").exists():
        raise SystemExit("ODA DMG must not be inside the app")

    sign_command = ["codesign", "--force", "--deep", "--sign", args.identity]
    if args.identity != "-":
        sign_command.extend(["--options", "runtime", "--timestamp"])
    sign_command.append(str(OUTPUT_APP))
    run(*sign_command)
    run("codesign", "--verify", "--deep", "--strict", "--verbose=2", str(OUTPUT_APP))

    app_arches = architectures(APP_EXECUTABLE)
    if args.dmg_output and not args.dmg:
        raise SystemExit("--dmg-output requires --dmg")
    if args.dmg:
        arch = next(iter(sorted(app_arches)))
        dmg_output = (args.dmg_output or ROOT / "dist" / f"Tuyi_v{version}_macOS_{arch}.dmg")
        dmg_output = dmg_output.expanduser().resolve()
        if dmg_output.suffix.lower() != ".dmg":
            raise SystemExit(f"DMG output must end in .dmg: {dmg_output}")
        dmg_output.parent.mkdir(parents=True, exist_ok=True)
        create_drag_install_dmg(OUTPUT_APP, dmg_output)
        print(f"DMG: {dmg_output}")
        zip_output = ROOT / "dist" / f"Tuyi_v{version}_macOS_{arch}.zip"
        if zip_output.exists():
            zip_output.unlink()
        run("ditto", "-c", "-k", "--keepParent", str(OUTPUT_APP), str(zip_output))
        print(f"ZIP: {zip_output}")

    print(f"Built: {OUTPUT_APP}")
    print(f"Version: {version}")
    print(f"App architectures: {', '.join(sorted(app_arches))}")


if __name__ == "__main__":
    main()
