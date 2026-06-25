import os, zipfile, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
THEME = os.path.join(ROOT, "merlows")
DIST = os.path.join(ROOT, "dist")
os.makedirs(DIST, exist_ok=True)

CHANGED = [
    "merlows/ai-visibility.php",
    "merlows/archive.php",
    "merlows/assets/css/main.css",
    "merlows/customizer-pages.php",
    "merlows/front-page.php",
    "merlows/functions.php",
    "merlows/inc/category-customizer.php",
    "merlows/inc/dashboard-functions.php",
    "merlows/inc/tool-embed.php",
    "merlows/index.php",
    "merlows/page-community.php",
    "merlows/page-dashboard.php",
    "merlows/page-discovery-results.php",
    "merlows/page-register.php",
    "merlows/page-tools.php",
    "merlows/single.php",
]

def add(zf, abspath, arcname):
    # Force forward slashes; zipfile normalizes but be explicit.
    arcname = arcname.replace(os.sep, "/")
    zf.write(abspath, arcname)

# ---- Full theme zip (complete, installable) ----
full = os.path.join(DIST, "merlows-theme-full.zip")
count_full = 0
with zipfile.ZipFile(full, "w", zipfile.ZIP_DEFLATED) as zf:
    for dirpath, dirnames, filenames in os.walk(THEME):
        # skip VCS / junk
        dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules", "__pycache__")]
        for fn in filenames:
            ap = os.path.join(dirpath, fn)
            rel = os.path.relpath(ap, ROOT)  # -> merlows/...
            add(zf, ap, rel)
            count_full += 1

# ---- Patch zip (only the 15 changed files, structure preserved) ----
patch = os.path.join(DIST, "merlows-patch-15-files.zip")
missing = []
with zipfile.ZipFile(patch, "w", zipfile.ZIP_DEFLATED) as zf:
    for rel in CHANGED:
        ap = os.path.join(ROOT, rel)
        if not os.path.isfile(ap):
            missing.append(rel); continue
        add(zf, ap, rel)

print(f"FULL  : {full}  ({count_full} files)")
print(f"PATCH : {patch}  ({len(CHANGED)-len(missing)} files)")
if missing:
    print("MISSING (not added):", missing)
    sys.exit(1)
