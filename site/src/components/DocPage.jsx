import TopBar from "./TopBar";
import Footer from "./Footer";
import DocScript from "./DocScript";
import pages from "@/generated/pages.json";

// A page of the reference, the cookbook or the examples: what make-docs.mjs or make-guides.mjs made of it (its
// top, its body and its own script, for searching and filtering), in the site's look
export function docMetadata(slug) {
  const page = pages[slug];
  return { title: page.title, description: page.description };
}

export const docSlugs = () => Object.keys(pages).filter(Boolean);

export default function DocPage({ slug }) {
  const page = pages[slug];
  return (
    <>
      <TopBar />
      <main className="doc">
        <section className="doc-hero"><div className="wrap" dangerouslySetInnerHTML={{ __html: page.hero }} /></section>
        <div className="doc-body" dangerouslySetInnerHTML={{ __html: page.body }} />
        <DocScript code={page.script} />
      </main>
      <Footer />
    </>
  );
}
