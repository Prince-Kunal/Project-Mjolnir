// Proves Edge Functions load the shared rules through the import map (plan section 6).
import { assertEquals } from "@std/assert";
import { DEFAULT_DAY_BOUNDARY_HOUR, STREAK_THRESHOLD } from "@mjolnir/domain";

Deno.test("domain package resolves under Deno", () => {
  assertEquals(DEFAULT_DAY_BOUNDARY_HOUR, 4);
  assertEquals(STREAK_THRESHOLD, 50);
});
