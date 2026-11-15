import "../essay.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Benchmarks from "./benchmarks";

export const metadata = {
  title: "Benchmarks · how fast Folio is",
  description: "The same four programs in Folio, C, Rust, JavaScript and Python, timed as whole runs with start-up included; and training a GPT step on a GPU, against PyTorch.",
};

export default function BenchmarksPage() {
  return (
    <>
      <Nav />
      <Benchmarks />
      <Footer />
    </>
  );
}
