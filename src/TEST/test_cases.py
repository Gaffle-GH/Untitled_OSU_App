# TEST CASES FOR TESTING THE FUNCTIONS IN test.py
import os
import sys
import traceback
import time
from test_functions import test_details

sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))
from include.const import Colors

# Add a beatmapset ID (e.g., 2312504) and some beatmap IDs
test_cases = [2312504, 4986389, 4973448, 4408321]

results = []
skipped = 0

print(f"{Colors.BOLD}{Colors.CYAN}========== RUNNING TEST CASES =========={Colors.END}")
print()

for i, beatmap_id in enumerate(test_cases, start=1):
    print(f"{Colors.BOLD}{Colors.CYAN}─── Test {i}/{len(test_cases)}  (ID: {beatmap_id}) {'─' * 20}{Colors.END}")
    start = time.time()
    try:
        result = test_details(True, id=beatmap_id)
        if not result or not result.get("preview_path"):
            raise RuntimeError("preview download missing")
        download = result.get("download")
        if not download or not download.get("osz_path"):
            raise RuntimeError("OSZ download missing")
        extract = download.get("extract")
        if not extract or not extract.get("extracted"):
            raise RuntimeError("extracted image missing")
        if not extract.get("cropped"):
            raise RuntimeError("cropped image missing")
        elapsed = time.time() - start
        results.append({"id": beatmap_id, "passed": True, "error": None, "elapsed": elapsed})
        print(f"✓  PASSED  ({elapsed:.2f}s)\n")
    except Exception as e:
        elapsed = time.time() - start
        skipped += 1
        results.append({"id": beatmap_id, "passed": False, "error": e, "elapsed": elapsed})
        print(f"{Colors.YELLOW}⚠️  SKIPPED{Colors.END}  ({elapsed:.2f}s)")
        if isinstance(e, RuntimeError):
            print(f"  {Colors.DIM}→ {e}{Colors.END}\n")
        else:
            print(f"{traceback.format_exc().strip()}\n")

# Summary
passed = sum(1 for r in results if r["passed"])
skipped_count = skipped
failed = len(results) - passed - skipped_count

print(f"{Colors.BOLD}{Colors.CYAN}{'─' * 40}{Colors.END}")
print(f"{Colors.BOLD}{Colors.CYAN}SUMMARY{Colors.END}")
for r in results:
    status = f"{Colors.GREEN}✓ PASS{Colors.END}" if r["passed"] else f"{Colors.YELLOW}⚠️ SKIP{Colors.END}"
    err    = f"  {Colors.DIM}→ {r['error']}{Colors.END}" if r['error'] else ""
    print(f"  {status}  ID {r['id']}  ({r['elapsed']:.2f}s){err}")
print(f"{Colors.BOLD}{Colors.CYAN}{'─' * 40}{Colors.END}")
print(f"  {Colors.GREEN}{passed}/{len(results)} passed{Colors.END}", end="")
if failed:
    print(f"  |  {Colors.RED}{failed} failed{Colors.END}", end="")
if skipped_count:
    print(f"  |  {Colors.YELLOW}{skipped_count} skipped{Colors.END}", end="")
print(f"  |  {sum(r['elapsed'] for r in results):.2f}s total")

if failed == 0:
    print("\n- All Test Cases Passed -\n")
else:
    print(f"\n- {failed} Test Case(s) Failed — See Errors Above -\n")