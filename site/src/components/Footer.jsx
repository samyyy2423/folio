import Link from "next/link";
import { BASE, GITHUB, RELEASES } from "@/lib/site";

export default function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="cols">
          <div><p className="lead">Programs that read like what they do.</p></div>
          <div>
            <h4>Start</h4>
            <ul>
              <li><a href={`${BASE}/playground`}>Playground</a></li>
              <li><Link href="/learn">Lessons</Link></li>
              <li><Link href="/docs/cookbook">Cookbook</Link></li>
              <li><Link href="/docs/examples">Examples</Link></li>
            </ul>
          </div>
          <div>
            <h4>Reference</h4>
            <ul>
              <li><Link href="/docs">Standard library</Link></li>
              <li><a href={`${GITHUB}#the-language`}>The language</a></li>
              <li><a href={`${GITHUB}/blob/main/SPEC.md`}>Specification</a></li>
              <li><a href={`${GITHUB}/blob/main/DESIGN.md`}>Design notes</a></li>
            </ul>
          </div>
          <div>
            <h4>Project</h4>
            <ul>
              <li><a href={GITHUB}>GitHub</a></li>
              <li><a href={RELEASES}>Releases</a></li>
              <li><a href={`${GITHUB}/blob/main/CHANGELOG.md`}>Changelog</a></li>
              <li><a href={`${GITHUB}/blob/main/CONTRIBUTING.md`}>Contributing</a></li>
            </ul>
          </div>
        </div>
        <div className="legal">
          <span>Open source · Apache License 2.0</span>
          <span>The playground runs Folio, compiled to WebAssembly by Folio</span>
        </div>
      </div>
      <p className="wordmark" aria-hidden="true">{"FOLIO".split("").map((c, i) => <span key={i}>{c}</span>)}</p>
    </footer>
  );
}
