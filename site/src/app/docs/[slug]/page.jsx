import "../../docs.css";
import DocPage, { docMetadata, docSlugs } from "@/components/DocPage";

export const dynamicParams = false;

export function generateStaticParams() {
  return docSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return docMetadata(slug);
}

export default async function Doc({ params }) {
  const { slug } = await params;
  return <DocPage slug={slug} />;
}
