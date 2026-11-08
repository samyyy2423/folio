import "../essay.css";
import TopBar from "@/components/TopBar";
import Footer from "@/components/Footer";
import Why from "./why";

export const metadata = {
  title: "Why Folio · readable code that runs fast",
  description: "Who Folio is for, the idea behind it, what it isn't, and answers to the questions people ask most: COBOL, Ruby, and why a new language at all.",
};

export default function WhyPage() {
  return (
    <>
      <TopBar />
      <Why />
      <Footer />
    </>
  );
}
