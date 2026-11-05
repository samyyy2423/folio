// The website (site/, DESIGN §148): what it takes from the rest of the repository is still there to take, and
// the playground's new page has every element the playground's own script looks for. No Next.js needed to run it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { playgroundScript, idsUsed, docsPages, libraryCounts } from "./scripts/sync.mjs";

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
