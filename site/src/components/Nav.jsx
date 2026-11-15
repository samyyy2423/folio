import TopBar from "./TopBar";
import pages from "@/generated/pages.json";
import site from "@/generated/site.json";
import { LESSONS } from "@/generated/learn-lessons.js";

// How many of each thing the site has, worked out when it's built from the pages themselves: the lessons, the
// libraries, the cookbook's recipes and the examples. The top bar shows each beside its page's name.
const count = (html, mark) => html.split(mark).length - 1;
export const COUNTS = {
  "/learn": LESSONS.length,
  "/docs": site.libraries,
  "/docs/cookbook": count(pages.cookbook.body, 'class="fn recipe"'),
  "/docs/examples": count(pages.examples.body, 'class="fn example"'),
};

export default function Nav() {
  return <TopBar counts={COUNTS} />;
}
