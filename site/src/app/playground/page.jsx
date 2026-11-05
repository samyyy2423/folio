import "./playground.css";
import Link from "next/link";
import MothMark from "@/components/MothMark";
import { BASE, GITHUB } from "@/lib/site";
import RunPlayground from "./run";

export const metadata = {
  title: "Playground · Moth",
  description: "Write Moth and run it in your browser: on a JIT, a bytecode VM, or WebAssembly compiled by Moth's own compiler. Draw, make apps and games, and share them.",
};

const Icon = ({ name }) => <svg className="icon" aria-hidden="true"><use href={`#i-${name}`} /></svg>;

// The playground: every element the playground's own script works with (index.html's, word for word, in
// /playground.js), by the ids it finds them by, laid out as a workbench in the site's look. The script does the rest.
export default function Playground() {
  return (
    <div className="studio">
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <symbol id="i-run" viewBox="0 0 16 16"><path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.2-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5z" /></symbol>
          <symbol id="i-debug" viewBox="0 0 16 16"><path d="M3 3v10M7 3.6v8.8a.5.5 0 0 0 .8.4l5.6-4.4a.5.5 0 0 0 0-.8L7.8 3.2a.5.5 0 0 0-.8.4z" /></symbol>
          <symbol id="i-stop" viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9" rx="1.6" /></symbol>
          <symbol id="i-share" viewBox="0 0 16 16"><path d="M8 10V2.5M5 5.5l3-3 3 3M3.5 9v3.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V9" /></symbol>
          <symbol id="i-tidy" viewBox="0 0 16 16"><path d="M2.5 3.5h11M6.5 6.5h7M6.5 9.5h7M2.5 12.5h11" /></symbol>
          <symbol id="i-files" viewBox="0 0 16 16"><path d="M2 4.5a1 1 0 0 1 1-1h3.2l1.5 1.5H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" /></symbol>
          <symbol id="i-back" viewBox="0 0 16 16"><path d="M10 3.5 5.5 8l4.5 4.5" /></symbol>
          <symbol id="i-step" viewBox="0 0 16 16"><path d="m6 3.5 4.5 4.5L6 12.5" /></symbol>
          <symbol id="i-end" viewBox="0 0 16 16"><path d="m3.5 3.5 4.5 4.5-4.5 4.5M11.5 3.5v9" /></symbol>
        </defs>
      </svg>

      <header className="pg-top">
        <a className="brand" href={`${BASE}/`} title="Moth's front page"><MothMark />Moth<sup>®</sup></a>
        <p className="pg-title">Playground</p>
        <nav aria-label="Pages">
          <Link href="/learn">Learn</Link>
          <Link href="/docs">Docs</Link>
          <Link href="/docs/cookbook">Cookbook</Link>
          <Link href="/docs/examples">Examples</Link>
          <a className="btn small" href={GITHUB}><span>GitHub</span></a>
        </nav>
      </header>

      <section className="playground" id="playground" aria-label="Playground">
        <div className="toolbar">
          <div className="tools run-tools" role="group" aria-label="Run">
            <button id="run" type="button" title="Ctrl+Enter"><Icon name="run" />Run</button>
            <button id="debug" type="button" title="Go through the program a step at a time, backwards too"><Icon name="debug" />Debug</button>
            <button id="stop" type="button" disabled><Icon name="stop" />Stop</button>
          </div>
          <div className="tools" role="group" aria-label="Code">
            <button id="share" type="button" title="Copy a link with the code in it"><Icon name="share" />Share</button>
            <button id="tidy" type="button" title="Indents, spaces and blank lines, the one way Moth writes them"><Icon name="tidy" />Tidy</button>
            <button id="add-files" type="button" title="Files a program can read by name, like pictures for draw picture: pick them here, or drop them on the playground"><Icon name="files" />Files</button>
            <input id="file-picker" type="file" multiple hidden />
          </div>
          <span className="spacer" />
          <label className="field"><span>Example</span><select id="example" aria-label="Example" /></label>
          <label className="field"><span>Engine</span>
            <select id="engine" aria-label="Engine" title="All three run the same program the same way, at different speeds" defaultValue="jit">
              <option value="jit">JIT · JavaScript</option>
              <option value="wasm">WebAssembly</option>
              <option value="vm">VM · bytecode</option>
            </select>
          </label>
        </div>

        <main className="workspace">
          <section className="pane code-pane" aria-label="Code">
            <div className="pane-head"><span className="tag">(01)</span>Code<span className="grow" /><span className="keys">Ctrl+Enter runs</span></div>
            <div className="editor" id="editor">
              <pre className="gutter" id="gutter" aria-hidden="true" />
              <div className="code">
                <pre id="highlight" aria-hidden="true" />
                <textarea id="code" aria-label="Code" spellCheck="false" autoCapitalize="off" autoComplete="off" wrap="off" />
              </div>
            </div>
            <ol id="lines" hidden aria-label="The code being debugged; the highlighted line runs next" />
          </section>

          <section className="pane side" aria-label="Results">
            <div className="pane-head"><span className="tag">(02)</span>Results<span className="grow" />
              <label className="toggle"><span>Compiled</span>
                <select id="compiled" aria-label="Compiled" defaultValue="">
                  <option value="">hidden</option>
                  <option value="bytecode">bytecode (VM)</option>
                  <option value="js">JavaScript (JIT)</option>
                  <option value="moth">JavaScript (compiler written in Moth)</option>
                  <option value="wasm">WebAssembly</option>
                </select>
              </label>
            </div>
            <div className="side-body">
              <div id="page-view" className="sheet" hidden>
                <div className="title">Page</div>
                <iframe id="page-frame" title="The page the program made" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" />
              </div>
              <div id="drawing-view" className="sheet ink" hidden>
                <div className="title">Drawing</div>
                <canvas id="canvas" width="500" height="500" tabIndex="0" role="img" aria-label="What the program drew; an app takes keys and clicks here" />
              </div>
              <div id="debug-panel" className="sheet" hidden>
                <div className="title">Variables</div>
                <pre id="variables" />
              </div>
              <div id="problems-view" className="sheet" hidden>
                <div className="title">Problems · found without running</div>
                <ul id="problems" />
              </div>
              <div id="files-view" className="sheet" hidden>
                <div className="title">Files · a program reads them by name</div>
                <ul id="files" />
              </div>
              <div className="sheet out-sheet">
                <div className="title" id="output-title">Output</div>
                <pre id="output" aria-live="polite" />
              </div>
              <div id="bytecode-view" className="sheet" hidden>
                <div className="title" id="compiled-title" />
                <pre id="bytecode" />
              </div>
            </div>
          </section>
        </main>

        <footer className="status" id="statusbar">
          <span id="debug-controls" hidden style={{ display: "contents" }}>
            <button id="back" type="button"><Icon name="back" />Back</button>
            <button id="step" type="button">Step<Icon name="step" /></button>
            <button id="end" type="button">End<Icon name="end" /></button>
            <input id="timeline" type="range" min="0" defaultValue="0" aria-label="Move through the run" />
            <span id="position" />
          </span>
          <span id="status" role="status" />
          <span className="hint" id="hint">Ctrl+Enter runs · Debug goes backwards too</span>
        </footer>
      </section>

      {/* the front page's sample and gallery, which the script also looks for: here, unseen */}
      <div hidden>
        <button id="try-sample" type="button" />
        <pre id="sample" />
        <pre id="sample-said" />
        <div id="gallery" />
      </div>
      <RunPlayground />
    </div>
  );
}
