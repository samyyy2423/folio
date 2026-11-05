// Folio in Zed (DESIGN §108): the language server is folio's own, `folio lsp`, found on the PATH, or where Zed's
// settings say: "lsp": { "folio": { "binary": { "path": "C:/tools/folio.exe" } } }.
use zed_extension_api::{self as zed, settings::LspSettings, LanguageServerId, Result, Worktree};

struct Folio;

impl zed::Extension for Folio {
    fn new() -> Self {
        Folio
    }

    fn language_server_command(&mut self, _id: &LanguageServerId, worktree: &Worktree) -> Result<zed::Command> {
        let binary = LspSettings::for_worktree("folio", worktree).ok().and_then(|settings| settings.binary);
        let command = match binary.as_ref().and_then(|b| b.path.clone()) {
            Some(path) => path,
            None => worktree.which("folio").ok_or_else(|| {
                "folio isn't on your PATH: install it from https://github.com/samyyy2423/folio/releases, or set lsp.folio.binary.path in Zed's settings".to_string()
            })?,
        };
        let args = binary.and_then(|b| b.arguments).unwrap_or_else(|| vec!["lsp".to_string()]);
        Ok(zed::Command { command, args, env: worktree.shell_env() })
    }
}

zed::register_extension!(Folio);
