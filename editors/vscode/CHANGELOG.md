# Changelog

What changed in each version of Folio for VS Code, newest first. What changed in Folio itself, the language and
the `folio` command line, is in [Folio's changelog](https://github.com/samyyy2423/folio/blob/main/CHANGELOG.md).

## 0.1.0

The first version on the Visual Studio Marketplace and Open VSX.

- **Colours** for `.folio` files, including the values inside text, `"Hi {name}!"`.
- **Problems as you type**, from Folio's own checker, built into the extension, with a **Quick Fix** for a
  misspelled name or a symbol from another language.
- **Format Document**, as `folio tidy` writes code.
- **The outline, Go to Definition, hovers and completion**, from Folio's language server, `folio lsp`, where folio
  is installed; without it, the outline and Go to Definition find the file's functions by their lines.
- **A debugger**, through `folio debug`: breakpoints, stepping, the calls in progress and the variables.
- **Run and Build**, which start `folio run` or `folio build` on the file as a task, whose terminal keeps what the
  program said once it has ended, and answers its questions; and `"type": "folio"` tasks in tasks.json.
- **Snippets** for `to`, `if`, `repeat`, `for each`, `try` and a test.
- **Finding folio**: from the `folio.path` setting, or else the PATH (`folio.exe` on Windows, `folio` on Linux).
  Where there's none, one message says so, with a button to Folio's releases.
