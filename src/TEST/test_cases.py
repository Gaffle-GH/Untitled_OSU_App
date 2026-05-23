# TEST CASES FOR TESTING THE FUNCTIONS IN test.py
import traceback
import time
from test_functions import test_details

test_cases = [4986389, 4973448, 4408321]

results = []

for i, beatmap_id in enumerate(test_cases, start=1):
    print(f"─── Test {i}/{len(test_cases)}  (ID: {beatmap_id}) {'─' * 20}")
    start = time.time()
    try:
        test_details(True, id=beatmap_id)
        elapsed = time.time() - start
        results.append({"id": beatmap_id, "passed": True, "error": None, "elapsed": elapsed})
        print(f"✓  PASSED  ({elapsed:.2f}s)\n")
    except Exception as e:
        elapsed = time.time() - start
        results.append({"id": beatmap_id, "passed": False, "error": e, "elapsed": elapsed})
        print(f"✗  FAILED  ({elapsed:.2f}s)")
        print(f"{traceback.format_exc().strip()}\n")

# Summary
passed = sum(1 for r in results if r["passed"])
failed = len(results) - passed

print("─" * 40)
print("Results:")
for r in results:
    status = "✓ PASS" if r["passed"] else "✗ FAIL"
    err    = f"  → {r['error']}" if r["error"] else ""
    print(f"  {status}  ID {r['id']}  ({r['elapsed']:.2f}s){err}")
print("─" * 40)
print(f"  {passed}/{len(results)} passed", end="")
print(f"  |  {failed} failed" if failed else "", end="")
print(f"  |  {sum(r['elapsed'] for r in results):.2f}s total")

if failed == 0:
    print("\n- All Test Cases Passed -\n")
else:
    print(f"\n- {failed} Test Case(s) Failed — See Errors Above -\n")