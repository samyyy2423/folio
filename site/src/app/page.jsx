import "./home.css";
import TopBar from "@/components/TopBar";
import Home from "./home";
import site from "@/generated/site.json";
import { LESSONS } from "@/generated/learn-lessons.js";

export default function Page() {
  return (
    <>
      <TopBar />
      <Home lessons={LESSONS.length} gallery={site.gallery} />
    </>
  );
}
