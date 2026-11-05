-- Folio in Neovim (DESIGN §108): what ftplugin/folio.lua uses.
local M = {}

-- Indenting as the VS Code extension does (editors/vscode/language-configuration.json): the line after one
-- that opens a block goes in a step, and end, else, if it fails and either way come back out one
local opens = vim.regex([[\v\C^\s*(to|if|else|repeat|for|try|when|every|match|either way|kind|use the library)>[^#]*$]])
local closes = vim.regex([[\v\C^\s*(end|else|if it fails|either way)>]])

function M.indent()
  local line = vim.v.lnum
  local before = vim.fn.prevnonblank(line - 1)
  if before == 0 then
    return 0
  end
  local width = vim.fn.indent(before)
  if opens:match_str(vim.fn.getline(before)) then
    width = width + vim.fn.shiftwidth()
  end
  if closes:match_str(vim.fn.getline(line)) then
    width = width - vim.fn.shiftwidth()
  end
  return math.max(width, 0)
end

-- Folio's language server, for this buffer: folio lsp, from vim.g.folio_path or the PATH, in the folder with
-- folio.packages or .git above the file, or the file's own. Nothing if folio isn't there.
function M.start_server(buffer)
  local folio = vim.g.folio_path or "folio"
  if vim.fn.executable(folio) ~= 1 then
    return nil
  end
  local file = vim.api.nvim_buf_get_name(buffer)
  return vim.lsp.start({
    name = "folio",
    cmd = { folio, "lsp" },
    root_dir = vim.fs.root(buffer, { "folio.packages", ".git" }) or vim.fs.dirname(file),
  }, { bufnr = buffer })
end

-- Folio's debugger, for nvim-dap where it's installed: the debug adapter (editors/vscode/debug-adapter.js beside
-- this folder, or vim.g.folio_debug_adapter), run by Node.js, on `folio debug`. Once, and nothing without them.
function M.setup_debugger()
  local ok, dap = pcall(require, "dap")
  if not ok or dap.adapters.folio then
    return
  end
  local here = debug.getinfo(1, "S").source:sub(2)
  local adapter = vim.g.folio_debug_adapter or vim.fs.normalize(vim.fs.dirname(here) .. "/../../vscode/debug-adapter.js")
  if vim.fn.executable("node") ~= 1 or vim.fn.filereadable(adapter) ~= 1 then
    return
  end
  dap.adapters.folio = { type = "executable", command = "node", args = { adapter } }
  dap.configurations.folio = dap.configurations.folio or {
    { type = "folio", request = "launch", name = "Debug this file", program = "${file}", folioPath = vim.g.folio_path or "folio" },
  }
end

return M
