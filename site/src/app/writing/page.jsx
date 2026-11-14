import "../essay.css";
import "./writing.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Writing from "./writing";

export const metadata = {
  title: "Writing Folio · logic in plain words, programs that stay small",
  description: "How to write logic in Folio, how to say it in fewer lines, and how to keep a larger program small: kinds, files, tests and folio tidy.",
};

export default function WritingPage() {
  return (
    <>
      <Nav />
      <Writing />
      <Footer />
    </>
  );
}
