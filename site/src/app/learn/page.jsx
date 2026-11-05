import "./learn.css";
import TopBar from "@/components/TopBar";
import Footer from "@/components/Footer";
import Lessons from "./lessons";

export const metadata = {
  title: "Learn Moth · eleven short lessons",
  description: "Learn Moth a step at a time: eleven short lessons, each a program to run and change, right in your browser.",
};

export default function Learn() {
  return (
    <>
      <TopBar />
      <Lessons />
      <Footer />
    </>
  );
}
