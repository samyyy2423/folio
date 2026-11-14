import "./home.css";
import Nav from "@/components/Nav";
import Home from "./home";
import site from "@/generated/site.json";
import art from "@/generated/art.json";
import { LESSONS } from "@/generated/learn-lessons.js";
import { COUNTS } from "@/components/Nav";

export default function Page() {
  return (
    <>
      <Nav />
      <Home lessons={LESSONS.length} gallery={site.gallery} art={art}
        version={(site.version ?? "").split(".").slice(0, 2).join(".")} year={new Date().getFullYear()}
        index={[
          [COUNTS["/learn"], "Lessons", "/learn"], [COUNTS["/docs"], "Libraries", "/docs"],
          [COUNTS["/docs/cookbook"], "Recipes", "/docs/cookbook"], [COUNTS["/docs/examples"], "Examples", "/docs/examples"],
          [site.functions, "Functions", "/docs"], [4, "Benchmarks", "/benchmarks"],
        ]} />
    </>
  );
}
