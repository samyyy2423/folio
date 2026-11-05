-- Folio in Neovim (DESIGN §108): comments, indenting, folio lsp, and tree-sitter's colours where the parser has been
-- built (see editors/README.md). Set vim.g.folio_lsp = false to start the server some other way.
local folio = require("folio")

vim.bo.commentstring = "# %s"
vim.bo.expandtab = true
vim.bo.shiftwidth = 4
vim.bo.softtabstop = 4
vim.bo.indentexpr = "v:lua.require'folio'.indent()"
vim.bo.indentkeys = "0=end,0=else,=fails,0=either,o,O,!^F"

-- folio lsp: problems as you type, vim.lsp.buf.format() as folio tidy, the outline, gd, K and completion
if vim.g.folio_lsp ~= false then
  folio.start_server(0)
end

-- the colours, from parser/folio.so (folio.dll on Windows) beside this folder, if it's there
pcall(vim.treesitter.start)

-- the debugger, through nvim-dap, if it's installed: :DapContinue (or require("dap").continue()) debugs the file
folio.setup_debugger()
