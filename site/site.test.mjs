// The website (site/, DESIGN §148): what it takes from the rest of the repository is still there to take, and
// the playground's new page has every element the playground's own script looks for. No Next.js needed to run it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { playgroundScript, idsUsed, docsPages, libraryCounts } from "./scripts/sync.mjs";
import { run, test as folioTest } from "../folio.js";
import { LOGIC, SHORTER, CART, SHOP, SHOP_SAYS, CART_TEST } from "./src/app/writing/examples.js";

const here = (file) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8");

test("the playground page has every element index.html's playground script looks up by id", () => {
  const ids = idsUsed(playgroundScript());
  assert.ok(ids.length > 30, `only ${ids.length} ids found`);
  const page = here("src/app/playground/page.jsx");
  const missing = ids.filter((id) => !page.includes(`id="${id}"`));
  assert.deepEqual(missing, []);
});

test("every page the docs generators made is cut into its parts, with its links at the site's new addresses", () => {
  const pages = docsPages();
  assert.ok(Object.hasOwn(pages, "") && Object.hasOwn(pages, "cookbook") && Object.hasOwn(pages, "examples"));
  for (const [slug, page] of Object.entries(pages)) {
    assert.ok(page.title && page.hero && page.body, slug);
    assert.doesNotMatch(page.body, /href="[^"#:]*\.html/, `${slug} links to an old .html address`);
  }
  const { libraries, functions } = libraryCounts(pages);
  assert.ok(libraries > 40 && functions > 500, `${libraries} libraries, ${functions} functions`);
  assert.match(pages.examples.body, /href="\/folio\/playground#code=/);
});

test("every program on the Writing Folio page says what the page shows", () => {
  const files = (name) => ({ "cart.folio": CART })[name];
  const said = (code) => { const out = []; run(code, (line) => out.push(String(line)), { files, maxSteps: 1_000_000 }); return out; };
  for (const x of LOGIC) assert.deepEqual(said(x.code), x.says, x.id);
  for (const x of SHORTER) {
    assert.deepEqual(said(x.long), x.says, `${x.id}, the long way`);
    assert.deepEqual(said(x.short), x.says, `${x.id}, the Folio way`);
  }
  assert.deepEqual(said(SHOP), SHOP_SAYS, "shop.folio");
  const tests = folioTest(CART_TEST, { files });
  assert.equal(tests.length, 2);
  for (const t of tests) assert.ok(!t.error, `${t.name}: ${t.error?.message}`);
});
