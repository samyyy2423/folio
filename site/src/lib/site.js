// What every page knows: where the site is, and its pages
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "/moth";
export const GITHUB = "https://github.com/samyyy2423/moth";
export const RELEASES = `${GITHUB}/releases`;

export const PAGES = [
  { name: "Playground", href: "/playground", full: true }, // a page of its own: its script runs once, on load
  { name: "Learn", href: "/learn" },
  { name: "Docs", href: "/docs" },
  { name: "Cookbook", href: "/docs/cookbook" },
  { name: "Examples", href: "/docs/examples" },
];

// Folio's words, for colouring code: the same set the playground colours
const WORDS = new Set(("set add say if else end repeat while for to return and or not is yes no nothing list empty length item "
  + "move turn pen record dictionary where remove keys byte bytes as hex binary shift bit xor read write arguments expect clear draw box circle "
  + "button random when every milliseconds seconds pressed clicked dragged mouse key fail stop ask use try fails uppercase lowercase split join "
  + "number position by times each in from with than at least most divisible of forward back left right up down color width table total average "
  + "largest smallest chart picture play note beep send json headers checkbox tick untick area showing choice ticked dropdown slider moved choose "
  + "library gives package function power items rounded remainder divided without repeats page used order").split(" "));

// Folio as tokens: [kind, text], kind "k" a word of Folio's, "s" text, "n" a number, "c" a comment, "" the rest
export function tokens(code) {
  const out = [];
  const pattern = /("(?:[^"\\]|\\.)*"?)|(#[^\n]*)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(\s+|.)/g;
  for (const [, text, comment, number, word, other] of code.matchAll(pattern)) {
    if (text !== undefined) out.push(["s", text]);
    else if (comment !== undefined) out.push(["c", comment]);
    else if (number !== undefined) out.push(["n", number]);
    else if (word !== undefined) out.push([WORDS.has(word) ? "k" : "", word]);
    else out.push(["", other]);
  }
  return out;
}

// what a program's link to the playground is: its code, in the address
export const playgroundLink = (code) => `${BASE}/playground#code=${encodeURIComponent(code)}`;
